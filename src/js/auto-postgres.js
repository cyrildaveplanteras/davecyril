const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

const PG_PORT = parseInt(process.env.DB_PORT, 10) || 5433;
const POLL_INTERVAL = 800;
const START_TIMEOUT = 60000;
const STOP_TIMEOUT = 15000;

const PG_BIN_DIR = process.env.PG_BIN_DIR || 'C:\\Program Files\\PostgreSQL\\17\\bin';
const PG_DATA_DIR = process.env.PG_DATA_DIR || 'C:\\gh-postgres\\data';

const PG_PATH_CANDIDATES = [
  PG_BIN_DIR,
  'C:\\gh-postgres\\pgsql\\bin',
  'C:\\Program Files\\PostgreSQL\\17\\bin',
  'C:\\Program Files\\PostgreSQL\\16\\bin',
  'C:\\Program Files\\PostgreSQL\\15\\bin',
];

let startedByUs = false;

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
  if (!fs.existsSync(PG_DATA_DIR)) {
    throw new Error(`PostgreSQL data directory not found at ${PG_DATA_DIR}`);
  }

  const args = ['start', '-D', PG_DATA_DIR, '-w', '-l', path.join(PG_DATA_DIR, 'server.log')];
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
  const pgCtlPath = path.join(binDir, 'pg_ctl.exe');
  const args = ['stop', '-D', PG_DATA_DIR, '-m', 'fast', '-t', String(STOP_TIMEOUT)];
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
  console.log('auto-postgres: Checking PostgreSQL service...');

  const alreadyRunning = await isPortOpen(PG_PORT);
  if (alreadyRunning) {
    console.log(`auto-postgres: PostgreSQL already running on port ${PG_PORT}`);
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
    await waitForPort(PG_PORT, START_TIMEOUT, `PostgreSQL (port ${PG_PORT})`);
  } catch (err) {
    console.error('auto-postgres: Failed to start PostgreSQL:', err.message);
  }
}

async function cleanupPostgres() {
  if (!startedByUs) return;
  const binDir = findPgBinDir();
  if (!binDir) return;
  stopPostgres(binDir);
  const start = Date.now();
  while (Date.now() - start < STOP_TIMEOUT) {
    if (!(await isPortOpen(PG_PORT))) {
      console.log('auto-postgres: PostgreSQL stopped cleanly');
      startedByUs = false;
      return;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  console.warn('auto-postgres: PostgreSQL did not stop in time');
}

module.exports = { ensurePostgresRunning, cleanupPostgres };