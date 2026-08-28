const db = require('../src/js/database');

async function reconcileMemberAddresses({ dryRun = false } = {}) {
  const pool = db.getPool();

  const [provRows] = await pool.execute("SELECT id FROM ref_provinces WHERE name = 'Zamboanga del Norte' LIMIT 1");
  const zdnProvinceId = provRows.length ? provRows[0].id : 56;

  const [munRows] = await pool.execute('SELECT id, name FROM ref_municipalities WHERE province_id = ?', [zdnProvinceId]);
  const munByName = {};
  for (const m of munRows) munByName[normalizeName(m.name)] = m.id;

  const [brgyRows] = await pool.execute('SELECT id, name, municipality_id FROM ref_barangays');
  const brgyByMunName = {};
  for (const b of brgyRows) {
    const munId = b.municipality_id;
    if (!brgyByMunName[munId]) brgyByMunName[munId] = {};
    brgyByMunName[munId][normalizeName(b.name)] = b.id;
  }

  const [members] = await pool.execute('SELECT Id, af_no, address, complete_address, province_id, municipality_id, barangay_id FROM members ORDER BY Id');
  const results = { ok: [], noAddress: [], badMun: [], badBrgy: [], provinceMismatch: [] };

  for (const m of members) {
    const parsed = parseAddress(m.address || m.complete_address);
    if (!parsed) {
      results.noAddress.push({ id: m.Id, af: m.af_no });
      continue;
    }
    const munName = resolveMunicipality(parsed.munTxt);
    const munId = munByName[normalizeName(munName)];
    if (!munId) {
      results.badMun.push({ id: m.Id, af: m.af_no, munTxt: parsed.munTxt });
      continue;
    }
    let brgyId = null;
    if (parsed.brgyTxt) {
      brgyId = brgyByMunName[munId] ? brgyByMunName[munId][normalizeName(parsed.brgyTxt)] : null;
      if (!brgyId) {
        results.badBrgy.push({ id: m.Id, af: m.af_no, brgyTxt: parsed.brgyTxt, mun: munName });
        continue;
      }
    }

    const provinceWrong = m.province_id !== zdnProvinceId;
    const munWrong = m.municipality_id !== munId;
    const brgyWrong = m.barangay_id !== brgyId;

    if (provinceWrong || munWrong || brgyWrong) {
      results.ok.push({
        id: m.Id, af: m.af_no,
        oldProv: m.province_id, newProv: zdnProvinceId,
        oldMun: m.municipality_id, newMun: munId,
        oldBrgy: m.barangay_id, newBrgy: brgyId,
        munName, brgyTxt: parsed.brgyTxt
      });
      if (!dryRun) {
        await pool.execute(
          'UPDATE members SET province_id = ?, municipality_id = ?, barangay_id = ? WHERE Id = ?',
          [zdnProvinceId, munId, brgyId, m.Id]
        );
      }
    }
  }

  return results;
}

async function countMemberAddressMismatches() {
  const pool = db.getPool();
  const [provRows] = await pool.execute("SELECT id FROM ref_provinces WHERE name = 'Zamboanga del Norte' LIMIT 1");
  const zdnProvinceId = provRows.length ? provRows[0].id : 56;
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM members m
     LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
     LEFT JOIN ref_provinces p ON mun.province_id = p.id
     LEFT JOIN ref_barangays br ON m.barangay_id = br.id
     WHERE p.id IS NULL OR p.id <> ?
        OR br.municipality_id <> m.municipality_id`,
    [zdnProvinceId]
  );
  return cnt;
}

const MUNICIPALITY_ALIASES = {
  'president manuel a. roxas': 'Pres. Manuel A. Roxas',
  'leon b. postigo': 'Leon T. Postigo',
  'manukand': 'Manukan'
};

function parseAddress(address) {
  if (!address) return null;
  const lines = String(address).split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const provinceTxt = lines[lines.length - 1];
  const munTxt = lines[lines.length - 2].replace(/,$/, '').trim();
  const brgyTxt = lines[lines.length - 3] ? lines[lines.length - 3].replace(/,$/, '').trim() : null;
  return { provinceTxt, munTxt, brgyTxt };
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function resolveMunicipality(munTxt) {
  const key = normalizeName(munTxt);
  return MUNICIPALITY_ALIASES[key] || munTxt;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const results = await reconcileMemberAddresses({ dryRun });

  console.log('===== PSGC FIX REPORT =====');
  console.log('Total members scanned:', [].concat(results.ok, results.noAddress, results.badMun, results.badBrgy).length);
  console.log('Would update / updated:', results.ok.length);
  console.log('No address:', results.noAddress.length);
  console.log('Unmatched municipality:', results.badMun.length);
  console.log('Unmatched barangay:', results.badBrgy.length);
  if (results.noAddress.length) console.log('No-address IDs:', results.noAddress.map(r => r.id + '(' + r.af + ')').join(', '));
  if (results.badMun.length) console.log('BadMun:', results.badMun.map(r => r.id + '(' + r.munTxt + ')').join(', '));
  if (results.badBrgy.length) console.log('BadBrgy:', results.badBrgy.map(r => r.id + '(' + r.brgyTxt + '@' + r.mun + ')').join(', '));
  console.log('Sample updates (first 10):');
  results.ok.slice(0, 10).forEach(r => {
    console.log(`  #${r.id} ${r.af} prov ${r.oldProv}->${r.newProv} mun ${r.oldMun}->${r.newMun} (${r.munName}) brgy ${r.oldBrgy}->${r.newBrgy} (${r.brgyTxt})`);
  });
  console.log('===== END =====');
  process.exit(0);
}

module.exports = { reconcileMemberAddresses, countMemberAddressMismatches };

if (require.main === module) {
  main().catch((err) => {
    console.error('Migration error:', err.message);
    process.exit(1);
  });
}
