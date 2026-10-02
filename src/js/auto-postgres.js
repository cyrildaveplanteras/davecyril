const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Config values are read lazily rather than captured at module load. The
// first-run setup dialog can change DB_PORT / PG_BIN_DIR / PG_DATA_DIR after
// this module has been required, and those values must take effect immediately
// instead of silently keeping the pre-setup defaults.
const DEFAULT_PG_PORT = 5433;
const DEFAULT_PG_BIN_DIR = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const DEFAULT_PG_DATA_DIR = 'C:\\gh-postgres\\data';

const POLL_INTERVAL = 800;
const START_TIMEOUT = 60000;
const STOP_TIMEOUT = 15000;

function pgPort() {
  return parseInt(process.env.DB_PORT, 10) || DEFAULT_PG_PORT;
}
function pgBinDirEnv() {
  return process.env.PG_BIN_DIR || DEFAULT_PG_BIN_DIR;
}
function pgDataDirEnv() {
  return process.env.PG_DATA_DIR || DEFAULT_PG_DATA_DIR;
}

const PG_PATH_CANDIDATES = [
  pgBinDirEnv(),
  'C:\\gh-postgres\\pgsql\\bin',
  'C:\\Program Files\\PostgreSQL\\17\\bin',
  'C:\\Program Files\\PostgreSQL\\16\\bin',
  'C:\\Program Files\\PostgreSQL\\15\\bin',
];

let startedByUs = false;
let startedDataDir = null;

function findPgBinDir() {
  for (const dir of PG_PATH_CANDIDATES) {
    try {
      if (fs.existsSync(path.join(dir, 'pg_ctl.exe')) && fs.existsSync(path.join(dir, 'psql.exe'))) {
        console.log(`auto-postgres: Found PostgreSQL at ${dir}`);
        return dir;
      }
    } catch (_) {}
  }
  console.warn('auto-postgres: PostgreSQL binaries not found at any known path');
  return null;
}

function isPortOpen(port, host) {
  host = host || '127.0.0.1';
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function waitForPort(port, timeout, label) {
  label = label || `port ${port}`;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortOpen(port)) {
      console.log(`auto-postgres: ${label} is ready`);
      return true;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  console.warn(`auto-postgres: ${label} did not start within ${timeout}ms`);
  return false;
}

function startPostgres(binDir) {
  const pgCtlPath = path.join(binDir, 'pg_ctl.exe');
  if (!fs.existsSync(pgCtlPath)) {
    throw new Error(`pg_ctl not found at ${pgCtlPath}`);
  }
  const dataDir = pgDataDirEnv();
  if (!fs.existsSync(dataDir)) {
    throw new Error(`PostgreSQL data directory not found at ${dataDir}`);
  }

  const args = ['start', '-D', dataDir, '-w', '-l', path.join(dataDir, 'server.log')];
  console.log(`auto-postgres: Starting PostgreSQL: ${pgCtlPath} ${args.join(' ')}`);

  const proc = spawn(pgCtlPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  proc.on('error', (err) => {
    console.error('auto-postgres: pg_ctl spawn error:', err.message);
  });

  proc.unref();
}

function stopPostgres(binDir) {
  // Stop the cluster this process actually started, which may differ from the
  // currently configured data directory if setup changed it.
  const dataDir = startedDataDir || pgDataDirEnv();
  const pgCtlPath = path.join(binDir, 'pg_ctl.exe');
  const args = ['stop', '-D', dataDir, '-m', 'fast', '-t', String(STOP_TIMEOUT)];
  console.log(`auto-postgres: Stopping PostgreSQL: ${pgCtlPath} ${args.join(' ')}`);
  const proc = spawn(pgCtlPath, args, {
    stdio: 'ignore',
    windowsHide: true,
  });
  proc.on('error', (err) => {
    console.error('auto-postgres: pg_ctl stop error:', err.message);
  });
  proc.unref();
}

async function ensurePostgresRunning() {
  const port = pgPort();
  console.log(`auto-postgres: Checking PostgreSQL service on port ${port}...`);

  const alreadyRunning = await isPortOpen(port);
  if (alreadyRunning) {
    console.log(`auto-postgres: PostgreSQL already running on port ${port}`);
    return;
  }

  const binDir = findPgBinDir();
  if (!binDir) {
    console.warn('auto-postgres: PostgreSQL not found. Please start PostgreSQL manually.');
    return;
  }

  try {
    startPostgres(binDir);
    startedByUs = true;
    startedDataDir = pgDataDirEnv();
    await waitForPort(port, START_TIMEOUT, `PostgreSQL (port ${port})`);
  } catch (err) {
    console.error('auto-postgres: Failed to start PostgreSQL:', err.message);
  }
}

async function cleanupPostgres() {
  if (!startedByUs) return;
  const binDir = findPgBinDir();
  if (!binDir) return;
  const port = pgPort();
  stopPostgres(binDir);
  const start = Date.now();
  while (Date.now() - start < STOP_TIMEOUT) {
    if (!(await isPortOpen(port))) {
      console.log('auto-postgres: PostgreSQL stopped cleanly');
      startedByUs = false;
      startedDataDir = null;
      return;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  console.warn('auto-postgres: PostgreSQL did not stop in time');
}

module.exports = { ensurePostgresRunning, cleanupPostgres };