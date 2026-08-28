const db = require('../src/js/database');

function toAugYear(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y + 1, 7, d));
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const pool = db.getPool();
  const dryRun = process.argv.includes('--dry-run');

  const [members] = await pool.execute(
    `SELECT Id, af_no, full_name, registration_date, renewal_date FROM members
     WHERE renewal_date BETWEEN '2026-01-01' AND '2026-01-31' ORDER BY Id`
  );

  if (members.length === 0) {
    console.log('No members found with a January 2026 renewal date. Nothing to do.');
    await pool.end();
    process.exit(0);
  }

  const plan = members.map((m) => {
    const target = m.registration_date ? toYmd(toAugYear(m.registration_date)) : null;
    return { id: m.Id, af_no: m.af_no, full_name: m.full_name, old: m.renewal_date, new: target };
  });

  console.log(`Members with January 2026 renewal: ${plan.length}`);
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