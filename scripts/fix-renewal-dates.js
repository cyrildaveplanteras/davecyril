const db = require('D:/damayan-electron/damayan-electron/damayan-electron - Copy/damayan-electron/GoldenHopeApp/goldenhope-electron/src/js/database');

function addYear(dateStr, years = 1) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d));
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const pool = db.getPool();
  const dryRun = process.argv.includes('--dry-run');

  // REAL renewal payers only:
  //   - members the app actually processed a renewal for (renewal_success notification), OR
  //   - members who paid MF = 250 in a real (varied) remittance slip (remId >= 11).
  // The July/early-Aug bulk remittances (remId < 11) are uniform auto-filled rows (MF=250, MSC=300
  // on every row) and do NOT count as genuine MF payments. MF = 350 does not count either.
  const [payerRows] = await pool.execute(
    `SELECT DISTINCT n.member_id FROM notifications n
     WHERE n.type = 'renewal_success'
     UNION
     SELECT DISTINCT rd.MemberId FROM remittance_details rd
     JOIN remittances r ON r.Id = rd.RemittanceId
     WHERE rd.MF = 250 AND r.Status = 'Completed' AND r.Id >= 11`
  );
  const payerSet = new Set(payerRows.map((p) => p.MemberId ?? p.member_id));

  const [members] = await pool.execute(
    `SELECT Id, af_no, full_name, registration_date, renewal_date, last_renewed_date, member_status, membership_status
     FROM members`
  );

  const plan = [];
  const anomalies = [];
  let payerCount = 0;
  let nonPayerCount = 0;

  for (const m of members) {
    const isPayer = payerSet.has(m.Id);
    const suspiciousReg = m.registration_date && (m.registration_date.slice(0, 4) < '2000' || m.registration_date.slice(0, 4) > '2026');

    let renewal = null;
    let lastPayDate = null;

    if (isPayer) {
      payerCount++;
      if (suspiciousReg) {
        // Corrupt registration year (e.g. m405's 0025-10-20): keep the existing renewal as-is.
        renewal = m.renewal_date;
      } else {
        // Payers renewed in 2026: registration (2025) + 2 years = 2027, capped at 2027.
        renewal = m.registration_date ? toYmd(addYear(m.registration_date, 2)) : m.renewal_date;
        if (!renewal) renewal = '2027-01-01';
        if (renewal.slice(0, 4) > '2027') renewal = '2027-01-01';
      }
      // last_renewed = the qualifying MF=250 payment date from a real slip (remId >= 11),
      // else the renewal_success notification date, else keep existing.
      const [paidRows] = await pool.execute(
        `SELECT r.DateDeposit, r.Id FROM remittance_details rd
         JOIN remittances r ON r.Id = rd.RemittanceId
         WHERE rd.MemberId = ? AND rd.MF = 250 AND r.Status = 'Completed' AND r.Id >= 11
         ORDER BY r.DateDeposit DESC LIMIT 1`,
        [m.Id]
      );
      if (paidRows.length > 0) {
        lastPayDate = paidRows[0].DateDeposit.slice(0, 10);
      } else {
        const [nt] = await pool.execute(
          `SELECT DATE(created_at) as d FROM notifications
           WHERE member_id = ? AND type = 'renewal_success' ORDER BY created_at DESC LIMIT 1`,
          [m.Id]
        );
        if (nt.length > 0) lastPayDate = nt[0].d ? String(nt[0].d).slice(0, 10) : m.last_renewed_date;
        else lastPayDate = m.last_renewed_date;
      }
    } else {
      nonPayerCount++;
      if (suspiciousReg) {
        // Corrupt registration year: keep the existing renewal as-is.
        renewal = m.renewal_date;
      } else {
        // No real MF payment: renewal stays at registration + 1 year (2026 baseline).
        renewal = m.registration_date ? toYmd(addYear(m.registration_date)) : m.renewal_date;
        if (renewal && renewal.slice(0, 4) > '2026') renewal = toYmd(addYear(m.registration_date));
      }
      lastPayDate = null;
    }

    const target = { id: m.Id, af_no: m.af_no, full_name: m.full_name, old: m.renewal_date, new: renewal, lastPayDate, status: m.member_status };
    if (m.renewal_date !== renewal || String(m.last_renewed_date || '') !== String(lastPayDate || '')) {
      plan.push(target);
    }

    if (m.registration_date && m.registration_date.slice(0, 4) < '2000') {
      anomalies.push(`#${m.Id} ${m.af_no}: suspicious registration year ${m.registration_date}`);
    }
    if (m.registration_date && m.registration_date.slice(0, 4) >= '2027') {
      anomalies.push(`#${m.Id} ${m.af_no}: registration in future ${m.registration_date}`);
    }
  }

  console.log(`Total members processed: ${members.length} (${payerCount} with qualifying payments, ${nonPayerCount} without)`);
  console.log(`Will update: ${plan.length}`);
  console.log(`Anomalies flagged: ${anomalies.length}`);
  console.log('\n===== SAMPLE CHANGES (first 30) =====');
  for (const t of plan.slice(0, 30)) {
    console.log(`#${t.id} ${t.af_no} ${t.full_name} | ${t.old} -> ${t.new} (lastPaid ${t.lastPayDate}) [${t.status}]`);
  }

  if (anomalies.length) {
    console.log('\n===== DATA ANOMALIES (not auto-fixed) =====');
    anomalies.forEach(a => console.log('  ' + a));
  }

  if (!dryRun && plan.length) {
    console.log('\n===== APPLYING UPDATES =====');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const t of plan) {
        await conn.execute(
          'UPDATE members SET renewal_date = ?, last_renewed_date = ? WHERE Id = ?',
          [t.new, t.lastPayDate, t.id]
        );
      }
      await conn.commit();
      console.log(`Committed ${plan.length} updates.`);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } else {
    console.log('\n(dry run - no changes made. Re-run without --dry-run to apply.)');
  }

  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
