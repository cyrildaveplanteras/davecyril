// PostgreSQL boot migrations for GoldenHope.
// Applies the definitive schema (src/js/pg-schema.js) then runs idempotent
// data migrations in PostgreSQL dialect. Replaces the old MySQL bootstrap block.
const { applySchema } = require('./pg-schema');

async function seedUsers(pool) {
  const [existing] = await pool.execute('SELECT COUNT(*) as cnt FROM "users"');
  if (existing[0].cnt === 0) {
    const bcrypt = require('bcryptjs');
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync('admin', salt);
    const encoderHash = bcrypt.hashSync('admin', salt);
    await pool.execute(
      'INSERT INTO "users" ("Username", "PasswordHash", "FullName", "Role", "IsActive", "MustChangePassword") VALUES (?,?,?,?,1,0)',
      ['admin', adminHash, 'System Administrator', 'Admin']
    );
    await pool.execute(
      'INSERT INTO "users" ("Username", "PasswordHash", "FullName", "Role", "IsActive", "MustChangePassword") VALUES (?,?,?,?,1,0)',
      ['encoder', encoderHash, 'Data Encoder', 'Encoder']
    );
    console.log('Default users seeded: admin (Admin) and encoder (Encoder). Passwords set; no forced change on login.');
  }
}

async function backfillRenewalDates(pool) {
  await pool.execute(
    "UPDATE members SET renewal_date = registration_date + INTERVAL '1 year' WHERE renewal_date IS NULL AND registration_date IS NOT NULL"
  );
}

async function autoCorrectHonoraryYears(pool) {
  const [correction] = await pool.execute(
    `UPDATE members m
     SET honorary_years_completed = COALESCE(rc.cnt, 0)
     FROM (
       SELECT rd."MemberId", COUNT(*) as cnt
       FROM remittance_details rd
       JOIN remittances rmt ON rd."RemittanceId" = rmt."Id"
       WHERE rmt."Status" = 'Completed' AND (rd."MF" = 250 OR rd."MF" = 350)
       GROUP BY rd."MemberId"
     ) rc
     WHERE m."Id" = rc."MemberId"
       AND m.membership_status = 'Honorary' AND m.member_status = 'Active'
       AND m.honorary_years_completed != COALESCE(rc.cnt, 0)`
  );
  if (correction.affectedRows > 0) {
    console.log(`Auto-corrected ${correction.affectedRows} Honorary member(s) honorary_years_completed`);
  }
}

async function cleanupDraftRemittances(pool) {
  await pool.execute(
    "DELETE FROM remittances WHERE \"Status\" = 'Draft' AND \"PreparedBy\" = '' AND \"VerifiedBy\" = '' AND \"TotalDeposit\" = 0"
  );
  console.log('Cleaned up old Draft placeholder remittances');
}

async function fixCommissionValues(pool) {
  const [preRemits] = await pool.execute(
    `SELECT DISTINCT "RemittanceId" FROM remittance_details
     WHERE ("MF" >= 250 AND "COM" IN (100.00, 140.00))
        OR ("MF" >= 250 AND ("COM" IS NULL OR "COM" = 0))`
  );
  const [fix100] = await pool.execute(
    'UPDATE remittance_details SET "COM" = 120.00, "NetDeposit" = "Total" - 120.00 WHERE "MF" >= 250 AND "COM" = 100.00'
  );
  const [fix140] = await pool.execute(
    'UPDATE remittance_details SET "COM" = 120.00, "NetDeposit" = "Total" - 120.00 WHERE "MF" >= 250 AND "COM" = 140.00'
  );
  // Bulk/Honorary processing in the legacy MySQL app recorded MF >= 250 rows with
  // COM = 0 (commission bypassed). The central rule awards the flat P120 for any
  // qualifying MF, so normalize those too.
  const [fixZero] = await pool.execute(
    'UPDATE remittance_details SET "COM" = 120.00, "NetDeposit" = "Total" - 120.00 WHERE "MF" >= 250 AND "Total" >= 120 AND ("COM" IS NULL OR "COM" = 0)'
  );
  const totalFixed = (fix100.affectedRows || 0) + (fix140.affectedRows || 0) + (fixZero.affectedRows || 0);
  const recomputed = [];
  for (const r of preRemits) {
    await pool.execute(
      'UPDATE remittances SET "TotalDeposit" = (SELECT COALESCE(SUM(rd."NetDeposit"), 0) FROM remittance_details rd WHERE rd."RemittanceId" = ?) WHERE "Id" = ?',
      [r.RemittanceId, r.RemittanceId]
    );
    recomputed.push(r.RemittanceId);
  }
  if (totalFixed > 0 || recomputed.length > 0) {
    console.log(`Migration: Corrected ${totalFixed} commission record(s) from ₱100/₱140 to ₱120; recomputed TotalDeposit for ${recomputed.length} remittance(s)`);
    try {
      await pool.execute(
        "INSERT INTO audit_logs (\"AdminUserId\", \"Action\", \"Description\", \"CreatedAt\") VALUES (NULL, 'Commission Correction', ?, now())",
        [`Historical Sales Coordinator commission corrected from ₱100 to ₱120 on ${totalFixed} remittance detail(s); TotalDeposit recomputed for ${recomputed.length} remittance(s).`]
      );
    } catch (_) {}
  }
}

async function fixOrphanCommissions(pool) {
  const [fixResult] = await pool.execute(
    `UPDATE commission_transactions ct
     SET "SalesCoordinatorId" = m.sales_coordinator_id
     FROM members m
     WHERE ct."MemberId" = m."Id"
       AND ct."SalesCoordinatorId" IS NULL
       AND m.sales_coordinator_id IS NOT NULL`
  );
  if (fixResult.affectedRows > 0) {
    console.log(`Fixed ${fixResult.affectedRows} orphaned commission_transactions records`);
  }
}

async function ensurePsgc(pool) {
  const [cnt] = await pool.execute('SELECT COUNT(*) as cnt FROM ref_provinces');
  if (cnt[0].cnt === 0) {
    console.log('PSGC tables empty. Starting import...');
    try {
      const { importPsgcOnly } = require('./psgc-importer');
      const result = await importPsgcOnly();
      if (result && result.success) {
        console.log(`PSGC import complete: ${result.provinces} provinces, ${result.municipalities} municipalities, ${result.barangays} barangays`);
      } else {
        console.error('PSGC import failed:', result && result.error);
      }
    } catch (e) {
      console.error('PSGC import failed:', e.message);
    }
  } else {
    console.log(`PSGC data already loaded (${cnt[0].cnt} provinces)`);
  }
}

async function setZdnProvince(pool) {
  const [zdnProv] = await pool.execute(
    "SELECT id FROM ref_provinces WHERE psgc_code = '097200000' OR name LIKE '%Zamboanga del Norte%' LIMIT 1"
  );
  if (zdnProv.length > 0) {
    const zdnId = zdnProv[0].id;
    await pool.execute('UPDATE members SET province_id = ? WHERE province_id IS NULL OR province_id = 0 OR province_id = 1', [zdnId]);
    await pool.execute('UPDATE members SET province_id = ? WHERE province_id = 1', [zdnId]);
  }
}

async function seedBranch(pool) {
  const [existing] = await pool.execute('SELECT COUNT(*) as cnt FROM branches');
  if (existing[0].cnt === 0) {
    await pool.execute(
      "INSERT INTO branches (\"Code\", \"Name\", \"Address\", \"ContactNo\", \"Status\") VALUES (?, ?, ?, ?, 'Active')",
      ['MO', 'Main Office', 'Boulevard Commercial Building - 2nd Floor, Poblacion, Manukan, Zamboanga del Norte', '']
    );
    console.log('Seeded default Main Office branch');
  }
  const [mainOffice] = await pool.execute("SELECT \"Id\" FROM branches WHERE \"Code\" = 'MO' LIMIT 1");
  if (mainOffice.length > 0) {
    const defaultBranchId = mainOffice[0].Id;
    await pool.execute('UPDATE members SET branch_id = ? WHERE branch_id IS NULL', [defaultBranchId]);
  }
}

async function refreshLockStatuses(pool) {
  await pool.execute(
    "UPDATE lock_logs SET \"Status\" = 'Active' WHERE \"Status\" = 'Scheduled' AND \"LockStart\" <= now() AND \"LockEnd\" > now()"
  );
  await pool.execute(
    "UPDATE lock_logs SET \"Status\" = 'Expired' WHERE \"Status\" = 'Scheduled' AND \"LockEnd\" <= now()"
  );
}

// Reconcile member PSGC references if ref IDs changed (re-import scenario).
// Only touches members whose municipality/barangay no longer resolve.
async function reconcileMemberAddresses(pool) {
  const [bad] = await pool.execute(
    `SELECT m."Id" FROM members m
     LEFT JOIN ref_municipalities mu ON m.municipality_id = mu.id
     WHERE m.municipality_id IS NOT NULL AND mu.id IS NULL`
  );
  if (bad.length > 0) {
    await pool.execute('UPDATE members SET municipality_id = NULL WHERE municipality_id IS NOT NULL AND municipality_id NOT IN (SELECT id FROM ref_municipalities)');
    await pool.execute('UPDATE members SET barangay_id = NULL WHERE barangay_id IS NOT NULL AND barangay_id NOT IN (SELECT id FROM ref_barangays)');
    console.log(`Address reconciliation: cleared ${bad.length} dangling municipality reference(s)`);
  }
}

// Section 19: the Activity Log records ONLY login lifecycle events (Login,
// Logout, Login Failed). All financial/operational actions belong in the
// dedicated audit_logs table. This migration backfills existing non-login
// entries into audit_logs and removes them from activitylogs.
async function migrateActivityLogsToAuditLogs(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO audit_logs ("AdminUserId", "Action", "Description", "IpAddress", "UserAgent", "Status", "CreatedAt")
       SELECT "AdminUserId", "Action", "Description", "IpAddress", "UserAgent", "Status", "CreatedAt"
       FROM activitylogs
       WHERE "Action" NOT IN ('Login','Logout','Login Failed')`
    );
    const [del] = await conn.execute(
      `DELETE FROM activitylogs WHERE "Action" NOT IN ('Login','Logout','Login Failed')`
    );
    await conn.commit();
    if (del.affectedRows > 0) {
      console.log(`Moved ${del.affectedRows} non-login activity log record(s) to audit_logs`);
    }
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Ensure the members table exposes every column the registration save query
// references. applySchema uses CREATE TABLE IF NOT EXISTS, so a members table
// that already exists from an older schema revision will NOT gain newly added
// columns — causing registration INSERTs to fail with "column does not exist"
// (which the old error handler masked as a vague "unexpected error"). This
// idempotently backfills any missing columns. Each ALTER is isolated so one
// failure never blocks the rest.
async function ensureMembersColumns(pool) {
  const columns = [
    ['last_renewed_date', 'DATE'],
    ['district', 'VARCHAR(100) DEFAULT \'\''],
    ['membership_status', 'VARCHAR(50) DEFAULT \'Regular\''],
    ['honorary_years_completed', 'INTEGER DEFAULT 0'],
    ['honorary_start_date', 'DATE'],
    ['membership_fee', 'NUMERIC(10,2) DEFAULT 0.00'],
    ['msc', 'NUMERIC(10,2) DEFAULT 0.00'],
    ['hda_balance', 'NUMERIC(10,2) DEFAULT 0.00'],
    ['overall_payment', 'NUMERIC(10,2) DEFAULT 0.00'],
    ['"Savings"', 'NUMERIC(10,2) DEFAULT 0.00'],
    ['birth_date', 'DATE'],
    ['age', 'INTEGER DEFAULT 0'],
    ['gender', 'VARCHAR(20) DEFAULT \'\''],
    ['occupation', 'VARCHAR(200) DEFAULT \'\''],
    ['religion', 'VARCHAR(200) DEFAULT \'\''],
    ['province_id', 'INTEGER DEFAULT 1'],
    ['municipality_id', 'INTEGER'],
    ['barangay_id', 'INTEGER'],
    ['house_no', 'VARCHAR(50) DEFAULT \'\''],
    ['street', 'TEXT'],
    ['complete_address', 'TEXT'],
    ['address', 'TEXT'],
    ['civil_status', 'VARCHAR(50) DEFAULT \'\''],
    ['contact_no', 'VARCHAR(50) DEFAULT \'\''],
    ['family_rep_name', 'VARCHAR(200) DEFAULT \'\''],
    ['family_rep_birthdate', 'DATE'],
    ['family_rep_age', 'INTEGER DEFAULT 0'],
    ['family_rep_gender', 'VARCHAR(20) DEFAULT \'\''],
    ['family_rep_contact', 'VARCHAR(50) DEFAULT \'\''],
    ['barangay_coordinator_id', 'INTEGER'],
    ['sales_coordinator_id', 'INTEGER'],
    ['branch_id', 'INTEGER'],
    ['member_status', 'VARCHAR(50) DEFAULT \'Active\''],
    ['"Notes"', 'TEXT'],
  ];
  let added = 0;
  for (const [col, def] of columns) {
    try {
      await pool.execute(`ALTER TABLE members ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      added++;
    } catch (e) {
      console.error(`ensureMembersColumns: failed to add ${col}:`, e.message);
    }
  }
  if (added > 0) console.log(`ensureMembersColumns: verified ${columns.length} member columns`);
}

async function runMigrations(pool) {
  await applySchema(pool);
  await ensureMembersColumns(pool);
  await seedUsers(pool);
  await backfillRenewalDates(pool);
  await autoCorrectHonoraryYears(pool);
  await cleanupDraftRemittances(pool);
  await fixCommissionValues(pool);
  await fixOrphanCommissions(pool);
  await migrateActivityLogsToAuditLogs(pool);
  await ensurePsgc(pool);
  await setZdnProvince(pool);
  await seedBranch(pool);
  await refreshLockStatuses(pool);
  await reconcileMemberAddresses(pool);
}

module.exports = { runMigrations };