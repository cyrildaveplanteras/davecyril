const db = require('../src/js/database');

async function main() {
  const pool = db.getPool();
  const dryRun = process.argv.includes('--dry-run');

  const [members] = await pool.execute(
    `SELECT Id, af_no, full_name, renewal_date FROM members
     WHERE renewal_date IS NOT NULL
     AND EXTRACT(MONTH FROM renewal_date) = 12
     ORDER BY Id`
  );

  if (members.length === 0) {
    console.log('No members found with a December renewal date. Nothing to do.');
    await pool.end();
    process.exit(0);
  }

  const plan = members.map((m) => {
    const day = parseInt(String(m.renewal_date).slice(8, 10), 10);
    const newDate = `2026-12-${String(day).padStart(2, '0')}`;
    return { id: m.Id, af_no: m.af_no, full_name: m.full_name, old: m.renewal_date, new: newDate };
  });

  console.log(`Members with December renewal: ${plan.length}`);
  console.log('\n===== CHANGES =====');
  plan.forEach((t) => console.log(`#${t.id} ${t.af_no} ${t.full_name} | ${t.old} -> ${t.new}`));

  if (dryRun) {
    console.log('\n(dry run - no changes made. Re-run without --dry-run to apply.)');
    await pool.end();
    process.exit(0);
  }

  console.log('\n===== APPLYING UPDATES =====');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const t of plan) {
      await conn.execute('UPDATE members SET renewal_date = ? WHERE Id = ?', [t.new, t.id]);
    }
    await conn.commit();
    console.log(`Committed ${plan.length} updates.`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await pool.end();
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
