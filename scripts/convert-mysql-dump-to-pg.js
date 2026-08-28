require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getPool } = require('../src/js/database');
const fs = require('fs');
const path = require('path');

const DUMP = process.argv[2] || path.join(__dirname, '..', 'goldenhope_backup_20260820_202408.sql');
const OUT_SQL = process.argv[3] || path.join(require('os').tmpdir(), 'converted_dump.sql');
const OUT_REPORT = OUT_SQL.replace(/\.sql$/, '.report.json');

const TABLE_ORDER = [
  'ref_regions', 'provinces', 'ref_provinces', 'municipalities', 'ref_municipalities',
  'barangays', 'ref_barangays', 'users', 'branches', 'commission_config',
  'sales_coordinators', 'barangay_coordinators', 'app_settings', 'members',
  'remittances', 'remittance_details', 'commission_transactions', 'death_cases',
  'damayan_deductions', 'hda_deductions', 'membership_audit_log', 'notifications',
  'pending_remittances', 'lock_logs', 'login_attempts', 'activitylogs',
  'data_change_log', 'personnel', 'psgc_audit_log', 'psgc_import_logs', 'psgc_migration_logs',
];

const ROW_BATCH = 250;

function extractCreateColumns(createSql) {
  const open = createSql.indexOf('(');
  if (open < 0) return [];
  let depth = 0, end = -1;
  for (let i = open; i < createSql.length; i++) {
    const c = createSql[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = createSql.slice(open + 1, end);
  const segs = [];
  let seg = '', d = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') d++;
    else if (c === ')') d--;
    if (c === ',' && d === 0) { segs.push(seg); seg = ''; continue; }
    seg += c;
  }
  if (seg.trim()) segs.push(seg);
  const cols = [];
  for (const s of segs) {
    const m = s.trim().match(/^`([^`]+)`/);
    if (m) cols.push(m[1]);
  }
  return cols;
}

function parseCreateTables(text) {
  const map = {};
  const re = /CREATE TABLE `([^`]+)`/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const start = m.index;
    const close = findMatchingParen(text, text.indexOf('(', m.index));
    if (close < 0) continue;
    map[name] = extractCreateColumns(text.slice(start, close + 1));
  }
  return map;
}

function findMatchingParen(text, open) {
  if (open < 0) return -1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function parseValueList(text, startIdx) {
  let i = startIdx;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '(') throw new Error(`expected '(' at offset ${i}`);
  const rows = [];
  let depth = 0, row = [], cur = '', hasToken = false, inString = false, done = false;
  while (i < text.length && !done) {
    const c = text[i];
    if (inString) {
      cur += c;
      if (c === '\\') { cur += text[i + 1] || ''; i += 2; continue; }
      if (c === "'") inString = false;
      i++;
      continue;
    }
    if (c === "'") { inString = true; hasToken = true; cur += c; i++; continue; }
    if (c === '(') { depth++; if (depth > 1) cur += c; i++; continue; }
    if (c === ')') {
      depth--;
      if (depth === 0) {
        if (hasToken) row.push(cur);
        rows.push(row);
        row = []; cur = ''; hasToken = false;
        i++;
        while (i < text.length && /\s/.test(text[i])) i++;
        if (text[i] === ',') { i++; while (i < text.length && /\s/.test(text[i])) i++; }
        else if (text[i] === ';') { done = true; i++; }
        else throw new Error(`expected ',' or ';' at offset ${i}`);
        continue;
      }
      if (depth >= 1) cur += c;
      i++; continue;
    }
    if (c === ',' && depth === 1) { row.push(cur); cur = ''; hasToken = false; i++; continue; }
    cur += c; hasToken = true; i++;
  }
  return { rows, endIdx: i };
}

function parseInserts(text) {
  const map = {};
  const re = /INSERT INTO `([^`]+)`\s+VALUES\s*/g;
  let m;
  while ((m = re.exec(text))) {
    const table = m[1];
    const res = parseValueList(text, re.lastIndex);
    re.lastIndex = res.endIdx;
    (map[table] = map[table] || []).push(...res.rows);
  }
  return map;
}

function unescapeMysql(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      switch (n) {
        case '0': out += '\0'; break;
        case 'b': out += '\b'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'Z': out += '\x1a'; break;
        case '\\': out += '\\'; break;
        case "'": out += "'"; break;
        case '"': out += '"'; break;
        default: out += n; break;
      }
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

function toPgLiteral(raw) {
  const t = raw.trim();
  if (t === 'NULL' || t === 'null' || t === 'NULL\n') return 'NULL';
  if (t.charAt(0) === "'") {
    let inner = t.slice(1, t.length - 1);
    if (/^0{4}-0{2}-0{2}([ ]0{2}:[0-9:. ]*)?$/.test(inner)) return 'NULL';
    inner = unescapeMysql(inner);
    return `'${inner.replace(/'/g, "''")}'`;
  }
  if (t.slice(0, 2) === '0x') {
    const hex = t.slice(2);
    let str = '';
    for (let k = 0; k + 1 < hex.length; k += 2) str += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
    return `'${str.replace(/'/g, "''")}'`;
  }
  return t;
}

async function main() {
  const raw = fs.readFileSync(DUMP, 'utf8').replace(/^\uFEFF/, '');
  const pool = getPool();

  const createMap = parseCreateTables(raw);
  const insertMap = parseInserts(raw);
  const report = {};

  const identityCols = [];
  const [idents] = await pool.execute(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public' AND (column_default LIKE 'nextval(%' OR is_identity = 'YES')`
  );
  for (const id of idents) identityCols.push(id);

  const sqlOut = [];
  sqlOut.push("SET client_encoding = 'UTF8';");
  sqlOut.push('SET standard_conforming_strings = on;');
  sqlOut.push('BEGIN;');

  for (const table of TABLE_ORDER) {
    const dumpCols = createMap[table] || [];
    const rows = insertMap[table] || [];
    const [pgColsRes] = await pool.execute(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name = ? ORDER BY ordinal_position`,
      [table]
    );
    const pgCols = pgColsRes.map(c => c.column_name);

    const idxByPg = pgCols.map(pc => dumpCols.indexOf(pc));
    const usable = pgCols.filter((pc, k) => idxByPg[k] >= 0);

    let loaded = 0;
    let bad = 0;
    const badSamples = [];
    for (let b = 0; b < rows.length; b += ROW_BATCH) {
      const chunk = rows.slice(b, b + ROW_BATCH);
      const tuples = [];
      for (const r of chunk) {
        const vals = usable.map((pc, k) => {
          const v = toPgLiteral(r[idxByPg[k]]);
          return v;
        });
        if (vals.length !== usable.length) { bad++; continue; }
        tuples.push(`(${vals.join(', ')})`);
        loaded++;
      }
      if (tuples.length) {
        const colsSql = usable.map(c => `"${c}"`).join(', ');
        sqlOut.push(`INSERT INTO "${table}" (${colsSql}) VALUES ${tuples.join(',\n')};`);
      }
    }

    report[table] = { found: rows.length, loaded, bad, pgColumns: pgCols.length, dumpColumns: dumpCols.length, usable: usable.length, badSamples };
    console.log(`${table}: dump=${rows.length} loaded=${loaded} bad=${bad}`);
  }

  sqlOut.push('COMMIT;');

  for (const id of identityCols) {
    sqlOut.push(
      `SELECT setval(pg_get_serial_sequence('${id.table_name}','"${id.column_name}"'), GREATEST((SELECT COALESCE(MAX("${id.column_name}"),1) FROM "${id.table_name}"),1), (SELECT "MAXV" FROM (SELECT COALESCE(MAX("${id.column_name}"),0) AS "MAXV" FROM "${id.table_name}") s) > 0);`
    );
  }

  fs.writeFileSync(OUT_SQL, sqlOut.join('\n') + '\n', 'utf8');
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nWrote ${OUT_SQL} (${(fs.statSync(OUT_SQL).size / 1024).toFixed(1)} KB)`);
  console.log(`Report: ${OUT_REPORT}`);
  await pool.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });