const db = require('../src/js/database');
const BusinessRules = require('../src/js/business-rules');

// Reconciliation of remittance_details against the central business rules.
//   - Fixes any row where the stored COM does not match the two-tier rule:
//       MF = 350 → ₱120 ; MF = 250 → ₱100
//   - Recomputes NetDeposit and parent remittance TotalDeposit for every touched row
//   - Normalizes commission_config to the single canonical two-tier row and dedupes
//   - Writes an audit_logs entry summarizing the reconciliation
//
// The commission rule is amount-based and authoritative: a row carrying MF = 350
// earns ₱120, MF = 250 earns ₱100, and only MF < 250 earns none. A row with a
// qualifying MF earns its commission regardless of its purpose label, so it must
// never be zeroed; only rows that carry MF but have no qualifying fee (e.g. phantom
// MF on a genuine MSC-only deposit) get MF zeroed.
//
// Usage:
//   node scripts/reconcile.js            # show classification, make NO changes
//   node scripts/reconcile.js --apply    # apply fixes in a transaction + write audit
//   node scripts/reconcile.js --report   # only print a summary report

async function main() {
  const apply = process.argv.includes('--apply');
  const reportOnly = process.argv.includes('--report');
  const pool = db.getPool();
  const cfg = BusinessRules.normalizeConfig(null);

  // ---- 1. Classify rows carrying a qualifying MF against the stored COM ----
  const [anom] = await pool.execute(
    `SELECT rd.Id, rd.RemittanceId, rd.MemberId, rd.AFNo, rd.MF, rd.MSC, rd.HDA, rd.Total, rd.COM, rd.NetDeposit,
            m.full_name, m.af_no AS member_afno
     FROM remittance_details rd
     LEFT JOIN members m ON m.Id = rd.MemberId
     WHERE rd.MF >= 250`
  );

  // The commission rule is amount-based and authoritative: MF=350 → ₱120,
  // MF=250 → ₱100. Any row whose stored COM drifted from its tier (legacy flat
  // ₱120 on MF=250 rows, bypassed COM=0, stale ₱140) is fixed to the computed
  // value; already-correct rows are reported only.
  const mfPayments = [];
  const other = [];
  for (const r of anom) {
    const mf = parseFloat(r.MF) || 0;
    const msc = parseFloat(r.MSC) || 0;
    const hda = parseFloat(r.HDA) || 0;
    const expected = BusinessRules.calcCommission(mf, msc, 'both', cfg);
    if (expected > 0 && Math.abs((parseFloat(r.COM) || 0) - expected) > 0.001) {
      mfPayments.push(Object.assign({}, r, { expected }));
    } else {
      other.push(r); // already correct → left untouched (reported only)
    }
  }

  const classify = {
    mfPayments: mfPayments.length,
    other: other.length,
    total: anom.length
  };
  console.log('=== CLASSIFICATION (MF>=250 vs stored COM rule) ===');
  console.log(JSON.stringify(classify, null, 2));

  // ---- 2. commission_config duplicates ----
  const [cfgRows] = await pool.execute(
    'SELECT "Id", "MFAmount", "COMAmount", "COMAmountAlt", "MFThreshold", "AltThreshold" FROM commission_config ORDER BY "Id"'
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
    `SELECT r."Id", r."TotalDeposit" AS stored,
            (SELECT COALESCE(SUM(rd."NetDeposit"),0) FROM remittance_details rd WHERE rd."RemittanceId" = r."Id") AS computed
     FROM remittances r
     WHERE r."TotalDeposit" <> (SELECT COALESCE(SUM(rd."NetDeposit"),0) FROM remittance_details rd WHERE rd."RemittanceId" = r."Id")`
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
      const total = Math.round((mf + msc + hda) * 100) / 100;
      const net = Math.round((total - r.expected) * 100) / 100;
      await conn.execute(
        'UPDATE remittance_details SET COM = ?, NetDeposit = ? WHERE Id = ?',
        [r.expected, net, r.Id]
      );
      affectedRemittances.add(r.RemittanceId);
      fixedMf++;
    }
    // 'other' rows left untouched (already correct) — only reported.
    skippedOther = other.length;

    // Recompute TotalDeposit for every affected remittance
    for (const remId of affectedRemittances) {
      await conn.execute(
        'UPDATE remittances SET TotalDeposit = (SELECT COALESCE(SUM(NetDeposit),0) FROM remittance_details WHERE RemittanceId = ?) WHERE Id = ?',
        [remId, remId]
      );
    }

    // Normalize commission_config to the canonical two-tier row, then drop any
    // legacy duplicates (e.g. a stale flat-₱120 row).
    const [cfgRowsNow] = await conn.execute(
      'SELECT "Id", "COMAmount", "COMAmountAlt" FROM commission_config ORDER BY "Id"'
    );
    if (cfgRowsNow.length === 0) {
      await conn.execute(
        'INSERT INTO commission_config ("MFAmount", "COMAmount", "COMAmountAlt", "MFThreshold", "AltThreshold") VALUES (?, ?, ?, ?, ?)',
        [350.00, 120.00, 100.00, 350.00, 250.00]
      );
    } else {
      const canonical = cfgRowsNow.find(c => parseFloat(c.COMAmount) === 120 && parseFloat(c.COMAmountAlt) === 100) || cfgRowsNow[0];
      if (!(parseFloat(canonical.COMAmount) === 120 && parseFloat(canonical.COMAmountAlt) === 100)) {
        await conn.execute(
          'UPDATE commission_config SET COMAmount = ?, COMAmountAlt = ? WHERE Id = ?',
          [120.00, 100.00, canonical.Id]
        );
      }
      await conn.execute('DELETE FROM commission_config WHERE Id <> ?', [canonical.Id]);
    }

    // Audit trail (audit_logs; the Activity Log records only login lifecycle events)
    await conn.execute(
      "INSERT INTO audit_logs (AdminUserId, Action, Description, CreatedAt) VALUES (NULL, 'Data Reconciliation', ?, NOW())",
      [`Reconciliation: ${fixedMf} qualifying MF payment(s) corrected to the two-tier rule (₱120 for MF=350, ₱100 for MF=250), ${skippedOther} already-correct row(s) left; TotalDeposit recomputed for ${affectedRemittances.size} remittance(s); commission_config normalized to 1 canonical two-tier row.`]
    );

    await conn.commit();
    console.log('\nCommitted.');
    console.log('Fixed MF payments (two-tier):', fixedMf);
    console.log('Skipped (already correct):', skippedOther);
    console.log('Remittances recomputed:', affectedRemittances.size);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  // Verify
  const [remaining] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM remittance_details WHERE MF >= 250 AND NOT ((MF >= 350 AND COM = 120.00) OR (MF >= 250 AND MF < 350 AND COM = 100.00))'
  );
  console.log('Remaining MF>=250 rows with wrong COM:', remaining[0].cnt);
  const [cfgCount] = await pool.execute('SELECT COUNT(*) AS cnt FROM commission_config');
  console.log('commission_config rows now:', cfgCount[0].cnt);
  const [cfgCheck] = await pool.execute('SELECT COUNT(*) AS cnt FROM commission_config WHERE COMAmount = 120.00 AND COMAmountAlt = 100.00');
  console.log('canonical two-tier commission_config rows:', cfgCheck[0].cnt);

  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });