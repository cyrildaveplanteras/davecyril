require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function dumpSchema() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  });
  const schema = process.env.MYSQL_DB || 'goldenhope_db';
  try {
    const [tables] = await conn.query(
      `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [schema]);
    const [columns] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`, [schema]);
    const [indexes] = await conn.query(
      `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, [schema]);
    const [fks] = await conn.query(
      `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`, [schema]);

    const dump = {
      schema,
      tables: tables.map(t => ({ name: t.TABLE_NAME, engine: t.ENGINE, collation: t.TABLE_COLLATION, auto_increment: t.AUTO_INCREMENT })),
      columns: columns.map(c => ({
        table: c.TABLE_NAME, name: c.COLUMN_NAME, ordinal: c.ORDINAL_POSITION,
        default: c.COLUMN_DEFAULT, nullable: c.IS_NULLABLE === 'YES',
        type: c.COLUMN_TYPE, dataType: c.DATA_TYPE,
        maxLen: c.CHARACTER_MAXIMUM_LENGTH, numPrec: c.NUMERIC_PRECISION, numScale: c.NUMERIC_SCALE,
        key: c.COLUMN_KEY, extra: c.EXTRA
      })),
      indexes: indexes.map(i => ({
        table: i.TABLE_NAME, name: i.INDEX_NAME, unique: i.NON_UNIQUE === 0,
        seq: i.SEQ_IN_INDEX, column: i.COLUMN_NAME, subPart: i.SUB_PART
      })),
      foreignKeys: fks.map(f => ({
        table: f.TABLE_NAME, name: f.CONSTRAINT_NAME, column: f.COLUMN_NAME,
        refTable: f.REFERENCED_TABLE_NAME, refColumn: f.REFERENCED_COLUMN_NAME
      }))
    };

    const outPath = path.join(__dirname, 'mysql-schema-dump.json');
    fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));
    console.log(`Dumped ${tables.length} tables, ${columns.length} columns, ${indexes.length} indexes, ${fks.length} FKs -> ${outPath}`);

    const tableNames = tables.map(t => t.name);
    console.log('Tables:', tableNames.join(', '));
  } finally {
    await conn.end();
  }
}

dumpSchema().catch(e => { console.error('FAIL', e.message); process.exit(1); });