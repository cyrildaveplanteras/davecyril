const db = require('../src/js/database');
const BusinessRules = require('../src/js/business-rules');

// Reconciliation of remittance_details against the central business rules.
//   - Fixes rows with MF >= 250 but COM = 0 that are genuine MF payments (COM -> 120)
//   - Detects MSC-only deposits (MSC > 0, COM=0) that wrongly carry MF=250 (MF -> 0)
//   - Recomputes NetDeposit and parent remittance TotalDeposit for every touched row
//   - Dedupes commission_config (keep single canonical ₱120 row)
//   - Writes an ActivityLogs entry summarizing the reconciliation
//
// The commission rule is amount-based and authoritative: ANY qualifying MF
// payment (MF >= 250) earns the flat ₱120 Sales Coordinator commission,
// including the remittance made at registration. A row with MF >= 250 is a
// qualifying payment regardless of its purpose label, so it must never be
// zeroed; only rows that carry MF but have no qualifying fee (e.g. phantom MF
// on a genuine MSC-only deposit) get MF zeroed.
//
// Usage:
//   node scripts/reconcile.js            # show classification, make NO changes
//   node scripts/reconcile.js --apply    # apply fixes in a transaction + write audit
//   node scripts/reconcile.js --report   # only print a summary report

async function main() {
  const apply = process.argv.includes('--apply');
  const reportOnly = process.argv.includes('--report');
  const pool = db.getPool();

  // ---- 1. Classify anomalous COM=0 rows ----
  const [anom] = await pool.execute(
    `SELECT rd.Id, rd.RemittanceId, rd.MemberId, rd.AFNo, rd.MF, rd.MSC, rd.HDA, rd.Total, rd.COM, rd.NetDeposit,
            m.full_name, m.af_no AS member_afno
     FROM remittance_details rd
     LEFT JOIN members m ON m.Id = rd.MemberId
     WHERE rd.MF >= 250 AND rd.COM = 0`
  );

    // The commission rule is amount-based and authoritative: a row carrying a
  // qualifying MF (>= AltThreshold) earns the flat ₱120 — no purpose label can
  // suppress it. So EVERY row in the anomaly set (MF>=250, COM=0) is a missing
  // commission; none should have its MF zeroed.
  const mfPayments = [];
  const other = [];
  for (const r of anom) {
    const mf = parseFloat(r.MF) || 0;
    const msc = parseFloat(r.MSC) || 0;
    const hda = parseFloat(r.HDA) || 0;
    if (BusinessRules.calcCommission(mf, msc, 'both', null) > 0) {
      mfPayments.push(r); // qualifying MF payment missing its commission → COM=120
    } else {
      other.push(r); // does not qualify → leave untouched (reported only)
    }
  }

  const classify = {
    mfPayments: mfPayments.length,
    other: other.length,
    total: anom.length
  };
  console.log('=== CLASSIFICATION (MF>=250 & COM=0) ===');
  console.log(JSON.stringify(classify, null, 2));

  // ---- 2. commission_config duplicates ----
  const [cfgRows] = await pool.execute(
    'SELECT Id, MFAmount, COMAmount, COMAmountAlt, MFThreshold, AltThreshold, CreatedAt FROM commission_config ORDER BY Id'
  );
  let cfgDuplicates = 0;
  const seen = new Set();
  for (const c of cfgRows) {
    const key = [c.MFAmount, c.COMAmount, c.COMAmountAlt, c.MFThreshold, c.AltThreshold].join('|');
    if (seen.has(key)) cfgDuplicates++;
    seen.add(key);
  }
  console.log('commission_config rows:', cfgRows.length, 'duplicate configs:', cfgDuplicates);

  // ---- 3. Remittance TotalDeposit consistency ----
  const [misTotals] = await pool.execute(
    `SELECT r.Id, r.TotalDeposit AS stored,
            (SELECT COALESCE(SUM(rd.NetDeposit),0) FROM remittance_details rd WHERE rd.RemittanceId = r.Id) AS computed
     FROM remittances r
     WHERE r.TotalDeposit <> (SELECT COALESCE(SUM(rd.NetDeposit),0) FROM remittance_details rd WHERE rd.RemittanceId = r.Id)`
  );
  console.log('remittances with TotalDeposit mismatch:', misTotals.length);

  if (reportOnly) {
    await pool.end();
    return;
  }
  if (!apply) {
    console.log('\n(dry run — run with --apply to commit. No changes made.)');
    await pool.end();
    return;
  }

  // ---- APPLY ----
  const conn = await pool.getConnection();
  const affectedRemittances = new Set();
  try {
    await conn.beginTransaction();

    let fixedMf = 0, skippedOther = 0;
    for (const r of mfPayments) {
      const mf = parseFloat(r.MF) || 0;
      const msc = parseFloat(r.MSC) || 0;
      const hda = parseFloat(r.HDA) || 0;
      const cfg = BusinessRules.normalizeConfig(null);
      const com = BusinessRules.calcCommission(mf, msc, 'both', cfg);
      const total = Math.round((mf + msc + hda) * 100) / 100;
      const net = Math.round((total - com) * 100) / 100;
      await conn.execute(
        'UPDATE remittance_details SET COM = ?, NetDeposit = ? WHERE Id = ?',
        [com, net, r.Id]
      );
      affectedRemittances.add(r.RemittanceId);
      fixedMf++;
    }
    // 'other' rows left untouched (non-qualifying) — only reported.
    skippedOther = other.length;

    // Recompute TotalDeposit for every affected remittance
    for (const remId of affectedRemittances) {
      await conn.execute(
        'UPDATE remittances SET TotalDeposit = (SELECT COALESCE(SUM(NetDeposit),0) FROM remittance_details WHERE RemittanceId = ?) WHERE Id = ?',
        [remId, remId]
      );
    }

    // Dedupe commission_config: keep the single canonical ₱120 row (first by Id),
    // delete any legacy duplicates (e.g. a ₱100 row created by old code).
    const [canonicalRows] = await conn.execute(
      'SELECT Id FROM commission_config WHERE COMAmount = 120.00 AND COMAmountAlt = 120.00 ORDER BY Id ASC LIMIT 1'
    );
    if (canonicalRows.length > 0) {
      await conn.execute('DELETE FROM commission_config WHERE Id <> ?', [canonicalRows[0].Id]);
    }

    // Audit trail (audit_logs; the Activity Log records only login lifecycle events)
    await conn.execute(
      "INSERT INTO audit_logs (AdminUserId, Action, Description, CreatedAt) VALUES (NULL, 'Data Reconciliation', ?, NOW())",
      [`Reconciliation: ${fixedMf} qualifying MF payment(s) got COM=120, ${skippedOther} non-qualifying row(s) left; TotalDeposit recomputed for ${affectedRemittances.size} remittance(s); commission_config deduped to 1 canonical ₱120 row.`]
    );

    await conn.commit();
    console.log('\nCommitted.');
    console.log('Fixed MF payments (COM=120):', fixedMf);
    console.log('Skipped (non-qualifying):', skippedOther);
    console.log('Remittances recomputed:', affectedRemittances.size);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  // Verify
  const [remaining] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM remittance_details WHERE MF >= 250 AND COM = 0'
  );
  console.log('Remaining MF>=250/COM=0 rows:', remaining[0].cnt);
  const [cfgCount] = await pool.execute('SELECT COUNT(*) AS cnt FROM commission_config');
  console.log('commission_config rows now:', cfgCount[0].cnt);
  const [badCfg] = await pool.execute("SELECT COUNT(*) AS cnt FROM commission_config WHERE COMAmount IN (100.00,140.00) OR COMAmountAlt IN (100.00,140.00)");
  console.log('commission_config rows with ₱100/₱140:', badCfg[0].cnt);

  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });