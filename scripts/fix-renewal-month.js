/* eslint-disable no-console */
/*
 * Correct renewal_date month/day drift away from the registration anniversary.
 *
 * Background: handleMemberRenewal used to reset an overdue renewal_date to
 * `today + 1 year`, which permanently shifted the member's renewal month away
 * from their registered month. This backfills the affected rows.
 *
 * Rule (user-approved):
 *   1) Renewal month/day must equal the registered month/day (the registration
 *      anniversary, Feb 29 clamped to the last day of the target month).
 *   2) For candidates whose renewal_date month/day differs from registration:
 *      - renewal_date in the FUTURE: target = registration anniversary in the
 *        SAME year as the stored renewal, with year floor = regYear + 1.
 *        Pure month/day correction - the renewal year (paid-through term) is
 *        untouched, so no coverage is gained or lost.
 *      - renewal_date in the PAST (stale/reverted value): compute the member's
 *        genuine paid-through date, mirroring getMemberPaidThroughDate /
 *        scripts/fix-active-inactive-by-balance.js:
 *          * genuine renewal = completed qualifying MF (250/350) in a REAL
 *            remittance slip (Id >= 11) - bulk import rows (Id < 11) do not
 *            count - OR a renewal_success notification processed by the app;
 *          * the initial registration fee (deposited within 90 days of
 *            registration) is excluded;
 *          * paidThrough = registration anniversary in (last genuine renewal
 *            year + 1).
 *        If covered (paidThrough >= today - 15) -> target = paidThrough, so a
 *        paying member's coverage is never reduced by this fix. If not covered
 *        -> target = the same-year registration anniversary (an accurate past
 *        date; member_status is left for checkMemberRenewals to evaluate).
 *   3) Only renewal_date is ever written. member_status and last_renewed_date
 *      are never modified - no coverage is invented and no status is changed.
 *
 * Usage:
 *   node scripts/fix-renewal-month.js            # dry run (default)
 *   node scripts/fix-renewal-month.js --apply    # apply updates in a transaction
 */
const db = require('../src/js/database');

const OVERDUE_GRACE_DAYS = 15;
const INITIAL_REG_GRACE_DAYS = 90;
const QUALIFYING_MF = [250, 350];
const PLANNED_MIN_REG_YEAR = 2000;

function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim().split(' ')[0];
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
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

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Registration month/day in a given year (renewal month coincides with the
// registered month; Feb 29 clamps to the last day of the target month).
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

  const today = startOfDay(new Date());
  const todayYear = today.getFullYear();
  const graceFloor = addDays(today, -OVERDUE_GRACE_DAYS);

  // 1) Candidates: plausible registration_date whose renewal_date month/day
  //    drifted away from the registration anniversary.
  const [candidates] = await pool.execute(
    `SELECT m."Id", m.af_no, m.full_name, m.registration_date, m.renewal_date,
            m.last_renewed_date, m.member_status
     FROM members m
     WHERE m.registration_date IS NOT NULL
       AND m.renewal_date IS NOT NULL
       AND EXTRACT(YEAR FROM m.registration_date) >= ?
       AND EXTRACT(YEAR FROM m.registration_date) <= ?
       AND (EXTRACT(MONTH FROM m.registration_date) <> EXTRACT(MONTH FROM m.renewal_date)
            OR EXTRACT(DAY FROM m.registration_date) <> EXTRACT(DAY FROM m.renewal_date))
     ORDER BY m."Id"`,
    [PLANNED_MIN_REG_YEAR, todayYear + 1]
  );

  // 2) Set of members with a GENUINE renewal (same definition as
  //    fix-active-inactive-by-balance.js and getMemberPaidThroughDate).
  const [payerRows] = await pool.execute(
    `SELECT DISTINCT n.member_id FROM notifications n WHERE n.type = 'renewal_success'
     UNION
     SELECT DISTINCT rd."MemberId" FROM remittance_details rd
     JOIN remittances r ON r."Id" = rd."RemittanceId"
     WHERE rd."MF" IN (?, ?) AND r."Status" = 'Completed' AND r."Id" >= 11`,
    [QUALIFYING_MF[0], QUALIFYING_MF[1]]
  );
  const payerSet = new Set(payerRows.map((p) => p.MemberId ?? p.member_id));

  const plan = [];       // rows to update: { id, af_no, full_name, status, old, new, reason }
  const skipped = [];    // { id, af_no, full_name, reason }
  let futureCount = 0;
  let pastCovered = 0;
  let pastUncovered = 0;

  for (const c of candidates) {
    const reg = parseDate(c.registration_date);
    const stored = parseDate(c.renewal_date);
    if (!reg || !stored) {
      skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'unparseable registration_date or renewal_date' });
      continue;
    }
    const regYear = reg.getFullYear();
    const storedYear = stored.getFullYear();

    // Same-year anniversary: preserve the stored renewal year, correct month/day.
    // Floor at regYear + 1 so a renewal can never precede the initial `reg + 1y`.
    const targetYear = Math.max(storedYear, regYear + 1);
    const sameYear = fmtDate(anniversaryInYear(c.registration_date, targetYear));
    if (!sameYear) {
      skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'cannot compute anniversary' });
      continue;
    }

    const storedIsPast = stored < today;

    if (!storedIsPast) {
      // --- Stored renewal in the future: pure month/day correction ---
      if (sameYear === String(c.renewal_date).slice(0, 10)) {
        skipped.push({ id: c.Id, af_no: c.af_no, full_name: c.full_name, reason: 'already aligned (Feb 29 clamp)' });
        continue;
      }
      plan.push({
        id: c.Id, af_no: c.af_no, full_name: c.full_name, status: c.member_status,
        old: String(c.renewal_date).slice(0, 10), new: sameYear,
        reason: 'future: month/day corrected in stored year'
      });
      futureCount++;
      continue;
    }

    // --- Stored renewal in the past (stale/reverted): use genuine paid-through ---
    let paidThrough = null;
    let evidence = null;

    if (payerSet.has(c.Id)) {
      const regFloor = addDays(reg, INITIAL_REG_GRACE_DAYS);
      const [deposits] = await pool.execute(
        `SELECT r."DateDeposit" FROM remittance_details rd
         JOIN remittances r ON r."Id" = rd."RemittanceId"
         WHERE rd."MemberId" = ? AND rd."MF" IN (?, ?) AND r."Status" = 'Completed' AND r."Id" >= 11`,
        [c.Id, QUALIFYING_MF[0], QUALIFYING_MF[1]]
      );
      const realDeposits = deposits
        .map((d) => parseDate(d.DateDeposit))
        .filter((d) => d && d >= regFloor) // exclude the initial registration fee
        .map((d) => startOfDay(d));

      if (realDeposits.length === 0) {
        // Only evidence is a renewal_success notification; anchor to that.
        const [nt] = await pool.execute(
          `SELECT DATE(created_at) AS d FROM notifications
           WHERE member_id = ? AND type = 'renewal_success' ORDER BY created_at DESC LIMIT 1`,
          [c.Id]
        );
        const ntDate = nt.length > 0 ? parseDate(nt[0].d)
          : (c.last_renewed_date ? parseDate(c.last_renewed_date) : null);
        if (ntDate) realDeposits.push(startOfDay(ntDate));
      }

      if (realDeposits.length > 0) {
        const lastRenewalYear = Math.max(...realDeposits.map((d) => d.getFullYear()));
        const pt = anniversaryInYear(c.registration_date, lastRenewalYear + 1);
        if (pt) {
          paidThrough = pt;
          evidence = `last genuine renewal ${lastRenewalYear}`;
        }
      }
    }

    if (paidThrough && paidThrough >= graceFloor) {
      // Covered: never reduce coverage - write the true paid-through date.
      plan.push({
        id: c.Id, af_no: c.af_no, full_name: c.full_name, status: c.member_status,
        old: String(c.renewal_date).slice(0, 10), new: fmtDate(paidThrough),
        reason: `past (stale): genuine coverage through ${fmtDate(paidThrough)} (${evidence})`
      });
      pastCovered++;
    } else {
      // Not covered: write the accurate past anniversary; status untouched.
      plan.push({
        id: c.Id, af_no: c.af_no, full_name: c.full_name, status: c.member_status,
        old: String(c.renewal_date).slice(0, 10), new: sameYear,
        reason: paidThrough
          ? `past: paid through ${fmtDate(paidThrough)} (> ${OVERDUE_GRACE_DAYS}-day grace) - accurate past anniversary`
          : 'past: no genuine renewal evidence - accurate past anniversary'
      });
      pastUncovered++;
    }
  }

  console.log(`Today: ${fmtDate(today)}  (grace floor ${fmtDate(graceFloor)})`);
  console.log(`Candidates with month/day drift: ${candidates.length}`);
  console.log(`To update: ${plan.length}  (future ${futureCount}, past covered ${pastCovered}, past uncovered ${pastUncovered})`);
  if (skipped.length) console.log(`Skipped: ${skipped.length}`);

  console.log('\n===== PAST-DUE / STALE ROWS (full detail) =====');
  const pastRows = plan.filter((p) => p.reason.startsWith('past'));
  if (pastRows.length === 0) console.log('(none)');
  for (const p of pastRows) {
    console.log(`#${p.id} ${p.af_no} ${p.full_name} | ${p.status} | renewal ${p.old} -> ${p.new} | ${p.reason}`);
  }

  console.log('\n===== FUTURE ROWS (month/day correction) =====');
  const futureRows = plan.filter((p) => p.reason.startsWith('future'));
  if (futureRows.length === 0) console.log('(none)');
  for (const p of futureRows) {
    console.log(`#${p.id} ${p.af_no} ${p.full_name} | ${p.status} | ${p.old} -> ${p.new}`);
  }

  if (skipped.length > 0) {
    console.log(`\n----- SKIPPED (${skipped.length}) -----`);
    for (const s of skipped) console.log(`#${s.id} ${s.af_no} ${s.full_name} | ${s.reason}`);
  }

  if (!apply) {
    console.log('\n(dry run - no changes made. Re-run with --apply to apply.)');
    await pool.end();
    process.exit(0);
  }

  console.log('\n===== APPLYING =====');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of plan) {
      await conn.execute('UPDATE members SET renewal_date = ? WHERE Id = ?', [p.new, p.id]);
    }
    await conn.commit();
    console.log(`Committed ${plan.length} renewal_date update(s).`);
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
