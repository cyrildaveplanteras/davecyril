require('dotenv').config();

// Load db-config.json (project root) as a fallback config source. Real
// environment variables and .env (loaded above) take precedence; db-config.json
// only fills values that are still unset. This must run BEFORE requiring
// ./src/js/database and ./src/js/auto-postgres, since auto-postgres reads
// DB_PORT/PG_BIN_DIR/PG_DATA_DIR at module load time.
(function loadDbConfigJson() {
  try {
    const fs = require('fs');
    const path = require('path');
    const applyConfig = (cfg) => {
      if (!cfg) return;
      const setIfMissing = (envKey, value) => {
        if (value === undefined || value === null || value === '') return;
        if (process.env[envKey] === undefined || process.env[envKey] === '') {
          process.env[envKey] = String(value);
        }
      };
      const d = cfg.database || {};
      setIfMissing('DB_HOST', d.host);
      setIfMissing('DB_PORT', d.port);
      setIfMissing('DB_USER', d.user);
      setIfMissing('DB_PASSWORD', d.password);
      setIfMissing('DB_NAME', d.name);
      setIfMissing('DB_TIMEZONE', d.timezone);
      setIfMissing('DB_CONNECTION_LIMIT', d.connectionLimit);
      const p = cfg.postgres || {};
      setIfMissing('PG_BIN_DIR', p.binDir);
      setIfMissing('PG_DATA_DIR', p.dataDir);
    };
    // Packaged config (inside app.asar) is read-only; load it as the base.
    const pkgPath = path.join(__dirname, 'db-config.json');
    let pkgCfg = null;
    if (fs.existsSync(pkgPath)) {
      try { pkgCfg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch (_) {}
    }
    // User-editable config lives in %LOCALAPPDATA%\GoldenHope\db-config.json.
    // It overrides the packaged copy so the user can correct PG_BIN_DIR /
    // credentials after install without reinstalling. Seed it from the packaged
    // copy on first run so the file exists and is editable.
    const userDir = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'GoldenHope') : null;
    let userCfg = null;
    if (userDir) {
      const userPath = path.join(userDir, 'db-config.json');
      if (fs.existsSync(userPath)) {
        try { userCfg = JSON.parse(fs.readFileSync(userPath, 'utf8')); } catch (_) {}
      } else if (pkgCfg) {
        try {
          if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
          fs.copyFileSync(pkgPath, userPath);
          userCfg = pkgCfg;
        } catch (_) { /* cannot seed user config; fall back to packaged */ }
      }
    }
    // Precedence: real env / .env  >  userData config  >  packaged config.
    applyConfig(pkgCfg);
    applyConfig(userCfg);
  } catch (_) { /* ignore config load errors; rely on .env + built-in defaults */ }
})();

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./src/js/database');
const bcrypt = require('bcryptjs');
const { autoUpdater } = require('electron-updater');
const { ensurePostgresRunning, cleanupPostgres } = require('./src/js/auto-postgres');
const BusinessRules = require('./src/js/business-rules');
const { runMigrations } = require('./src/js/pg-migrations');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;
// Only log updater internals during development.
if (!app.isPackaged) autoUpdater.logger = console;

// How often to re-check for updates (ms). First check happens shortly after the
// window loads (see did-finish-load below).
const UPDATER_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours

// Single-instance lock: prevent multiple app instances from running at once
// (they could otherwise contend over the same MySQL schema migrations and IPC).
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Tracks the updater lifecycle so the renderer can render the correct banner/
// status even if it subscribed after an event fired (e.g. page navigation).
let updaterState = {
  status: 'idle',
  appVersion: app.getVersion(),
  availableVersion: null,
  percent: 0,
  error: null
};

// Returns the configured update feed, or null when publishing is not actually
// configured. The GitHub owner/repo in package.json is a placeholder until the
// real repository is wired up; the app must never phone home to a fake host,
// so any placeholder-looking owner/repo disables the updater entirely.
function getUpdateFeedConfig() {
  try {
    const pkg = require('./package.json');
    const pub = (pkg.build && pkg.build.publish) || null;
    if (!pub) return null;
    if (pub.provider === 'github') {
      const owner = (pub.owner || '').trim();
      const repo = (pub.repo || '').trim();
      if (!owner || !repo) return null;
      if (/(YOUR|CHANGE|REPLACE|TODO|PLACEHOLDER)/i.test(owner + ' ' + repo)) return null;
      return { provider: 'github', owner, repo };
    }
    if (pub.provider === 'generic') {
      const url = (pub.url || '').trim();
      if (!url || url.includes('your-update-server.com')) return null;
      return { provider: 'generic', url };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function isUpdateServerConfigured() {
  return getUpdateFeedConfig() !== null;
}

// Push the current updater state to the renderer. Safe to call anytime; no-ops
// when the window is gone.
function broadcastUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', updaterState);
  }
}

function safeCheckForUpdates() {
  // Never check for updates from an unpackaged dev build.
  if (!app.isPackaged) return;
  if (!isUpdateServerConfigured()) return;
  autoUpdater.checkForUpdates().catch((err) => {
    // Silent fail: log but don't update UI state for network errors
    const msg = err && err.message ? err.message : String(err);
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|socket hang up|network|timeout|unreachable/i.test(msg)) {
      console.log('[UPDATE] Check skipped (offline or network error):', msg);
      return;
    }
    // Non-network errors: surface to UI
    updaterState = {
      ...updaterState,
      status: 'error',
      error: msg
    };
    broadcastUpdateStatus();
    console.error('[UPDATE] check failed:', msg);
  });
}

// Turn a raw pg_dump/pg_restore/psql stderr into a user-actionable message when
// the client major version does not match the server major version.
function friendlyPgVersionError(detail) {
  const d = detail || '';
  if (/server version/i.test(d) && /(not supported|mismatch|newer than|older than|incompatible)/i.test(d)) {
    return 'Database operation failed: the installed PostgreSQL client tools (pg_dump/pg_restore/psql) are a different major version than the server. ' +
      'Install the matching client tools (same major version as the server) and set PG_BIN_DIR to their bin folder, or remove PG_BIN_DIR to let the app auto-detect the correct version.';
  }
  return d;
}

function findPgBinary(name) {
  const fs = require('fs');
  const { execFileSync } = require('child_process');
  // Candidate directories in priority order. We intentionally do NOT short-circuit
  // on PG_BIN_DIR: that pin can point at an older major version than the running
  // server (e.g. pg_dump 16 vs PostgreSQL 17), which fails with a version mismatch.
  // Instead we collect every candidate and pick the NEWEST client major version
  // available (see below).
  const candidateDirs = [];
  if (process.env.PG_BIN_DIR) candidateDirs.push(process.env.PG_BIN_DIR);
  candidateDirs.push(
    'C:\\gh-postgres\\pgsql\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    'C:\\Program Files\\PostgreSQL\\15\\bin',
    'C:\\Program Files (x86)\\PostgreSQL\\17\\bin',
    'C:\\Program Files (x86)\\PostgreSQL\\16\\bin',
    'C:\\Program Files (x86)\\PostgreSQL\\15\\bin',
    'C:\\PostgreSQL\\17\\bin',
    'C:\\PostgreSQL\\16\\bin',
    'C:\\PostgreSQL\\15\\bin'
  );
  // Enumerate any PostgreSQL version installed under the default Program Files
  // locations so pg_dump/pg_restore/psql are found regardless of major version.
  for (const base of ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL', 'C:\\PostgreSQL']) {
    try {
      if (fs.existsSync(base)) {
        for (const sub of fs.readdirSync(base)) {
          const bin = path.join(base, sub, 'bin');
          if (fs.existsSync(path.join(bin, `${name}.exe`))) candidateDirs.push(bin);
        }
      }
    } catch (_) { /* ignore unreadable dirs */ }
  }
  // Deduplicate and collect the binaries that actually exist, capturing each
  // one's major version from `<name> --version`.
  const seen = new Set();
  const candidates = [];
  for (const dir of candidateDirs) {
    if (!dir) continue;
    const full = path.join(dir, `${name}.exe`);
    if (seen.has(full)) continue;
    try { if (!fs.existsSync(full)) continue; } catch (_) { continue; }
    seen.add(full);
    let major = null;
    try {
      const out = execFileSync(full, ['--version'], { timeout: 10000, windowsHide: true }).toString();
      const m = out.match(/(\d+)\.(\d+)/);
      if (m) major = parseInt(m[1], 10);
    } catch (_) { /* binary present but --version failed; rank it last */ }
    candidates.push({ full, major });
  }
  if (candidates.length === 0) return null;
  // Prefer the newest PostgreSQL client major version. A newer pg_dump/pg_restore
  // can target an older server, but an older client CANNOT target a newer server
  // (the reported "server version mismatch"), so choosing the highest available
  // major is the safe universal rule and fixes the 16-client vs 17-server case.
  candidates.sort((a, b) => (b.major == null ? -1 : a.major == null ? 1 : b.major - a.major));
  const best = candidates[0];
  if (best.major != null) {
    console.log(`[PG] using ${name} v${best.major} at ${best.full}`);
  }
  return best.full;
}

function maskSqlError(error) {
  if (!error) return 'An unexpected error occurred';
  // Under PostgreSQL, database.js maps PG error codes to MySQL-style codes on
  // `error.code` and copies the real message into `error.sqlMessage`. The
  // classifier below must inspect BOTH so real failures are not silently
  // reported as a vague "unexpected error".
  const code = error.code || '';
  const msg = error.sqlMessage || error.message || '';
  const sqlPatterns = [
    'ER_PARSE_ERROR', 'ER_DUP_ENTRY', 'ER_NO_REFERENCED_ROW_2', 'ER_NO_SUCH_TABLE',
    'ER_BAD_FIELD_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_LOCK_DEADLOCK',
    'ER_ROW_IS_REFERENCED_2', 'ER_ROW_IS_REFERENCED_',
    'ER_TRUNCATED_WRONG_VALUE', 'ER_DATA_TOO_LONG', 'ER_UNKNOWN_COLUMN',
    'ER_CANT_OPEN_FILE', 'ER_TABLE_EXISTS_ERROR',
  ];
  const haystack = `${code} ${msg}`;
  for (const pat of sqlPatterns) {
    if (haystack.includes(pat)) return 'A database error occurred. Please try again or contact support.';
  }
  // Unrecognized error: log the real cause and surface it so it can be diagnosed.
  console.error('[SQL ERROR]', code, msg);
  return msg ? `Save failed: ${msg}` : 'An unexpected error occurred. Please try again or contact support.';
}

let mainWindow;

autoUpdater.on('checking-for-update', () => {
  updaterState = { ...updaterState, status: 'checking', error: null };
  mainWindow?.webContents.send('update:checking');
  broadcastUpdateStatus();
});
autoUpdater.on('update-available', (info) => {
  updaterState = { ...updaterState, status: 'available', availableVersion: info && info.version, error: null, percent: 0 };
  mainWindow?.webContents.send('update:available', info);
  broadcastUpdateStatus();
});
autoUpdater.on('update-not-available', (info) => {
  updaterState = { ...updaterState, status: 'not-available', availableVersion: info && info.version, error: null, percent: 0 };
  mainWindow?.webContents.send('update:not-available', info);
  broadcastUpdateStatus();
});
autoUpdater.on('download-progress', (progress) => {
  const pct = progress && progress.percent != null ? Math.round(progress.percent) : 0;
  updaterState = { ...updaterState, status: 'downloading', percent: pct, error: null };
  mainWindow?.webContents.send('update:downloading', progress);
  broadcastUpdateStatus();
});
autoUpdater.on('update-downloaded', (info) => {
  updaterState = { ...updaterState, status: 'downloaded', availableVersion: info && info.version, percent: 100, error: null };
  mainWindow?.webContents.send('update:downloaded', info);
  broadcastUpdateStatus();
});
autoUpdater.on('error', (err) => {
  const msg = err && err.message ? err.message : String(err);
  // Ignore network/connectivity errors - these are expected offline
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|socket hang up|network|timeout|unreachable/i.test(msg)) {
    console.log('[UPDATE] Network error (offline):', msg);
    return;
  }
  // Real errors (corrupt download, etc.) still surface
  updaterState = {
    ...updaterState,
    status: 'error',
    error: msg
  };
  mainWindow?.webContents.send('update:error', updaterState.error);
  broadcastUpdateStatus();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0F172A',
    title: 'GoldenHope Member Management System',
    icon: path.join(__dirname, 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Content Security Policy - restrictive but allows app functionality
      // script-src: allow 'self' (local files) and 'unsafe-inline' for inline event handlers
      // style-src: allow 'self' and 'unsafe-inline' for dynamic styles
      // img-src: allow data: for base64 images, blob: for generated images
      // font-src: allow data: for base64 fonts
      // connect-src: allow 'self' for IPC (though IPC doesn't use network)
      csp: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'pages', 'login.html')).catch(err => {
    console.error('Failed to load login page:', err.message);
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    // Allow navigation between the app's own pages (login <-> main), block everything else
    const allowed = url.startsWith('file://') &&
      (url.includes('/src/pages/login.html') || url.includes('/src/pages/main.html'));
    if (!allowed) e.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow the app's own blank print/preview windows (window.open('', '_blank')),
    // keep them isolated, and deny everything else (external URLs, remote content).
    if (url === 'about:blank' || url === '') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            javascript: true,
            webSecurity: true
          }
        }
      };
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(safeCheckForUpdates, 5000);
    setInterval(safeCheckForUpdates, UPDATER_CHECK_INTERVAL_MS);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[DIAG] render-process-gone reason=' + details.reason + ' exitCode=' + details.exitCode);
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[DIAG] renderer unresponsive');
  });
  const mainWinId = mainWindow.webContents.id;
  mainWindow.on('closed', () => {
    sessions.delete(mainWinId);
    console.error('[DIAG] mainWindow closed');
  });
}

app.whenReady().then(async () => {
  if (!gotTheLock) return;

  // Auto-start PostgreSQL if not already running
  try {
    await ensurePostgresRunning();
  } catch (pgErr) {
    console.error('Failed to auto-start PostgreSQL:', pgErr.message);
  }

  // Ensure the database exists before creating pool
  try {
    await db.ensureDatabase();
  } catch (dbErr) {
    console.error('Failed to ensure database exists:', dbErr.message);
  }

  // Acquire migration lock to prevent race conditions on multi-instance
  const migrationLockName = 'goldenhope_migration_lock';
  let lockReleased = false;
  try {
    const pool = db.getPool();
    const [lockResult] = await pool.execute("SELECT pg_try_advisory_lock(hashtext('goldenhope_migration_lock')) AS acquired");
    if (lockResult[0].acquired !== true) {
      console.warn('Could not acquire migration lock, proceeding anyway...');
    }
  } catch (lockErr) {
    console.warn('Migration lock acquisition failed:', lockErr.message);
  }

  const releaseLock = async () => {
    if (lockReleased) return;
    lockReleased = true;
    try {
      const pool = db.getPool();
      await pool.execute("SELECT pg_advisory_unlock(hashtext('goldenhope_migration_lock'))");
    } catch (_) { /* ignore */ }
  };

  // Register address/PSGC IPC handlers (must happen before window creation)
  registerAddressIPCHandlers();
  registerPsgcIPCHandlers();

  try {
    const pool = db.getPool();
    await runMigrations(pool);
    console.log('PostgreSQL schema and migrations applied.');
  } catch (migrationErr) {
    console.error('Migration block failed:', migrationErr.message);
    await releaseLock();
    createWindow();
    return;
  }

  await releaseLock();

createWindow();

  // Cross-device sync poller
  startSyncPolling();

  // Auto-run checks on startup
  setTimeout(checkMemberRenewals, 3000);
  setTimeout(checkBirthdays, 5000);
  setTimeout(checkBenefitEligibility, 7000);
  setTimeout(checkPaymentMilestones, 9000);
  setTimeout(checkOverdueRemittances, 11000);

  // Periodic checks every 6 hours
  setInterval(checkMemberRenewals, 6 * 60 * 60 * 1000);
  setInterval(checkBirthdays, 6 * 60 * 60 * 1000);
  setInterval(checkBenefitEligibility, 6 * 60 * 60 * 1000);
  setInterval(checkPaymentMilestones, 6 * 60 * 60 * 1000);
  setInterval(checkOverdueRemittances, 6 * 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  console.error('[DIAG] before-quit fired');
  cleanupPostgres();
});

process.on('exit', (code) => {
  console.error('[DIAG] process exit code=' + code);
});
process.on('uncaughtException', (err) => {
  console.error('[DIAG] uncaughtException: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[DIAG] unhandledRejection: ' + (reason && reason.stack ? reason.stack : reason));
});

// ===== AUTH IPC HANDLERS =====

// ===== CROSS-DEVICE SYNC =====
// Every data mutation writes a row into data_change_log (in-transaction).
// Each app instance polls for rows newer than its last-seen id and re-broadcasts
// to its renderer(s) via 'sync:data-changed', so any device connected to the same
// central MySQL DB reflects other devices' changes within the poll interval.

let syncLastSeenId = 0;
let syncPollTimer = null;

async function logDataChange(conn, entityType, entityId, action, userId) {
  try {
    await conn.execute(
      'INSERT INTO data_change_log (EntityType, EntityId, Action, UserId) VALUES (?,?,?,?)',
      [entityType, entityId == null ? null : entityId, action, userId || null]
    );
  } catch (e) {
    console.error('logDataChange error:', e.message);
  }
}

// Section 19: financial/operational audit entries go to audit_logs, keeping the
// Activity Log (activitylogs) strictly limited to login lifecycle events.
async function logAudit(conn, userId, action, description, ipAddress = '', userAgent = '', status = 'Success') {
  try {
    await conn.execute(
      'INSERT INTO audit_logs (AdminUserId, Action, Description, IpAddress, UserAgent, Status) VALUES (?,?,?,?,?,?)',
      [userId || null, action, description, ipAddress || '', userAgent || '', status || 'Success']
    );
  } catch (e) {
    console.error('logAudit error:', e.message);
  }
}

// Broadcasts to every open BrowserWindow (replaces the old single-mainWindow send).
function broadcastDataChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try { win.webContents.send('members:data-changed'); } catch (_) { /* ignore */ }
    }
  }
}

async function startSyncPolling() {
  try {
    const pool = db.getPool();
    const [rows] = await pool.execute('SELECT COALESCE(MAX(Id), 0) as maxId FROM data_change_log');
    syncLastSeenId = rows[0]?.maxId || 0;
  } catch (_) { /* ignore */ }
  if (syncPollTimer) clearInterval(syncPollTimer);
  syncPollTimer = setInterval(async () => {
    try {
      const pool = db.getPool();
      const [rows] = await pool.execute(
        'SELECT Id, EntityType, EntityId, Action, UserId FROM data_change_log WHERE Id > ? ORDER BY Id ASC',
        [syncLastSeenId]
      );
      if (rows.length === 0) return;
      syncLastSeenId = rows[rows.length - 1].Id;
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        try { win.webContents.send('sync:data-changed', rows); } catch (_) { /* ignore */ }
      }
    } catch (e) {
      console.error('sync poll error:', e.message);
    }
  }, BusinessRules.RULES.SYNC_POLL_INTERVAL_MS);
}

// ===== LOGIN BRUTE-FORCE THROTTLE (persistent, database-backed) =====
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;

// Minimum monthly savings contribution (MSC) required for a Regular membership.
const REQUIRED_MSC = BusinessRules.RULES.REQUIRED_MSC;

// Central Sales Coordinator commission deducted from every qualifying remittance.
// Approved business rule: exactly ₱120 per applicable transaction. Do not change.
const SALES_COORDINATOR_COMMISSION = BusinessRules.RULES.SALES_COORDINATOR_COMMISSION;

function getLoginKey(username) {
  return String(username || '').toLowerCase().trim();
}

async function isLoginLocked(key) {
  try {
    const pool = db.getPool();
    const [rows] = await pool.execute(
      'SELECT locked_until FROM login_attempts WHERE username = ? AND locked_until > NOW()',
      [key]
    );
    return rows.length > 0;
  } catch (e) {
    console.error('isLoginLocked error:', e.message);
    return false; // Fail open for availability
  }
}

async function recordLoginFailure(key) {
  try {
    const pool = db.getPool();
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MS);
    
    // First, clean up old expired records
    await pool.execute('DELETE FROM login_attempts WHERE locked_until IS NOT NULL AND locked_until < NOW()');
    
    // Upsert the attempt record. window_start stores the time of this failure
    // (not now - WINDOW_MS); we only use now - WINDOW_MS as the expiry boundary
    // so a failure older than the window resets the count instead of stacking.
    await pool.execute(`
      INSERT INTO login_attempts (username, attempt_count, window_start, last_attempt)
      VALUES (?, 1, ?, ?)
      ON CONFLICT (username) DO UPDATE SET
        attempt_count = CASE WHEN login_attempts.window_start < $4 THEN 1 ELSE login_attempts.attempt_count + 1 END,
        window_start = CASE WHEN login_attempts.window_start < $4 THEN $5 ELSE login_attempts.window_start END,
        last_attempt = $6,
        locked_until = CASE WHEN (login_attempts.attempt_count + 1) >= $7::int THEN now() + ($8::int * INTERVAL '1 second') ELSE login_attempts.locked_until END
    `, [key, now, now, windowStart, now, now, MAX_LOGIN_ATTEMPTS, Math.round(LOCKOUT_MS / 1000)]);
  } catch (e) {
    console.error('recordLoginFailure error:', e.message);
  }
}

async function clearLoginFailures(key) {
  try {
    const pool = db.getPool();
    await pool.execute('DELETE FROM login_attempts WHERE username = ?', [key]);
  } catch (e) {
    console.error('clearLoginFailures error:', e.message);
  }
}

// ===== IPC RATE LIMITER =====
// Simple in-memory rate limiter for IPC handlers (per renderer session)
const ipcRateLimits = new Map(); // key: `${senderId}:${handlerName}` -> { count, windowStart, blockedUntil }

function checkIpcRateLimit(event, handlerName, maxRequests = 60, windowMs = 60000, blockMs = 300000) {
  const senderId = event?.sender?.id || 'unknown';
  const key = `${senderId}:${handlerName}`;
  const now = Date.now();
  const record = ipcRateLimits.get(key);
  
  if (!record) {
    ipcRateLimits.set(key, { count: 1, windowStart: now, blockedUntil: 0 });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  
  if (record.blockedUntil && now < record.blockedUntil) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.blockedUntil - now) / 1000) };
  }
  
  if (now - record.windowStart > windowMs) {
    record.count = 1;
    record.windowStart = now;
    record.blockedUntil = 0;
    ipcRateLimits.set(key, record);
    return { allowed: true, remaining: maxRequests - 1 };
  }
  
  record.count++;
  if (record.count > maxRequests) {
    record.blockedUntil = now + blockMs;
    ipcRateLimits.set(key, record);
    return { allowed: false, remaining: 0, retryAfter: Math.ceil(blockMs / 1000) };
  }
  
  ipcRateLimits.set(key, record);
  return { allowed: true, remaining: maxRequests - record.count };
}

// ===== AUTH SESSION STORE =====
// Authenticated sessions live in the main process, keyed by webContents id, so a
// renderer cannot forge its own identity. User id/role are derived from here.
const sessions = new Map();

function getSession(event) {
  if (!event || !event.sender) return null;
  return sessions.get(event.sender.id) || null;
}

// Returns { ok:true, session } when the caller has an active session (and role, if
// given). Otherwise { ok:false, error }.
function authGuard(event, roles) {
  const s = getSession(event);
  if (!s) return { ok: false, error: 'Not authenticated. Please log in again.' };
  if (roles && roles.length > 0 && !roles.includes(s.role)) {
    return { ok: false, error: 'You do not have permission to perform this action.' };
  }
  return { ok: true, session: s };
}

// Returns null when the password satisfies the policy, otherwise an error message.
function validatePassword(pw) {
  if (typeof pw !== 'string') return 'Password must be a string.';
  if (pw.length < 8) return 'Password must be at least 8 characters long.';
  if (pw.length > 128) return 'Password must not exceed 128 characters.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
  return null;
}

ipcMain.handle('auth:login', async (event, { username, password }) => {
  // IPC rate limiting (10 requests/minute per session for login)
  const rateLimit = checkIpcRateLimit(event, 'auth:login', 10, 60000);
  if (!rateLimit.allowed) {
    return { success: false, error: `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`, rateLimited: true };
  }

  try {
    const pool = db.getPool();
    const key = getLoginKey(username);
    if (await isLoginLocked(key)) {
      return { success: false, error: 'Too many failed attempts. Please try again in a few minutes.' };
    }
    const [users] = await pool.execute('SELECT * FROM users WHERE Username = ? AND IsActive = 1 AND IsLocked = 0', [username]);
    if (users.length === 0) {
      await recordLoginFailure(key);
      try {
        await pool.execute(
          "INSERT INTO ActivityLogs (AdminUserId, Action, Description, Status) VALUES (NULL, 'Login Failed', ?, 'Failed')",
          [`Login attempt for user '${username}' failed: account not found or inactive.`]
        );
      } catch (_) {}
      return { success: false, error: 'Invalid username or password' };
    }
    const user = users[0];
    let valid = false;
    try {
      valid = bcrypt.compareSync(password, user.PasswordHash);
    } catch {}
    if (!valid) {
      await recordLoginFailure(key);
      try {
        await pool.execute(
          "INSERT INTO ActivityLogs (AdminUserId, Action, Description, Status) VALUES (NULL, 'Login Failed', ?, 'Failed')",
          [`Login attempt for user '${username}' failed: invalid password.`]
        );
      } catch (_) {}
      return { success: false, error: 'Invalid username or password' };
    }
    await clearLoginFailures(key);
    await pool.execute('UPDATE users SET LastLogin = NOW() WHERE Id = ?', [user.Id]);

    // Audit login (server-side, identity derived from DB row, not renderer payload)
    try {
      await pool.execute(
        "INSERT INTO ActivityLogs (AdminUserId, Action, Description, Status) VALUES (?, 'Login', ?, 'Success')",
        [user.Id, `User ${user.Username} logged in successfully.`]
      );
    } catch (_) {}

    // Establish a server-side session keyed by this window's webContents
    sessions.set(event.sender.id, { userId: user.Id, username: user.Username, role: user.Role });

    return {
      success: true,
      user: {
        id: user.Id,
        username: user.Username,
        fullName: user.FullName,
        role: user.Role,
        profilePicture: user.ProfilePicture
      }
    };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('auth:logout', (event) => {
  if (event && event.sender) sessions.delete(event.sender.id);
  return { success: true };
});

ipcMain.handle('auth:me', (event) => {
  const s = getSession(event);
  if (!s) return { success: false, error: 'Not authenticated' };
  return { success: true, user: { id: s.userId, username: s.username, role: s.role } };
});

// ===== MEMBER IPC HANDLERS =====

// ===== ADDRESS IPC HANDLERS =====
function registerAddressIPCHandlers() {
  ipcMain.handle('address:getRegions', async () => {
    try {
      const [rows] = await db.getPool().execute('SELECT id, psgc_code, name FROM ref_regions ORDER BY name');
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('address:getProvinces', async (event, { regionId } = {}) => {
    try {
      let query = 'SELECT id, psgc_code, name, region_id FROM ref_provinces';
      const params = [];
      if (regionId) {
        query += ' WHERE region_id = ?';
        params.push(regionId);
      }
      query += ' ORDER BY name';
      const [rows] = await db.getPool().execute(query, params);
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('address:getMunicipalities', async (event, { provinceId } = {}) => {
    try {
      let query = 'SELECT id, province_id, psgc_code, name, municipality_type FROM ref_municipalities';
      const params = [];
      if (provinceId) {
        query += ' WHERE province_id = ?';
        params.push(provinceId);
      }
      query += ' ORDER BY name';
      const [rows] = await db.getPool().execute(query, params);
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('address:getBarangays', async (event, { municipalityId } = {}) => {
    try {
      if (!municipalityId) return { success: true, data: [] };
      const [rows] = await db.getPool().execute(
        'SELECT id, municipality_id, psgc_code, name FROM ref_barangays WHERE municipality_id = ? ORDER BY name',
        [municipalityId]
      );
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('address:getAllBarangays', async () => {
    try {
      const [rows] = await db.getPool().execute(
        `SELECT b.id, b.name, b.psgc_code, b.municipality_id, m.name as municipality_name, p.name as province_name
         FROM ref_barangays b
         JOIN ref_municipalities m ON b.municipality_id = m.id
         JOIN ref_provinces p ON m.province_id = p.id
         ORDER BY m.name, b.name`
      );
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });
}

function registerPsgcIPCHandlers() {
  ipcMain.handle('psgc:import', async (event) => {
    try {
      const g = authGuard(event, ['Admin']);
      if (!g.ok) return { success: false, error: g.error };
      const { importPsgc } = require('./scripts/psgc-importer');
      const result = await importPsgc(g.session.userId || null);
      return result;
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('psgc:getImportLogs', async () => {
    try {
      const [rows] = await db.getPool().execute(
        'SELECT * FROM psgc_import_logs ORDER BY import_date DESC LIMIT 100'
      );
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('psgc:getMigrationLogs', async () => {
    try {
      const [rows] = await db.getPool().execute(
        'SELECT * FROM psgc_migration_logs ORDER BY migrated_at DESC LIMIT 500'
      );
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('psgc:getDuplicateRecords', async () => {
    try {
      const pool = db.getPool();
      const [munDups] = await pool.execute(
        'SELECT name, COUNT(*) as cnt FROM ref_municipalities GROUP BY name HAVING COUNT(*) > 1'
      );
      const [brgyDups] = await pool.execute(
        'SELECT b.name, m.name as municipality, COUNT(*) as cnt FROM ref_barangays b JOIN ref_municipalities m ON b.municipality_id = m.id GROUP BY b.municipality_id, b.name HAVING COUNT(*) > 1'
      );
      return { success: true, data: { municipalityDuplicates: munDups, barangayDuplicates: brgyDups } };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('psgc:refreshBrgyLists', async () => {
    return { success: true };
  });

  ipcMain.handle('psgc:auditLog', async (event, { action, description, affectedRecords } = {}) => {
    try {
      const g = authGuard(event);
      if (!g.ok) return { success: false, error: g.error };
      await db.getPool().execute(
        'INSERT INTO psgc_audit_log (user_id, username, action, description, affected_records) VALUES (?, ?, ?, ?, ?)',
        [g.session.userId || null, g.session.username || '', action || '', description || '', affectedRecords || 0]
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });

  ipcMain.handle('psgc:getAuditLogs', async () => {
    try {
      const [rows] = await db.getPool().execute(
        'SELECT * FROM psgc_audit_log ORDER BY created_at DESC LIMIT 200'
      );
      return { success: true, data: rows };
    } catch (error) {
      return { success: false, error: maskSqlError(error) };
    }
  });
}

ipcMain.handle('members:list', async (event, { page = 1, pageSize = 25, search, status, municipality_id, barangay_id, registration_month, exportAll } = {}) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    pageSize = Math.min(Math.max(1, pageSize || 25), exportAll ? 100000 : 200);
    const offset = Math.max(0, (page - 1)) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      const trimmed = search.trim();
      if (trimmed.length > 200) {
        return { success: false, error: 'Search query too long (max 200 characters)' };
      }
      const words = trimmed.split(/\s+/).filter(w => w.length > 0);
      // Case-insensitive (ILIKE cross-column OR) with explicit ESCAPE so literal
      // % and _ inside search terms (and inside stored values) are honored.
      // Multi-word search uses AND per word so name order is irrelevant
      // (e.g. "Dela Cruz Juan" matches "Juan Dela Cruz"), while each word may
      // match any searched column (af_no, full_name, locations, coordinators...).
      for (const word of words) {
        const escaped = word.replace(/[%_]/g, '\\$&');
        const like = `%${escaped}%`;
        where += ` AND (m.af_no ILIKE ? ESCAPE '\\' OR m.full_name ILIKE ? ESCAPE '\\' OR m.contact_no ILIKE ? ESCAPE '\\'
          OR m.address ILIKE ? ESCAPE '\\' OR m.complete_address ILIKE ? ESCAPE '\\' OR m.house_no ILIKE ? ESCAPE '\\' OR m.street ILIKE ? ESCAPE '\\'
          OR m.district ILIKE ? ESCAPE '\\' OR m.membership_status ILIKE ? ESCAPE '\\'
          OR m.civil_status ILIKE ? ESCAPE '\\' OR m.gender ILIKE ? ESCAPE '\\' OR m.religion ILIKE ? ESCAPE '\\'
          OR m.occupation ILIKE ? ESCAPE '\\' OR TO_CHAR(m.registration_date, 'YYYY FMMM FMDD FMMonth MM/DD/YYYY') ILIKE ? ESCAPE '\\'
          OR bc.FullName ILIKE ? ESCAPE '\\' OR sc.FullName ILIKE ? ESCAPE '\\'
          OR prov.name ILIKE ? ESCAPE '\\' OR mun.name ILIKE ? ESCAPE '\\' OR brgy.name ILIKE ? ESCAPE '\\')`;
        params.push(like, like, like, like, like, like, like, like, like, like, like, like, like, like, like, like, like, like, like);
      }
    }
    if (status && status !== 'All') {
      where += ' AND m.member_status = ?';
      params.push(status);
    }
    if (municipality_id) {
      where += ' AND m.municipality_id = ?';
      params.push(municipality_id);
    }
    if (barangay_id) {
      where += ' AND m.barangay_id = ?';
      params.push(barangay_id);
    }
    if (registration_month && /^\d{4}-\d{2}$/.test(String(registration_month))) {
      where += " AND TO_CHAR(m.registration_date, 'YYYY-MM') = ?";
      params.push(String(registration_month));
    }
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM members m
       LEFT JOIN barangay_coordinators bc ON m.barangay_coordinator_id = bc.Id
       LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
       LEFT JOIN ref_provinces prov ON m.province_id = prov.id
       LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
       LEFT JOIN ref_barangays brgy ON m.barangay_id = brgy.id
       ${where}`,
      params
    );
    const total = countRows[0].total;
    const [rows] = await pool.execute(
      `SELECT m.*, bc.FullName as BarangayCoordinator, sc.FullName as SalesCoordinator, b.Name as BranchName, b.Address as BranchAddress,
               prov.name as province_name, prov.psgc_code as province_psgc,
               prov.region_id as region_id, r.name as region_name,
               mun.name as municipality_name, mun.psgc_code as municipality_psgc,
               brgy.name as barangay_name, brgy.psgc_code as barangay_psgc,
                (COALESCE((SELECT SUM(rd.MSC + COALESCE(rd.HDA,0)) FROM remittance_details rd JOIN remittances r ON rd.RemittanceId = r.Id WHERE r.Status = 'Completed' AND (rd.MemberId = m.Id OR (rd.MemberId IS NULL AND rd.AFNo = m.af_no))),0) - COALESCE((SELECT SUM(dd.Amount) FROM damayan_deductions dd WHERE dd.MemberId = m.Id),0) - COALESCE((SELECT SUM(hd.Amount) FROM hda_deductions hd WHERE hd.MemberId = m.Id),0)) as computed_balance
         FROM members m
         LEFT JOIN barangay_coordinators bc ON m.barangay_coordinator_id = bc.Id
         LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
         LEFT JOIN branches b ON m.branch_id = b.Id
         LEFT JOIN ref_provinces prov ON m.province_id = prov.id
         LEFT JOIN ref_regions r ON prov.region_id = r.id
         LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
         LEFT JOIN ref_barangays brgy ON m.barangay_id = brgy.id
         ${where} ORDER BY m.Id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [aggRows] = await pool.execute(
      `SELECT
         COALESCE(SUM(m.membership_fee),0) as total_membership_fee,
         COALESCE(SUM(deposits.total_msc),0) - COALESCE(SUM(deductions.total_ded),0) - COALESCE(SUM(hda_ded.total_ded),0) as total_msc
       FROM members m
       LEFT JOIN barangay_coordinators bc ON m.barangay_coordinator_id = bc.Id
       LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
       LEFT JOIN ref_provinces prov ON m.province_id = prov.id
       LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
       LEFT JOIN ref_barangays brgy ON m.barangay_id = brgy.id
        LEFT JOIN (SELECT COALESCE(rd.MemberId, 0) as mkey, rd.AFNo, SUM(MSC + COALESCE(HDA,0)) as total_msc FROM remittance_details rd JOIN remittances r ON rd.RemittanceId = r.Id WHERE r.Status = 'Completed' GROUP BY mkey, rd.AFNo) deposits ON (deposits.mkey = m.Id OR (deposits.mkey = 0 AND deposits.AFNo = m.af_no))
       LEFT JOIN (SELECT MemberId, SUM(Amount) as total_ded FROM damayan_deductions GROUP BY MemberId) deductions ON m.Id = deductions.MemberId
       LEFT JOIN (SELECT MemberId, SUM(Amount) as total_ded FROM hda_deductions GROUP BY MemberId) hda_ded ON m.Id = hda_ded.MemberId
       ${where}`,
      params
    );
    return { success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize), totals: aggRows[0] };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('members:options', async (event, { status } = {}) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const params = [];
    let where = '';
    if (status) {
      where = 'WHERE m.member_status = ?';
      params.push(status);
    }
    const [rows] = await pool.execute(
      `SELECT m.Id, m.af_no, m.full_name, m.member_status, m.membership_status,
              m.honorary_years_completed, sc.FullName as SalesCoordinator
       FROM members m
       LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
       ${where} ORDER BY m.af_no`,
      params
    );
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('members:get', async (event, { id }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const [rows] = await db.getPool().execute(
      `SELECT m.*, bc.FullName as BarangayCoordinator, sc.FullName as SalesCoordinator, b.Name as BranchName, b.Address as BranchAddress,
               prov.name as province_name, prov.psgc_code as province_psgc,
               prov.region_id as region_id, r.name as region_name,
               mun.name as municipality_name, mun.psgc_code as municipality_psgc,
               brgy.name as barangay_name, brgy.psgc_code as barangay_psgc,
                (COALESCE((SELECT SUM(rd.MSC + COALESCE(rd.HDA,0)) FROM remittance_details rd JOIN remittances r ON rd.RemittanceId = r.Id WHERE r.Status = 'Completed' AND (rd.MemberId = m.Id OR (rd.MemberId IS NULL AND rd.AFNo = m.af_no))),0) - COALESCE((SELECT SUM(dd.Amount) FROM damayan_deductions dd WHERE dd.MemberId = m.Id),0) - COALESCE((SELECT SUM(hd.Amount) FROM hda_deductions hd WHERE hd.MemberId = m.Id),0)) as computed_balance
        FROM members m
        LEFT JOIN barangay_coordinators bc ON m.barangay_coordinator_id = bc.Id
        LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
        LEFT JOIN branches b ON m.branch_id = b.Id
        LEFT JOIN ref_provinces prov ON m.province_id = prov.id
        LEFT JOIN ref_regions r ON prov.region_id = r.id
        LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
        LEFT JOIN ref_barangays brgy ON m.barangay_id = brgy.id
        WHERE m.Id = ?`, [id]);
    return { success: true, data: rows[0] || null };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

let _zdnProvinceId = null;
async function getZdnProvinceId(pool) {
  if (_zdnProvinceId) return _zdnProvinceId;
  const [rows] = await pool.execute("SELECT id FROM ref_provinces WHERE psgc_code = '097200000' OR name LIKE '%Zamboanga del Norte%' LIMIT 1");
  _zdnProvinceId = rows.length > 0 ? rows[0].id : 1;
  return _zdnProvinceId;
}

ipcMain.handle('members:save', async (event, { member }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const zdnId = await getZdnProvinceId(conn);
      const afNo = String(member.AFNo || '').trim();
      if (afNo) {
        const [dupRows] = await conn.execute(
          member.Id
            ? 'SELECT Id FROM members WHERE af_no = ? AND Id <> ? LIMIT 1'
            : 'SELECT Id FROM members WHERE af_no = ? LIMIT 1',
          member.Id ? [afNo, member.Id] : [afNo]
        );
        if (dupRows.length > 0) {
          await conn.rollback();
          return { success: false, error: 'AF No. is already in use by another member.' };
        }
      }
      if (member.Id) {
        // Check if membership_status changed to Honorary
        const [existing] = await conn.execute(
          'SELECT af_no, registration_date, renewal_date, membership_status, honorary_start_date, honorary_years_completed, sales_coordinator_id FROM members WHERE Id = ?',
          [member.Id]
        );
        const oldAfNo = existing.length > 0 ? existing[0].af_no : null;
        const wasHonorary = existing.length > 0 && existing[0].membership_status === 'Honorary';
        let extraUpdate = '';
        let extraParams = [];
        if (existing.length > 0 && member.MembershipStatus === 'Honorary' && !wasHonorary && (!existing[0].honorary_start_date)) {
          extraUpdate = ',honorary_start_date=CURDATE(),honorary_years_completed=0';
        }
        if (wasHonorary && member.MembershipStatus !== 'Honorary') {
          extraUpdate = ',honorary_years_completed=0,honorary_start_date=NULL';
          // Log conversion away from Honorary
          await conn.execute(
            'INSERT INTO membership_audit_log (member_id, old_status, new_status, reason) VALUES (?,?,?,?)',
            [member.Id, 'Honorary', member.MembershipStatus, 'Manual status change via edit']
          );
        }

        const regDate = member.RegistrationDate || member.registration_date || null;
        let renewalDate = null;
        if (existing.length > 0) {
          const oldRegDate = existing[0].registration_date;
          const oldRenewalDate = existing[0].renewal_date;
          const regDateStr = regDate ? String(regDate).slice(0, 10) : null;
          const oldRegDateStr = oldRegDate ? String(oldRegDate).slice(0, 10) : null;
          if (regDateStr && regDateStr !== oldRegDateStr) {
            const d = new Date(regDateStr);
            d.setFullYear(d.getFullYear() + 1);
            renewalDate = d.toISOString().slice(0, 10);
          } else {
            renewalDate = oldRenewalDate;
          }
        }
        await conn.execute(`UPDATE members SET af_no=?,registration_date=?,renewal_date=?,district=?,membership_status=?,membership_fee=?,msc=?,overall_payment=?,
          full_name=?,birth_date=?,age=?,gender=?,occupation=?,religion=?,address=?,civil_status=?,contact_no=?,
          family_rep_name=?,family_rep_birthdate=?,family_rep_age=?,family_rep_gender=?,family_rep_contact=?,
          barangay_coordinator_id=?,sales_coordinator_id=?,branch_id=?,Notes=?,
          province_id=?,municipality_id=?,barangay_id=?,house_no=?,street=?,complete_address=?,
          UpdatedAt=NOW()${extraUpdate}
          WHERE Id=?`, [
          member.AFNo, regDate, renewalDate, member.District || '', member.MembershipStatus || 'Regular', member.MembershipFee || 0, member.Msc || 0, member.OverallPayment || 0,
          member.FullName || '', member.BirthDate || null, member.Age || 0, member.Gender || '', member.Occupation || '', member.Religion || '', member.Address || '', member.CivilStatus || '', member.ContactNo || '',
          member.FamilyRepName || '', member.FamilyRepBirthDate || null, member.FamilyRepAge || 0, member.FamilyRepGender || '', member.FamilyRepContact || '',
          member.BarangayCoordinatorId || null, member.SalesCoordinatorId || null, member.BranchId || null, member.Notes || '',
          member.ProvinceId || zdnId, member.MunicipalityId || null, member.BarangayId || null, member.HouseNo || '', member.Street || '', member.CompleteAddress || '',
          member.Id
        ]);
        // Sync commission_transactions if sales_coordinator_id changed
        const oldSalesCoordId = existing[0]?.sales_coordinator_id ?? null;
        const newSalesCoordId = member.SalesCoordinatorId != null && String(member.SalesCoordinatorId).trim() !== '' ? member.SalesCoordinatorId : null;
        if (String(oldSalesCoordId ?? '') !== String(newSalesCoordId ?? '')) {
          await conn.execute(
            `UPDATE commission_transactions SET SalesCoordinatorId = ? WHERE MemberId = ? AND Status = 'Completed'`,
            [newSalesCoordId, member.Id]
          );
        }
        // Sync remittance history when the member's AF No changes so all af_no
        // joins (balances, lookups) stay consistent
        if (oldAfNo && afNo && oldAfNo !== afNo) {
          await conn.execute('UPDATE remittance_details SET AFNo = ? WHERE MemberId = ?', [afNo, member.Id]);
          await conn.execute('UPDATE remittance_details SET AFNo = ? WHERE AFNo = ? AND MemberId IS NULL', [afNo, oldAfNo]);
        }
        await conn.commit();
        await logDataChange(conn, 'member', member.Id, 'update', g.session.userId || null);
        broadcastDataChanged();
        return { success: true, id: member.Id };
      } else {
        const regDate = member.RegistrationDate || new Date().toISOString().slice(0, 10);

        // Compute renewal date in JS (registration + 1 year) and pass it as a
        // plain value. Using `? + INTERVAL '1 year'` with a *parameter* makes
        // PostgreSQL coerce the unknown parameter to INTERVAL, producing
        // "column renewal_date is of type date but expression is of type interval".
        const regDt = new Date(String(regDate).slice(0, 10) + 'T00:00:00');
        regDt.setFullYear(regDt.getFullYear() + 1);
        const renewalDate = `${regDt.getFullYear()}-${String(regDt.getMonth() + 1).padStart(2, '0')}-${String(regDt.getDate()).padStart(2, '0')}`;

        const isHonorary = member.MembershipStatus === 'Honorary';

        // Enforce minimums: MSC ?300, Overall ?650 (MF?350 + MSC?300) — only for Regular members
        const msc = isHonorary ? (member.Msc || 0) : Math.max(300, member.Msc || 0);
        const overallPayment = isHonorary ? (member.OverallPayment || 0) : Math.max(650, member.OverallPayment || 0);
        const membershipFee = member.MembershipFee || 0;

        const [result] = await conn.execute(`INSERT INTO members (af_no,registration_date,renewal_date,district,membership_status,honorary_years_completed,honorary_start_date,membership_fee,msc,overall_payment,
          full_name,birth_date,age,gender,occupation,religion,address,civil_status,contact_no,
          family_rep_name,family_rep_birthdate,family_rep_age,family_rep_gender,family_rep_contact,
          barangay_coordinator_id,sales_coordinator_id,branch_id,member_status,Notes,
          province_id,municipality_id,barangay_id,house_no,street,complete_address)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
          ?,?,?,?,?,?)`, [
          member.AFNo, regDate, renewalDate, member.District || '', member.MembershipStatus || 'Regular',
          0, isHonorary ? regDate : null,
          membershipFee, msc, overallPayment,
          member.FullName || '', member.BirthDate || null, member.Age || 0, member.Gender || '', member.Occupation || '', member.Religion || '', member.Address || '', member.CivilStatus || '', member.ContactNo || '',
          member.FamilyRepName || '', member.FamilyRepBirthDate || null, member.FamilyRepAge || 0, member.FamilyRepGender || '', member.FamilyRepContact || '',
          member.BarangayCoordinatorId || null, member.SalesCoordinatorId || null, member.BranchId || null, 'Active', member.Notes || '',
          member.ProvinceId || zdnId, member.MunicipalityId || null, member.BarangayId || null, member.HouseNo || '', member.Street || '', member.CompleteAddress || ''
        ]);
        const newMemberId = result.insertId;

        if (isHonorary) {
          await conn.execute(
            'INSERT INTO membership_audit_log (member_id, old_status, new_status, reason) VALUES (?,?,?,?)',
            [newMemberId, 'N/A', 'Honorary', 'New honorary member registration']
          );
        }

        // Notify: new member registered
        try {
          await conn.execute(
            "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'member_registered', 'New Member Registered', ?, 'info')",
            [newMemberId, `${member.FullName} (AF No: ${member.AFNo}) has been registered as a new member. District: ${member.District || 'N/A'}.`]
          );
        } catch (_) { /* ignore */ }

        await conn.commit();
        await logDataChange(conn, 'member', newMemberId, 'create', g.session.userId || null);
        broadcastDataChanged();
        return { success: true, id: newMemberId };
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('[members:save] failed:', error && error.code, error && error.message);
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('members:delete', async (event, { id }) => {
  try {
    const g = authGuard(event, ['Admin', 'Branch Manager']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [mRows] = await conn.execute('SELECT af_no FROM members WHERE Id = ?', [id]);
      const afNo = mRows.length > 0 ? mRows[0].af_no : null;
      // Collect affected remittances BEFORE deleting details so totals can be recomputed
      const [affectedRemits] = await conn.execute(
        'SELECT DISTINCT RemittanceId FROM remittance_details WHERE MemberId = ? OR (MemberId IS NULL AND AFNo = ?)',
        [id, afNo || '']
      );
      await conn.execute('DELETE FROM notifications WHERE member_id = ?', [id]);
      await conn.execute('DELETE FROM pending_remittances WHERE member_id = ?', [id]);
      await conn.execute('DELETE FROM membership_audit_log WHERE member_id = ?', [id]);
      await conn.execute('DELETE FROM hda_deductions WHERE MemberId = ?', [id]);
      await conn.execute('DELETE FROM commission_transactions WHERE MemberId = ?', [id]);
      // death_cases cascades to damayan_deductions via FK
      await conn.execute('DELETE FROM death_cases WHERE MemberId = ?', [id]);
      await conn.execute('DELETE FROM damayan_deductions WHERE MemberId = ?', [id]);
      await conn.execute('DELETE FROM remittance_details WHERE MemberId = ?', [id]);
      // Clean up orphaned detail rows matched only by AF No
      if (afNo) {
        await conn.execute('DELETE FROM remittance_details WHERE MemberId IS NULL AND AFNo = ?', [afNo]);
      }
      await conn.execute('DELETE FROM members WHERE Id = ?', [id]);
      // Recompute TotalDeposit for every remittance that had details for this member
      for (const remit of affectedRemits) {
        await conn.execute(
          'UPDATE remittances SET TotalDeposit = (SELECT COALESCE(SUM(NetDeposit), 0) FROM remittance_details WHERE RemittanceId = ?) WHERE Id = ?',
          [remit.RemittanceId, remit.RemittanceId]
        );
      }
      await conn.commit();
      await logDataChange(conn, 'member', id, 'delete', g.session.userId || null);
      broadcastDataChanged();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    return { success: false, error: 'Failed to delete member. Ensure no active references exist.' };
  }
});

ipcMain.handle('members:toggleStatus', async (event, { id, status }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const [m] = await pool.execute('SELECT full_name, af_no, member_status FROM members WHERE Id = ?', [id]);
    await pool.execute('UPDATE members SET member_status = ? WHERE Id = ?', [status, id]);
    if (m.length > 0 && m[0].member_status !== status) {
      await pool.execute(
        "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'member_status_changed', 'Member Status Changed', ?, 'warning')",
        [id, `${m[0].full_name}'s status changed from ${m[0].member_status} to ${status}.`]
      );
    }
    await logDataChange(pool, 'member', id, 'status', g.session.userId || null);
    broadcastDataChanged();
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('members:getHonoraryProgress', async (event, { id }) => {
  try {
    const [rows] = await db.getPool().execute(
      'SELECT membership_status, honorary_years_completed, honorary_start_date FROM members WHERE Id = ?',
      [id]
    );
    if (rows.length === 0) return { success: false, error: 'Member not found' };
    const m = rows[0];
    return {
      success: true,
      data: {
        membershipStatus: m.membership_status,
        yearsCompleted: m.honorary_years_completed || 0,
        yearsRequired: 10,
        startDate: m.honorary_start_date,
        remainingYears: Math.max(0, 10 - (m.honorary_years_completed || 0)),
        isConverted: m.membership_status === 'Regular' && m.honorary_years_completed >= 10
      }
    };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('members:nextAfNo', async () => {
  try {
    const [rows] = await db.getPool().execute("SELECT COALESCE(MAX(CAST(REPLACE(af_no, 'GH-', '') AS INTEGER)), 0) + 1 as next_num FROM members");
    return { success: true, afNo: String(rows[0].next_num).padStart(5, '0') };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('members:generateQR', async (event, { data }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const QRCode = require('qrcode');
    const dataUrl = await QRCode.toDataURL(data, { width: 200, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } });
    return { success: true, dataUrl };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('members:dashboard', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const [totalRows] = await pool.execute('SELECT COUNT(*) as val FROM members');
    const [activeRows] = await pool.execute("SELECT COUNT(*) as val FROM members WHERE member_status='Active'");
    const [inactiveRows] = await pool.execute("SELECT COUNT(*) as val FROM members WHERE member_status='Inactive'");
    // MSC Total Fund - net MSC deposits plus HDA deposits minus deductions
    const [mscTotalRows] = await pool.execute(`
      SELECT
        COALESCE(SUM(COALESCE(ct.NetMSCAmount, rd.MSC)), 0) + COALESCE(SUM(rd.HDA), 0)
        - COALESCE((SELECT SUM(Amount) FROM damayan_deductions), 0)
        - COALESCE((SELECT SUM(Amount) FROM hda_deductions), 0) as val
      FROM remittance_details rd
      JOIN remittances r ON rd.RemittanceId = r.Id AND r.Status = 'Completed'
      LEFT JOIN commission_transactions ct ON rd.Id = ct.RemittanceDetailId AND ct.Status = 'Completed'
    `);
    // Company Fund (MF - COM) - company earnings after commission deduction
    const [mfTotalRows] = await pool.execute(`
      SELECT COALESCE(SUM(rd.MF - rd.COM), 0) as val 
      FROM remittance_details rd
      JOIN remittances r ON rd.RemittanceId = r.Id
      JOIN members m ON rd.AFNo = m.af_no
      WHERE r.Status = 'Completed'
    `);
    const [fundRows] = await pool.execute("SELECT COALESCE(SUM(TotalDeposit),0) as val FROM remittances WHERE Status = 'Completed'");
    const [monthlyCol] = await pool.execute(`SELECT TO_CHAR(registration_date,'Mon') as month, COUNT(*) as count
      FROM members WHERE registration_date >= CURRENT_DATE - INTERVAL '12 months' GROUP BY TO_CHAR(registration_date,'Mon') ORDER BY MIN(registration_date)`);
    const [recentAct] = await pool.execute(`SELECT a.Action, a.Description, a.CreatedAt, u.FullName FROM ActivityLogs a
      LEFT JOIN users u ON a.AdminUserId = u.Id WHERE a.Action IN ('Login','Logout') ORDER BY a.CreatedAt DESC LIMIT 10`);
    const [growthData] = await pool.execute(`SELECT TO_CHAR(registration_date,'YYYY-MM') as date, COUNT(*) as count
      FROM members WHERE registration_date >= CURRENT_DATE - INTERVAL '12 months' GROUP BY TO_CHAR(registration_date,'YYYY-MM') ORDER BY date`);

    // Pending remittances
    const [pendingRemit] = await pool.execute(
      `SELECT p.*, m.af_no, m.full_name
       FROM pending_remittances p
       JOIN members m ON p.member_id = m.Id
       ORDER BY p.created_at ASC`
    );

    // Upcoming renewals - active members with renewal_date in the future or within grace period,
    // plus active members who have never paid their MF (flagged for renewal regardless of date)
    const [upcomingRenewals] = await pool.execute(
      `SELECT m.Id, m.af_no, m.full_name, m.renewal_date, m.member_status,
              (SELECT COUNT(*) FROM remittance_details rd2 JOIN remittances r2 ON r2.Id = rd2.RemittanceId
               WHERE rd2.MemberId = m.Id AND rd2.MF IN (250, 350) AND r2.Status = 'Completed') as mf_payment_count
       FROM members m
       WHERE m.member_status = 'Active'
         AND m.renewal_date IS NOT NULL
         AND (m.renewal_date <= CURRENT_DATE + INTERVAL '30 days'
              OR NOT EXISTS (SELECT 1 FROM remittance_details rd3 JOIN remittances r3 ON r3.Id = rd3.RemittanceId
                             WHERE rd3.MemberId = m.Id AND rd3.MF IN (250, 350) AND r3.Status = 'Completed'))
       ORDER BY m.renewal_date ASC
       LIMIT 10`
    );

    // Total members last month (for trend)
    const [prevMonthTotal] = await pool.execute(
      `SELECT COUNT(*) as val FROM members
       WHERE registration_date < date_trunc('month', CURRENT_DATE)`
    );
    const [prevMonthActive] = await pool.execute(
      `SELECT COUNT(*) as val FROM members
       WHERE member_status='Active'
         AND registration_date < date_trunc('month', CURRENT_DATE)`
    );
    // Approximate: count members that were registered before this month minus those that were never active
    const prevTotal = prevMonthTotal[0].val;
    const prevActive = prevMonthActive[0].val;

    // Pending renewals count
    const [pendingRenewalsCount] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM members
       WHERE member_status = 'Active'
         AND renewal_date IS NOT NULL
         AND renewal_date <= CURRENT_DATE + INTERVAL '30 days'`
    );

    // --- Membership status distribution ---
    const [memberDist] = await pool.execute(`
      SELECT
        SUM(CASE WHEN membership_status = 'Regular' AND member_status = 'Active' THEN 1 ELSE 0 END) as regular_members,
        SUM(CASE WHEN membership_status = 'Honorary' AND member_status = 'Active' THEN 1 ELSE 0 END) as honorary_members,
        SUM(CASE WHEN member_status = 'Inactive' THEN 1 ELSE 0 END) as inactive_members,
        SUM(CASE WHEN member_status = 'Active' AND renewal_date IS NOT NULL AND renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' THEN 1 ELSE 0 END) as pending_renewal,
        SUM(CASE WHEN member_status = 'Deceased' THEN 1 ELSE 0 END) as deceased_members,
        COUNT(*) as total_members
      FROM members
    `);
    const dist = memberDist[0];
    const draftCount = 0;

    // --- Honorary progress ---
    const [honoraryRows] = await pool.execute(`
      SELECT
        COUNT(*) as honorary_count,
        COALESCE(AVG(honorary_years_completed), 0) as avg_years_completed,
        SUM(CASE WHEN honorary_years_completed >= 10 THEN 1 ELSE 0 END) as eligible_for_promotion,
        SUM(CASE WHEN honorary_years_completed >= 9 AND honorary_years_completed < 10 THEN 1 ELSE 0 END) as completing_this_year
      FROM members
      WHERE membership_status = 'Honorary' AND member_status = 'Active'
    `);
    const honorary = honoraryRows[0];

    // --- Quick insights ---
    const [insightRows] = await pool.execute(`
      SELECT
        (SELECT COUNT(*) FROM members WHERE membership_status = 'Honorary' AND member_status = 'Active' AND honorary_years_completed >= 9 AND honorary_years_completed < 10) as becoming_regular,
        (SELECT COUNT(*) FROM members WHERE member_status = 'Active' AND renewal_date IS NOT NULL AND renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as renewals_in_30,
        (SELECT COUNT(*) FROM members WHERE registration_date >= CURRENT_DATE - INTERVAL '1 year') as members_last_year,
        (SELECT COUNT(*) FROM members) as current_total
    `);
    const insights = insightRows[0];
    const activeCount = Number(dist.regular_members) + Number(dist.honorary_members);
    const totalCount = Number(dist.total_members);
    const activePct = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;

    // Pending remittances count
    const [pendingRemittancesCount] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM pending_remittances'
    );

    // Notifications count
    const [notifUnread] = await pool.execute(
      "SELECT COUNT(*) as cnt FROM notifications WHERE status = 'unread'"
    );
    const [notifications] = await pool.execute(
      `SELECT n.*, m.full_name as member_name
       FROM notifications n
       LEFT JOIN members m ON n.member_id = m.Id
       WHERE n.status != 'resolved'
       ORDER BY n.created_at DESC
       LIMIT 5`
    );

    return { success: true, data: {
      totalMembers: totalRows[0].val,
      activeMembers: activeRows[0].val,
      inactiveMembers: inactiveRows[0].val,
      mscTotalFund: mscTotalRows[0].val,
      companyFund: mfTotalRows[0].val,
      totalFunds: fundRows[0].val,
      monthlyRegistrations: monthlyCol,
      recentActivities: recentAct,
      growthData,
      pendingRemittances: pendingRemit,
      upcomingRenewals,
      totalMembersPrev: prevTotal,
      activeMembersPrev: prevActive,
      notificationCount: notifUnread[0].cnt,
      notifications,
      pendingRenewalsCount: pendingRenewalsCount[0].cnt,
      pendingRemittancesCount: pendingRemittancesCount[0].cnt,
      // Membership widget data
      membershipDist: {
        regular: dist.regular_members,
        honorary: dist.honorary_members,
        inactive: dist.inactive_members,
        pendingRenewal: dist.pending_renewal,
        deceased: dist.deceased_members,
        draft: draftCount,
        total: totalCount
      },
      honoraryProgress: {
        honoraryCount: honorary.honorary_count,
        avgYearsCompleted: parseFloat(honorary.avg_years_completed).toFixed(1),
        eligibleForPromotion: honorary.eligible_for_promotion,
        completingThisYear: honorary.completing_this_year
      },
      quickInsights: {
        becomingRegular: insights.becoming_regular,
        renewalsIn30Days: insights.renewals_in_30,
        membersLastYear: insights.members_last_year,
        currentTotal: insights.current_total,
        activePct: activePct
      }
    }};
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== REMITTANCE IPC HANDLERS =====

ipcMain.handle('remittances:getCurrentDraft', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM remittances WHERE Status = 'Draft' AND TO_CHAR(DateDeposit, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM') ORDER BY Id DESC LIMIT 1"
    );
    if (rows.length === 0) return { success: true, data: null };
    const [details] = await pool.execute('SELECT * FROM remittance_details WHERE RemittanceId = ?', [rows[0].Id]);
    return { success: true, data: { ...rows[0], details } };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:list', async (event, { page = 1, pageSize = 25, search, status } = {}) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    pageSize = Math.min(Math.max(1, pageSize || 25), 200);
    const offset = Math.max(0, (page - 1)) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (r.RemittanceNo LIKE ? OR r.PreparedBy LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (status) {
      where += ' AND r.Status = ?';
      params.push(status);
    }
    const [countRows] = await pool.execute(`SELECT COUNT(*) as total FROM remittances r ${where}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.execute(
      `SELECT r.*, b.Name as BranchName, b.Address as BranchAddress,
        pp.FullName as PreparedByName, pv.FullName as VerifiedByName,
        (SELECT COUNT(*) FROM remittance_details rd WHERE rd.RemittanceId = r.Id) as ItemCount
       FROM remittances r
       LEFT JOIN branches b ON r.BranchId = b.Id
       LEFT JOIN personnel pp ON r.PreparedById = pp.Id
       LEFT JOIN personnel pv ON r.VerifiedById = pv.Id
       ${where} ORDER BY r.DateDeposit DESC, r.Id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return { success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:get', async (event, { id }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const [remittances] = await pool.execute(
      `SELECT r.*, b.Name as BranchName, b.Address as BranchAddress,
        pp.FullName as PreparedByName, pv.FullName as VerifiedByName
       FROM remittances r
       LEFT JOIN branches b ON r.BranchId = b.Id
       LEFT JOIN personnel pp ON r.PreparedById = pp.Id
       LEFT JOIN personnel pv ON r.VerifiedById = pv.Id
       WHERE r.Id = ?`, [id]
    );
    if (remittances.length === 0) return { success: false, error: 'Remittance not found' };
    const [details] = await pool.execute('SELECT * FROM remittance_details WHERE RemittanceId = ?', [id]);
    return { success: true, data: { ...remittances[0], details } };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:getMonthlySlip', async (event, { month, remittanceNo } = {}) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    let where = "r.Status = 'Completed'";
    const params = [];
    if (remittanceNo) {
      where += ' AND r.RemittanceNo = ?';
      params.push(remittanceNo);
    } else if (month) {
      where += ' AND TO_CHAR(r.DateDeposit,\'YYYY-MM\') = ?';
      params.push(month);
    } else {
      return { success: false, error: 'Month or RemittanceNo required' };
    }
    const [remitRows] = await pool.execute(
      `SELECT r.*, b.Name as BranchName, b.Address as BranchAddress,
              pp.FullName as PreparedByName, pv.FullName as VerifiedByName
       FROM remittances r
       LEFT JOIN branches b ON r.BranchId = b.Id
       LEFT JOIN personnel pp ON r.PreparedById = pp.Id
       LEFT JOIN personnel pv ON r.VerifiedById = pv.Id
       WHERE ${where} ORDER BY r.DateDeposit DESC LIMIT 1`,
      params
    );
    if (remitRows.length === 0) return { success: false, error: 'No completed remittance found' };
    const remit = remitRows[0];
    const [details] = await pool.execute(
      `SELECT rd.*, m.full_name
       FROM remittance_details rd
       LEFT JOIN members m ON rd.MemberId = m.Id
       WHERE rd.RemittanceId = ?
       ORDER BY
         CASE
           WHEN m.full_name LIKE '%,%' THEN TRIM(split_part(m.full_name, ',', 1))
           ELSE COALESCE(substring(trim(m.full_name) from '\\S+$'), '')
         END ASC,
         m.full_name ASC`,
      [remit.Id]
    );
    return { success: true, data: { ...remit, details } };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

async function getCommissionConfigSql(conn) {
  try {
    const [rows] = await conn.execute('SELECT MFThreshold, COMAmount, COMAmountAlt, AltThreshold FROM commission_config LIMIT 1');
    if (rows.length > 0) {
      return BusinessRules.normalizeConfig(rows[0]);
    }
  } catch (_) { /* ignore */ }
  return BusinessRules.normalizeConfig(null);
}

// Server-side mirror of the renderer's calcCOM, so stored totals cannot be forged.
// Commission is centrally locked to SALES_COORDINATOR_COMMISSION (₱120) for every
// qualifying transaction (MF >= AltThreshold). There is no ₱100 tier.
// Delegates to the shared business-rules module so server and client can never diverge.
function calcComServer(mf, msc, paymentPurpose, cfg) {
  return BusinessRules.calcCommission(mf, msc, paymentPurpose, cfg);
}

ipcMain.handle('remittances:save', async (event, { remittance, details }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const userId = g.session.userId || null;
    if (!remittance || typeof remittance !== 'object') return { success: false, error: 'Invalid remittance data' };
    if (!Array.isArray(details)) return { success: false, error: 'Invalid remittance details' };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const conn = await pool.getConnection();
    const isNewRemittance = !remittance.Id;
    try {
      await conn.beginTransaction();
      const status = remittance.Status || 'Draft';
      const statusCompleted = status === 'Completed';
      // Members that already had renewal/commission applied in a prior save of this remittance.
      // Only preload when the stored remittance was already Completed — a re-saved Draft (or
      // Draft->Completed) must not skip renewal, since no renewal was applied while it was a Draft.
      const alreadyProcessedMembers = new Set();
if (remittance.Id) {
        const [storedRemit] = await conn.execute('SELECT Status FROM remittances WHERE Id = ?', [remittance.Id]);
        const storedCompleted = storedRemit.length > 0 && storedRemit[0].Status === 'Completed';
        const [existingDetails] = await conn.execute('SELECT DISTINCT MemberId FROM remittance_details WHERE RemittanceId = ?', [remittance.Id]);
        for (const ed of existingDetails) {
          if (ed.MemberId != null && storedCompleted) alreadyProcessedMembers.add(ed.MemberId);
        }
        await conn.execute(`UPDATE remittances SET DateDeposit=?,TotalDeposit=?,BranchId=?,PreparedBy=?,PreparedById=?,VerifiedBy=?,VerifiedById=?,Status=?,UpdatedAt=NOW() WHERE Id=?`,
          [remittance.DateDeposit || null, remittance.TotalDeposit || null, remittance.BranchId || null, remittance.PreparedBy || '', remittance.PreparedById || null, remittance.VerifiedBy || '', remittance.VerifiedById || null, status, remittance.Id]);
        await conn.execute('DELETE FROM remittance_details WHERE RemittanceId = ?', [remittance.Id]);
        await conn.execute('DELETE FROM commission_transactions WHERE RemittanceId = ?', [remittance.Id]);
      } else {
        const [rows] = await conn.execute("SELECT CONCAT('REM-',TO_CHAR(CURRENT_DATE,'YYYYMM'),'-',LPAD((COALESCE(MAX(CAST(RIGHT(\"RemittanceNo\",4) AS INTEGER)),0)+1)::text,4,'0')) as \"newNo\" FROM remittances WHERE \"RemittanceNo\" LIKE CONCAT('REM-',TO_CHAR(CURRENT_DATE,'YYYYMM'),'-%')");
        const remittanceNo = rows[0].newNo;
        remittance.RemittanceNo = remittanceNo;
        const [result] = await conn.execute(`INSERT INTO remittances (RemittanceNo,DateDeposit,TotalDeposit,BranchId,PreparedBy,PreparedById,VerifiedBy,VerifiedById,CreatedBy,Status) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [remittanceNo, remittance.DateDeposit || null, remittance.TotalDeposit || null, remittance.BranchId || null, remittance.PreparedBy || '', remittance.PreparedById || null, remittance.VerifiedBy || '', remittance.VerifiedById || null, userId, status]);
        remittance.Id = result.insertId;
      }
      const renewedMembers = new Set();
      const cfg = await getCommissionConfigSql(conn);
      let netTotal = 0;
      for (const d of details) {
        const mf = parseFloat(d.MF) || 0;
        const msc = parseFloat(d.MSC) || 0;
        const hda = parseFloat(d.HDA) || 0;
        const savings = parseFloat(d.Savings) || 0;
        const total = Math.round((mf + msc + hda) * 100) / 100;
        const com = calcComServer(mf, msc, d.paymentPurpose, cfg);
        const netDeposit = Math.round((total - com) * 100) / 100;
        netTotal = Math.round((netTotal + netDeposit) * 100) / 100;
        const [matchingMembers] = await conn.execute('SELECT Id, full_name, sales_coordinator_id FROM members WHERE af_no = ?', [d.AFNo]);
        const memberId = matchingMembers.length > 0 ? matchingMembers[0].Id : null;
        const salesCoordinatorId = matchingMembers.length > 0 ? matchingMembers[0].sales_coordinator_id : null;
        const [detailResult] = await conn.execute(`INSERT INTO remittance_details (RemittanceId,MemberId,AFNo,MemberName,SalesCoordinator,MF,MSC,HDA,Savings,Total,COM,NetDeposit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [remittance.Id, memberId, d.AFNo || '', d.MemberName || '', d.SalesCoordinator || '', mf, msc, hda, savings, total, com, netDeposit]);
        const detailId = detailResult.insertId;
        // Audit log for HDA payment
        if (hda > 0 && memberId) {
          try {
            await logAudit(conn, userId || null, 'HDA Payment', `HDA payment of ₱${hda.toFixed(2)} for ${d.MemberName || 'Unknown'} (${d.AFNo || ''}).`);
          } catch (_) { /* ignore */ }
        }
        // Generate commission for MSC deposits (only for completed remittances)
        if (statusCompleted && msc > 0 && memberId) {
          const [existingCount] = await conn.execute(
            "SELECT COUNT(*) as cnt FROM commission_transactions WHERE MemberId = ? AND Status = 'Completed' AND RemittanceId != ?",
            [memberId, remittance.Id]
          );
          const priorDeposits = existingCount[0].cnt;
          const commissionAmount = BusinessRules.calcMscCommission(msc, priorDeposits);
          const netMsc = msc - commissionAmount;
          await conn.execute(
            `INSERT INTO commission_transactions (SalesCoordinatorId,MemberId,RemittanceId,RemittanceDetailId,MSCAmount,CommissionRate,CommissionAmount,NetMSCAmount,TransactionDate,EncoderId,Status,MSCDepositCount)
             VALUES (?,?,?,?,?,5.00,?,?,?,?,?,?)`,
            [salesCoordinatorId, memberId, remittance.Id, detailId, msc, commissionAmount, netMsc, remittance.DateDeposit || new Date(), remittance.CreatedBy || userId, 'Completed', priorDeposits + 1]
          );
        }
        // Check for qualifying renewal (MF = 250 or 350) — only once per member per completed save
        if (statusCompleted && memberId && BusinessRules.isQualifyingMF(mf)) {
          if (!alreadyProcessedMembers.has(memberId) && !renewedMembers.has(memberId)) {
            renewedMembers.add(memberId);
            await handleMemberRenewal(memberId, conn);
          }
        }
      }
      // Clear pending remittances for all members in this remittance
      for (const d of details) {
        if (d.AFNo) {
          const [m] = await conn.execute('SELECT Id FROM members WHERE af_no = ?', [d.AFNo]);
          if (m.length > 0) {
            await conn.execute('DELETE FROM pending_remittances WHERE member_id = ?', [m[0].Id]);
          }
        }
      }
      // Store the server-computed net deposit total (never trust the renderer)
      await conn.execute('UPDATE remittances SET TotalDeposit = ? WHERE Id = ?', [netTotal, remittance.Id]);
      // Notify: remittance submitted
      try {
        const remittanceNo = remittance.RemittanceNo || (remittance.Id ? `REM-${remittance.Id}` : 'New');
        await conn.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority, entity_type, entity_id) VALUES (NULL, 'remittance_submitted', 'Remittance Submitted', ?, 'info', 'remittance', ?)",
          [`Remittance ${remittanceNo} submitted. Total: ₱${netTotal.toFixed(2)}.`, remittance.Id]
        );
      } catch (_) { /* ignore */ }
      // Audit log: commission generated
      try {
        const [comms] = await conn.execute(
          "SELECT COUNT(*) as cnt, COALESCE(SUM(CommissionAmount),0) as total FROM commission_transactions WHERE RemittanceId = ? AND Status = 'Completed' AND CommissionAmount > 0",
          [remittance.Id]
        );
        if (comms.length > 0 && comms[0].cnt > 0) {
          await logAudit(conn, userId || null, 'Commission Generated', `${comms[0].cnt} commission(s) generated for Remittance #${remittance.RemittanceNo || remittance.Id}, total: ₱${parseFloat(comms[0].total).toFixed(2)}`);
        }
      } catch (_) { /* ignore */ }

      await conn.commit();
      await logDataChange(conn, 'remittance', remittance.Id, isNewRemittance ? 'create' : 'update', userId || null);
      broadcastDataChanged();
      return { success: true, id: remittance.Id };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:delete', async (event, { id }) => {
  try {
    const g = authGuard(event, ['Admin', 'Branch Manager']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Reverse commissions: mark as Reversed and log
      const [commissions] = await conn.execute(
        "SELECT ct.*, COALESCE(u.FullName, 'System') as EncoderName FROM commission_transactions ct LEFT JOIN users u ON ct.EncoderId = u.Id WHERE ct.RemittanceId = ? AND ct.Status = 'Completed'",
        [id]
      );
      if (commissions.length > 0) {
        await conn.execute(
          "UPDATE commission_transactions SET Status = 'Reversed', UpdatedAt = NOW() WHERE RemittanceId = ? AND Status = 'Completed'",
          [id]
        );
        // Log audit for commission reversals
        try {
          for (const c of commissions) {
            await logAudit(conn, null, 'Commission Reversed', `Commission reversed: ₱${parseFloat(c.CommissionAmount).toFixed(2)} for Remittance #${id}, Member #${c.MemberId}. Reversed by system on remittance deletion.`);
          }
        } catch (_) {}
      }
      // Reverse member renewal attribution if this completed remittance triggered it
      const [remitRows] = await conn.execute('SELECT DateDeposit, Status FROM remittances WHERE Id = ?', [id]);
      const remitStatus = remitRows.length > 0 ? remitRows[0].Status : null;
      if (remitStatus === 'Completed') {
        const [detailRows] = await conn.execute('SELECT DISTINCT MemberId FROM remittance_details WHERE RemittanceId = ? AND MemberId IS NOT NULL', [id]);
        for (const d of detailRows) {
          const [m] = await conn.execute('SELECT renewal_date, last_renewed_date FROM members WHERE Id = ?', [d.MemberId]);
          if (m.length === 0 || !m[0].renewal_date) continue;
          // Only reverse if no other completed remittance for this member happened on/after the renewal
          const [later] = await conn.execute(
            "SELECT COUNT(*) as cnt FROM remittance_details rd2 JOIN remittances r2 ON rd2.RemittanceId = r2.Id WHERE rd2.MemberId = ? AND r2.Id != ? AND r2.Status = 'Completed' AND r2.DateDeposit >= ?",
            [d.MemberId, id, m[0].last_renewed_date || m[0].renewal_date]
          );
          if (later[0].cnt > 0) continue;
          await conn.execute(
            "UPDATE members SET renewal_date = renewal_date - INTERVAL '1 year', last_renewed_date = NULL WHERE Id = ?",
            [d.MemberId]
          );
        }
      }
      await conn.execute('DELETE FROM remittance_details WHERE RemittanceId = ?', [id]);
      await conn.execute('DELETE FROM remittances WHERE Id = ?', [id]);
      await conn.commit();
      await logDataChange(conn, 'remittance', id, 'delete', g.session.userId || null);
      broadcastDataChanged();
      return { success: true };
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== PENDING REMITTANCE IPC HANDLERS =====

ipcMain.handle('remittances:getPending', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const [rows] = await pool.execute(
      `SELECT p.*, m.af_no, m.full_name, m.registration_date, m.membership_status
       FROM pending_remittances p
       JOIN members m ON p.member_id = m.Id
       ORDER BY p.created_at ASC`
    );
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:addPending', async (event, { memberId }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const [existing] = await pool.execute('SELECT Id FROM pending_remittances WHERE member_id = ?', [memberId]);
    if (existing.length > 0) return { success: true };
    await pool.execute('INSERT INTO pending_remittances (member_id) VALUES (?)', [memberId]);
    const [m] = await pool.execute('SELECT full_name FROM members WHERE Id = ?', [memberId]);
    if (m.length > 0) {
      await pool.execute(
        "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'member_pending_remittance', 'Pending Remittance', ?, 'reminder')",
        [memberId, `${m[0].full_name} has been added to the pending remittance list.`]
      );
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:removePending', async (event, { id }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    await pool.execute('DELETE FROM pending_remittances WHERE Id = ?', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:removePendingByMemberId', async (event, { memberId }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    await pool.execute('DELETE FROM pending_remittances WHERE member_id = ?', [memberId]);
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('remittances:isPending', async (event, { memberId }) => {
  try {
    const [rows] = await db.getPool().execute('SELECT Id FROM pending_remittances WHERE member_id = ?', [memberId]);
    return { success: true, data: rows[0] || null };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== REMITTANCE DASHBOARD SUMMARY =====

ipcMain.handle('remittances:dashboard-summary', async (event, { period, startDate, endDate }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const now = new Date();
    let start, end, prevStart, prevEnd;

    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(start);
        end.setDate(end.getDate() + 1);
        break;
      case 'week':
        start = new Date(now);
        start.setDate(start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1));
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 7);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'quarter':
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1);
        end = new Date(now.getFullYear(), (q + 1) * 3, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear() + 1, 0, 1);
        break;
      case 'custom':
        start = new Date(startDate);
        end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        break;
    }

    const periodMs = end - start;
    prevStart = new Date(start.getTime() - periodMs);
    prevEnd = new Date(start);

    // Format dates using LOCAL calendar components. Using toISOString() here is a
    // timezone bug: for the Philippine (+08:00) timezone a local midnight becomes the
    // previous day in UTC, so "today" ranges silently drifted to yesterday.
    const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fmtStart = fmtLocal(start);
    const fmtEnd = fmtLocal(end);
    const fmtPrevStart = fmtLocal(prevStart);
    const fmtPrevEnd = fmtLocal(prevEnd);

    const [aggRows] = await pool.execute(`
      SELECT
        COUNT(*) as transactionCount,
        COALESCE(SUM(TotalDeposit), 0) as totalCollection,
        CASE WHEN COUNT(*) > 0 THEN SUM(TotalDeposit) / COUNT(*) ELSE 0 END as avgTransaction
      FROM remittances
      WHERE Status = 'Completed' AND DateDeposit >= ? AND DateDeposit < ?
    `, [fmtStart, fmtEnd]);

    const [trendRows] = await pool.execute(`
      SELECT DateDeposit as date, COUNT(*) as transactions, SUM(TotalDeposit) as amount
      FROM remittances
      WHERE Status = 'Completed' AND DateDeposit >= ? AND DateDeposit < ?
      GROUP BY DateDeposit ORDER BY DateDeposit ASC
    `, [fmtStart, fmtEnd]);

    const [bdRows] = await pool.execute(`
      SELECT
        CASE
          WHEN rd.MF > 0 AND rd.MSC > 0 THEN 'New Registration'
          WHEN rd.MF > 0 AND (rd.MSC IS NULL OR rd.MSC = 0) THEN 'Renewal'
          WHEN (rd.MF IS NULL OR rd.MF = 0) AND rd.MSC > 0 THEN 'MSC Deposit'
          ELSE 'Other Collections'
        END as type,
        COUNT(*) as count,
        COALESCE(SUM(rd.Total), 0) as amount
      FROM remittance_details rd
      JOIN remittances r ON rd.RemittanceId = r.Id
      WHERE r.Status = 'Completed' AND r.DateDeposit >= ? AND r.DateDeposit < ?
      GROUP BY type
    `, [fmtStart, fmtEnd]);

    const [prevRows] = await pool.execute(`
      SELECT COALESCE(SUM(TotalDeposit), 0) as total
      FROM remittances
      WHERE Status = 'Completed' AND DateDeposit >= ? AND DateDeposit < ?
    `, [fmtPrevStart, fmtPrevEnd]);

    let targetAmount = 500000;
    try {
      const [settingRows] = await pool.execute(
        'SELECT SettingValue FROM app_settings WHERE SettingKey = ?',
        ['monthly_collection_target']
      );
      if (settingRows.length > 0 && settingRows[0].SettingValue) {
        const parsed = parseFloat(settingRows[0].SettingValue);
        if (!isNaN(parsed)) targetAmount = parsed;
      }
    } catch (e) {}

    if (period !== 'month') {
      targetAmount = prevRows[0].total * 1.1 || targetAmount;
    }

    return {
      success: true,
      data: {
        totalCollection: parseFloat(aggRows[0].totalCollection) || 0,
        transactionCount: parseInt(aggRows[0].transactionCount) || 0,
        avgTransaction: parseFloat(aggRows[0].avgTransaction) || 0,
        dailyTrend: trendRows.map(r => ({
          date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
          transactions: parseInt(r.transactions) || 0,
          amount: parseFloat(r.amount) || 0
        })),
        breakdown: bdRows.map(r => ({
          type: r.type,
          count: parseInt(r.count) || 0,
          amount: parseFloat(r.amount) || 0
        })),
        previousTotal: parseFloat(prevRows[0].total) || 0,
        targetAmount: targetAmount,
        updatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== COORDINATORS IPC HANDLERS =====

ipcMain.handle('coordinators:list', async (event, { type, page = 1, pageSize = 50, search } = {}) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const coordType = type === 'barangay' || type === 'sales' ? type : 'barangay';
    const table = coordType === 'barangay' ? 'barangay_coordinators' : 'sales_coordinators';
    const nameField = coordType === 'barangay' ? 'BarangayAssigned' : 'AssignedArea';
    pageSize = Math.min(Math.max(1, pageSize || 50), 100000);
    const offset = Math.max(0, (page - 1)) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (FullName LIKE ? OR ' + nameField + ' LIKE ? OR Email LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    const [countRows] = await pool.execute(`SELECT COUNT(*) as total FROM ${table} ${where}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.execute(`SELECT * FROM ${table} ${where} ORDER BY Id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    return { success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('coordinators:save', async (event, { type, coordinator }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const coordType = type === 'barangay' || type === 'sales' ? type : 'barangay';
    const table = coordType === 'barangay' ? 'barangay_coordinators' : 'sales_coordinators';
    const areaField = coordType === 'barangay' ? 'BarangayAssigned' : 'AssignedArea';
    const entityType = coordType === 'barangay' ? 'barangay_coordinator' : 'sales_coordinator';
    if (coordinator.Id) {
      const [old] = await pool.execute(`SELECT Status FROM ${table} WHERE Id = ?`, [coordinator.Id]);
      const areaValue = coordinator[areaField] != null ? coordinator[areaField] : (coordinator.AssignedArea || '');
      await pool.execute(`UPDATE ${table} SET FullName=?,${areaField}=?,ContactNumber=?,Email=?,ProfilePicture=?,Status=?,UpdatedAt=NOW() WHERE Id=?`,
        [coordinator.FullName, areaValue, coordinator.ContactNumber, coordinator.Email || '', coordinator.ProfilePicture || null, coordinator.Status || 'Active', coordinator.Id]);
      // Notify: coordinator status changed
      if (old.length > 0 && old[0].Status !== coordinator.Status) {
        const label = coordType === 'barangay' ? 'Barangay Coordinator' : 'Sales Coordinator';
        try {
          await pool.execute(
            "INSERT INTO notifications (member_id, type, title, message, priority, entity_type, entity_id) VALUES (NULL, 'coordinator_status_changed', 'Coordinator Status Changed', ?, 'info', 'coordinator', ?)",
            [`${label} ${coordinator.FullName} status changed from ${old[0].Status} to ${coordinator.Status}.`, coordinator.Id]
          );
        } catch (_) { /* ignore */ }
      }
      await logDataChange(pool, entityType, coordinator.Id, 'update', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: coordinator.Id };
    } else {
      const areaValue = coordinator[areaField] != null ? coordinator[areaField] : (coordinator.AssignedArea || '');
      const [result] = await pool.execute(`INSERT INTO ${table} (FullName,${areaField},ContactNumber,Email,ProfilePicture,Status) VALUES (?,?,?,?,?,?)`,
        [coordinator.FullName, areaValue, coordinator.ContactNumber, coordinator.Email || '', coordinator.ProfilePicture || null, coordinator.Status || 'Active']);
      await logDataChange(pool, entityType, result.insertId, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: result.insertId };
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('coordinators:delete', async (event, { type, id }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    if (type !== 'barangay' && type !== 'sales') return { success: false, error: 'Invalid coordinator type' };
    const pool = db.getPool();
    const rejected = await rejectIfLocked(pool);
    if (rejected) return rejected;
    const table = type === 'barangay' ? 'barangay_coordinators' : 'sales_coordinators';
    await pool.execute(`DELETE FROM ${table} WHERE Id = ?`, [id]);
    await logDataChange(pool, type === 'barangay' ? 'barangay_coordinator' : 'sales_coordinator', id, 'delete', g.session.userId || null);
    broadcastDataChanged();
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('coordinators:active', async (event, { type }) => {
  try {
    if (type !== 'barangay' && type !== 'sales') return { success: false, error: 'Invalid coordinator type' };
    const table = type === 'barangay' ? 'barangay_coordinators' : 'sales_coordinators';
    const [rows] = await db.getPool().execute(`SELECT * FROM ${table} WHERE Status = 'Active'`);
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== COMMISSION TRANSACTION IPC HANDLERS =====

ipcMain.handle('commissions:getByCoordinator', async (event, { coordinatorId, page = 1, pageSize = 25, search, month, year, dateFrom, dateTo, barangay, municipality }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    pageSize = Math.min(Math.max(1, pageSize || 25), 200);
    const offset = Math.max(0, (page - 1)) * pageSize;
    let where = 'WHERE ct.SalesCoordinatorId = ? AND ct.Status = \'Completed\'';
    const params = [coordinatorId];
    if (search) {
      where += ' AND (m.full_name LIKE ? OR m.af_no LIKE ? OR r.RemittanceNo LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (month) { where += ' AND EXTRACT(MONTH FROM ct.TransactionDate)::int = ?'; params.push(parseInt(month)); }
    if (year) { where += ' AND EXTRACT(YEAR FROM ct.TransactionDate)::int = ?'; params.push(parseInt(year)); }
    if (dateFrom) { where += ' AND ct.TransactionDate >= ?'; params.push(dateFrom); }
    if (dateTo) { where += ' AND ct.TransactionDate <= ?'; params.push(dateTo); }
    if (barangay) { where += ' AND m.barangay_id = ?'; params.push(parseInt(barangay)); }
    if (municipality) { where += ' AND m.municipality_id = ?'; params.push(parseInt(municipality)); }
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM commission_transactions ct
       LEFT JOIN members m ON ct.MemberId = m.Id
       LEFT JOIN remittances r ON ct.RemittanceId = r.Id
       ${where}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.execute(
      `SELECT ct.*, m.full_name as MemberName, m.af_no, r.RemittanceNo,
              COALESCE(u.FullName, 'System') as EncoderName
       FROM commission_transactions ct
       LEFT JOIN members m ON ct.MemberId = m.Id
       LEFT JOIN remittances r ON ct.RemittanceId = r.Id
       LEFT JOIN users u ON ct.EncoderId = u.Id
       ${where}
       ORDER BY ct.TransactionDate DESC, ct.Id DESC
       LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    return { success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('commissions:getCoordinatorSummary', async (event, { coordinatorId }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const [totals] = await pool.execute(
      `SELECT
         COUNT(DISTINCT ct.MemberId) as totalMembersManaged,
         COUNT(DISTINCT ct.RemittanceId) as totalRemittancesProcessed,
         COALESCE(SUM(ct.MSCAmount), 0) as totalMSCCollected,
         COALESCE(SUM(ct.CommissionAmount), 0) as totalCommissionEarned,
         COALESCE(SUM(CASE WHEN TO_CHAR(ct.TransactionDate, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM') THEN ct.CommissionAmount ELSE 0 END), 0) as currentMonthCommission,
         COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM ct.TransactionDate)::int = EXTRACT(YEAR FROM CURRENT_DATE)::int THEN ct.CommissionAmount ELSE 0 END), 0) as yearToDateCommission,
         COALESCE(SUM(ct.CommissionAmount), 0) as lifetimeCommission,
         COALESCE(SUM(ct.MSCAmount), 0) as lifetimeMSC
       FROM commission_transactions ct
       WHERE ct.SalesCoordinatorId = ? AND ct.Status = 'Completed'`,
      [coordinatorId]
    );
    return { success: true, data: totals[0] };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('commissions:getCoordinatorTotals', async (event, { coordinatorId, search, month, year, dateFrom, dateTo, barangay, municipality }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    let where = 'WHERE ct.SalesCoordinatorId = ? AND ct.Status = \'Completed\'';
    const params = [coordinatorId];
    if (search) {
      where += ' AND (m.full_name LIKE ? OR m.af_no LIKE ? OR r.RemittanceNo LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (month) { where += ' AND EXTRACT(MONTH FROM ct.TransactionDate)::int = ?'; params.push(parseInt(month)); }
    if (year) { where += ' AND EXTRACT(YEAR FROM ct.TransactionDate)::int = ?'; params.push(parseInt(year)); }
    if (dateFrom) { where += ' AND ct.TransactionDate >= ?'; params.push(dateFrom); }
    if (dateTo) { where += ' AND ct.TransactionDate <= ?'; params.push(dateTo); }
    if (barangay) { where += ' AND m.barangay_id = ?'; params.push(parseInt(barangay)); }
    if (municipality) { where += ' AND m.municipality_id = ?'; params.push(parseInt(municipality)); }
    const [totals] = await pool.execute(
      `SELECT
         COALESCE(SUM(ct.MSCAmount), 0) as totalMSCProcessed,
         COALESCE(SUM(ct.CommissionAmount), 0) as totalCommissionEarned,
         CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(ct.CommissionAmount), 0) / COUNT(*) ELSE 0 END as avgCommissionPerRemittance,
         COUNT(*) as totalTransactions
       FROM commission_transactions ct
       LEFT JOIN members m ON ct.MemberId = m.Id
       LEFT JOIN remittances r ON ct.RemittanceId = r.Id
       ${where}`, params);
    return { success: true, data: totals[0] };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== DEATH CASE IPC HANDLERS =====

ipcMain.handle('deathcases:list', async () => {
  try {
    const [rows] = await db.getPool().execute(
      `SELECT dc.*, m.full_name as MemberName FROM death_cases dc
       LEFT JOIN members m ON dc.MemberId = m.Id ORDER BY dc.Id DESC`);
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('deathcases:process', async (event, { memberId, deceasedName, dateOfDeath, causeOfDeath, beneficiary, processedBy }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [activeRows] = await conn.execute("SELECT COUNT(*) as cnt FROM members WHERE member_status='Active'");
      const totalMembers = activeRows[0].cnt;
      const amountPerMember = 5;
      const totalDeduction = totalMembers * amountPerMember;
      // Calculate death benefit based on registration date
      const [memberRow] = await conn.execute('SELECT registration_date, membership_status FROM members WHERE Id = ?', [memberId]);
      const benefitAmount = memberRow.length > 0
        ? calculateDeathBenefit(memberRow[0].registration_date, dateOfDeath, memberRow[0].membership_status)
        : 0;
      const [dcResult] = await conn.execute(`INSERT INTO death_cases (MemberId,DeceasedName,DateOfDeath,CauseOfDeath,Beneficiary,TotalMembersAffected,TotalDeduction,BenefitAmount,ProcessedBy)
        VALUES (?,?,?,?,?,?,?,?,?)`, [memberId, deceasedName || '', dateOfDeath || null, causeOfDeath || null, beneficiary || '', totalMembers, totalDeduction, benefitAmount, processedBy]);
      await conn.execute('INSERT INTO damayan_deductions (DeathCaseId,MemberId,Amount) SELECT ?, Id, ? FROM members WHERE member_status = ?', [dcResult.insertId, amountPerMember, 'Active']);

      // Notify: death case filed & benefit processed
      try {
        await conn.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'death_case_filed', 'Death Case Filed', ?, 'critical')",
          [memberId, `A death case has been filed for ${deceasedName}. Benefit: ₱${benefitAmount.toFixed(2)}. Cause: ${causeOfDeath || 'N/A'}.`]
        );
        await conn.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'benefit_processed', 'Death Benefit Processed', ?, 'info')",
          [memberId, `Death benefit of ₱${benefitAmount.toFixed(2)} has been processed for ${deceasedName}. Deduction of ₱${totalDeduction.toFixed(2)} applied to ${totalMembers} active members.`]
        );
      } catch (_) { /* ignore */ }

      await conn.commit();
      await logDataChange(conn, 'death_case', dcResult.insertId, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: dcResult.insertId, totalDeduction, benefitAmount, membersAffected: totalMembers };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('deduction:bulk', async (event, { quantity, reason, month, processedBy }) => {
  try {
    const g = authGuard(event, ['Admin', 'Branch Manager']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const qty = parseInt(quantity, 10);
      if (!Number.isFinite(qty) || qty < 1) {
        await conn.rollback();
        return { success: false, error: 'Quantity must be a whole number of at least 1.' };
      }
      const amountPerMember = qty * 5;
      const monthStr = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : '';
      const where = monthStr
        ? "WHERE member_status='Active' AND TO_CHAR(registration_date, 'YYYY-MM') = ?"
        : "WHERE member_status='Active'";
      const whereParams = monthStr ? [monthStr] : [];
      const [activeRows] = await conn.execute(`SELECT COUNT(*) as cnt FROM members ${where}`, whereParams);
      const totalMembers = activeRows[0].cnt;
      const totalDeduction = totalMembers * amountPerMember;
      const periodLabel = monthStr ? ` (${monthStr})` : '';
      const [dcResult] = await conn.execute(`INSERT INTO death_cases (MemberId,DeceasedName,DateOfDeath,CauseOfDeath,Beneficiary,TotalMembersAffected,TotalDeduction,ProcessedBy)
        VALUES (NULL,?,NULL,'Bulk Deduction','',?,?,?)`, [reason || `Bulk (${qty} \u00d7 \u20B15)${periodLabel}`, totalMembers, totalDeduction, processedBy]);
      await conn.execute(`INSERT INTO damayan_deductions (DeathCaseId,MemberId,Amount) SELECT ?, Id, ? FROM members ${where}`, [dcResult.insertId, amountPerMember, ...whereParams]);

      // Notify: bulk deduction processed
      try {
        await conn.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority, entity_type, entity_id) VALUES (NULL, 'death_deduction_processed', 'Bulk Deduction Processed', ?, 'info', 'death_case', ?)",
          [`Bulk deduction (${qty} × ₱5.00 = ₱${amountPerMember.toFixed(2)} per member) processed${periodLabel}. Total: ₱${totalDeduction.toFixed(2)} applied to ${totalMembers} active member(s). Reason: ${reason || 'N/A'}.`, dcResult.insertId]
        );
      } catch (_) { /* ignore */ }

      await conn.commit();
      await logDataChange(conn, 'death_case', dcResult.insertId, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: dcResult.insertId, totalDeduction, membersAffected: totalMembers };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== INDIVIDUAL DEDUCTION IPC HANDLER =====
ipcMain.handle('deduction:individual', async (event, { memberId, amount, reason, processedBy }) => {
  try {
    const g = authGuard(event, ['Admin', 'Branch Manager']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;

    // Validate member exists and is active
    const [member] = await pool.execute('SELECT Id, full_name, af_no FROM members WHERE Id = ? AND member_status = \'Active\'', [memberId]);
    if (!member.length) return { success: false, error: 'Member not found or not active' };
    if (!amount || amount <= 0) return { success: false, error: 'Amount must be greater than 0' };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Create death_cases record (type: Individual Deduction)
      const [dcResult] = await conn.execute(
        `INSERT INTO death_cases (MemberId, DeceasedName, DateOfDeath, CauseOfDeath, Beneficiary, TotalMembersAffected, TotalDeduction, ProcessedBy)
         VALUES (?, ?, NOW(), 'Individual Deduction', '', 1, ?, ?)`,
        [memberId, member[0].full_name, amount, processedBy]
      );
      // Insert deduction for this member only
      await conn.execute(
        'INSERT INTO damayan_deductions (DeathCaseId, MemberId, Amount) VALUES (?, ?, ?)',
        [dcResult.insertId, memberId, amount]
      );
      // Notify
      await conn.execute(
        `INSERT INTO notifications (member_id, type, title, message, priority, entity_type, entity_id)
         VALUES (?, 'death_deduction_processed', 'Individual Deduction Processed', ?, 'info', 'death_case', ?)`,
        [memberId, `Individual deduction of ₱${amount.toFixed(2)} applied. Reason: ${reason || 'N/A'}.`, dcResult.insertId]
      );
      await conn.commit();
      await logDataChange(conn, 'death_case', dcResult.insertId, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: dcResult.insertId, memberId, amount, memberName: member[0].full_name };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('deduction:preview', async (event, { month }) => {
  try {
    const pool = db.getPool();
    const monthStr = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : '';
    if (!monthStr) {
      const [rows] = await pool.execute("SELECT COUNT(*) as cnt FROM members WHERE member_status='Active'");
      return { success: true, count: rows[0].cnt, month: null };
    }
    const [rows] = await pool.execute(
      "SELECT COUNT(*) as cnt FROM members WHERE member_status='Active' AND TO_CHAR(registration_date, 'YYYY-MM') = ?",
      [monthStr]
    );
    return { success: true, count: rows[0].cnt, month: monthStr };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== HDA DEDUCTION IPC HANDLER =====

ipcMain.handle('hdaDeduction:bulk', async (event, { memberIds, amount, reason, processedBy }) => {
  try {
    const g = authGuard(event, ['Admin', 'Branch Manager']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const decAmount = parseFloat(amount) || 0;
      if (decAmount <= 0) {
        await conn.rollback();
        return { success: false, error: 'Invalid deduction amount' };
      }

      // If no memberIds provided, deduct from all active members
      if (!memberIds || memberIds.length === 0) {
        const [allActive] = await conn.execute('SELECT Id FROM members WHERE member_status = ?', ['Active']);
        memberIds = allActive.map(r => r.Id);
      }
      if (memberIds.length === 0) {
        await conn.rollback();
        return { success: false, error: 'No active members to deduct from' };
      }

      const processed = [];
      const skipped = [];
      for (const memberId of memberIds) {
        const [member] = await conn.execute('SELECT full_name, af_no FROM members WHERE Id = ?', [memberId]);
        if (member.length === 0) { skipped.push({ id: memberId, reason: 'Member not found' }); continue; }
        // Check HDA balance: total HDA deposits (completed remittances) minus prior HDA deductions
        const [balRows] = await conn.execute(
          `SELECT COALESCE(SUM(rd.HDA), 0) - COALESCE((SELECT SUM(Amount) FROM hda_deductions WHERE MemberId = ?), 0) as hda_balance
           FROM remittance_details rd
           JOIN remittances r ON rd.RemittanceId = r.Id AND r.Status = 'Completed'
           WHERE rd.MemberId = ?`,
          [memberId, memberId]
        );
        const hdaBalance = parseFloat(balRows[0]?.hda_balance || 0);
        if (hdaBalance < decAmount) {
          skipped.push({ id: memberId, reason: 'Insufficient HDA balance', name: member[0].full_name });
          continue;
        }
        await conn.execute(
          'INSERT INTO hda_deductions (MemberId, Amount, Reason, ProcessedBy) VALUES (?, ?, ?, ?)',
          [memberId, decAmount, reason || 'HDA Deduction', processedBy]
        );
        // Audit log
        try {
          await logAudit(conn, processedBy, 'HDA Deduction', `HDA deduction of ₱${decAmount.toFixed(2)} for ${member[0].full_name} (${member[0].af_no || ''}). Reason: ${reason || 'N/A'}.`);
        } catch (_) { /* ignore */ }
        processed.push({ id: memberId, name: member[0].full_name });
      }

      // Notify
      try {
        await conn.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (NULL, 'hda_deduction_processed', 'HDA Deduction Processed', ?, 'info')",
          [`HDA deduction processed for ${processed.length} member(s). Amount: ₱${decAmount.toFixed(2)} each. ${skipped.length > 0 ? `${skipped.length} member(s) skipped (insufficient balance or not found).` : ''}`]
        );
      } catch (_) { /* ignore */ }

      await conn.commit();
      await logDataChange(conn, 'hda_deduction', null, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, processed: processed.length, skipped: skipped.length, totalDeduction: decAmount * processed.length };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== DEATH BENEFIT ELIGIBILITY =====

function calculateDeathBenefit(regDateStr, asOfDateStr, memberStatus) {
  if (memberStatus && memberStatus !== 'Regular') return 0;
  const reg = new Date(regDateStr);
  const asOf = new Date(asOfDateStr);
  const addMonthsClamped = (d, m) => {
    const r = new Date(d.getFullYear(), d.getMonth() + m, 1);
    const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(d.getDate(), lastDay));
    return r;
  };
  const add = (d, m, dy) => { const r = addMonthsClamped(d, m); r.setDate(r.getDate() + dy); return r; };
  const beforeCutoff = (reg.getMonth() + 1 < 6) || (reg.getMonth() + 1 === 6 && reg.getDate() <= 15);
  if (beforeCutoff) {
    if (add(reg, 7, 1) <= asOf) return 50000;
    if (add(reg, 5, 1) <= asOf) return 20000;
  } else {
    if (add(reg, 9, 1) <= asOf) return 50000;
    if (add(reg, 7, 1) <= asOf) return 20000;
  }
  return 0;
}

// ===== STATEMENT OF ACCOUNT IPC =====

ipcMain.handle('soa:get', async (event, { memberId }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    if (memberId == null || memberId === undefined) {
      return { success: false, error: 'Invalid member ID' };
    }
    const pool = db.getPool();
    const [member] = await pool.execute('SELECT m.*, (COALESCE((SELECT SUM(rd.MSC + COALESCE(rd.HDA,0)) FROM remittance_details rd JOIN remittances r ON rd.RemittanceId = r.Id WHERE r.Status = \'Completed\' AND (rd.MemberId = m.Id OR (rd.MemberId IS NULL AND rd.AFNo = m.af_no))),0) - COALESCE((SELECT SUM(dd.Amount) FROM damayan_deductions dd WHERE dd.MemberId = m.Id),0) - COALESCE((SELECT SUM(hd.Amount) FROM hda_deductions hd WHERE hd.MemberId = m.Id),0)) as computed_balance FROM members m WHERE m.Id = ?', [memberId]);
    if (member.length === 0) return { success: false, error: 'Member not found' };
    const [deathStats] = await pool.execute(`
      SELECT (SELECT COUNT(*) FROM death_cases) as Total,
             (SELECT COUNT(*) FROM death_cases WHERE EXTRACT(YEAR FROM ProcessedAt)::int = EXTRACT(YEAR FROM CURRENT_DATE)::int) as CurrentYear,
             (SELECT COUNT(*) FROM death_cases WHERE EXTRACT(YEAR FROM ProcessedAt)::int = EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) as PreviousYear
    `);
    const nowLocal = new Date();
    const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
    const benefitAmount = calculateDeathBenefit(member[0].registration_date, today, member[0].membership_status);
    return { success: true, member: member[0], deathStats: deathStats[0], membershipStatus: member[0].membership_status, deathBenefit: benefitAmount };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('soa:transactions', async (event, { memberId, page = 1, pageSize = 25, search } = {}) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    if (memberId == null || memberId === undefined) {
      return { success: false, error: 'Invalid member ID' };
    }
    const pool = db.getPool();
    const [member] = await pool.execute('SELECT af_no FROM members WHERE Id = ?', [memberId]);
    if (member.length === 0) return { success: false, error: 'Member not found' };
    const afNo = member[0].af_no;
    const offset = Math.max(0, (page - 1)) * pageSize;

    let where = 'WHERE (rd.`MemberId` = ? OR (rd.`MemberId` IS NULL AND rd.`AFNo` = ?)) AND r.Status = ?';
    const params = [memberId, afNo, 'Completed'];
    if (search) {
      where += ' AND (rd.`AFNo` LIKE ? OR r.DateDeposit LIKE ? OR rd.MemberName LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM remittance_details rd\n' +
      'JOIN remittances r ON rd.RemittanceId = r.Id ' + where,
      params
    );
    const total = countRows[0].total;

    const [rows] = await pool.execute(
      'SELECT rd.`AFNo` as xf_no, r.`DateDeposit` as effective_date, rd.`MF` as mf_mk, rd.`MSC` as msc_savings, rd.`HDA` as hda_amount,\n' +
      'rd.`Total` as total, rd.`COM` as com, rd.`NetDeposit` as net_deposit, r.`RemittanceNo`,\n' +
      'rd.`MemberName`, rd.`SalesCoordinator`, m.member_status as status\n' +
      'FROM remittance_details rd\n' +
      'JOIN remittances r ON rd.RemittanceId = r.Id\n' +
      'JOIN members m ON (m.Id = rd.`MemberId` OR (rd.`MemberId` IS NULL AND rd.`AFNo` = m.`af_no`))\n' +
      where + '\n' +
      'ORDER BY r.`DateDeposit` DESC\n' +
      'LIMIT ? OFFSET ?',
      [...params, parseInt(pageSize), parseInt(offset)]
    );

    return {
      success: true,
      data: rows,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / pageSize)
    };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== REPORTS IPC =====

ipcMain.handle('reports:get', async (event, { type, params }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    let sql = '';
    let queryParams = [];
    switch (type) {
      case 'member-master-list':
        let mmlWhere = 'WHERE 1=1';
        const mmlParams = [];
        if (params?.district) {
          mmlWhere += ' AND m.district = ?';
          mmlParams.push(params.district);
        }
        if (params?.barangay) {
          const b = String(params.barangay).trim();
          if (/^\d+$/.test(b)) { mmlWhere += ' AND m.barangay_id = ?'; mmlParams.push(parseInt(b, 10)); }
          else if (b) { mmlWhere += ' AND brgy.name = ?'; mmlParams.push(b); }
        }
        if (params?.province) {
          mmlWhere += ' AND m.province_id = ?';
          mmlParams.push(params.province);
        }
        if (params?.municipality) {
          mmlWhere += ' AND m.municipality_id = ?';
          mmlParams.push(params.municipality);
        }
        if (params?.coordinator_id) {
          mmlWhere += ' AND m.sales_coordinator_id = ?';
          mmlParams.push(params.coordinator_id);
        }
        if (params?.membership_status) {
          mmlWhere += ' AND m.membership_status = ?';
          mmlParams.push(params.membership_status);
        }
        if (params?.month) {
          mmlWhere += ' AND EXTRACT(MONTH FROM m.registration_date)::int = ?';
          mmlParams.push(parseInt(params.month, 10));
        }
        if (params?.year) {
          mmlWhere += ' AND EXTRACT(YEAR FROM m.registration_date)::int = ?';
          mmlParams.push(parseInt(params.year, 10));
        }
        sql = `
          SELECT m.Id, m.af_no, m.full_name, m.complete_address as address, m.district, m.membership_status,
                 m.renewal_date, m.membership_fee,
                 m.msc, m.member_status,
                 bc.FullName as BarangayCoordinator,
                 sc.FullName as SalesCoordinator,
                 prov.name as province_name,
                 mun.name as municipality_name,
                 brgy.name as barangay_name,
          COALESCE(deposits.total_msc, 0) as total_deposits,
                  COALESCE(deductions.total_ded, 0) as total_deductions,
                  COALESCE(hda_ded.total_ded, 0) as total_hda_deductions,
                  (COALESCE(deposits.total_msc, 0) - COALESCE(deductions.total_ded, 0) - COALESCE(hda_ded.total_ded, 0)) as computed_balance,
                  (SELECT COUNT(*) FROM remittance_details rd2 JOIN remittances r2 ON r2.Id = rd2.RemittanceId
                   WHERE rd2.MemberId = m.Id AND rd2.MF IN (250, 350) AND r2.Status = 'Completed') as mf_payment_count
           FROM members m
           LEFT JOIN ref_provinces prov ON m.province_id = prov.id
           LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
           LEFT JOIN ref_barangays brgy ON m.barangay_id = brgy.id
           LEFT JOIN barangay_coordinators bc ON m.barangay_coordinator_id = bc.Id
           LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
           LEFT JOIN (
             SELECT COALESCE(rd.MemberId, 0) as mkey, rd.AFNo, SUM(rd.MSC + COALESCE(rd.HDA,0)) as total_msc
             FROM remittance_details rd
             JOIN remittances r ON rd.RemittanceId = r.Id
             WHERE r.Status = 'Completed'
             GROUP BY mkey, rd.AFNo
           ) deposits ON (deposits.mkey = m.Id OR (deposits.mkey = 0 AND deposits.AFNo = m.af_no))
           LEFT JOIN (
             SELECT MemberId, SUM(Amount) as total_ded
             FROM damayan_deductions
             GROUP BY MemberId
           ) deductions ON m.Id = deductions.MemberId
           LEFT JOIN (
             SELECT MemberId, SUM(Amount) as total_ded
             FROM hda_deductions
             GROUP BY MemberId
           ) hda_ded ON m.Id = hda_ded.MemberId
          ${mmlWhere}
          ORDER BY m.full_name ASC`;
        queryParams = mmlParams;
        break;
      case 'active-members':
        sql = "SELECT * FROM members WHERE member_status='Active' ORDER BY full_name";
        break;
      case 'inactive-members':
        sql = "SELECT * FROM members WHERE member_status='Inactive' ORDER BY full_name";
        break;
      case 'deceased-members':
        sql = "SELECT * FROM members WHERE member_status='Deceased' ORDER BY full_name";
        break;
      case 'monthly-remittance':
        sql = `SELECT r.RemittanceNo as RemittanceNo, r.DateDeposit as Date,
                      rd.MemberName as Member, rd.\`AFNo\` as AF,
                      rd.MF as MF, rd.MSC as MSC, rd.HDA as HDA, rd.Total as Total, rd.COM as COM, rd.NetDeposit as Net,
                      CASE WHEN rd.HDA > 0 THEN 'HDA'
                           WHEN rd.MF > 0 AND (rd.MSC IS NULL OR rd.MSC = 0) THEN 'Renewal'
                           WHEN (rd.MF IS NULL OR rd.MF = 0) AND rd.MSC > 0 THEN 'MSC Deposit'
                           ELSE 'Other' END as Type,
                      r.PreparedBy as Encoder, r.Status as Status
               FROM remittance_details rd
               JOIN remittances r ON rd.RemittanceId = r.Id
               WHERE r.Status = 'Completed' AND TO_CHAR(r.DateDeposit,'YYYY-MM') = ?
               ORDER BY r.DateDeposit DESC, rd.MemberName`;
        queryParams = [params?.month || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })()];
        break;
      case 'damayan-deductions':
        sql = `SELECT dc.*, m.full_name as MemberName FROM death_cases dc
               LEFT JOIN members m ON dc.MemberId = m.Id ORDER BY dc.ProcessedAt DESC`;
        break;
      case 'barangay-coordinators':
        sql = 'SELECT * FROM barangay_coordinators ORDER BY FullName';
        break;
      case 'sales-coordinators':
        sql = 'SELECT * FROM sales_coordinators ORDER BY FullName';
        break;
      case 'collection-summary':
        sql = `SELECT TO_CHAR(DateDeposit,'YYYY-MM') as Period, COUNT(*) as Transactions, SUM(TotalDeposit) as Total
               FROM remittances WHERE Status = 'Completed' GROUP BY TO_CHAR(DateDeposit,'YYYY-MM') ORDER BY Period DESC`;
        break;
      case 'financial-summary':
        sql = `SELECT 'Total Membership Fees (Initial)' as Item, COALESCE(SUM(m.membership_fee),0) as Amount FROM members m
               UNION ALL SELECT 'MSC Total Fund', COALESCE(SUM(COALESCE(ct.NetMSCAmount, rd.MSC)),0) + COALESCE(SUM(rd.HDA),0) - COALESCE((SELECT SUM(Amount) FROM damayan_deductions),0) - COALESCE((SELECT SUM(Amount) FROM hda_deductions),0)
               FROM remittance_details rd
               JOIN remittances r ON rd.RemittanceId = r.Id AND r.Status = 'Completed'
               LEFT JOIN commission_transactions ct ON rd.Id = ct.RemittanceDetailId AND ct.Status = 'Completed'
               UNION ALL SELECT 'Remittance MF Collected', COALESCE(SUM(rd.MF),0) FROM remittance_details rd
               JOIN remittances r ON rd.RemittanceId = r.Id
               JOIN members m ON rd.AFNo = m.af_no
               WHERE r.Status = 'Completed'
               UNION ALL SELECT 'Remittance MSC Deposited', COALESCE(SUM(rd.MSC + COALESCE(rd.HDA,0)),0) FROM remittance_details rd
               JOIN remittances r ON rd.RemittanceId = r.Id
               JOIN members m ON rd.AFNo = m.af_no
               WHERE r.Status = 'Completed'
               UNION ALL SELECT 'Remittance HDA Deposited', COALESCE(SUM(rd.HDA),0) FROM remittance_details rd
               JOIN remittances r ON rd.RemittanceId = r.Id
               JOIN members m ON rd.AFNo = m.af_no
               WHERE r.Status = 'Completed' AND rd.HDA > 0
               UNION ALL SELECT 'Commission Expense', COALESCE(SUM(rd.COM),0) FROM remittance_details rd
               JOIN remittances r ON rd.RemittanceId = r.Id
               JOIN members m ON rd.AFNo = m.af_no
               WHERE r.Status = 'Completed'
               UNION ALL SELECT '5% Sales Coordinator Commission', COALESCE(SUM(ct.CommissionAmount),0)
               FROM commission_transactions ct
               WHERE ct.Status = 'Completed'
               UNION ALL SELECT 'Net Deposit', COALESCE(SUM(rd.NetDeposit),0) FROM remittance_details rd
               JOIN remittances r ON rd.RemittanceId = r.Id
               JOIN members m ON rd.AFNo = m.af_no
               WHERE r.Status = 'Completed'`;
        break;
      case 'ready-for-renewal':
        let rfrWhere = 'WHERE m.member_status = ? AND m.renewal_date IS NOT NULL AND m.membership_status != ?';
        const rfrParams = ['Active', 'Regular'];
        if (params?.district) {
          rfrWhere += ' AND m.district = ?';
          rfrParams.push(params.district);
        }
        if (params?.province) {
          rfrWhere += ' AND m.province_id = ?';
          rfrParams.push(params.province);
        }
        if (params?.municipality) {
          rfrWhere += ' AND m.municipality_id = ?';
          rfrParams.push(params.municipality);
        }
        if (params?.barangay) {
          const b = String(params.barangay).trim();
          if (/^\d+$/.test(b)) { rfrWhere += ' AND m.barangay_id = ?'; rfrParams.push(parseInt(b, 10)); }
          else if (b) { rfrWhere += ' AND brgy.name = ?'; rfrParams.push(b); }
        }
        if (params?.coordinator_id) {
          rfrWhere += ' AND m.sales_coordinator_id = ?';
          rfrParams.push(params.coordinator_id);
        }
        if (params?.membership_status) {
          rfrWhere += ' AND m.membership_status = ?';
          rfrParams.push(params.membership_status);
        }
        if (params?.search) {
          rfrWhere += ' AND (m.af_no LIKE ? OR m.full_name LIKE ? OR m.contact_no LIKE ?)';
          const s = `%${params.search}%`;
          rfrParams.push(s, s, s);
        }
        sql = `
          SELECT m.Id, m.af_no, m.full_name, m.district,
                 bc.BarangayAssigned as Barangay,
                 sc.FullName as SalesCoordinator,
                 prov.name as province_name, mun.name as municipality_name, brgy.name as barangay_name,
                 m.membership_status,
                 m.registration_date,
                 m.renewal_date,
                 (m.renewal_date - CURRENT_DATE) as days_remaining,
                  (COALESCE(deposits.total_msc, 0) - COALESCE(deductions.total_ded, 0) - COALESCE(hda_ded.total_ded, 0)) as computed_balance,
                  ${REQUIRED_MSC} as required_msc,
                  (${REQUIRED_MSC} - (COALESCE(deposits.total_msc, 0) - COALESCE(deductions.total_ded, 0) - COALESCE(hda_ded.total_ded, 0))) as balance_shortage,
                  (SELECT MAX(r.DateDeposit)
                   FROM remittance_details rd
                   JOIN remittances r ON rd.RemittanceId = r.Id
                   WHERE r.Status = 'Completed' AND (rd.MemberId = m.Id OR (rd.MemberId IS NULL AND rd.AFNo = m.af_no))
                     AND rd.MSC > 0) as last_deposit_date,
                  m.contact_no,
                  'Ready for Renewal' as remarks
           FROM members m
           LEFT JOIN ref_provinces prov ON m.province_id = prov.id
           LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
           LEFT JOIN ref_barangays brgy ON m.barangay_id = brgy.id
           LEFT JOIN barangay_coordinators bc ON m.barangay_coordinator_id = bc.Id
           LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
           LEFT JOIN (
             SELECT COALESCE(rd.MemberId, 0) as mkey, rd.AFNo, SUM(rd.MSC + COALESCE(rd.HDA,0)) as total_msc
             FROM remittance_details rd
             JOIN remittances r ON rd.RemittanceId = r.Id
             WHERE r.Status = 'Completed'
             GROUP BY mkey, rd.AFNo
           ) deposits ON (deposits.mkey = m.Id OR (deposits.mkey = 0 AND deposits.AFNo = m.af_no))
           LEFT JOIN (
             SELECT MemberId, SUM(Amount) as total_ded
             FROM damayan_deductions
             GROUP BY MemberId
           ) deductions ON m.Id = deductions.MemberId
           LEFT JOIN (
             SELECT MemberId, SUM(Amount) as total_ded
             FROM hda_deductions
             GROUP BY MemberId
           ) hda_ded ON m.Id = hda_ded.MemberId
          ${rfrWhere}
          AND (m.renewal_date <= CURRENT_DATE + INTERVAL '2 months'
               OR NOT EXISTS (SELECT 1 FROM remittance_details rd4 JOIN remittances r4 ON r4.Id = rd4.RemittanceId
                              WHERE rd4.MemberId = m.Id AND rd4.MF IN (250, 350) AND r4.Status = 'Completed'))
          ORDER BY m.renewal_date ASC`;
        queryParams = rfrParams;
        break;
      case 'due-for-msc':
        let dfmWhere = 'WHERE m.member_status = ?';
        const dfmParams = ['Active'];
        if (params?.district) {
          dfmWhere += ' AND m.district = ?';
          dfmParams.push(params.district);
        }
        if (params?.province) {
          dfmWhere += ' AND m.province_id = ?';
          dfmParams.push(params.province);
        }
        if (params?.municipality) {
          dfmWhere += ' AND m.municipality_id = ?';
          dfmParams.push(params.municipality);
        }
        if (params?.barangay) {
          const b = String(params.barangay).trim();
          if (/^\d+$/.test(b)) { dfmWhere += ' AND m.barangay_id = ?'; dfmParams.push(parseInt(b, 10)); }
          else if (b) { dfmWhere += ' AND brgy.name = ?'; dfmParams.push(b); }
        }
        if (params?.coordinator_id) {
          dfmWhere += ' AND m.sales_coordinator_id = ?';
          dfmParams.push(params.coordinator_id);
        }
        if (params?.membership_status) {
          dfmWhere += ' AND m.membership_status = ?';
          dfmParams.push(params.membership_status);
        }
        if (params?.search) {
          dfmWhere += ' AND (m.af_no LIKE ? OR m.full_name LIKE ? OR m.contact_no LIKE ?)';
          const s = `%${params.search}%`;
          dfmParams.push(s, s, s);
        }
        // Note: balance_min/balance_max filters are applied in HAVING clause using the computed expression
        sql = `
          SELECT m.Id, m.af_no, m.full_name, m.district,
                 bc.BarangayAssigned as Barangay,
                 sc.FullName as SalesCoordinator,
                 prov.name as province_name, mun.name as municipality_name, brgy.name as barangay_name,
                 (COALESCE(deposits.total_msc, 0) - COALESCE(deductions.total_ded, 0) - COALESCE(hda_ded.total_ded, 0)) as computed_balance,
                 100 as required_msc,
                 (${REQUIRED_MSC} - (COALESCE(deposits.total_msc, 0) - COALESCE(deductions.total_ded, 0) - COALESCE(hda_ded.total_ded, 0))) as balance_shortage,
                  (SELECT MAX(r.DateDeposit)
                   FROM remittance_details rd
                   JOIN remittances r ON rd.RemittanceId = r.Id
                   WHERE r.Status = 'Completed' AND (rd.MemberId = m.Id OR (rd.MemberId IS NULL AND rd.AFNo = m.af_no))
                     AND rd.MSC > 0) as last_deposit_date,
                 m.contact_no,
                 'Subscription' as remarks
          FROM members m
          LEFT JOIN ref_provinces prov ON m.province_id = prov.id
          LEFT JOIN ref_municipalities mun ON m.municipality_id = mun.id
          LEFT JOIN ref_barangays brgy ON m.barangay_id = brgy.id
          LEFT JOIN barangay_coordinators bc ON m.barangay_coordinator_id = bc.Id
          LEFT JOIN sales_coordinators sc ON m.sales_coordinator_id = sc.Id
          LEFT JOIN (
            SELECT COALESCE(rd.MemberId, 0) as mkey, rd.AFNo, SUM(rd.MSC + COALESCE(rd.HDA,0)) as total_msc
            FROM remittance_details rd
            JOIN remittances r ON rd.RemittanceId = r.Id
            WHERE r.Status = 'Completed'
            GROUP BY mkey, rd.AFNo
          ) deposits ON (deposits.mkey = m.Id OR (deposits.mkey = 0 AND deposits.AFNo = m.af_no))
          LEFT JOIN (
            SELECT MemberId, SUM(Amount) as total_ded
            FROM damayan_deductions
            GROUP BY MemberId
          ) deductions ON m.Id = deductions.MemberId
          LEFT JOIN (
            SELECT MemberId, SUM(Amount) as total_ded
            FROM hda_deductions
            GROUP BY MemberId
          ) hda_ded ON m.Id = hda_ded.MemberId
          ${dfmWhere}
          HAVING computed_balance < ${REQUIRED_MSC}
             ${params?.balance_min != null && params?.balance_min !== '' ? ' AND computed_balance >= ?' : ''}
             ${params?.balance_max != null && params?.balance_max !== '' ? ' AND computed_balance <= ?' : ''}
          ORDER BY computed_balance ASC`;
        if (params?.balance_min != null && params?.balance_min !== '') dfmParams.push(parseFloat(params.balance_min) || 0);
        if (params?.balance_max != null && params?.balance_max !== '') dfmParams.push(parseFloat(params.balance_max) || 0);
        queryParams = dfmParams;
        break;
      default:
        return { success: false, error: 'Unknown report type: ' + type };
    }
    if (!sql) return { success: false, error: 'No SQL defined for report type: ' + type };
    const [rows] = await pool.execute(sql, queryParams);
    let diedMonthly = {};
    if (type === 'member-master-list' && params?.year) {
      try {
        const [deathRows] = await pool.execute('SELECT EXTRACT(MONTH FROM DateOfDeath)::int as m, COUNT(*) as cnt FROM death_cases WHERE EXTRACT(YEAR FROM DateOfDeath)::int = ? GROUP BY EXTRACT(MONTH FROM DateOfDeath)::int', [parseInt(params.year, 10)]);
        deathRows.forEach(r => { diedMonthly[r.m] = r.cnt; });
      } catch (_) {}
    }
    return { success: true, data: rows, type, diedMonthly };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== SETTINGS IPC =====

ipcMain.handle('settings:get', async (event, { key }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const [rows] = await db.getPool().execute('SELECT SettingValue FROM app_settings WHERE SettingKey = ?', [key]);
    return { success: true, data: rows[0]?.SettingValue || null };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:set', async (event, { key, value }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    await pool.execute('INSERT INTO app_settings (SettingKey, SettingValue) VALUES (?,?) ON CONFLICT (SettingKey) DO UPDATE SET SettingValue = EXCLUDED.SettingValue', [key, value]);
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:users', async (event) => {
  const g = authGuard(event, ['Admin', 'Branch Manager']);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const [rows] = await db.getPool().execute('SELECT Id, Username, FullName, Email, Mobile, Role, Branch, IsActive, IsLocked, LastLogin, CreatedAt, ProfilePicture FROM users ORDER BY Id');
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:saveUser', async (event, { user }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;

    // Server-side input validation
    if (!user.FullName || !String(user.FullName).trim()) {
      return { success: false, error: 'Full name is required' };
    }
    if (String(user.FullName).trim().length > 200) {
      return { success: false, error: 'Full name too long (max 200 characters)' };
    }
    
    if (user.Username !== undefined) {
      const username = String(user.Username).trim();
      if (!username) return { success: false, error: 'Username is required' };
      if (username.length < 3 || username.length > 50) {
        return { success: false, error: 'Username must be 3-50 characters' };
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        return { success: false, error: 'Username can only contain letters, numbers, dots, underscores, and hyphens' };
      }
    }
    
    if (user.Email) {
      const email = String(user.Email).trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return { success: false, error: 'Invalid email format' };
      }
      if (email.length > 255) {
        return { success: false, error: 'Email too long (max 255 characters)' };
      }
    }
    
    if (user.Role) {
      const validRoles = ['Admin', 'Encoder', 'Branch Manager', 'Branch Staff'];
      if (!validRoles.includes(user.Role)) {
        return { success: false, error: 'Invalid role' };
      }
    }
    
    if (user.Mobile) {
      const mobile = String(user.Mobile).trim();
      if (mobile.length > 50) {
        return { success: false, error: 'Mobile number too long (max 50 characters)' };
      }
    }
    
    if (user.Branch) {
      const branch = String(user.Branch).trim();
      if (branch.length > 100) {
        return { success: false, error: 'Branch name too long (max 100 characters)' };
      }
    }

    if (user.Password) {
      const policyError = validatePassword(user.Password);
      if (policyError) return { success: false, error: policyError };
    }
    
    // ... rest of handler
    if (user.Id) {
      const fields = 'FullName=?,Email=?,Mobile=?,Role=?,Branch=?,IsActive=?,IsLocked=?,ProfilePicture=?';
      const params = [user.FullName, user.Email || null, user.Mobile || null, user.Role, user.Branch || null, user.IsActive ? 1 : 0, user.IsLocked ? 1 : 0, user.ProfilePicture || null];
      // Check duplicate username (exclude current user)
      if (user.Username) {
        const [userNameCheck] = await pool.execute('SELECT Id FROM users WHERE Username = ? AND Id != ?', [user.Username, user.Id]);
        if (userNameCheck.length > 0) return { success: false, error: 'Username already exists' };
      }
      // Check duplicate email (exclude current user)
      if (user.Email) {
        const [emailCheck] = await pool.execute('SELECT Id FROM users WHERE Email = ? AND Id != ?', [user.Email, user.Id]);
        if (emailCheck.length > 0) return { success: false, error: 'Email address already in use' };
      }
      // Prevent demoting/deactivating the last active administrator
      const [cur] = await pool.execute('SELECT Role, IsActive, IsLocked FROM users WHERE Id = ?', [user.Id]);
      if (cur.length > 0) {
        const curIsAdmin = cur[0].Role === 'Admin' || cur[0].Role === 'Branch Manager';
        const newIsAdmin = user.Role === 'Admin' || user.Role === 'Branch Manager';
        const newActive = user.IsActive ? 1 : 0;
        const newLocked = user.IsLocked ? 1 : 0;
        if (curIsAdmin && (!newIsAdmin || !newActive || newLocked)) {
          const [cntRows] = await pool.execute(
            "SELECT COUNT(*) as cnt FROM users WHERE IsActive = 1 AND IsLocked = 0 AND Id != ? AND Role IN ('Admin','Branch Manager')",
            [user.Id]
          );
          if (cntRows[0].cnt === 0) return { success: false, error: 'Cannot demote or deactivate the last active administrator.' };
        }
      }
      if (user.Password) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(user.Password, salt);
        await pool.execute(`UPDATE users SET ${fields},PasswordHash=?,MustChangePassword=0 WHERE Id=?`, [...params, hash, user.Id]);
      } else {
        await pool.execute(`UPDATE users SET ${fields} WHERE Id=?`, [...params, user.Id]);
      }
      await logDataChange(pool, 'user', user.Id, 'update', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: user.Id };
    } else {
      if (!user.Username || !String(user.Username).trim()) return { success: false, error: 'Username is required' };
      if (!user.Password) return { success: false, error: 'Password is required' };
      const [existing] = await pool.execute('SELECT Id FROM users WHERE Username = ?', [user.Username]);
      if (existing.length > 0) return { success: false, error: 'Username already exists' };
      if (user.Email) {
        const [emailCheck] = await pool.execute('SELECT Id FROM users WHERE Email = ?', [user.Email]);
        if (emailCheck.length > 0) return { success: false, error: 'Email address already in use' };
      }
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(user.Password, salt);
      const [result] = await pool.execute(
        'INSERT INTO users (Username,PasswordHash,FullName,Email,Mobile,Role,Branch,IsActive,IsLocked,ProfilePicture,MustChangePassword) VALUES (?,?,?,?,?,?,?,?,?,?,0)',
        [user.Username, hash, user.FullName, user.Email || null, user.Mobile || null, user.Role, user.Branch || null, user.IsActive ? 1 : 0, user.IsLocked ? 1 : 0, user.ProfilePicture || null]);
      // Notify: user account created
      try {
        await pool.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority, entity_type, entity_id) VALUES (NULL, 'user_account_created', 'User Account Created', ?, 'info', 'user', ?)",
          [`New user account created: ${user.Username} (${user.Role}). Name: ${user.FullName || 'N/A'}.`, result.insertId]
        );
      } catch (_) { /* ignore */ }
      await logDataChange(pool, 'user', result.insertId, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: result.insertId };
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:toggleUser', async (event, { id, isActive, isLocked }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const [u] = await pool.execute('SELECT Username, Role, IsLocked FROM users WHERE Id = ?', [id]);
    if (u.length === 0) return { success: false, error: 'User not found' };
    const isAdmin = u[0].Role === 'Admin' || u[0].Role === 'Branch Manager';
    if (isAdmin && (!isActive || isLocked)) {
      const [cntRows] = await pool.execute(
        "SELECT COUNT(*) as cnt FROM users WHERE IsActive = 1 AND IsLocked = 0 AND Id != ? AND Role IN ('Admin','Branch Manager')",
        [id]
      );
      if (cntRows[0].cnt === 0) return { success: false, error: 'Cannot deactivate or lock the last active administrator.' };
    }
    let sql = 'UPDATE users SET IsActive = ?';
    const params = [isActive ? 1 : 0];
    if (isLocked !== undefined) {
      sql += ', IsLocked = ?';
      params.push(isLocked ? 1 : 0);
    }
    sql += ' WHERE Id = ?';
    params.push(id);
    await pool.execute(sql, params);
    // Notify: user locked/unlocked
    if (isLocked !== undefined && u.length > 0 && u[0].IsLocked !== (isLocked ? 1 : 0)) {
      try {
        if (isLocked) {
          await pool.execute(
            "INSERT INTO notifications (member_id, type, title, message, priority, entity_type, entity_id) VALUES (NULL, 'user_account_locked', 'User Account Locked', ?, 'warning', 'user', ?)",
            [`User account "${u[0].Username}" has been locked. They can no longer log in.`, id]
          );
        } else {
          await pool.execute(
            "INSERT INTO notifications (member_id, type, title, message, priority, entity_type, entity_id) VALUES (NULL, 'user_account_locked', 'User Account Unlocked', ?, 'info', 'user', ?)",
            [`User account "${u[0].Username}" has been unlocked. They can now log in again.`, id]
          );
        }
      } catch (_) { /* ignore */ }
    }
    await logDataChange(pool, 'user', id, 'update', g.session.userId || null);
    broadcastDataChanged();
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:changePassword', async (event, { userId, currentPassword, newPassword }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    if (g.session.role !== 'Admin' && g.session.role !== 'Branch Manager' && g.session.userId !== userId) {
      return { success: false, error: 'You can only change your own password.' };
    }
    const policyError = validatePassword(newPassword);
    if (policyError) return { success: false, error: policyError };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const [users] = await pool.execute('SELECT * FROM users WHERE Id = ?', [userId]);
    if (users.length === 0) return { success: false, error: 'User not found' };
    const user = users[0];
    const mustChange = user.MustChangePassword === 1 || user.MustChangePassword === true;
    let valid = false;
    try {
      valid = bcrypt.compareSync(currentPassword, user.PasswordHash);
    } catch {}
    if (!mustChange && !valid) return { success: false, error: 'Current password is incorrect' };
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);
    await pool.execute('UPDATE users SET PasswordHash = ?, MustChangePassword = 0 WHERE Id = ?', [hash, userId]);
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:deleteUser', async (event, { id }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const [existing] = await pool.execute('SELECT Role FROM users WHERE Id = ?', [id]);
    if (existing.length === 0) return { success: false, error: 'User not found' };
    if (existing[0].Role === 'Admin' || existing[0].Role === 'Branch Manager') {
      const [cntRows] = await pool.execute(
        "SELECT COUNT(*) as cnt FROM users WHERE Role IN ('Admin','Branch Manager') AND Id != ?",
        [id]
      );
      if (cntRows[0].cnt === 0) return { success: false, error: 'Cannot delete the last administrator account.' };
    }
    await pool.execute('DELETE FROM users WHERE Id = ?', [id]);
    await logDataChange(pool, 'user', id, 'delete', g.session.userId || null);
    broadcastDataChanged();
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:resetPassword', async (event, { id }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const [existing] = await pool.execute('SELECT Id FROM users WHERE Id = ?', [id]);
    if (existing.length === 0) return { success: false, error: 'User not found' };
    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(4).toString('hex');
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(tempPassword, salt);
    await pool.execute('UPDATE users SET PasswordHash = ?, MustChangePassword = 0 WHERE Id = ?', [hash, id]);
    return { success: true, tempPassword };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:activityLogs', async (event, { search, action, dateFrom, dateTo, page = 1, pageSize = 20 } = {}) => {
  const g = authGuard(event, ['Admin']);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const conditions = ['a.Action IN (?, ?, ?)'];
    const params = ['Login', 'Logout', 'Login Failed'];

    page = Math.max(1, parseInt(page, 10) || 1);
    pageSize = Math.min(Math.max(1, parseInt(pageSize, 10) || 20), 200);

    if (search) {
      conditions.push('u.FullName LIKE ?');
      params.push(`%${search}%`);
    }
    if (action) {
      conditions.push('a.Action = ?');
      params.push(action);
    }
    if (dateFrom) {
      conditions.push('a.CreatedAt >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('a.CreatedAt <= ?');
      params.push(dateTo + ' 23:59:59');
    }

    const where = 'WHERE ' + conditions.join(' AND ');
    const offset = Math.max(0, (page - 1)) * pageSize;

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM ActivityLogs a LEFT JOIN users u ON a.AdminUserId = u.Id ${where}`,
      params);
    const total = countRows[0].total;

    const [rows] = await pool.execute(
      `SELECT a.*, u.FullName, u.Role FROM ActivityLogs a LEFT JOIN users u ON a.AdminUserId = u.Id ${where} ORDER BY a.CreatedAt DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]);

    return { success: true, data: rows, total };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// Section 19: financial/operational audit trail (Admin-only). Distinct from the
// Activity Log, which records only login lifecycle events.
ipcMain.handle('settings:auditLogs', async (event, { search, action, dateFrom, dateTo, page = 1, pageSize = 20 } = {}) => {
  const g = authGuard(event, ['Admin']);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    const conditions = [];
    const params = [];

    page = Math.max(1, parseInt(page, 10) || 1);
    pageSize = Math.min(Math.max(1, parseInt(pageSize, 10) || 20), 200);

    if (search) {
      conditions.push('u.FullName LIKE ?');
      params.push(`%${search}%`);
    }
    if (action) {
      conditions.push('a.Action = ?');
      params.push(action);
    }
    if (dateFrom) {
      conditions.push('a.CreatedAt >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('a.CreatedAt <= ?');
      params.push(dateTo + ' 23:59:59');
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = Math.max(0, (page - 1)) * pageSize;

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM audit_logs a LEFT JOIN users u ON a.AdminUserId = u.Id ${where}`,
      params);
    const total = countRows[0].total;

    const [rows] = await pool.execute(
      `SELECT a.*, u.FullName, u.Role FROM audit_logs a LEFT JOIN users u ON a.AdminUserId = u.Id ${where} ORDER BY a.CreatedAt DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]);

    return { success: true, data: rows, total };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:backup', async (event) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const { execFile } = require('child_process');
    const fs = require('fs');
    const backupDir = path.join(app.getPath('documents'), 'GoldenHopeBackups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `goldenhope_backup_${dateStr}_${timeStr}.dump`;
    const filepath = path.join(backupDir, filename);
    const pgDumpPath = findPgBinary('pg_dump');
    if (!pgDumpPath) {
      return { success: false, error: 'pg_dump not found. Ensure PostgreSQL is installed (standalone or portable).' };
    }
    return new Promise((resolve) => {
      let resolved = false;
      let errMsg = '';
      let outMsg = '';
      const safeResolve = (val) => { if (!resolved) { resolved = true; resolve(val); } };
      const dbUser = process.env.DB_USER || 'postgres';
      const dbPass = process.env.DB_PASSWORD || '';
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbPort = process.env.DB_PORT || '5433';
      const dbName = process.env.DB_NAME || 'goldenhope_db';
      const pgArgs = ['-U', dbUser, '-h', dbHost, '-p', dbPort, '-Fc', '--no-owner', '--no-privileges', '-d', dbName, '-f', filepath];
      const env = { ...process.env };
      if (dbPass) env.PGPASSWORD = dbPass;
      const dump = execFile(pgDumpPath, pgArgs, { timeout: 120000, env });
      dump.stderr.on('data', (d) => { errMsg += d.toString(); });
      dump.stdout.on('data', (d) => { outMsg += d.toString(); });
      dump.on('exit', (code) => {
        if (code === 0) {
          // Sanity check: -Fc must produce a custom-format file beginning with
          // "PGDMP". If pg_dump emitted plain SQL (wrong binary/version), reject
          // it so the user isn't left with a non-restorable backup.
          let ok = true;
          try {
            const fd = fs.openSync(filepath, 'r');
            const head = Buffer.alloc(5);
            fs.readSync(fd, head, 0, 5, 0);
            fs.closeSync(fd);
            ok = head.toString('latin1', 0, 5) === 'PGDMP';
          } catch (_) { ok = false; }
          if (!ok) {
            try { fs.unlinkSync(filepath); } catch (_) {}
            db.getPool().execute(
              "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (NULL, 'db_backup_failed', 'Database Backup Failed', ?, 'critical')",
              ['Database backup failed. pg_dump produced an invalid (non-PostgreSQL) file. Ensure the correct PostgreSQL version is installed.']
            ).catch(() => {});
            safeResolve({ success: false, error: 'Backup failed: pg_dump produced an invalid (non-PostgreSQL) file. Ensure the correct PostgreSQL version is installed.' });
            return;
          }
          db.getPool().execute(
            "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (NULL, 'db_backup_completed', 'Database Backup Completed', ?, 'info')",
            [`Database backup completed successfully. File: ${filename}. Path: ${backupDir}.`]
          ).catch(() => {});
          safeResolve({ success: true, path: filepath });
        } else {
          const detail = (errMsg || outMsg || 'pg_dump exited with an error (no details captured)').trim();
          db.getPool().execute(
            "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (NULL, 'db_backup_failed', 'Database Backup Failed', ?, 'critical')",
            [`Database backup failed: ${detail}`]
          ).catch(() => {});
          safeResolve({ success: false, error: 'Database backup failed: ' + friendlyPgVersionError(detail) });
        }
      });
      dump.on('error', (err) => {
        safeResolve({ success: false, error: err.message });
      });
    });
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('settings:restore', async (event, { filepath }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const { execFile } = require('child_process');
    const fs = require('fs');
    if (typeof filepath !== 'string' || !/\.(dump|sql)$/i.test(filepath)) {
      return { success: false, error: 'Invalid backup file. Only .dump (PostgreSQL custom) or .sql (plain SQL) backup files are supported.' };
    }
    if (!fs.existsSync(filepath)) return { success: false, error: 'File not found' };

    const dbUser = process.env.DB_USER || 'postgres';
    const dbPass = process.env.DB_PASSWORD || '';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5433';
    const dbName = process.env.DB_NAME || 'goldenhope_db';
    const env = { ...process.env };
    if (dbPass) env.PGPASSWORD = dbPass;
    // Bulk-restore tuning: skip WAL fsync per commit (huge speedup) and give
    // index/constraint builds more memory. Data is rebuilt from the dump, so
    // losing the last WAL on crash mid-restore is irrelevant.
    env.PGOPTIONS = '-c synchronous_commit=off -c maintenance_work_mem=1GB -c work_mem=128MB';

    // Detect format by magic bytes. Custom-format dumps begin with "PGDMP";
    // anything else is treated as a plain-text SQL dump.
    let isCustom = false;
    try {
      const fd = fs.openSync(filepath, 'r');
      const head = Buffer.alloc(5);
      fs.readSync(fd, head, 0, 5, 0);
      fs.closeSync(fd);
      isCustom = head.toString('latin1', 0, 5) === 'PGDMP';
    } catch (_) { /* fall back to pg_restore and let it report the real error */ }

    // Stop background DB activity (sync poll) and tear down the live pool BEFORE
    // restoring. pg_restore --clean / DROP SCHEMA take ACCESS EXCLUSIVE locks;
    // an open pool lets the sync poll (every 5s) reconnect and queue against
    // those locks, which makes the restore hang ("keeps loading"). Clearing the
    // timer and ending the pool removes all contention during the restore.
    if (syncPollTimer) { try { clearInterval(syncPollTimer); } catch (_) {} syncPollTimer = null; }
    try {
      const livePool = db.getPool();
      if (livePool && typeof livePool.end === 'function') { try { await livePool.end(); } catch (_) {} }
    } catch (_) {}
    try { db.resetPool(); } catch (_) {}

    const runProc = (bin, args) => new Promise((resolve) => {
      let errMsg = '';
      const proc = execFile(bin, args, { timeout: 600000, env });
      proc.stderr.on('data', (d) => { errMsg += d.toString(); });
      proc.on('exit', (code) => resolve({ code: code === null ? -1 : code, errMsg }));
      proc.on('error', (err) => resolve({ code: -1, errMsg: err.message }));
    });

    const finalize = (result) => {
      try {
        db.getPool().execute(
          "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (NULL, ?, 'Database Restore " + (result.success ? 'Completed' : 'Failed') + "', ?, ?)",
          [
            result.success ? 'db_restore_completed' : 'db_restore_failed',
            result.success ? `Database restored successfully from: ${filepath}.` : `Database restore failed: ${result.error}`,
            result.success ? 'info' : 'critical'
          ]
        ).catch(() => {});
      } catch (_) {}
      if (result.success && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        setTimeout(() => {
          try { db.resetPool(); } catch (_) { /* pool may already be closed */ }
          try { startSyncPolling(); } catch (_) { /* restart background polling */ }
          try { mainWindow.webContents.reloadIgnoringCache(); } catch (_) {}
        }, 1200);
      }
      return result;
    };

    if (isCustom) {
      const pgRestorePath = findPgBinary('pg_restore');
      if (!pgRestorePath) return { success: false, error: 'pg_restore not found. Ensure PostgreSQL is installed (standalone or portable).' };
      const psqlPathForCustom = findPgBinary('psql');
      if (!psqlPathForCustom) return { success: false, error: 'psql not found. Ensure PostgreSQL is installed (standalone or portable).' };
      // Circular FKs (personnel <-> branches) make `pg_restore --clean --if-exists`
      // fail: `ALTER TABLE ... DROP CONSTRAINT personnel_pkey` is rejected because
      // FKs in branches still depend on the PK index. The dump's DROP order
      // cannot satisfy a cycle. Wipe the schema with CASCADE first (same as the
      // plain-SQL path), then restore WITHOUT --clean.
      const cleanupCustom = await runProc(psqlPathForCustom, ['-U', dbUser, '-h', dbHost, '-p', dbPort, '-d', dbName, '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;']);
      if (cleanupCustom.code !== 0) {
        return finalize({ success: false, error: 'Failed to reset schema before restore: ' + (cleanupCustom.errMsg || 'unknown error') });
      }
      const r = await runProc(pgRestorePath, ['-U', dbUser, '-h', dbHost, '-p', dbPort, '-d', dbName, filepath]);
      return finalize(r.code === 0 ? { success: true } : { success: false, error: 'Restore failed: ' + friendlyPgVersionError(r.errMsg || 'unknown error') });
    }

    // Plain SQL dump: reset the public schema so the dump applies cleanly
    // without "already exists" conflicts, then replay the file with psql.
    const psqlPath = findPgBinary('psql');
    if (!psqlPath) return { success: false, error: 'psql not found. Ensure PostgreSQL is installed (standalone or portable).' };
    const cleanup = await runProc(psqlPath, ['-U', dbUser, '-h', dbHost, '-p', dbPort, '-d', dbName, '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;']);
    if (cleanup.code !== 0) {
      return finalize({ success: false, error: 'Failed to reset schema before SQL restore: ' + (cleanup.errMsg || 'unknown error') });
    }
    const r = await runProc(psqlPath, ['-U', dbUser, '-h', dbHost, '-p', dbPort, '-d', dbName, '-v', 'ON_ERROR_STOP=0', '-f', filepath]);
    return finalize(r.code === 0 ? { success: true } : { success: false, error: 'Restore failed: ' + (r.errMsg || 'unknown error') });
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== DIALOG IPC =====
ipcMain.handle('dialog:openFile', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PostgreSQL Backup Files (.dump, .sql)', extensions: ['dump', 'sql'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  return { success: true, path: result.filePaths[0] };
});

// ===== SYSTEM-WIDE CONFIGURABLE MONTH LOCK IPC =====

// Core state machine: returns active lock or null; handles Scheduled?Active and Active?Expired transitions
async function checkSystemLock(pool) {
  const [rows] = await pool.execute(
    "SELECT * FROM lock_logs WHERE Status IN ('Scheduled', 'Active') ORDER BY Id DESC LIMIT 1"
  );
  if (rows.length === 0) return null;
  const lock = rows[0];
  const now = new Date();

  if (lock.Status === 'Scheduled') {
    if (now >= new Date(lock.LockStart) && now < new Date(lock.LockEnd)) {
      await pool.execute("UPDATE lock_logs SET Status = 'Active', UpdatedAt = NOW() WHERE Id = ?", [lock.Id]);
      lock.Status = 'Active';
      return lock;
    }
    if (now >= new Date(lock.LockEnd)) {
      await pool.execute("UPDATE lock_logs SET Status = 'Expired', UpdatedAt = NOW() WHERE Id = ?", [lock.Id]);
      return null;
    }
    return null; // Scheduled but not yet active
  }

  if (lock.Status === 'Active') {
    if (now >= new Date(lock.LockEnd)) {
      await pool.execute("UPDATE lock_logs SET Status = 'Expired', UpdatedAt = NOW() WHERE Id = ?", [lock.Id]);
      return null;
    }
    return lock;
  }

  return null;
}

// Returns the current schedule (Scheduled or Active) without triggering transitions
async function getLockSchedule(pool) {
  const [rows] = await pool.execute(
    "SELECT * FROM lock_logs WHERE Status IN ('Scheduled', 'Active') ORDER BY Id DESC LIMIT 1"
  );
  return rows.length > 0 ? rows[0] : null;
}

ipcMain.handle('lock:check', async () => {
  try {
    const pool = db.getPool();
    const activeLock = await checkSystemLock(pool);
    const schedule = await getLockSchedule(pool);
    return { success: true, data: activeLock, locked: !!activeLock, schedule };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('lock:set', async (event, { startDate, startTime, endDate, endTime, reason }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();

    // Prevent overlapping active/scheduled locks
    const existingSchedule = await getLockSchedule(pool);
    if (existingSchedule) {
      return {
        success: false,
        error: `A System Lock is already scheduled from ${new Date(existingSchedule.LockStart).toLocaleString()} until ${new Date(existingSchedule.LockEnd).toLocaleString()}.`
      };
    }

    const lockStart = new Date(`${startDate}T${startTime}`);
    const lockEnd = new Date(`${endDate}T${endTime}`);

    if (isNaN(lockStart.getTime()) || isNaN(lockEnd.getTime())) {
      return { success: false, error: 'Invalid date or time format.' };
    }
    if (lockEnd <= lockStart) {
      return { success: false, error: 'Unlock date and time must be later than the lock start date and time.' };
    }

    const uid = g.session.userId || null;
    const status = lockStart <= new Date() ? 'Active' : 'Scheduled';
    const [result] = await pool.execute(
      'INSERT INTO lock_logs (Status, LockedBy, LockStart, LockEnd, Reason) VALUES (?, ?, ?, ?, ?)',
      [status, uid, lockStart, lockEnd, reason || null]
    );

    // Audit log
    try {
      const desc = status === 'Active'
        ? `System lock activated. Ends: ${lockEnd.toLocaleString()}`
        : `System lock scheduled from ${lockStart.toLocaleString()} to ${lockEnd.toLocaleString()}`;
      await logAudit(pool, uid, 'Month Locked', desc);
    } catch (_) {}

    // Notify
    try {
      const msg = status === 'Active'
        ? `The system is now locked for reconciliation. Data entry is disabled until ${lockEnd.toLocaleString()}.`
        : `A system lock has been scheduled from ${lockStart.toLocaleString()} to ${lockEnd.toLocaleString()}.`;
      await pool.execute(
        "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (NULL, 'month_locked', 'Month Locked', ?, 'info')",
        [msg]
      );
    } catch (_) {}

    return { success: true, data: { id: result.insertId, status, lockStart: lockStart.toISOString(), lockEnd: lockEnd.toISOString() } };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('lock:cancel', async (event) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const schedule = await getLockSchedule(pool);
    if (!schedule) {
      return { success: false, error: 'No active or scheduled lock found.' };
    }

    await pool.execute(
      "UPDATE lock_logs SET Status = 'Cancelled', UpdatedAt = NOW() WHERE Id = ?",
      [schedule.Id]
    );

    // Audit log
    try {
      await logAudit(pool, g.session.userId || null, 'Month Unlocked', `System lock cancelled by administrator. Was scheduled: ${new Date(schedule.LockStart).toLocaleString()} to ${new Date(schedule.LockEnd).toLocaleString()}`);
    } catch (_) {}

    // Notify
    try {
      await pool.execute(
        "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (NULL, 'month_lock_overridden', 'Lock Overridden', ?, 'warning')",
        ['The system lock has been cancelled. Data entry is now enabled.']
      );
    } catch (_) {}

    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== LOCK GUARD: all data-modifying handlers call this =====

async function rejectIfLocked(pool) {
  const lock = await checkSystemLock(pool);
  if (lock) {
    const unlockDate = new Date(lock.LockEnd).toLocaleString();
    return { success: false, locked: true, error: `System is locked for monthly reconciliation. Data entry is disabled until ${unlockDate}.` };
  }
  return null;
}

// ===== EXCEL EXPORT IPC =====

ipcMain.handle('export:excel', async (event, { data, filename }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Report');
    if (data.length > 0) {
      const cols = Object.keys(data[0]);
      sheet.columns = cols.map(c => ({ header: c, key: c, width: 20 }));
      data.forEach(row => sheet.addRow(row));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return { success: true, data: [...buffer], filename };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== PDF EXPORT IPC =====

async function loadPdfHtmlWindow(pdfWindow, html) {
  const fs = require('fs');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-pdf-'));
  const file = path.join(tmpDir, 'report.html');
  fs.writeFileSync(file, html, 'utf8');
  pdfWindow.webContents.on('will-navigate', (e, url) => { e.preventDefault(); });
  pdfWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pdfWindow.on('closed', () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });
  await pdfWindow.loadFile(file);
  return tmpDir;
}

ipcMain.handle('export:printToPDF', async (event, { html, filename }) => {
  let pdfWindow = null;
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const { BrowserWindow } = require('electron');
    pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    await loadPdfHtmlWindow(pdfWindow, html);
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false
    });
    return { success: true, data: [...pdf], filename };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  } finally {
    if (pdfWindow) pdfWindow.close();
  }
});

ipcMain.handle('export:printToPDFLandscape', async (event, { html, filename }) => {
  let pdfWindow = null;
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const { BrowserWindow } = require('electron');
    pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    await loadPdfHtmlWindow(pdfWindow, html);
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Legal',
      landscape: true,
      marginsType: 0
    });
    return { success: true, data: [...pdf], filename };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  } finally {
    if (pdfWindow) pdfWindow.close();
  }
});

ipcMain.handle('export:printToPDFPortrait', async (event, { html, filename }) => {
  let pdfWindow = null;
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    const { BrowserWindow } = require('electron');
    pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    await loadPdfHtmlWindow(pdfWindow, html);
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      marginsType: 0
    });
    return { success: true, data: [...pdf], filename };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  } finally {
    if (pdfWindow) pdfWindow.close();
  }
});

ipcMain.handle('export:getLogoBase64', async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const logoPath = path.join(__dirname, 'assets', 'logo.png');
    if (fs.existsSync(logoPath)) {
      const data = fs.readFileSync(logoPath);
      const base64 = data.toString('base64');
      return { success: true, dataUrl: `data:image/png;base64,${base64}` };
    }
    return { success: true, dataUrl: null };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== ACTIVITY LOG IPC =====

ipcMain.handle('activity:log', async (event, { userId, action, description, ipAddress, userAgent, status }) => {
  try {
    // Allow unauthenticated log entries (e.g. failed logins) but never attribute them
    // to a real user. When a session exists, prefer the session identity over the renderer.
    const g = getSession(event);
    const effectiveUserId = g ? (userId || g.userId) : null;
    await db.getPool().execute(
      'INSERT INTO ActivityLogs (AdminUserId, Action, Description, IpAddress, UserAgent, Status) VALUES (?,?,?,?,?,?)',
      [effectiveUserId, action, description, ipAddress || '', userAgent || '', status || 'Success']);
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== COMMISSION CONFIG IPC =====

ipcMain.handle('commission:getConfig', async () => {
  try {
    const [rows] = await db.getPool().execute('SELECT * FROM commission_config ORDER BY Id DESC LIMIT 1');
    if (rows.length > 0) {
      return { success: true, config: BusinessRules.normalizeConfig(rows[0]) };
    }
    return { success: true, config: BusinessRules.normalizeConfig(null) };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== BUSINESS RULES IPC =====
// Exposes the single source of truth to the renderer so every screen
// (dashboard, reports, remittance, members, SOA) uses one set of rules.

ipcMain.handle('business:getRules', async () => {
  try {
    const cfg = await getCommissionConfigSql(db.getPool());
    return {
      success: true,
      rules: BusinessRules.RULES,
      commission: cfg
    };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('commission:saveConfig', async (event, config) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const mfAmount = parseFloat(config.MFAmount) || 0;
    const comAmount = parseFloat(config.COMAmount) || 0;
    const comAmountAlt = parseFloat(config.COMAmountAlt) || 0;
    const mfThreshold = parseFloat(config.MFThreshold) || 0;
    const altThreshold = parseFloat(config.AltThreshold) || 0;
    if (mfAmount < 0 || comAmount < 0 || comAmountAlt < 0 || mfThreshold < 0 || altThreshold < 0) {
      return { success: false, error: 'Commission values cannot be negative' };
    }
    // Approved business rule: the Sales Coordinator commission is strictly ₱120.
    // Reject any attempt to save a different commission (e.g. ₱100) so the value
    // can never drift from the central constant.
    if (comAmount !== SALES_COORDINATOR_COMMISSION || comAmountAlt !== SALES_COORDINATOR_COMMISSION) {
      return { success: false, error: `Commission must be ₱${SALES_COORDINATOR_COMMISSION} per approved business rule.` };
    }
    if (comAmount > mfAmount || comAmountAlt > mfAmount) {
      return { success: false, error: 'Commission cannot exceed membership fee amount' };
    }
    if (altThreshold > mfThreshold) {
      return { success: false, error: 'Alternate threshold cannot exceed the main threshold' };
    }
    const [existing] = await pool.execute('SELECT Id FROM commission_config LIMIT 1');
    if (existing.length > 0) {
      await pool.execute(
        'UPDATE commission_config SET MFAmount = ?, COMAmount = ?, COMAmountAlt = ?, MFThreshold = ?, AltThreshold = ? WHERE Id = ?',
        [mfAmount, comAmount, comAmountAlt, mfThreshold, altThreshold, existing[0].Id]
      );
    } else {
      await pool.execute(
        'INSERT INTO commission_config (MFAmount, COMAmount, COMAmountAlt, MFThreshold, AltThreshold) VALUES (?, ?, ?, ?, ?)',
        [mfAmount, comAmount, comAmountAlt, mfThreshold, altThreshold]
      );
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== BRANCHES IPC HANDLERS =====

ipcMain.handle('branches:list', async (event, { page = 1, pageSize = 50, search, status } = {}) => {
  try {
    const pool = db.getPool();
    pageSize = Math.min(Math.max(1, pageSize || 50), 100000);
    const offset = Math.max(0, (page - 1)) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (Name LIKE ? OR Code LIKE ? OR Address LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status && status !== 'All') {
      where += ' AND Status = ?';
      params.push(status);
    }
    const [countRows] = await pool.execute(`SELECT COUNT(*) as total FROM branches ${where}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.execute(
      `SELECT * FROM branches ${where} ORDER BY Id ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return { success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('branches:save', async (event, { branch }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const branchId = branch.Id && branch.Id !== 'null' ? branch.Id : null;
    if (branchId) {
      await pool.execute('UPDATE branches SET Code=?,Name=?,Address=?,ContactNo=?,Status=? WHERE Id=?',
        [branch.Code || '', branch.Name || '', branch.Address || '', branch.ContactNo || '', branch.Status || 'Active', branchId]);
      await logDataChange(pool, 'branch', branchId, 'update', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: branchId };
    } else {
      const [result] = await pool.execute('INSERT INTO branches (Code,Name,Address,ContactNo,Status) VALUES (?,?,?,?,?)',
        [branch.Code || '', branch.Name || '', branch.Address || '', branch.ContactNo || '', branch.Status || 'Active']);
      await logDataChange(pool, 'branch', result.insertId, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: result.insertId };
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('branches:delete', async (event, { id }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    // Check if branch has personnel assigned
    const [personnel] = await pool.execute('SELECT COUNT(*) as cnt FROM personnel WHERE BranchId = ?', [id]);
    if (personnel[0].cnt > 0) {
      return { success: false, error: 'Cannot delete branch with active personnel. Remove or reassign personnel first.' };
    }
    // Check if branch has members assigned
    const [members] = await db.getPool().execute('SELECT COUNT(*) as cnt FROM members WHERE branch_id = ?', [id]);
    if (members[0].cnt > 0) {
      return { success: false, error: 'Cannot delete branch with members assigned. Reassign members first.' };
    }
    await db.getPool().execute('DELETE FROM branches WHERE Id = ?', [id]);
    await logDataChange(pool, 'branch', id, 'delete', g.session.userId || null);
    broadcastDataChanged();
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('branches:active', async () => {
  try {
    const [rows] = await db.getPool().execute("SELECT Id, Code, Name, Address FROM branches WHERE Status = 'Active' ORDER BY Id ASC");
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

// ===== PERSONNEL IPC HANDLERS =====

ipcMain.handle('personnel:list', async (event, { page = 1, pageSize = 50, search, branchId } = {}) => {
  try {
    const pool = db.getPool();
    pageSize = Math.min(Math.max(1, pageSize || 50), 100000);
    const offset = Math.max(0, (page - 1)) * pageSize;
    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (p.FullName LIKE ? OR p.Position LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s);
    }
    if (branchId) {
      where += ' AND p.BranchId = ?';
      params.push(branchId);
    }
    const [countRows] = await pool.execute(`SELECT COUNT(*) as total FROM personnel p ${where}`, params);
    const total = countRows[0].total;
    const [rows] = await pool.execute(
      `SELECT p.*, b.Name as BranchName FROM personnel p LEFT JOIN branches b ON p.BranchId = b.Id ${where} ORDER BY p.FullName ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    return { success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('personnel:listByBranch', async (event, { branchId }) => {
  try {
    if (!branchId) return { success: true, data: [] };
    const [rows] = await db.getPool().execute(
      "SELECT Id, FullName, Position FROM personnel WHERE BranchId = ? AND Status = 'Active' ORDER BY FullName ASC",
      [branchId]
    );
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('personnel:save', async (event, { personnel }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    const personnelId = personnel.Id && personnel.Id !== 'null' ? personnel.Id : null;
    if (personnelId) {
      await pool.execute('UPDATE personnel SET FullName=?,Position=?,BranchId=?,ContactNo=?,Email=?,Status=? WHERE Id=?',
        [personnel.FullName, personnel.Position || '', personnel.BranchId || null, personnel.ContactNo || '', personnel.Email || '', personnel.Status || 'Active', personnelId]);
      await logDataChange(pool, 'personnel', personnelId, 'update', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: personnelId };
    } else {
      const [result] = await pool.execute('INSERT INTO personnel (FullName,Position,BranchId,ContactNo,Email,Status) VALUES (?,?,?,?,?,?)',
        [personnel.FullName, personnel.Position || '', personnel.BranchId || null, personnel.ContactNo || '', personnel.Email || '', personnel.Status || 'Active']);
      await logDataChange(pool, 'personnel', result.insertId, 'create', g.session.userId || null);
      broadcastDataChanged();
      return { success: true, id: result.insertId };
    }
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('personnel:delete', async (event, { id }) => {
  try {
    const g = authGuard(event, ['Admin']);
    if (!g.ok) return { success: false, error: g.error };
    const pool = db.getPool();
    const locked = await rejectIfLocked(pool);
    if (locked) return locked;
    await pool.execute('DELETE FROM personnel WHERE Id = ?', [id]);
    await logDataChange(pool, 'personnel', id, 'delete', g.session.userId || null);
    broadcastDataChanged();
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});



// ===== NOTIFICATION HELPERS =====

// ===== NOTIFICATION IPC HANDLERS =====

ipcMain.handle('notifications:list', async (event, { filter, status } = {}) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const pool = db.getPool();
    let where = 'WHERE n.status != ?';
    const params = ['resolved'];
    if (filter && filter !== 'all') {
      if (filter === 'upcoming') {
        where += " AND n.type IN ('upcoming_30','upcoming_15','upcoming_7')";
      } else if (filter === 'due_today') {
        where += " AND n.type = 'due_today'";
      } else if (filter === 'grace_period') {
        where += " AND n.type = 'grace_period'";
      } else if (filter === 'inactive') {
        where += " AND n.type = 'inactive'";
      } else if (filter === 'renewal_success') {
        where += " AND n.type IN ('renewal_success','membership_upgrade')";
      } else if (filter === 'member_registered') {
        where += " AND n.type = 'member_registered'";
      } else if (filter === 'member_status_changed') {
        where += " AND n.type = 'member_status_changed'";
      } else if (filter === 'benefit_eligible') {
        where += " AND n.type = 'benefit_eligible'";
      } else if (filter === 'death_case') {
        where += " AND n.type IN ('death_case_filed','benefit_processed','death_deduction_processed')";
      } else if (filter === 'remittance') {
        where += " AND n.type IN ('remittance_submitted','member_pending_remittance','remittance_overdue')";
      } else if (filter === 'system') {
        where += " AND n.type IN ('month_locked','month_lock_overridden','user_account_created','user_account_locked','db_backup_completed','db_backup_failed')";
      } else if (filter === 'coordinator') {
        where += " AND n.type = 'coordinator_status_changed'";
      } else if (filter === 'birthday') {
        where += " AND n.type = 'member_birthday'";
      } else if (filter === 'payment_milestone') {
        where += " AND n.type = 'payment_milestone'";
      }
    }
    if (status && status !== 'all') {
      where += ' AND n.status = ?';
      params.push(status);
    }
    const [rows] = await pool.execute(
      `SELECT n.*, m.full_name as member_name, m.af_no, m.renewal_date, m.member_status
       FROM notifications n
       LEFT JOIN members m ON n.member_id = m.Id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT 100`,
      params
    );
    return { success: true, data: rows };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('notifications:unreadCount', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  try {
    const [rows] = await db.getPool().execute(
      "SELECT COUNT(*) as cnt FROM notifications WHERE status = 'unread'"
    );
    return { success: true, count: rows[0].cnt };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('notifications:markRead', async (event, { id }) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    await db.getPool().execute('UPDATE notifications SET status = ?, read_at = NOW() WHERE Id = ?', ['read', id]);
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('notifications:markAllRead', async (event) => {
  try {
    const g = authGuard(event);
    if (!g.ok) return { success: false, error: g.error };
    await db.getPool().execute("UPDATE notifications SET status = 'read', read_at = NOW() WHERE status = 'unread'");
    return { success: true };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
});

ipcMain.handle('notifications:checkRenewals', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  return await checkMemberRenewals();
});

ipcMain.handle('notifications:checkBirthdays', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  return await checkBirthdays();
});

ipcMain.handle('notifications:checkBenefitEligibility', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  return await checkBenefitEligibility();
});

ipcMain.handle('notifications:checkPaymentMilestones', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  return await checkPaymentMilestones();
});

ipcMain.handle('notifications:checkOverdueRemittances', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  return await checkOverdueRemittances();
});

async function checkMemberRenewals() {
  try {
    const pool = db.getPool();
    const results = { created: 0, inactivated: 0 };

    // Get active members with renewal_date
    const [members] = await pool.execute(
      "SELECT Id, full_name, af_no, renewal_date, member_status FROM members WHERE member_status = 'Active' AND renewal_date IS NOT NULL"
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const member of members) {
      const renewalDate = new Date(member.renewal_date);
      renewalDate.setHours(0, 0, 0, 0);
      const diffTime = renewalDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let type = null;
      let title = '';
      let message = '';
      let priority = 'info';

      if (diffDays <= 30 && diffDays > 15) {
        type = 'upcoming_30';
        title = 'Renewal Reminder';
        message = `${member.full_name}'s membership will expire on ${formatDateStr(member.renewal_date)} (${diffDays} days from now). Please remind the member to renew.`;
        priority = 'info';
      } else if (diffDays <= 15 && diffDays > 7) {
        type = 'upcoming_15';
        title = 'Renewal Reminder';
        message = `${member.full_name} has ${diffDays} days remaining before their membership renewal is due.`;
        priority = 'reminder';
      } else if (diffDays <= 7 && diffDays > 0) {
        type = 'upcoming_7';
        title = 'Renewal Reminder';
        message = `${member.full_name} has ${diffDays} days remaining before the renewal deadline.`;
        priority = 'reminder';
      } else if (diffDays === 0) {
        type = 'due_today';
        title = 'Renewal Due Today';
        message = `${member.full_name}'s membership renewal is due today.`;
        priority = 'warning';
      } else if (diffDays < 0 && diffDays >= -15) {
        type = 'grace_period';
        title = 'Grace Period';
        const graceEnd = new Date(renewalDate);
        graceEnd.setDate(graceEnd.getDate() + 15);
        message = `${member.full_name} is currently within the 15-day grace period. Membership remains Active until ${formatDateStr(graceEnd.toISOString().slice(0,10))}.`;
        priority = 'warning';
      } else if (diffDays < -15) {
        // Grace period expired - change status to Inactive
        type = 'inactive';
        title = 'Membership Inactive';
        message = `${member.full_name} did not renew before the grace period expired. Membership status has been changed to Inactive.`;
        priority = 'critical';

        // Update member status to Inactive
        await pool.execute("UPDATE members SET member_status = 'Inactive' WHERE Id = ?", [member.Id]);
        broadcastDataChanged();
        results.inactivated++;
      }

      if (type) {
        // Check if notification already exists for this member+type
        const [existing] = await pool.execute(
          'SELECT Id FROM notifications WHERE member_id = ? AND type = ? AND status != ?',
          [member.Id, type, 'resolved']
        );
        if (existing.length === 0) {
          await pool.execute(
            'INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, ?, ?, ?, ?)',
            [member.Id, type, title, message, priority]
          );
          results.created++;
        }
      }
    }

    return { success: true, ...results };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
}

function formatDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
  const parts = val.split(' ')[0].split('-');
  if (parts.length !== 3) return val;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
}

// ===== BIRTHDAY CHECKER =====

async function checkBirthdays() {
  try {
    const pool = db.getPool();
    const [members] = await pool.execute(
      "SELECT Id, full_name, af_no, birth_date FROM members WHERE member_status = 'Active' AND birth_date IS NOT NULL"
    );
    const today = new Date();
    const todayMD = `${today.getMonth() + 1}-${today.getDate()}`;
    let created = 0;
    for (const m of members) {
      if (!m.birth_date) continue;
      const bd = new Date(m.birth_date);
      const bdMD = `${bd.getMonth() + 1}-${bd.getDate()}`;
      if (bdMD !== todayMD) continue;
      const [existing] = await pool.execute(
        "SELECT Id FROM notifications WHERE member_id = ? AND type = 'member_birthday' AND DATE(created_at) = CURDATE()",
        [m.Id]
      );
      if (existing.length > 0) continue;
      await pool.execute(
        "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'member_birthday', 'Member Birthday', ?, 'info')",
        [m.Id, `Today is ${m.full_name}'s birthday! (AF No: ${m.af_no}) Send your greetings!`]
      );
      created++;
    }
    return { success: true, created };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
}

// ===== BENEFIT ELIGIBILITY CHECKER =====

async function checkBenefitEligibility() {
  try {
    const pool = db.getPool();
    const [members] = await pool.execute(
      "SELECT Id, full_name, af_no, registration_date, membership_status FROM members WHERE member_status = 'Active'"
    );
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    let created = 0;
    for (const m of members) {
      const benefit = calculateDeathBenefit(m.registration_date, today, m.membership_status);
      if (benefit <= 0) continue;
      const [existing] = await pool.execute(
        "SELECT Id FROM notifications WHERE member_id = ? AND type = 'benefit_eligible' AND status != 'resolved'",
        [m.Id]
      );
      if (existing.length > 0) continue;
      const label = `₱${BusinessRules.deathBenefitLabel(benefit).toLocaleString()}`;
      await pool.execute(
        "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'benefit_eligible', 'Death Benefit Eligible', ?, 'reminder')",
        [m.Id, `${m.full_name} (${m.af_no}) is now eligible for death benefit of ${label}. Registered: ${formatDateStr(m.registration_date)}.`]
      );
      created++;
    }
    return { success: true, created };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
}

// ===== PAYMENT MILESTONE CHECKER =====

async function checkPaymentMilestones() {
  const milestones = [10000, 20000, 50000, 100000];
  try {
    const pool = db.getPool();
    const [members] = await pool.execute(
      "SELECT Id, full_name, af_no, overall_payment FROM members WHERE member_status = 'Active' AND overall_payment > 0"
    );
    let created = 0;
    for (const m of members) {
      const op = parseFloat(m.overall_payment) || 0;
      const reached = milestones.filter(ms => op >= ms);
      for (const ms of reached) {
        const [existing] = await pool.execute(
          "SELECT Id FROM notifications WHERE member_id = ? AND type = 'payment_milestone' AND message LIKE ? AND status != 'resolved'",
          [m.Id, `%₱${ms.toLocaleString()}%`]
        );
        if (existing.length > 0) continue;
        await pool.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'payment_milestone', 'Payment Milestone Reached', ?, 'info')",
          [m.Id, `${m.full_name} (${m.af_no}) has reached a total payment of ₱${op.toFixed(2)} surpassing the ₱${ms.toLocaleString()} milestone!`]
        );
        created++;
      }
    }
    return { success: true, created };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
}

// ===== OVERDUE REMITTANCE CHECKER =====

async function checkOverdueRemittances() {
  try {
    const pool = db.getPool();
    const [members] = await pool.execute(
      "SELECT Id, full_name, af_no, renewal_date FROM members WHERE member_status = 'Active' AND renewal_date IS NOT NULL"
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let created = 0;
    for (const m of members) {
      const renewal = new Date(m.renewal_date);
      renewal.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - renewal.getTime()) / (1000 * 60 * 60 * 24));
      // Remittance considered overdue if renewal date has passed by 1+ days but not yet 30 days (handled by grace/inactive)
      if (diffDays >= 1 && diffDays <= 15) {
        const [existing] = await pool.execute(
          "SELECT Id FROM notifications WHERE member_id = ? AND type = 'remittance_overdue' AND status != 'resolved'",
          [m.Id]
        );
        if (existing.length > 0) continue;
        await pool.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'remittance_overdue', 'Remittance Overdue', ?, 'warning')",
          [m.Id, `${m.full_name} (${m.af_no}) is ${diffDays} day(s) past their renewal date. Please follow up for remittance.`]
        );
        created++;
      }
    }
    return { success: true, created };
  } catch (error) {
    return { success: false, error: maskSqlError(error) };
  }
}

// ===== RENEWAL HANDLER =====

async function handleMemberRenewal(memberId, pool) {
  try {
    // Get member with membership info
    const [members] = await pool.execute(
      'SELECT Id, full_name, af_no, registration_date, renewal_date, last_renewed_date, membership_status, honorary_years_completed, honorary_start_date FROM members WHERE Id = ?',
      [memberId]
    );
    if (members.length === 0) return;

    const member = members[0];

    // Skip if this is the initial registration MF payment (member registered within the last 90
    // days and has never had a qualifying renewal before). The initial fee must not extend the
    // membership term by an extra year.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!member.last_renewed_date && member.registration_date) {
      const regDate = new Date(member.registration_date);
      regDate.setHours(0, 0, 0, 0);
      const daysSinceReg = Math.round((today.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceReg >= 0 && daysSinceReg <= 90) return;
    }

    // ===== HONORARY MEMBER TRACKING (count annual payments only) =====
    if (member.membership_status === 'Honorary') {
      const currentYears = member.honorary_years_completed || 0;
      const newYears = currentYears + 1;

      if (newYears >= 10) {
        await pool.execute(
          "UPDATE members SET membership_status = 'Regular', honorary_years_completed = ? WHERE Id = ?",
          [newYears, memberId]
        );
        await pool.execute(
          'INSERT INTO membership_audit_log (member_id, old_status, new_status, reason) VALUES (?,?,?,?)',
          [memberId, 'Honorary', 'Regular', 'Auto-converted after completing 10 annual payments']
        );
        await pool.execute(
          "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'membership_upgrade', 'Membership Upgraded', ?, 'info')",
          [memberId, `${member.full_name} has been upgraded from Honorary Member to Regular Member after completing 10 years of annual payments. They are now entitled to full membership benefits.`]
        );
        broadcastDataChanged();
      } else {
        await pool.execute(
          'UPDATE members SET honorary_years_completed = ? WHERE Id = ?',
          [newYears, memberId]
        );
      }
    }

    // ===== RENEWAL DATE EXTENSION =====
    // Compute next renewal date:
    // - If renewal_date is NULL: start from today + 1 year
    // - If renewal_date is in the past (overdue): extend from today + 1 year
    // - If renewal_date is in the future: extend from current renewal_date + 1 year (preserves anniversary)
    let nextRenewalDate;
    if (!member.renewal_date) {
      // First renewal or missing data
      nextRenewalDate = new Date(today);
      nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
    } else {
      const currentRenewal = new Date(member.renewal_date);
      currentRenewal.setHours(0, 0, 0, 0);
      if (currentRenewal < today) {
        // Overdue: reset from today
        nextRenewalDate = new Date(today);
        nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
      } else {
        // On time or early: preserve anniversary
        nextRenewalDate = new Date(currentRenewal);
        nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
      }
    }
    const nextRenewalStr = nextRenewalDate.toISOString().slice(0, 10);

    // Update member renewal date and restore to Active
    await pool.execute(
      "UPDATE members SET renewal_date = ?, last_renewed_date = CURDATE(), member_status = 'Active' WHERE Id = ?",
      [nextRenewalStr, memberId]
    );
    broadcastDataChanged();

    // Resolve all unread/read notifications for this member (except renewal_success)
    await pool.execute(
      "UPDATE notifications SET status = 'resolved', resolved_at = NOW() WHERE member_id = ? AND type != 'renewal_success' AND type != 'membership_upgrade'",
      [memberId]
    );

    // Create success notification
    await pool.execute(
      "INSERT INTO notifications (member_id, type, title, message, priority) VALUES (?, 'renewal_success', 'Renewal Successful', ?, 'info')",
      [memberId, `${member.full_name} has successfully renewed their membership. The next renewal date is ${formatDateStr(nextRenewalStr)}.`]
    );
  } catch (err) {
    console.error('Renewal handler error:', err.message);
    // Rethrow so the caller (remittance save) can roll back the transaction.
    throw err;
  }
}

// Auto-update IPC handlers
ipcMain.handle('update:check', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  if (!isUpdateServerConfigured()) {
    return { success: false, error: 'Auto-updates are not configured for this build.' };
  }
  try {
    updaterState = { ...updaterState, status: 'checking', error: null };
    broadcastUpdateStatus();
    safeCheckForUpdates();
    return { success: true, data: { ...updaterState } };
  } catch (_) {
    return { success: false, error: 'Failed to check for updates.' };
  }
});

ipcMain.handle('update:startDownload', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  if (!app.isPackaged || !isUpdateServerConfigured()) {
    return { success: false, error: 'Auto-updates are not available in this build.' };
  }
  try {
    autoUpdater.downloadUpdate();
    return { success: true, data: { ...updaterState } };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : 'Failed to start the update download.' };
  }
});

ipcMain.handle('update:getStatus', async (event) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  return {
    success: true,
    data: {
      ...updaterState,
      appVersion: app.getVersion(),
      configured: isUpdateServerConfigured(),
      autoDownload: autoUpdater.autoDownload
    }
  };
});

ipcMain.handle('update:setAutoDownload', async (event, { enabled }) => {
  const g = authGuard(event);
  if (!g.ok) return { success: false, error: g.error };
  autoUpdater.autoDownload = !!enabled;
  return { success: true, data: { autoDownload: autoUpdater.autoDownload } };
});

ipcMain.handle('update:install', async (event) => {
  const g = authGuard(event, ['Admin']);
  if (!g.ok) return { success: false, error: g.error };
  setImmediate(() => {
    autoUpdater.quitAndInstall();
  });
  return { success: true };
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});
