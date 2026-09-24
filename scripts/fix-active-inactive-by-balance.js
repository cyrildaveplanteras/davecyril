/* eslint-disable no-console */
/*
 * Reconcile member Active/Inactive status against what members actually paid.
 *
 * Problem: checkMemberRenewals only looked at `renewal_date`. If that value was
 * stale (e.g. reverted by a data migration/restore), a member who did renew got
 * auto-inactivated anyway (JALANDONI #315 is the reported case).
 *
 * Rule applied here (user-approved, consistent with scripts/fix-renewal-dates.js):
 *   - A completed qualifying MF payment (₱250/₱350) only counts as a genuine
 *     renewal if it sits in a REAL remittance slip (r."Id" >= 11) or the app
 *     processed a renewal_success notification for the member. The July/early-Aug
 *     bulk remittances (remId < 11) are uniform auto-filled import rows and do
 *     NOT count. Neither does the initial registration fee (deposited within the
 *     first 90 days after registration).
 *   - healed renewal_date = registration month/day, in the year following the
 *     member's last genuine renewal (renewal month coincides with the registered
 *     month).
 *   - A member whose paid-through date is today (within the 15-day grace) or later
 *     is set to Active. Genuinely lapsed members stay Inactive.
 *
 * Also scans currently-Active members whose stored renewal_date is already >15
 * days overdue (they would be wrongly inactivated at the next checkMemberRenewals
 * run) and heals them with the same rule.
 *
 * Optional cleanup (--clean-orphans): removes commission_transactions rows whose
 * RemittanceDetailId no longer exists in remittance_details.
 *
 * Usage:
 *   node scripts/fix-active-inactive-by-balance.js            # dry run (default)
 *   node scripts/fix-active-inactive-by-balance.js --apply    # apply member fixes
 *   node scripts/fix-active-inactive-by-balance.js --apply --clean-orphans
 */
const db = require('../src/js/database');

const OVERDUE_GRACE_DAYS = 15;
const INITIAL_MF_GRACE_DAYS = 90;
const QUALIFYING_MF = [250, 350];

function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim().split(' ')[0];
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function fmtDate(d) {
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

// Registration month/day in a given year (renewal month coincides with the registered month).
function anniversaryInYear(reg, year) {
  const r = parseDate(reg);
  if (!r) return null;
  const m = r.getMonth() + 1;
  const day = Math.min(r.getDate(), daysInMonth(year, m));
  return new Date(year, m - 1, day);
}

async function main() {
  const pool = db.getPool();
  const apply = process.argv.includes('--apply');
  const cleanOrphans = process.argv.includes('--clean-orphans');

  const today = startOfDay(new Date());
  const graceFloor = addDays(today, -OVERDUE_GRACE_DAYS);

  // 1) Candidates: Inactive members, plus Active members already >15 days overdue.
  const [candidates] = await pool.execute(
    `SELECT m."Id", m.af_no, m.full_name, m.registration_date, m.renewal_date, m.last_renewed_date, m.member_status
     FROM members m
     WHERE m.registration_date IS NOT NULL
       AND (m.member_status = 'Inactive'
            OR (m.member_status = 'Active' AND m.renewal_date IS NOT NULL AND m.renewal_date < ?))
     ORDER BY m."Id"`,
    [fmtDate(graceFloor)]
  );

  if (candidates.length === 0) {
    console.log('No candidate members found. Nothing to do.');
  }

  // 2) Establish the set of members with a GENUINE renewal:
  //    - a renewal_success notification processed by the app, OR
  //    - a qualifying MF (₱250/₱350) in a real remittance slip (remId >= 11).
  //    Early bulk remittances (remId < 11) are import artifacts (see fix-renewal-dates.js).
  const [payerRows] = await pool.execute(
    `SELECT DISTINCT n.member_id FROM notifications n WHERE n.type = 'renewal_success'
     UNION
     SELECT DISTINCT rd."MemberId" FROM remittance_details rd
     JOIN remittances r ON r."Id" = rd."RemittanceId"
     WHERE rd."MF" IN (?, ?) AND r."Status" = 'Completed' AND r."Id" >= 11`,
    [QUALIFYING_MF[0], QUALIFYING_MF[1]]
  );
  const payerSet = new Set(payerRows.map((p) => p.MemberId ?? p.member_id));

  // 3) Genuine deposits (null/Non reals) for candidates: qualifying MF in real slips only.
  const ids = candidates.filter((c) => payerSet.has(c.Id)).map((c) => c.Id);
  const depositsByMember = new Map();
  if (ids.length > 0) {
    const [deposits] = await pool.execute(
      `SELECT rd."MemberId", r."DateDeposit"
       FROM remittance_details rd
       JOIN remittances r ON r."Id" = rd."RemittanceId"
       WHERE rd."MF" IN (?, ?) AND r."Status" = 'Completed' AND r."Id" >= 11
         AND rd."MemberId" IN (${ids.map(() => '?').join(',')})
       ORDER BY rd."MemberId", r."DateDeposit"`,
      [QUALIFYING_MF[0], QUALIFYING_MF[1], ...ids]
    );
    for (const d of deposits) {
      if (!depositsByMember.has(d.MemberId)) depositsByMember.set(d.MemberId, []);
      depositsByMember.get(d.MemberId).push(d.DateDeposit);
    }
  }

  const plan = [];
  const skipped = [];

  for (const c of candidates) {
    const reg = parseDate(c.registration_date);
    if (!reg) {
      skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'no registration_date' });
      continue;
    }

    // Members without genuine renewal evidence are correctly inactive (or are left
    // alone when Active) — only bulk-import MF rows exist, which are not real renewals.
    if (!payerSet.has(c.Id)) {
      if (c.member_status === 'Inactive') {
        skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'no genuine renewal (bulk import or initial fee only) - correctly inactive' });
      } else {
        skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'no genuine renewal evidence; left to renewal checker' });
      }
      continue;
    }

    const regFloor = addDays(reg, INITIAL_MF_GRACE_DAYS);
    const realDeposits = (depositsByMember.get(c.Id) || [])
      .map(parseDate)
      .filter((d) => d && d >= regFloor) // exclude the initial registration fee
      .map((d) => startOfDay(d));

    if (realDeposits.length === 0) {
      // Only evidence is a renewal_success notification; anchor the term year to that.
      const [nt] = await pool.execute(
        `SELECT DATE(created_at) AS d FROM notifications
         WHERE member_id = ? AND type = 'renewal_success' ORDER BY created_at DESC LIMIT 1`,
        [c.Id]
      );
      const ntDate = nt.length > 0 ? parseDate(nt[0].d) : (c.last_renewed_date ? parseDate(c.last_renewed_date) : null);
      if (ntDate) realDeposits.push(startOfDay(ntDate));
    }

    if (realDeposits.length === 0) {
      if (c.member_status === 'Inactive') {
        skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'renewal evidence without a usable date' });
      } else {
        skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'renewal evidence without a usable date' });
      }
      continue;
    }

    const lastActiveYear = Math.max(...realDeposits.map((d) => d.getFullYear()));
    const paidThrough = anniversaryInYear(c.registration_date, lastActiveYear + 1); // next renewal date
    if (!paidThrough) {
      skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'cannot compute anniversary' });
      continue;
    }

    if (paidThrough < graceFloor) {
      // Their last qualifying payment only covered an earlier term.
      skipped.push({
        id: c.Id, af_no: c.af_no, full_name: c.full_name,
        reason: `paid through ${fmtDate(paidThrough)} which is >${OVERDUE_GRACE_DAYS} days ago`
      });
      continue;
    }

    plan.push({
      id: c.Id,
      af_no: c.af_no,
      full_name: c.full_name,
      status: c.member_status,
      old_renewal: c.renewal_date,
      new_renewal: fmtDate(paidThrough),
      new_status: 'Active'
    });
  }

  console.log(`\n===== RECONCILIATION PLAN (${plan.length} to heal) =====`);
  for (const p of plan) {
    console.log(`#${p.id} ${p.af_no} ${p.full_name} | ${p.status} | renewal ${p.old_renewal || '(none)'} -> ${p.new_renewal} | ${p.new_status}`);
  }

  if (skipped.length > 0) {
    console.log(`\n----- SKIPPED (${skipped.length}) -----`);
    for (const s of skipped) {
      console.log(`#${s.id} ${s.af_no} ${s.full_name} | ${s.reason}`);
    }
  }

  // ---- Orphan commission cleanup ----
  let orphans = [];
  if (cleanOrphans) {
    const [orphanRows] = await pool.execute(
      `SELECT ct."Id", ct."MemberId", ct."RemittanceId", ct."RemittanceDetailId", ct."MSCAmount", ct."TransactionDate"
       FROM commission_transactions ct
       LEFT JOIN remittance_details rd ON rd."Id" = ct."RemittanceDetailId"
       WHERE rd."Id" IS NULL`
    );
    orphans = orphanRows;
    console.log(`\n===== ORPHAN COMMISSIONS (${orphans.length}) =====`);
    for (const o of orphans) {
      console.log(`#${o.Id} member=${o.MemberId} remittance=${o.RemittanceId} detail=${o.RemittanceDetailId} MSC=${o.MSCAmount} date=${o.TransactionDate}`);
    }
  }

  if (!apply) {
    console.log('\n(dry run - no changes made. Re-run with --apply to apply, add --clean-orphans to delete orphan commissions.)');
    await pool.end();
    process.exit(0);
  }

  console.log('\n===== APPLYING =====');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of plan) {
      await conn.execute(
        "UPDATE members SET member_status = 'Active', renewal_date = ? WHERE Id = ?",
        [p.new_renewal, p.id]
      );
    }
    for (const o of orphans) {
      await conn.execute('DELETE FROM commission_transactions WHERE "Id" = ?', [o.Id]);
    }
    await conn.commit();
    console.log(`Committed ${plan.length} member update(s) and ${orphans.length} orphan cleanup(s).`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });