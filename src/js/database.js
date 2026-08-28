const { Pool, types } = require('pg');

let pool = null;

const PLACEHOLDER_PASSWORD = 'CHANGE_ME_STRONG_PASSWORD';

// Case-sensitive identifiers that must be double-quoted in PostgreSQL so result
// rows keep the exact column casing the renderer expects (MySQL-style keys).
const KNOWN_IDENTIFIERS = require('./pg-identifiers');

// Match mysql2 `dateStrings:true` behaviour: DATE and TIMESTAMP are returned as
// plain strings ("YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS") instead of JS Date objects.
types.setTypeParser(1082, (v) => v); // DATE
types.setTypeParser(1114, (v) => v); // TIMESTAMP WITHOUT TIME ZONE
types.setTypeParser(1184, (v) => v); // TIMESTAMP WITH TIME ZONE

// Match mysql2 behaviour for numeric types: COUNT(*), SUM(), bigint identities
// (OID 20 / int8) and NUMERIC/DECIMAL columns (OID 1700) are returned as JS
// numbers, not strings. Without this, `COUNT(*)` comes back as a string, which
// breaks strict `=== 0` checks (last-admin guard, seedUsers) and JS arithmetic
// such as `priorDeposits + 1` (string concat -> "2" + 1 = "21").
types.setTypeParser(20, (v) => parseInt(v, 10)); // INT8 / BIGINT
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC / DECIMAL

// Map PostgreSQL error codes to MySQL-compatible codes/errnos so the existing
// main.js error handling (e.errno, e.code, ER_*) keeps working unchanged.
const PG_ERROR_MAP = {
  '23505': { code: 'ER_DUP_ENTRY', errno: 1062 },
  '23503': { code: 'ER_NO_REFERENCED_ROW_2', errno: 1452 },
  '23502': { code: 'ER_BAD_NULL_ERROR', errno: 1048 },
  '23514': { code: 'ER_CHECK_CONSTRAINT', errno: 3819 },
  '42P01': { code: 'ER_NO_SUCH_TABLE', errno: 1146 },
  '42703': { code: 'ER_BAD_FIELD_ERROR', errno: 1054 },
  '42701': { code: 'ER_DUP_FIELDNAME', errno: 1060 },
  '42601': { code: 'ER_PARSE_ERROR', errno: 1064 },
  '42P07': { code: 'ER_TABLE_EXISTS_ERROR', errno: 1050 },
  '42602': { code: 'ER_PARSE_ERROR', errno: 1064 },
  '40P01': { code: 'ER_LOCK_DEADLOCK', errno: 1213 },
  '22001': { code: 'ER_DATA_TOO_LONG', errno: 1406 },
  '22003': { code: 'ER_DATA_OUT_OF_RANGE', errno: 1264 },
  '22007': { code: 'ER_TRUNCATED_WRONG_VALUE', errno: 1292 },
  '22P02': { code: 'ER_TRUNCATED_WRONG_VALUE', errno: 1292 },
  '3D000': { code: 'ER_BAD_DB_ERROR', errno: 1049 },
  '28P01': { code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 },
  '28000': { code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 },
  '53300': { code: 'ER_TOO_MANY_USER_CONNECTIONS', errno: 1203 },
  '57014': { code: 'ER_QUERY_INTERRUPTED', errno: 1317 },
};

function mapError(err) {
  if (!err) return err;
  if (err.code && err.code.startsWith('2') && PG_ERROR_MAP[err.code]) {
    const mapped = PG_ERROR_MAP[err.code];
    err.code = mapped.code;
    err.errno = mapped.errno;
    err.sqlState = mapped.code;
    err.sqlMessage = err.message;
  } else if (err.code) {
    err.sqlMessage = err.message;
  }
  return err;
}

// Convert MySQL `?` positional placeholders to PostgreSQL `$1..$n`.
// Skips content inside single-quoted strings, double-quoted identifiers,
// backtick identifiers (converted to double quotes) and comments.
// Bare identifiers matching a known mixed-case column are double-quoted so
// PostgreSQL preserves their exact case (matching MySQL result keys).
function convertPlaceholders(sql) {
  let out = '';
  let i = 0;
  let n = 0;
  const len = sql.length;
  const isIdentChar = (ch) => /[A-Za-z0-9_$]/.test(ch);
  while (i < len) {
    const ch = sql[i];
    if (ch === "'") {
      out += ch;
      i++;
      while (i < len) {
        out += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { out += sql[i + 1]; i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
    } else if (ch === '"') {
      out += ch;
      i++;
      while (i < len && sql[i] !== '"') { out += sql[i]; i++; }
      if (i < len) { out += sql[i]; i++; }
    } else if (ch === '`') {
      out += '"';
      i++;
      while (i < len && sql[i] !== '`') { out += sql[i]; i++; }
      if (i < len) { out += '"'; i++; }
    } else if (ch === '-' && sql[i + 1] === '-') {
      out += '--';
      i += 2;
      while (i < len && sql[i] !== '\n') { out += sql[i]; i++; }
    } else if (ch === '/' && sql[i + 1] === '*') {
      out += '/*';
      i += 2;
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) { out += sql[i]; i++; }
      if (i < len) { out += '*/'; i += 2; }
    } else if (ch === '?') {
      n++;
      out += '$' + n;
      i++;
    } else if (isIdentChar(ch)) {
      let j = i;
      while (j < len && isIdentChar(sql[j])) j++;
      const word = sql.slice(i, j);
      if (word.toLowerCase() === 'curdate') {
        // MySQL CURDATE() -> PostgreSQL CURRENT_DATE (no parens).
        let k = j;
        while (k < len && /\s/.test(sql[k])) k++;
        if (sql[k] === '(') {
          let depth = 0;
          while (k < len) {
            if (sql[k] === '(') depth++;
            else if (sql[k] === ')') { depth--; if (depth === 0) { k++; break; } }
            k++;
          }
          out += 'CURRENT_DATE';
          i = k;
        } else {
          out += 'CURRENT_DATE';
          i = j;
        }
      } else if (KNOWN_IDENTIFIERS.has(word)) {
        out += `"${word}"`;
        i = j;
      } else {
        out += word;
        i = j;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function isInsert(sql) {
  return /^\s*INSERT\b/i.test(sql) || (/^\s*WITH\b/i.test(sql) && /\bINSERT\b/i.test(sql));
}

function isSelectLike(sql) {
  return /^\s*(SELECT|WITH|SHOW|EXPLAIN|VALUES)\b/i.test(sql);
}

// Prepare a statement: normalize backticks/placeholders and add `RETURNING *`
// to INSERT statements so `insertId` is always available (mysql2 behaviour).
function prepareStatement(sql) {
  let stmt = String(sql).trim();
  while (stmt.endsWith(';')) stmt = stmt.slice(0, -1).trimEnd();
  if (isInsert(stmt) && !/\bRETURNING\b/i.test(stmt)) {
    stmt = `${stmt} RETURNING *`;
  }
  return convertPlaceholders(stmt);
}

function validateDbConfig() {
  const password = process.env.DB_PASSWORD || '';
  if (password === PLACEHOLDER_PASSWORD) {
    console.warn('⚠️  SECURITY WARNING: Using default placeholder database password!');
    console.warn('   Set a strong password in .env (DB_PASSWORD=your_strong_password)');
    console.warn('   Generate with: openssl rand -base64 32');
  } else if (!password) {
    console.warn('⚠️  SECURITY WARNING: Database password is empty.');
    console.warn('   For production, set a strong password in .env (DB_PASSWORD=your_strong_password)');
  } else if (password.length < 12) {
    console.warn('⚠️  SECURITY WARNING: Database password is too short (<12 chars)!');
  }
}

function poolConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5433,
    user: process.env.DB_USER || 'goldenhope',
    password: process.env.DB_PASSWORD || 'GoldenHopenDamayan',
    database: process.env.DB_NAME || 'goldenhope_db',
    max: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    application_name: 'goldenhope',
    options: '-c timezone=Asia/Manila'
  };
}

async function ensureDatabase() {
  validateDbConfig();
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT, 10) || 5433;
  const user = process.env.DB_USER || 'goldenhope';
  const password = process.env.DB_PASSWORD || 'GoldenHopenDamayan';
  const dbName = process.env.DB_NAME || 'goldenhope_db';
  const admin = new Pool({ host, port, user, password, database: 'postgres', max: 1, connectionTimeoutMillis: 15000 });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}" OWNER "${user.replace(/"/g, '""')}" ENCODING 'UTF8'`);
    }
  } finally {
    await admin.end();
  }
}

function getPool() {
  if (!pool) {
    validateDbConfig();
    const pgPool = new Pool(poolConfig());
    pgPool.on('error', (err) => {
      console.error('[PG POOL] idle client error:', err.message);
    });
    pool = {
      execute: async (sql, params) => runOnPool(pgPool, sql, params),
      query: async (sql, params) => runOnPool(pgPool, sql, params),
      getConnection: async () => {
        const client = await pgPool.connect();
        return new Connection(client);
      },
      end: () => pgPool.end(),
      get pool() { return pgPool; }
    };
  }
  return pool;
}

async function runOnPool(pgPool, sql, params) {
  const client = await pgPool.connect();
  try {
    return await executeOnClient(client, sql, params);
  } catch (err) {
    throw mapError(err);
  } finally {
    client.release();
  }
}

function makeHeader(result) {
  return {
    insertId: result.rows && result.rows[0] ? (result.rows[0].Id ?? result.rows[0].id ?? result.rows[0].ID ?? 0) : 0,
    affectedRows: result.rowCount || 0,
    changedRows: result.rowCount || 0,
    warningStatus: 0,
    info: ''
  };
}

async function executeOnClient(client, sql, params) {
  const prepared = prepareStatement(sql);
  const values = params || [];
  const result = await client.query({ text: prepared, values });
  if (isInsert(prepared)) return [makeHeader(result)];
  if (isSelectLike(prepared)) return [result.rows];
  return [makeHeader(result)];
}

class Connection {
  constructor(client) {
    this._client = client;
  }

  async execute(sql, params) {
    try {
      return await executeOnClient(this._client, sql, params);
    } catch (err) {
      throw mapError(err);
    }
  }

  async query(sql, params) {
    return this.execute(sql, params);
  }

  async beginTransaction() {
    await this._client.query('BEGIN');
  }

  async commit() {
    await this._client.query('COMMIT');
  }

  async rollback() {
    try { await this._client.query('ROLLBACK'); } catch (_) { /* connection may be broken */ }
  }

  release() {
    this._client.release();
  }

  end() {
    this.release();
  }

  get connection() {
    return this._client;
  }
}

// End the current pool (if any) and clear the cache so the next getPool()
// call rebuilds a fresh one. Used after a database restore, where the backing
// database objects were dropped/recreated and any in-flight connections should
// be discarded rather than reused.
function resetPool() {
  if (pool) {
    try { pool.end(); } catch (_) { /* already closing */ }
  }
  pool = null;
}

module.exports = { getPool, resetPool, ensureDatabase, Connection, convertPlaceholders };