// PostgreSQL database initialization for GoldenHope.
// Ensures the database exists, applies the definitive schema (pg-schema.js),
// then runs idempotent boot migrations (pg-migrations.js).
// NOTE: the Electron app performs the same steps automatically at startup;
// this script exists for headless/manual provisioning.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { ensureDatabase, getPool } = require('../src/js/database');
const { runMigrations } = require('../src/js/pg-migrations');

async function initializeDatabase() {
  console.log('=== GoldenHope Database Initialization (PostgreSQL) ===\n');

  await ensureDatabase();

  const pool = getPool();
  await runMigrations(pool);

  const [tables] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = current_schema()'
  );
  console.log(`\nDatabase ready. ${tables[0].cnt} table(s) present in schema.`);
  await pool.end();
  console.log('Done.');
}

initializeDatabase().catch((e) => {
  console.error('Initialization failed:', e.message);
  process.exit(1);
});