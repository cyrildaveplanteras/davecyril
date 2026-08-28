require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../src/js/database');
const BusinessRules = require('../src/js/business-rules');

// DB-level consistency check against the central business rules.
// Verifies stored COM values match the rule, no ₱100 commissions exist,
// remittance totals match the sum of NetDeposit, and commission_config is sane.

async function main() {
  const pool = db.getPool();
  let failed = 0;
  const check = (name, ok, detail) => {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  →  ' + detail : ''));
    if (!ok) failed++;
  };

  // 1. No COM=100 anywhere
  const [badCom] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM remittance_details WHERE COM = 100.00 OR COM = 140.00'
  );
  check('no ₱100/₱140 commissions in remittance_details', badCom[0].cnt === 0, 'found ' + badCom[0].cnt);

  // 2. Stored COM matches rule for every qualifying MF row
  const [rows] = await pool.execute(
    'SELECT Id, MF, MSC, COM FROM remittance_details WHERE MF >= 250'
  );
  let mismatches = 0;
  for (const r of rows) {
    const expected = BusinessRules.calcCommission(r.MF, r.MSC, 'mf', null);
    if (Math.abs(parseFloat(r.COM) - expected) > 0.001) mismatches++;
  }
  check('all MF>=250 rows have COM matching rule', mismatches === 0, mismatches + ' mismatch(es)');

  // 3. Remittance TotalDeposit == SUM(NetDeposit)
  const [misTotals] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM remittances r
     WHERE r.TotalDeposit <> (SELECT COALESCE(SUM(rd.NetDeposit),0) FROM remittance_details rd WHERE rd.RemittanceId = r.Id)`
  );
  check('all remittance totals match SUM(NetDeposit)', misTotals[0].cnt === 0, misTotals[0].cnt + ' mismatch(es)');

  // 4. commission_config has exactly one sane row
  const [cfg] = await pool.execute('SELECT COUNT(*) AS cnt, MIN(COMAmount) AS mn, MAX(COMAmount) AS mx, MIN(COMAmountAlt) AS mna, MAX(COMAmountAlt) AS mxa FROM commission_config');
  check('commission_config is a single row', cfg[0].cnt === 1, cfg[0].cnt + ' row(s)');
  check('commission_config COM == 120', parseFloat(cfg[0].mn) === 120 && parseFloat(cfg[0].mx) === 120, `${cfg[0].mn}..${cfg[0].mx}`);
  check('commission_config COMAmountAlt == 120', parseFloat(cfg[0].mna) === 120 && parseFloat(cfg[0].mxa) === 120, `${cfg[0].mna}..${cfg[0].mxa}`);

  // 5. data_change_log table exists
  const [tbl] = await pool.execute("SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'data_change_log'");
  check('data_change_log table exists', tbl[0].cnt === 1);

  // 6. No orphan MSC-only rows still carrying MF
  const [phantom] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM remittance_details WHERE MF >= 250 AND COM = 0'
  );
  check('no phantom MF>=250/COM=0 rows', phantom[0].cnt === 0, phantom[0].cnt + ' remaining');

  // 7. Registration remittances (first completed deposit with qualifying fee) earn ₱120.
  //    The rule is amount-based: a registration remittance carrying a qualifying MF
  //    (>= AltThreshold) earns the flat ₱120 regardless of the recorded default fee.
  const [reg] = await pool.execute(
    `SELECT rd.Id, rd.MF, rd.COM, m.membership_fee
     FROM remittance_details rd
     JOIN members m ON m.Id = rd.MemberId
     JOIN remittances r ON r.Id = rd.RemittanceId
     WHERE r.Status = 'Completed'
       AND m.membership_fee >= 250
       AND NOT EXISTS (
         SELECT 1 FROM remittance_details rd2
         JOIN remittances r2 ON r2.Id = rd2.RemittanceId
         WHERE rd2.MemberId = rd.MemberId AND r2.Status = 'Completed'
           AND (r2.DateDeposit < r.DateDeposit OR (r2.DateDeposit = r.DateDeposit AND r2.Id < r.Id))
       )`
  );
  // Amount-based rule (calcCommission): only a qualifying MF (>= AltThreshold)
  // earns the flat P120. A registration deposit with no MF component (e.g.
  // MSC-only, MF = 0) legitimately earns COM = 0, so only flag rows that carry
  // a qualifying MF but are missing the commission.
  const regBad = reg.filter(r => parseFloat(r.MF) >= 250 && parseFloat(r.COM) !== 120);
  check('all registration remittances earn COM=120 with qualifying MF', regBad.length === 0,
    regBad.length + ' bad (e.g. ' + (regBad[0] ? 'id=' + regBad[0].Id + ' MF=' + regBad[0].MF + ' COM=' + regBad[0].COM : '') + ')');

  // 8. commission_config is always the canonical ₱120 (no ₱100/₱140 anywhere)
  const [badCfg] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM commission_config WHERE COMAmount IN (100.00,140.00) OR COMAmountAlt IN (100.00,140.00)'
  );
  check('no ₱100/₱140 in commission_config', badCfg[0].cnt === 0, badCfg[0].cnt + ' row(s)');

  console.log(`\n${failed === 0 ? 'ALL' : failed} check(s) ${failed === 0 ? 'passed' : 'failed'}`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });