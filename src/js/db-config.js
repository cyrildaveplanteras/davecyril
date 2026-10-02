// Central loader for GoldenHope's database configuration.
//
// Precedence (highest first):
//   1. real environment variables and .env (loaded by dotenv in main.js)
//   2. %LOCALAPPDATA%\GoldenHope\db-config.json   (user-editable, per machine)
//   3. <app root>\db-config.json                  (packaged defaults, read-only)
//
// The packaged copy holds NON-SECRET defaults only (host, port, db/user name,
// PostgreSQL bin/data directories). The database password is never shipped: it
// is supplied by the first-run setup dialog (src/pages/db-setup.html) and
// written to the per-machine user config, which only that Windows user can read.
//
// This module runs before ./database and ./auto-postgres are required, because
// auto-postgres reads DB_PORT / PG_BIN_DIR / PG_DATA_DIR at module load time.

const fs = require('fs');
const path = require('path');

const CONFIG_FILENAME = 'db-config.json';
const USER_DIR_NAME = 'GoldenHope';

// The only settings the first-run dialog collects. saveDbConfig() is allowed to
// overwrite exactly these in the running process.
const SETUP_FORCED_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

function userConfigDir() {
  const base = process.env.LOCALAPPDATA;
  return base ? path.join(base, USER_DIR_NAME) : null;
}

function userConfigPath() {
  const dir = userConfigDir();
  return dir ? path.join(dir, CONFIG_FILENAME) : null;
}

function packagedConfigPath(rootDir) {
  return path.join(rootDir || __dirname, CONFIG_FILENAME);
}

function readJsonSafe(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

// Copies any non-empty config value into process.env, never overwriting a value
// that is already set. An empty string is treated as "not supplied", which is
// what lets the packaged default file carry `"password": ""`.
//
// options.force  - overwrite process.env even when it is already set. Used only
//                  by saveDbConfig(), because a value the user just typed must
//                  apply to the running process or the correction would not take
//                  effect until the next launch.
// options.only   - allowlist of env keys that force is allowed to touch. The
//                  setup dialog only collects the connection fields, so those
//                  and ONLY those are forced; timezone, connection limit and the
//                  PostgreSQL paths keep the normal "env wins" behaviour and are
//                  never silently reset by a password change.
function applyConfig(cfg, options) {
  const force = !!(options && options.force);
  const only = options && options.only ? options.only : null;
  if (!cfg) return;
  const setValue = (envKey, value) => {
    if (value === undefined || value === null || value === '') return;
    if (force) {
      if (!only || only.includes(envKey)) process.env[envKey] = String(value);
      return;
    }
    if (process.env[envKey] === undefined || process.env[envKey] === '') {
      process.env[envKey] = String(value);
    }
  };
  const d = cfg.database || {};
  setValue('DB_HOST', d.host);
  setValue('DB_PORT', d.port);
  setValue('DB_USER', d.user);
  setValue('DB_PASSWORD', d.password);
  setValue('DB_NAME', d.name);
  setValue('DB_TIMEZONE', d.timezone);
  setValue('DB_CONNECTION_LIMIT', d.connectionLimit);
  const p = cfg.postgres || {};
  setValue('PG_BIN_DIR', p.binDir);
  setValue('PG_DATA_DIR', p.dataDir);
}

// Loads and applies the configuration chain. Returns details the first-run setup
// needs (the writable user config path and whether it exists).
function loadDbConfig(rootDir) {
  const result = { userPath: userConfigPath(), hasUserConfig: false };

  const pkgPath = packagedConfigPath(rootDir);
  const pkgCfg = readJsonSafe(pkgPath);

  // The user-editable copy overrides the packaged one so a machine can correct
  // PG_BIN_DIR / credentials after install without reinstalling. Seed it from
  // the packaged copy on first run so the file exists and is editable.
  const dir = userConfigDir();
  if (dir && result.userPath) {
    const userCfg = readJsonSafe(result.userPath);
    if (userCfg) {
      result.hasUserConfig = true;
    } else if (pkgCfg) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(pkgPath, result.userPath);
        result.hasUserConfig = true;
      } catch (_) { /* cannot seed user config; fall back to packaged */ }
    }
  }

  // Order matters: the user-editable copy is applied first so it wins, and the
  // packaged copy only fills whatever the user copy left unset. Real env vars
  // and .env were populated before this module ran, so neither of these can
  // overwrite them.
  applyConfig(readJsonSafe(result.userPath), { force: false });
  applyConfig(pkgCfg);
  return result;
}

// True when we have enough configuration to attempt a database connection. A
// missing password is the main reason the first-run setup opens, but an
// obviously incomplete config is caught here too so the user is offered the
// setup dialog instead of a cryptic connection error later on.
function hasUsableDbConfig() {
  const required = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'DB_PASSWORD'];
  return required.every((key) => {
    const value = process.env[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

// Persists a first-run configuration to the per-machine user config file and
// applies it to the current process so startup can continue without a restart.
function saveDbConfig(rootDir, cfg) {
  const target = userConfigPath();
  if (!target) {
    return { success: false, error: 'LOCALAPPDATA is not set; cannot save the database configuration.' };
  }
  // Layer the files: packaged defaults are the bottom layer, the existing user
  // config sits on top, and the values just collected by the setup dialog go on
  // top of both. Merging onto the packaged copy alone would silently discard a
  // user's own timezone / PostgreSQL path settings.
  const pkgCfg = readJsonSafe(packagedConfigPath(rootDir)) || {};
  const userCfg = readJsonSafe(target) || {};
  const next = {
    database: Object.assign({}, pkgCfg.database || {}, userCfg.database || {}, cfg.database || {}),
    postgres: Object.assign({}, pkgCfg.postgres || {}, userCfg.postgres || {}, cfg.postgres || {})
  };
  // Never persist an empty secret - it would silently fall back to a default.
  if (!next.database.password) {
    return { success: false, error: 'A database password is required.' };
  }
  try {
    if (!fs.existsSync(path.dirname(target))) fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    return { success: false, error: 'Could not write the database configuration file: ' + err.message };
  }
  // Force only the connection fields the setup dialog collected, so startup can
  // continue without a restart while .env keeps priority for everything else.
  applyConfig(next, { force: true, only: SETUP_FORCED_KEYS });
  return { success: true, path: target };
}

module.exports = {
  CONFIG_FILENAME,
  SETUP_FORCED_KEYS,
  applyConfig,
  loadDbConfig,
  saveDbConfig,
  hasUsableDbConfig,
  userConfigPath,
  packagedConfigPath
};
