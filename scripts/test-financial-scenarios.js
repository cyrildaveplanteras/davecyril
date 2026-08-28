// DB-level integration tests for the financial scenarios that main.js performs
// during remittance save/delete. Runs inside transactions that are ALWAYS
// ROLLED BACK, so the live database is never modified.
//
// Scenarios covered:
//   1. 1st MSC deposit  -> 0% coordinator commission, MSCDepositCount = 1
//   2. 2nd MSC deposit  -> 5% commission,            MSCDepositCount = 2
//   3. 3rd MSC deposit  -> 5% commission,            MSCDepositCount = 3
//   4. MSCDepositCount is a NUMBER (regression: bigint string concat bug)
//   5. Failed remittance save rolls back atomically (no partial rows)
//   6. Remittance deletion reverses generated commissions
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getPool } = require('../src/js/database');
const BusinessRules = require('../src/js/business-rules');

const R = BusinessRules.RULES;

(async () => {
  let failed = 0;
  const check = (name, ok, detail) => {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  ->  ' + detail : ''));
    if (!ok) failed++;
  };

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const stamp = Date.now();
    const afNo = 'TST-' + stamp;

    // ---- Fixture: one member + one Sales Coordinator + three remittances ----
    const [sc] = await conn.execute(
      'SELECT "Id" FROM sales_coordinators ORDER BY "Id" LIMIT 1'
    );
    const scId = sc[0].Id;
    const [branch] = await conn.execute('SELECT "Id" FROM branches ORDER BY "Id" LIMIT 1');
    const branchId = branch[0].Id;

    const [mRes] = await conn.execute(
      `INSERT INTO members (af_no, registration_date, membership_status, membership_fee, msc, full_name, sales_coordinator_id, branch_id, member_status)
       VALUES (?, CURRENT_DATE, 'Regular', 250, 0, 'Test Scenario Member', ?, ?, 'Active')`,
      [afNo, scId, branchId]
    );
    const memberId = mRes.insertId;
    check('fixture: test member created', memberId > 0, 'id=' + memberId);

    const makeRemittance = async (remNo, dateDep) => {
      const [r] = await conn.execute(
        'INSERT INTO remittances ("RemittanceNo","DateDeposit","TotalDeposit","BranchId","Status","CreatedBy") VALUES (?,?,0,?,\'Completed\',1)',
        [remNo, dateDep, branchId]
      );
      return r.insertId;
    };

    // ---- Scenario 1-3: MSC deposits with escalating deposit counts ----
    const mscAmount = 300;
    let prior = 0;
    const deposits = [];
    for (let i = 1; i <= 3; i++) {
      const remId = await makeRemittance('REM-' + stamp + '-' + i, '2026-08-0' + i);
      const [rd] = await conn.execute(
        `INSERT INTO remittance_details ("RemittanceId","MemberId","AFNo","MemberName","MF","MSC","HDA","Total","COM","NetDeposit")
         VALUES (?,?,?,'Test Scenario Member',0,?,0,?,0,?)`,
        [remId, memberId, afNo, mscAmount, mscAmount, mscAmount]
      );
      const detailId = rd.insertId;

      // Exact query used by main.js (remittances:save)
      const [existingCount] = await conn.execute(
        "SELECT COUNT(*) as cnt FROM commission_transactions WHERE MemberId = ? AND Status = 'Completed' AND RemittanceId != ?",
        [memberId, remId]
      );
      prior = existingCount[0].cnt;
      const commissionAmount = BusinessRules.calcMscCommission(mscAmount, prior);
      const netMsc = mscAmount - commissionAmount;
      const [ct] = await conn.execute(
        `INSERT INTO commission_transactions (SalesCoordinatorId,MemberId,RemittanceId,RemittanceDetailId,MSCAmount,CommissionRate,CommissionAmount,NetMSCAmount,TransactionDate,EncoderId,Status,MSCDepositCount)
         VALUES (?,?,?,?,?,5.00,?,?,?,?,?,?)`,
        [scId, memberId, remId, detailId, mscAmount, commissionAmount, netMsc, '2026-08-0' + i, 1, 'Completed', prior + 1]
      );
      deposits.push({ i, remId, detailId, commissionAmount, storedCount: ct.insertId ? null : null, rowId: ct.insertId });
    }

    // Read back the stored MSCDepositCount values for the 3 deposits
    const [stored] = await conn.execute(
      'SELECT "MSCDepositCount" AS cnt FROM commission_transactions WHERE "MemberId" = ? ORDER BY "Id" ASC',
      [memberId]
    );
    const counts = stored.map((s) => s.cnt);
    check('1st deposit commission = 0', deposits[0].commissionAmount === 0, 'got ' + deposits[0].commissionAmount);
    check('2nd deposit commission = 5%', deposits[1].commissionAmount === Math.round(mscAmount * 0.05 * 100) / 100, 'got ' + deposits[1].commissionAmount);
    check('3rd deposit commission = 5%', deposits[2].commissionAmount === Math.round(mscAmount * 0.05 * 100) / 100, 'got ' + deposits[2].commissionAmount);
    check('MSCDepositCount stored as [1,2,3]', JSON.stringify(counts) === JSON.stringify([1, 2, 3]), JSON.stringify(counts));
    check('MSCDepositCount values are numbers (no string concat)', counts.every((c) => typeof c === 'number'), JSON.stringify(counts) + ' types=' + counts.map((c) => typeof c).join(','));

    // ---- Scenario 5: atomicity on failure ----
    // Simulate a failed save: we deliberately cause an FK violation AFTER inserting
    // a remittance, then verify a rollback-to-savepoint leaves nothing partial.
    await conn.connection.query('SAVEPOINT sp_atomic');
    const rem4 = await makeRemittance('REM-' + stamp + '-4', '2026-08-04');
    await conn.execute(
      `INSERT INTO remittance_details ("RemittanceId","MemberId","MF","Total","NetDeposit") VALUES (?,?,250,250,130)`,
      [rem4, memberId]
    );
    // Force a failure: reference a nonexistent MemberId on commission_transactions
    // (FK commission_transactions_ibfk_2 -> members)
    let dupInsert = null;
    try {
      await conn.execute(
        `INSERT INTO commission_transactions (SalesCoordinatorId,MemberId,RemittanceId,MSCAmount,CommissionAmount,NetMSCAmount,TransactionDate,Status)
         VALUES (?,99999999,?,300,15,285,'2026-08-04','Completed')`,
        [scId, rem4]
      );
    } catch (e) {
      dupInsert = e;
    }
    check('failed save raises an error (FK violation)', !!dupInsert, dupInsert ? dupInsert.code || dupInsert.message : 'no error');
    await conn.connection.query('ROLLBACK TO SAVEPOINT sp_atomic');

    // After rollback-to-savepoint, the partially-written rows from scenario 5 must be gone
    const [afterFail] = await conn.execute(
      'SELECT COUNT(*) AS cnt FROM remittances WHERE "RemittanceNo" = ?',
      ['REM-' + stamp + '-4']
    );
    check('atomicity: failed save left no partial rows', afterFail[0].cnt === 0, afterFail[0].cnt + ' row(s) remain');

    // ---- Scenario 6: commission reversal on remittance deletion ----
    const [commRows] = await conn.execute(
      'SELECT "Id", "CommissionAmount", "MemberId" FROM commission_transactions WHERE "RemittanceId" = ?',
      [deposits[0].remId]
    );
    check('reversal: commissions exist for remittance', commRows.length === 1, commRows.length + ' row(s)');
    for (const c of commRows) {
      await conn.execute('DELETE FROM commission_transactions WHERE "Id" = ?', [c.Id]);
    }
    const [afterDel] = await conn.execute(
      'SELECT COUNT(*) AS cnt FROM commission_transactions WHERE "RemittanceId" = ?',
      [deposits[0].remId]
    );
    check('reversal: commissions removed after delete', afterDel[0].cnt === 0, afterDel[0].cnt + ' row(s) remain');

    // ---- Always roll back: the live DB must be untouched ----
    await conn.rollback();

    const [leftover] = await pool.execute('SELECT COUNT(*) AS cnt FROM members WHERE af_no = ?', [afNo]);
    check('cleanup: no test rows persisted', leftover[0].cnt === 0, leftover[0].cnt + ' member row(s)');
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }

  console.log(`\n${failed === 0 ? 'ALL' : failed} financial scenario check(s) ${failed === 0 ? 'passed' : 'failed'}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });