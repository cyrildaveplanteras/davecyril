require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const { getPool } = require('../src/js/database');
const { applySchema } = require('../src/js/pg-schema');
const fs = require('fs');
const path = require('path');

// Dependency order: parents before children so FKs are satisfied.
const TABLE_ORDER = [
  'ref_regions',
  'provinces',
  'ref_provinces',
  'municipalities',
  'ref_municipalities',
  'barangays',
  'ref_barangays',
  'users',
  'branches',
  'commission_config',
  'sales_coordinators',
  'barangay_coordinators',
  'app_settings',
  'members',
  'remittances',
  'remittance_details',
  'commission_transactions',
  'death_cases',
  'damayan_deductions',
  'hda_deductions',
  'membership_audit_log',
  'notifications',
  'pending_remittances',
  'lock_logs',
  'login_attempts',
  'activitylogs',
  'data_change_log',
  'personnel',
  'psgc_audit_log',
  'psgc_import_logs',
  'psgc_migration_logs',
];

const BATCH_SIZE = 500;

function quoteIdent(name) {
  return /[A-Z\s]/.test(name) ? `"${name}"` : name;
}

async function getPgColumns(pool, table) {
  const [cols] = await pool.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ? ORDER BY ordinal_position",
    [table]
  );
  return cols.map(c => c.column_name);
}

async function getPgPk(pool, table) {
  const [pk] = await pool.execute(
    `SELECT kcu.column_name FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema='public' AND tc.table_name = ? AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table]
  );
  return pk.length ? pk[0].column_name : null;
}

function escapeSqlString(v) {
  return String(v).replace(/'/g, "''");
}

async function migrateTable(mysqlConn, pgPool, table, report) {
  const cols = await getPgColumns(pgPool, table);
  const pk = await getPgPk(pgPool, table);
  const colIdent = cols.map(quoteIdent);
  const [cnt] = await mysqlConn.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
  const total = cnt[0].c;
  report[table] = { found: total, migrated: 0, failed: 0, errors: [] };

  if (total === 0) {
    console.log(`  ${table}: 0 rows (skip)`);
    return;
  }

  // Stream from MySQL in batches (keyset pagination keeps large tables fast).
  let lastId = null;
  let migrated = 0;
  let failed = 0;
  const pkIdent = pk ? quoteIdent(pk) : null;

  while (true) {
    const where = lastId != null ? ` WHERE \`${pk}\` > ${Number(lastId)}` : '';
    const sql = `SELECT \`${cols.join('\`,\`')}\` FROM \`${table}\`${where} ORDER BY \`${pk}\` LIMIT ${BATCH_SIZE}`;
    const [rows] = await mysqlConn.query({ sql, rowsAsArray: true });

    if (rows.length === 0) break;

    // Build multi-row INSERT with $n placeholders
    const valueClauses = [];
    const params = [];
    for (const row of rows) {
      const placeholders = row.map(() => '?').join(',');
      valueClauses.push(`(${placeholders})`);
      for (const v of row) params.push(v);
      if (pk) lastId = row[cols.indexOf(pk)];
    }

    const insertSql = `INSERT INTO ${quoteIdent(table)} (${colIdent.join(', ')}) VALUES ${valueClauses.join(', ')}`;
    try {
      await pgPool.execute(insertSql, params);
      migrated += rows.length;
    } catch (err) {
      // Fallback: try row-by-row so a single bad row doesn't abort the table.
      failed += rows.length;
      for (const row of rows) {
        try {
          const placeholders = row.map(() => '?').join(',');
          await pgPool.execute(
            `INSERT INTO ${quoteIdent(table)} (${colIdent.join(', ')}) VALUES (${placeholders})`,
            row
          );
          migrated += 1;
          failed -= 1;
        } catch (rowErr) {
          if (report[table].errors.length < 10) {
            report[table].errors.push({ row: row[0], error: rowErr.message });
          }
        }
      }
      console.log(`  ${table}: batch error (${err.message.slice(0, 100)}), fell back to row-by-row`);
    }
  }

  report[table].migrated = migrated;
  report[table].failed = failed;
  console.log(`  ${table}: migrated ${migrated}/${total}${failed ? ` (${failed} failed)` : ''}`);
}

async function resetSequences(pgPool, report) {
  const [identities] = await pgPool.execute(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public' AND (column_default LIKE 'nextval(%' OR is_identity = 'YES')`
  );
  for (const id of identities) {
    const seqSql = `pg_get_serial_sequence('${id.table_name}', '${id.column_name}')`;
    const [mx] = await pgPool.execute(
      `SELECT COALESCE(MAX(${quoteIdent(id.column_name)}), 0) AS m FROM ${quoteIdent(id.table_name)}`
    );
    const maxVal = Number(mx[0].m) || 0;
    await pgPool.execute(
      `SELECT setval(${seqSql}, GREATEST(${maxVal}, 1), ${maxVal > 0})`
    );
  }
  console.log(`  Reset ${identities.length} identity sequences`);
}

async function reconcile(mysqlConn, pgPool, report) {
  const mismatches = [];
  for (const table of TABLE_ORDER) {
    const [mc] = await mysqlConn.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
    const [pc] = await pgPool.execute(`SELECT COUNT(*) AS c FROM ${quoteIdent(table)}`);
    const m = mc[0].c;
    const p = Number(pc[0].c);
    if (m !== p) {
      mismatches.push(`${table}: mysql=${m} pg=${p}`);
      console.log(`  MISMATCH ${table}: mysql=${m} pg=${p}`);
    } else {
      console.log(`  OK ${table}: ${m}`);
    }
  }
  return mismatches;
}

async function main() {
  console.log('=== GoldenHope MySQL → PostgreSQL Migration ===\n');

  const mysqlConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    dateStrings: true,
  });
  await mysqlConn.query(`USE \`${process.env.MYSQL_DB || 'goldenhope_db'}\``);

  const pgPool = getPool();

  try {
    console.log('Applying PostgreSQL schema...');
    await applySchema(pgPool);

    const report = {};
    for (const table of TABLE_ORDER) {
      await migrateTable(mysqlConn, pgPool, table, report);
    }

    console.log('\nResetting identity sequences...');
    await resetSequences(pgPool, report);

    console.log('\nReconciling row counts...');
    const mismatches = await reconcile(mysqlConn, pgPool, report);

    // Financial reconciliation
    console.log('\nFinancial reconciliation...');
    const finChecks = [
      ['members', 'msc'], ['members', 'overall_payment'], ['members', 'hda_balance'], ['members', 'Savings'],
      ['remittances', 'TotalDeposit'],
      ['remittance_details', 'MF'], ['remittance_details', 'MSC'], ['remittance_details', 'Savings'],
      ['remittance_details', 'Total'], ['remittance_details', 'COM'], ['remittance_details', 'NetDeposit'],
      ['commission_transactions', 'CommissionAmount'], ['commission_transactions', 'NetMSCAmount'],
      ['commission_transactions', 'MSCAmount'],
      ['damayan_deductions', 'Amount'],
    ];
    for (const [t, c] of finChecks) {
      const [mc] = await mysqlConn.query(`SELECT COALESCE(SUM(\`${c}\`),0) AS s FROM \`${t}\``);
      const [pc] = await pgPool.execute(`SELECT COALESCE(SUM(${quoteIdent(c)}),0) AS s FROM ${quoteIdent(t)}`);
      const ms = Number(mc[0].s);
      const ps = Number(pc[0].s);
      const match = Math.abs(ms - ps) < 0.01;
      if (!match) mismatches.push(`${t}.${c}: mysql=${ms} pg=${ps}`);
      console.log(`  ${match ? 'OK' : 'MISMATCH'} ${t}.${c}: ${ms} vs ${ps}`);
    }

    // Report file
    const outPath = path.join(__dirname, 'migration-report.json');
    const fullReport = {
      date: new Date().toISOString(),
      tables: report,
      mismatches,
      financialChecks: finChecks.length,
      status: mismatches.length === 0 ? 'SUCCESS' : 'REVIEW REQUIRED',
    };
    fs.writeFileSync(outPath, JSON.stringify(fullReport, null, 2));
    console.log(`\nReport written to ${outPath}`);

    if (mismatches.length > 0) {
      console.log(`\n⚠️  ${mismatches.length} mismatches — review migration-report.json`);
      process.exitCode = 1;
    } else {
      console.log('\n✅ Migration complete: all tables reconciled.');
    }
  } finally {
    await mysqlConn.end();
    await pgPool.end();
  }
}

main().catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); });