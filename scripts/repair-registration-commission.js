const db = require('../src/js/database');
const BusinessRules = require('../src/js/business-rules');

// Repair: registration remittances must earn the flat ₱120 Sales Coordinator
// commission. The registration remittance is the member's FIRST completed
// deposit, which includes the membership fee (MF). Earlier reconciliation
// wrongly zeroed MF on these rows (treating them as MSC-only deposits), which
// left 209 first-deposit rows with MF=0 / COM=0.
//
// This script restores:
//   - MF = members.membership_fee  (the qualifying membership fee)
//   - COM = 120  (flat commission, per business rule)
//   - Total = MF + MSC + HDA
//   - NetDeposit = Total - COM
//   - parent remittance TotalDeposit = SUM(NetDeposit)
//   - ActivityLogs audit entry
//
// Only rows that are a member's FIRST completed deposit AND whose member has a
// qualifying membership_fee >= 250 AND currently carry MF=0 / COM=0 are touched.
// Genuine MSC-only deposits (member has no qualifying fee, or this is a later
// deposit) are left untouched.
//
// Usage:
//   node scripts/repair-registration-commission.js             # dry run
//   node scripts/repair-registration-commission.js --apply     # commit

const cfg = BusinessRules.normalizeConfig(null);

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = db.getPool();

  // Registration remittances: a member's FIRST completed deposit row.
  // A member is "first completed" when no earlier Completed remittance exists
  // for them. Match on remittance_details row + members.membership_fee.
  const [rows] = await pool.execute(
    `SELECT rd.Id, rd.RemittanceId, rd.MemberId, rd.AFNo, rd.MF, rd.MSC, rd.HDA, rd.Total, rd.COM, rd.NetDeposit,
            m.full_name, m.membership_fee
     FROM remittance_details rd
     JOIN members m ON m.Id = rd.MemberId
     JOIN remittances r ON r.Id = rd.RemittanceId
     WHERE r.Status = 'Completed'
       AND m.membership_fee >= ?
       AND rd.MF = 0 AND rd.COM = 0
       AND NOT EXISTS (
         SELECT 1
         FROM remittance_details rd2
         JOIN remittances r2 ON r2.Id = rd2.RemittanceId
         WHERE rd2.MemberId = rd.MemberId
           AND r2.Status = 'Completed'
           AND (r2.DateDeposit < r.DateDeposit
                OR (r2.DateDeposit = r.DateDeposit AND r2.Id < r.Id))
       )`,
    [cfg.AltThreshold]
  );

  console.log(`Registration remittance rows to repair (first completed deposit, fee>=${cfg.AltThreshold}, MF=0/COM=0): ${rows.length}`);
  const byFee = {};
  for (const r of rows) {
    const fee = parseFloat(r.membership_fee) || 0;
    byFee[fee] = (byFee[fee] || 0) + 1;
  }
  console.log('Breakdown by membership_fee:', JSON.stringify(byFee, null, 2));

  // Also show the genuinely MSC-only rows (later deposits) that should NOT change
  const [skip] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM remittance_details rd
     JOIN members m ON m.Id = rd.MemberId
     JOIN remittances r ON r.Id = rd.RemittanceId
     WHERE r.Status = 'Completed'
       AND m.membership_fee >= ?
       AND rd.MF = 0 AND rd.COM = 0
       AND EXISTS (
         SELECT 1
         FROM remittance_details rd2
         JOIN remittances r2 ON r2.Id = rd2.RemittanceId
         WHERE rd2.MemberId = rd.MemberId
           AND r2.Status = 'Completed'
           AND (r2.DateDeposit < r.DateDeposit
                OR (r2.DateDeposit = r.DateDeposit AND r2.Id < r.Id))
       )`,
    [cfg.AltThreshold]
  );
  console.log(`Later deposits (members with qualifying fee, MF=0/COM=0) left untouched: ${skip[0].cnt}`);

  if (!apply) {
    console.log('\n(dry run — run with --apply to commit. No changes made.)');
    await pool.end();
    return;
  }

  const conn = await pool.getConnection();
  const affected = new Set();
  try {
    await conn.beginTransaction();
    let fixed = 0;
    for (const r of rows) {
      const mf = parseFloat(r.membership_fee) || 0;
      const msc = parseFloat(r.MSC) || 0;
      const hda = parseFloat(r.HDA) || 0;
      const com = BusinessRules.calcCommission(mf, msc, 'both', cfg);
      const total = Math.round((mf + msc + hda) * 100) / 100;
      const net = Math.round((total - com) * 100) / 100;
      await conn.execute(
        'UPDATE remittance_details SET MF = ?, Total = ?, COM = ?, NetDeposit = ? WHERE Id = ?',
        [mf, total, com, net, r.Id]
      );
      affected.add(r.RemittanceId);
      fixed++;
    }
    for (const remId of affected) {
      await conn.execute(
        'UPDATE remittances SET TotalDeposit = (SELECT COALESCE(SUM(NetDeposit),0) FROM remittance_details WHERE RemittanceId = ?) WHERE Id = ?',
        [remId, remId]
      );
    }
    await conn.execute(
      "INSERT INTO audit_logs (AdminUserId, Action, Description, CreatedAt) VALUES (NULL, 'Data Reconciliation', ?, NOW())",
      [`Registration-remittance repair: ${fixed} first-deposit row(s) restored (MF = membership_fee, COM = ₱120, Total/NetDeposit recomputed, parent TotalDeposit updated for ${affected.size} remittance(s)).`]
    );
    await conn.commit();
    console.log('\nCommitted.');
    console.log('Rows repaired:', fixed);
    console.log('Remittances recomputed:', affected.size);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });