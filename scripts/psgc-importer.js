const path = require('path');
const db = require('../src/js/database');

const PSGC_FILE = path.join(__dirname, '..', 'data', 'psgc', 'PSGC-2Q-2026-Publication-Datafile.xlsx');

async function ensurePsgcTables(pool) {
  await pool.execute(`CREATE TABLE IF NOT EXISTS ref_regions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    psgc_code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_region_code (psgc_code),
    INDEX idx_region_name (name)
  ) ENGINE=InnoDB`);

  const [regionCount] = await pool.execute('SELECT COUNT(*) as cnt FROM ref_regions');
  if (regionCount[0].cnt === 0) {
    await pool.execute(`INSERT INTO ref_regions (psgc_code, name) VALUES
      ('01', 'Region I (Ilocos Region)'),
      ('02', 'Region II (Cagayan Valley)'),
      ('03', 'Region III (Central Luzon)'),
      ('04', 'Region IV-A (CALABARZON)'),
      ('05', 'Region V (Bicol Region)'),
      ('06', 'Region VI (Western Visayas)'),
      ('07', 'Region VII (Central Visayas)'),
      ('08', 'Region VIII (Eastern Visayas)'),
      ('09', 'Region IX (Zamboanga Peninsula)'),
      ('10', 'Region X (Northern Mindanao)'),
      ('11', 'Region XI (Davao Region)'),
      ('12', 'Region XII (SOCCSKSARGEN)'),
      ('13', 'National Capital Region (NCR)'),
      ('14', 'Cordillera Administrative Region (CAR)'),
      ('16', 'Region XIII (Caraga)'),
      ('17', 'MIMAROPA Region'),
      ('18', 'Negros Island Region (NIR)'),
      ('19', 'Bangsamoro Autonomous Region In Muslim Mindanao (BARMM)')`);
  }

  await pool.execute(`CREATE TABLE IF NOT EXISTS ref_provinces (
    id INT AUTO_INCREMENT PRIMARY KEY,
    psgc_code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    region_code VARCHAR(10) DEFAULT '',
    region_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_psgc_prov_name (name),
    INDEX idx_prov_region (region_id),
    UNIQUE INDEX uq_prov_psgc (psgc_code),
    FOREIGN KEY (region_id) REFERENCES ref_regions(id) ON DELETE SET NULL
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS ref_municipalities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    province_id INT NOT NULL,
    psgc_code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    municipality_type VARCHAR(20) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_muni_province (province_id),
    INDEX idx_muni_name (name),
    UNIQUE INDEX uq_muni_psgc (psgc_code),
    FOREIGN KEY (province_id) REFERENCES ref_provinces(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS ref_barangays (
    id INT AUTO_INCREMENT PRIMARY KEY,
    municipality_id INT NOT NULL,
    psgc_code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_brgy_municipality (municipality_id),
    INDEX idx_brgy_name (name),
    UNIQUE INDEX uq_brgy_psgc (psgc_code),
    FOREIGN KEY (municipality_id) REFERENCES ref_municipalities(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS psgc_import_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    import_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Success',
    provinces_imported INT DEFAULT 0,
    municipalities_imported INT DEFAULT 0,
    barangays_imported INT DEFAULT 0,
    duplicates_skipped INT DEFAULT 0,
    errors TEXT,
    created_by INT DEFAULT NULL
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS psgc_migration_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT DEFAULT NULL,
    old_province_id INT DEFAULT NULL,
    new_province_id INT DEFAULT NULL,
    old_municipality_id INT DEFAULT NULL,
    new_municipality_id INT DEFAULT NULL,
    old_barangay_id INT DEFAULT NULL,
    new_barangay_id INT DEFAULT NULL,
    migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Success',
    notes TEXT,
    INDEX idx_mig_member (member_id)
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS psgc_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    username VARCHAR(100) DEFAULT '',
    action VARCHAR(100) NOT NULL,
    description TEXT,
    affected_records INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_action (action)
  ) ENGINE=InnoDB`);
}

async function importPsgc(userId) {
  const Excel = require('exceljs');
  const pool = db.getPool();

  await ensurePsgcTables(pool);

  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(PSGC_FILE);

  const ws = wb.getWorksheet('PSGC');
  if (!ws) {
    return { success: false, error: 'PSGC worksheet not found in Excel file' };
  }

  const errors = [];
  let provCount = 0, munCount = 0, brgyCount = 0, dupCount = 0;

  const fs = require('fs');
  if (!fs.existsSync(PSGC_FILE)) {
    return { success: false, error: `PSGC file not found at ${PSGC_FILE}` };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Stable-id import: never TRUNCATE (that destroys foreign-key references used
    // by members.municipality_id / barangay_id). Upsert by psgc_code instead.
    const provInsert = 'INSERT INTO ref_provinces (psgc_code, name, region_code, region_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), region_code=VALUES(region_code), region_id=VALUES(region_id)';
    const munInsert = 'INSERT INTO ref_municipalities (province_id, psgc_code, name, municipality_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE province_id=VALUES(province_id), name=VALUES(name), municipality_type=VALUES(municipality_type)';
    const brgyInsert = 'INSERT INTO ref_barangays (municipality_id, psgc_code, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE municipality_id=VALUES(municipality_id), name=VALUES(name)';

    const provCache = {};
    const munCache = {};
    const regionCache = {};
    const seenProv = new Set();
    const seenMun = new Set();
    const seenBrgy = new Set();
    const [regionRows] = await conn.execute('SELECT id, psgc_code FROM ref_regions');
    for (const r of regionRows) {
      regionCache[r.psgc_code] = r.id;
    }

    let rowCount = 0;
    const provPromises = [];
    ws.eachRow((row, rn) => {
      if (rn === 1) return;
      rowCount++;

      const psgc10 = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      const corrCode = String(row.getCell(3).value || '').trim();
      const geoLevel = String(row.getCell(4).value || '').trim();

      if (!psgc10 || !name || !geoLevel) return;

      try {
        if (geoLevel === 'Prov') {
          const regionCode = corrCode ? corrCode.substring(0, 4) + '00000' : '';
          const regionPrefix = psgc10.substring(0, 2);
          let regionId = null;
          if (regionCache[regionPrefix]) {
            regionId = regionCache[regionPrefix];
          }
          const code = corrCode || psgc10;
          if (seenProv.has(code)) { dupCount++; return; }
          seenProv.add(code);
          provPromises.push(conn.execute(provInsert, [code, name, regionCode, regionId]));
          provCache[corrCode] = { name };
          provCount++;
        }
      } catch (e) {
        if (e.errno === 1062) { dupCount++; }
        else { errors.push(`Row ${rn}: ${e.message}`); }
      }
    });
    await Promise.all(provPromises);

    // Create a single "Metro Manila" synthetic province to group all NCR cities/municipalities
    const ncrRegionId = regionCache['13'];
    let metroManilaProvId = null;
    if (ncrRegionId) {
      try {
        await conn.execute(provInsert, ['1300000000', 'Metro Manila', '', ncrRegionId]);
      } catch (e) {
        if (e.errno !== 1062) errors.push(`Metro Manila province: ${e.message}`);
      }
      const [mmRow] = await conn.execute("SELECT id FROM ref_provinces WHERE psgc_code = '1300000000'");
      if (mmRow.length > 0) metroManilaProvId = mmRow[0].id;
    }
    // Also cache it for the municipality loop below
    const [provRowsForCache] = await conn.execute('SELECT id, psgc_code FROM ref_provinces');
    for (const p of provRowsForCache) {
      if (!provCache[p.psgc_code]) {
        provCache[p.psgc_code] = { id: p.id };
      }
    }

    const [provRows] = await conn.execute('SELECT id, psgc_code, name FROM ref_provinces');
    for (const p of provRows) {
      provCache[p.psgc_code] = { id: p.id, name: p.name };
    }

    const munPromises = [];
    ws.eachRow((row, rn) => {
      if (rn === 1) return;
      const psgc10 = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      const corrCode = String(row.getCell(3).value || '').trim();
      const geoLevel = String(row.getCell(4).value || '').trim();
      if (!psgc10 || !name || !geoLevel) return;
      if (geoLevel !== 'Mun' && geoLevel !== 'City') return;
      try {
        if (corrCode.length >= 4) {
          const provKey = corrCode.substring(0, 4) + '00000';
          const prov = provCache[provKey];
          let effectiveProvId = prov && prov.id ? prov.id : null;
          if (!effectiveProvId && psgc10.startsWith('13') && metroManilaProvId) {
            effectiveProvId = metroManilaProvId;
          }
          if (effectiveProvId) {
            const code = corrCode || psgc10;
            if (seenMun.has(code)) { dupCount++; return; }
            seenMun.add(code);
            munPromises.push(conn.execute(munInsert, [effectiveProvId, code, name, geoLevel]));
            munCache[corrCode] = { province_id: effectiveProvId, name };
            munCount++;
          }
        }
      } catch (e) {
        if (e.errno === 1062) { dupCount++; }
        else { errors.push(`Row ${rn}: ${e.message}`); }
      }
    });
    await Promise.all(munPromises);

    const [munRows] = await conn.execute('SELECT id, psgc_code, province_id, name FROM ref_municipalities');
    for (const m of munRows) {
      munCache[m.psgc_code] = { id: m.id, province_id: m.province_id, name: m.name };
    }

    const brgyPromises = [];
    ws.eachRow((row, rn) => {
      if (rn === 1) return;
      const psgc10 = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      const corrCode = String(row.getCell(3).value || '').trim();
      const geoLevel = String(row.getCell(4).value || '').trim();
      if (!psgc10 || !name || !geoLevel) return;
      if (geoLevel !== 'Bgy') return;
      try {
        if (corrCode.length >= 6) {
          const munKey = corrCode.substring(0, 6) + '000';
          const mun = munCache[munKey];
          if (mun && mun.id) {
            const code = corrCode || psgc10;
            if (seenBrgy.has(code)) { dupCount++; return; }
            seenBrgy.add(code);
            brgyPromises.push(conn.execute(brgyInsert, [mun.id, code, name]));
            brgyCount++;
          }
        }
      } catch (e) {
        if (e.errno === 1062) { dupCount++; }
        else { errors.push(`Row ${rn}: ${e.message}`); }
      }
    });
    await Promise.all(brgyPromises);

    await conn.execute(
      'INSERT INTO psgc_import_logs (status, provinces_imported, municipalities_imported, barangays_imported, duplicates_skipped, errors, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [errors.length === 0 ? 'Success' : 'Partial', provCount, munCount, brgyCount, dupCount, errors.length > 0 ? errors.join('; ') : null, userId || null]
    );

    await conn.commit();
    return {
      success: true,
      provinces: provCount,
      municipalities: munCount,
      barangays: brgyCount,
      duplicates: dupCount,
      errors: errors.length
    };
  } catch (err) {
    await conn.rollback();
    return { success: false, error: err.message };
  } finally {
    conn.release();
  }
}

async function importPsgcOnly() {
  const pool = db.getPool();
  await ensurePsgcTables(pool);
  return importPsgc(null);
}

async function importNcrMissing() {
  const Excel = require('exceljs');
  const pool = db.getPool();
  await ensurePsgcTables(pool);

  const [existing] = await pool.execute("SELECT id FROM ref_provinces WHERE psgc_code = '1300000000'");
  if (existing.length > 0) return { success: true, note: 'Metro Manila already exists', provinces: 0 };

  const fs = require('fs');
  if (!fs.existsSync(PSGC_FILE)) return { success: false, error: 'PSGC file not found' };

  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(PSGC_FILE);
  const ws = wb.getWorksheet('PSGC');
  if (!ws) return { success: false, error: 'PSGC worksheet not found' };

  const ncrRegionRow = (await pool.execute("SELECT id FROM ref_regions WHERE psgc_code = '13'"))[0];
  if (!ncrRegionRow || ncrRegionRow.length === 0) return { success: false, error: 'NCR region not found' };
  const ncrRegionId = ncrRegionRow[0].id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const provInsert = 'INSERT INTO ref_provinces (psgc_code, name, region_code, region_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), region_code=VALUES(region_code), region_id=VALUES(region_id)';
    const munInsert = 'INSERT INTO ref_municipalities (province_id, psgc_code, name, municipality_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE province_id=VALUES(province_id), name=VALUES(name), municipality_type=VALUES(municipality_type)';
    const brgyInsert = 'INSERT INTO ref_barangays (municipality_id, psgc_code, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE municipality_id=VALUES(municipality_id), name=VALUES(name)';
    await conn.execute(provInsert, ['1300000000', 'Metro Manila', '', ncrRegionId]);
    const [mmProv] = await conn.execute("SELECT id FROM ref_provinces WHERE psgc_code = '1300000000'");
    const metroManilaProvId = mmProv.length > 0 ? mmProv[0].id : null;
    if (!metroManilaProvId) return { success: false, error: 'Failed to get Metro Manila province ID' };

    let munCount = 0, brgyCount = 0, dupCount = 0;
    const errors = [];
    const munCache = {};
    const seenMun = new Set();
    const seenBrgy = new Set();
    const munPromises = [];
    const brgyPromises = [];

    ws.eachRow((row, rn) => {
      if (rn === 1) return;
      const psgc10 = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      const corrCode = String(row.getCell(3).value || '').trim();
      const geoLevel = String(row.getCell(4).value || '').trim();
      if (!psgc10 || !name || !geoLevel) return;
      if (!psgc10.startsWith('13')) return;
      if (geoLevel !== 'Mun' && geoLevel !== 'City') return;
      try {
        const code = corrCode || psgc10;
        if (seenMun.has(code)) { dupCount++; return; }
        seenMun.add(code);
        munPromises.push(conn.execute(munInsert, [metroManilaProvId, code, name, geoLevel]));
        munCache[corrCode] = { province_id: metroManilaProvId, name };
        munCount++;
      } catch (e) {
        if (e.errno === 1062) dupCount++;
        else errors.push(`Row ${rn} (mun): ${e.message}`);
      }
    });
    await Promise.all(munPromises);

    const [munRows] = await conn.execute('SELECT id, psgc_code, province_id, name FROM ref_municipalities');
    for (const m of munRows) munCache[m.psgc_code] = { id: m.id, province_id: m.province_id, name: m.name };

    ws.eachRow((row, rn) => {
      if (rn === 1) return;
      const psgc10 = String(row.getCell(1).value || '').trim();
      const name = String(row.getCell(2).value || '').trim();
      const corrCode = String(row.getCell(3).value || '').trim();
      const geoLevel = String(row.getCell(4).value || '').trim();
      if (!psgc10 || !name || !geoLevel) return;
      if (!psgc10.startsWith('13')) return;
      if (geoLevel !== 'Bgy') return;
      try {
        if (corrCode.length >= 6) {
          const munKey = corrCode.substring(0, 6) + '000';
          const mun = munCache[munKey];
          if (mun && mun.id) {
            const code = corrCode || psgc10;
            if (seenBrgy.has(code)) { dupCount++; return; }
            seenBrgy.add(code);
            brgyPromises.push(conn.execute(brgyInsert, [mun.id, code, name]));
            brgyCount++;
          }
        }
      } catch (e) {
        if (e.errno === 1062) dupCount++;
        else errors.push(`Row ${rn} (brgy): ${e.message}`);
      }
    });
    await Promise.all(brgyPromises);

    await conn.commit();
    return {
      success: errors.length === 0,
      provinces: 1,
      municipalities: munCount,
      barangays: brgyCount,
      duplicates: dupCount,
      errors: errors.length
    };
  } catch (err) {
    await conn.rollback();
    return { success: false, error: err.message };
  } finally {
    conn.release();
  }
}

module.exports = { importPsgc, importPsgcOnly, ensurePsgcTables, importNcrMissing };
