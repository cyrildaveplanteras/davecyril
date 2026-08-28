// ===== APP CONTROLLER =====

const pageConfig = {
  'dashboard': { title: 'Dashboard', subtitle: 'Overview of Membership System Statistics' },
  'member-registration': { title: 'Member Registration', subtitle: 'Register new members or update existing records' },
  'member-list': { title: 'Member List', subtitle: 'View, search, and manage all members' },
  'remittance': { title: 'Remittance Management', subtitle: 'Manage remittance slips and collections' },
  'barangay-coordinators': { title: 'Barangay Coordinators', subtitle: 'Manage barangay coordinator records' },
  'sales-coordinators': { title: 'Sales Coordinators', subtitle: 'Manage sales coordinator records' },
  'branches': { title: 'District', subtitle: 'Manage branch offices and their addresses' },
  'personnel': { title: 'Personnel', subtitle: 'Manage branch personnel' },
  'reports': { title: 'Reports', subtitle: 'Generate and export system reports' },
  'soa': { title: 'Statement of Account', subtitle: 'View member statements of account' },
  'settings': { title: 'Settings', subtitle: 'System configuration and management' },
  'notifications': { title: 'Notifications', subtitle: 'View and manage system notifications' },
  'coordinators': { title: 'Coordinators', subtitle: 'Manage coordinator records' },
  'psgc-admin': { title: 'Location Management', subtitle: 'PSGC geographic data import and management' }
};

let currentPage = 'dashboard';

const rolePages = {
  Admin: [
    'dashboard', 'member-registration', 'member-list', 'remittance',
    'branches', 'personnel',
    'coordinators', 'barangay-coordinators', 'sales-coordinators', 'reports', 'soa', 'settings', 'notifications', 'psgc-admin'
  ],
  'Branch Manager': [
    'dashboard', 'member-registration', 'member-list', 'remittance',
    'branches', 'personnel',
    'coordinators', 'barangay-coordinators', 'sales-coordinators', 'reports', 'soa', 'settings', 'notifications'
  ],
  'Branch Staff': [
    'dashboard', 'member-registration', 'member-list', 'remittance', 'reports', 'soa', 'notifications'
  ],
  Encoder: [
    'dashboard', 'member-registration', 'member-list', 'remittance', 'reports', 'soa', 'settings', 'notifications'
  ]
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const role = user.role || 'Encoder';
  const allowed = rolePages[role] || rolePages.Encoder;

  document.querySelectorAll('.nav-item, .dropdown-item, .top-bar-icon-btn[data-page]').forEach(el => {
    const page = el.dataset.page;
    el.style.display = allowed.includes(page) ? '' : 'none';
  });

  document.querySelectorAll('.nav-item.dropdown').forEach(dd => {
    const anyVisible = dd.querySelectorAll('.dropdown-item').length > 0 &&
      Array.from(dd.querySelectorAll('.dropdown-item')).some(item => item.style.display !== 'none');
    dd.style.display = anyVisible ? '' : 'none';
  });

  const initial = user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U';
  // Sidebar avatar
  const sidebarAvatar = document.getElementById('userAvatar');
  if (sidebarAvatar) {
    if (user.profilePicture) {
      sidebarAvatar.textContent = '';
      sidebarAvatar.classList.add('has-img');
      const img = document.createElement('img');
      img.src = user.profilePicture;
      sidebarAvatar.appendChild(img);
    } else {
      sidebarAvatar.textContent = initial;
    }
  }
  document.getElementById('userName').textContent = user.fullName || user.username;
  document.getElementById('userRole').textContent = role;
  // Top bar avatar
  const topBarAvatar = document.getElementById('topBarAvatar');
  if (topBarAvatar) {
    if (user.profilePicture) {
      topBarAvatar.textContent = '';
      topBarAvatar.classList.add('has-img');
      const img = document.createElement('img');
      img.src = user.profilePicture;
      topBarAvatar.appendChild(img);
    } else {
      topBarAvatar.textContent = initial;
    }
  }

  navigateTo('dashboard');
  startClock();
});

// Cross-device sync: when another app instance writes to the central DB, reload
// the currently visible page's data so every screen reflects the latest state.
let _syncReloadPending = false;
function refreshCurrentPageData() {
  const page = currentPage || 'dashboard';
  const method = {
    'dashboard': 'loadDashboardData',
    'member-list': 'loadMemberList',
    'member-registration': null,
    'remittance': 'renderRemittance',
    'notifications': 'loadNotifications',
    'reports': null,
    'soa': null,
    'coordinators': 'loadCoordinators',
    'branches': 'loadBranches',
    'personnel': 'loadPersonnel',
    'settings': null
  }[page];
  if (method && typeof window[method] === 'function') {
    try { window[method](); } catch (_) { /* ignore */ }
  }
}
document.addEventListener('DOMContentLoaded', () => {
  if (window.api && window.api.onSyncDataChanged) {
    window.api.onSyncDataChanged(() => {
      if (_syncReloadPending) return;
      _syncReloadPending = true;
      setTimeout(() => { _syncReloadPending = false; refreshCurrentPageData(); }, 500);
    });
  }
});

function startClock() {
  function tick() {
    const now = new Date();
    const dateEl = document.getElementById('topBarDate');
    const timeEl = document.getElementById('topBarTime');
    if (dateEl) {
      const opts = { month: 'short', day: 'numeric', year: 'numeric' };
      dateEl.textContent = now.toLocaleDateString('en-US', opts);
    }
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
  }
  tick();
  setInterval(tick, 30000);
}

// ===== CONFIGURABLE SYSTEM LOCK =====

let systemLockInterval = null;
let countdownInterval = null;

function injectLockBanner() {
  if (document.getElementById('lockBanner')) return;
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;
  const banner = document.createElement('div');
  banner.id = 'lockBanner';
  banner.style.display = 'none';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center;width:100%">
      <span style="font-size:18px">&#128274;</span>
      <span id="lockBannerTitle" style="font-weight:700;font-size:16px">System Lock Active</span>
      <span id="lockBannerTimer" style="font-weight:400;font-size:15px;background:rgba(255,255,255,0.15);padding:4px 14px;border-radius:20px"></span>
    </div>
    <div id="lockBannerDetails" style="font-size:13px;font-weight:400;opacity:0.9;display:flex;gap:24px;flex-wrap:wrap;justify-content:center">
      <span>Locked by: <span id="lockBannerBy">...</span></span>
      <span>Started: <span id="lockBannerStart">...</span></span>
      <span>Ends: <span id="lockBannerEnd">...</span></span>
      <span id="lockBannerReason" style="display:none">Reason: <span id="lockBannerReasonText">...</span></span>
    </div>
    <button id="lockUnlockBtn" style="display:none;background:#fff;color:#DC2626;border:none;padding:6px 20px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">Cancel Lock</button>
  `;
  mainContent.insertBefore(banner, mainContent.firstChild);
  document.getElementById('lockUnlockBtn')?.addEventListener('click', handleManualUnlock);
}

function updateCountdown() {
  const schedule = getLockSchedule();
  const timerEl = document.getElementById('lockBannerTimer');
  if (!timerEl || !schedule) return;
  const now = new Date();
  const lockEnd = new Date(schedule.LockEnd);
  const lockStart = new Date(schedule.LockStart);
  let diff, label;
  if (now < lockStart) {
    diff = lockStart - now;
    label = 'Lock starts in';
  } else if (now < lockEnd) {
    diff = lockEnd - now;
    label = 'Remaining';
  } else {
    timerEl.textContent = '';
    return;
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  timerEl.textContent = `${label}: ${days}d ${hours}h ${minutes}m ${seconds}s`;
}

async function checkSystemLockStatus() {
  try {
    const result = await window.api.checkSystemLock();
    const banner = document.getElementById('lockBanner');
    const unlockBtn = document.getElementById('lockUnlockBtn');
    if (!banner) return;

    if (result.locked && result.data) {
      setSystemLocked(true, result.schedule || result.data);
      banner.style.display = 'flex';

      const s = result.schedule || result.data;
      document.getElementById('lockBannerTitle').textContent = 'System Lock Active';
      document.getElementById('lockBannerStart').textContent = new Date(s.LockStart).toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      document.getElementById('lockBannerEnd').textContent = new Date(s.LockEnd).toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      document.getElementById('lockBannerBy').textContent = s.LockedBy || 'Administrator';

      if (s.Reason) {
        document.getElementById('lockBannerReason').style.display = 'inline';
        document.getElementById('lockBannerReasonText').textContent = s.Reason;
      } else {
        document.getElementById('lockBannerReason').style.display = 'none';
      }

      const user = getCurrentUser();
      if (unlockBtn) {
        unlockBtn.style.display = (user && user.role === 'Admin') ? 'inline-block' : 'none';
      }

      if (countdownInterval) clearInterval(countdownInterval);
      updateCountdown();
      countdownInterval = setInterval(updateCountdown, 1000);
    } else if (result.schedule && result.schedule.Status === 'Scheduled') {
      setSystemLocked(false, result.schedule);
      banner.style.display = 'flex';
      banner.style.background = '#16A34A';
      document.getElementById('lockBannerTitle').textContent = 'System Lock Scheduled';
      document.getElementById('lockBannerStart').textContent = new Date(result.schedule.LockStart).toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      document.getElementById('lockBannerEnd').textContent = new Date(result.schedule.LockEnd).toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      document.getElementById('lockBannerBy').textContent = result.schedule.LockedBy || 'Administrator';
      if (result.schedule.Reason) {
        document.getElementById('lockBannerReason').style.display = 'inline';
        document.getElementById('lockBannerReasonText').textContent = result.schedule.Reason;
      } else {
        document.getElementById('lockBannerReason').style.display = 'none';
      }
      const user = getCurrentUser();
      if (unlockBtn) {
        unlockBtn.style.display = (user && user.role === 'Admin') ? 'inline-block' : 'none';
      }
      if (countdownInterval) clearInterval(countdownInterval);
      updateCountdown();
      countdownInterval = setInterval(updateCountdown, 1000);
    } else {
      setSystemLocked(false, null);
      banner.style.display = 'none';
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }
  } catch (_) {}
}

async function handleManualUnlock() {
  const user = getCurrentUser();
  if (!user) return;
  const schedule = getLockSchedule();
  const isActive = isSystemLocked();
  showModal(isActive ? 'Unlock System' : 'Cancel Scheduled Lock',
    `<p>Are you sure you want to ${isActive ? 'unlock the system' : 'cancel this scheduled lock'}? All data-entry functions will be restored.</p>
     ${schedule ? `<p style="font-size:13px;color:var(--text-light);margin-top:8px">Schedule: ${new Date(schedule.LockStart).toLocaleString()} until ${new Date(schedule.LockEnd).toLocaleString()}</p>` : ''}`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="closeModal(); doManualUnlock()">${isActive ? 'Unlock' : 'Cancel Lock'}</button>`
  );
}

async function doManualUnlock() {
  const user = getCurrentUser();
  if (!user) return;
  const result = await window.api.cancelSystemLock(user.id);
  if (result.success) {
    showToast('System lock has been cancelled');
    await checkSystemLockStatus();
  } else {
    showToast(result.error || 'Failed to cancel lock', 'error');
  }
}

function navigateTo(page, param) {
  const user = getCurrentUser();
  if (!user) { window.location.href = 'login.html'; return; }
  const role = user.role || 'Encoder';
  const allowed = rolePages[role] || rolePages.Encoder;
  if (!allowed.includes(page)) {
    showToast('You do not have permission to access this page', 'error');
    return;
  }

  currentPage = page;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const config = pageConfig[page];
  const topBar = document.getElementById('topBar');
  if (page === 'dashboard') {
    if (topBar) topBar.style.display = 'none';
  } else {
    if (topBar) { topBar.style.display = 'flex'; }
    document.getElementById('pageTitle').textContent = config.title;
    document.getElementById('pageSubtitle').textContent = config.subtitle;
  }
  document.getElementById('contentArea').innerHTML = '<div class="loading-overlay" style="position:relative;background:transparent"><div class="spinner"></div></div>';

  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'member-registration': renderMemberRegistration(); break;
    case 'member-list': renderMemberList(); break;
    case 'remittance': renderRemittance(param); break;
    case 'barangay-coordinators': renderCoordinators('barangay'); break;
    case 'sales-coordinators': renderCoordinators('sales'); break;
    case 'branches': renderBranches(); break;
    case 'personnel': renderPersonnel(); break;
    case 'reports': renderReports(); break;
    case 'soa': renderSOA(param); break;
    case 'settings': renderSettings(); break;
    case 'notifications': renderNotifications(); break;
    case 'coordinators': renderCoordinators('barangay'); break;
    case 'psgc-admin': renderPsgcAdmin(); break;
    default: renderDashboard(); break;
  }

  refreshNotificationBadge();
  // Check lock status after each navigation
  setTimeout(checkSystemLockStatus, 300);
}

// Inject lock banner on load and start periodic lock check
document.addEventListener('DOMContentLoaded', () => {
  injectLockBanner();
  checkSystemLockStatus();
  if (systemLockInterval) clearInterval(systemLockInterval);
  systemLockInterval = setInterval(checkSystemLockStatus, 15000); // Check every 15s for auto-activation/expiration
});

// ===== AUTO-UPDATE =====

const UPDATE_SKIP_KEY = 'goldenhope.skipUpdateVersion';
window.goldenhopeAppVersion = '';

function getSkippedUpdateVersion() {
  try { return localStorage.getItem(UPDATE_SKIP_KEY) || null; } catch (_) { return null; }
}

function skipUpdateVersion(version) {
  try { localStorage.setItem(UPDATE_SKIP_KEY, version || ''); } catch (_) {}
}

function getUpdateBanner() {
  let container = document.getElementById('updateBannerContainer');
  if (!container) container = createUpdateBanner();
  return {
    container,
    msg: document.getElementById('updateMessage'),
    progress: document.getElementById('updateProgress'),
    btn: document.getElementById('updateActionBtn'),
    later: document.getElementById('updateLaterBtn')
  };
}

function hideUpdateBanner() {
  const container = document.getElementById('updateBannerContainer');
  if (container) container.classList.add('hidden');
}

function showUpdateBanner(type, message, opts) {
  opts = opts || {};
  const els = getUpdateBanner();
  els.container.classList.remove('hidden');
  els.container.className = 'update-banner-container ' + type;
  els.msg.textContent = message || '';
  if (opts.progress != null) {
    els.progress.style.display = 'block';
    els.progress.querySelector('.update-progress-fill').style.width = opts.progress + '%';
  } else {
    els.progress.style.display = 'none';
  }
  if (opts.action) {
    els.btn.style.display = 'inline-block';
    els.btn.textContent = opts.action.text;
    els.btn.onclick = opts.action.onClick || null;
  } else {
    els.btn.style.display = 'none';
    els.btn.onclick = null;
  }
  if (opts.later) {
    els.later.style.display = 'inline-block';
    els.later.textContent = opts.later.text;
    els.later.onclick = opts.later.onClick || null;
  } else {
    els.later.style.display = 'none';
    els.later.onclick = null;
  }
}

function applyUpdateEvent(event, data, autoDownload) {
  const fmt = (v) => (v ? ` v${v}` : '');
  switch (event) {
    case 'checking':
      showUpdateBanner('info', 'Checking for updates...');
      break;
    case 'status':
      // Background state sync pushed from main (e.g. after page navigation) so
      // the banner never goes stale. Map the persisted state through the shared
      // handlers below.
      if (data && data.status && data.status !== 'idle' && data.status !== 'not-available') {
        applyUpdateEvent(data.status, data, autoDownload);
      } else {
        hideUpdateBanner();
      }
      break;
    case 'available': {
      const ver = data && data.version;
      if (ver && ver === getSkippedUpdateVersion()) { hideUpdateBanner(); return; }
      const skip = { text: 'Not now', onClick: () => { if (ver) skipUpdateVersion(ver); hideUpdateBanner(); } };
      if (autoDownload) {
        showUpdateBanner('info', `A new version${fmt(ver)} is available. Downloading...`, { progress: 0, later: skip });
      } else {
        showUpdateBanner('info', `A new version${fmt(ver)} is available.`, {
          action: { text: 'Download update', onClick: () => window.api.startUpdateDownload() },
          later: skip
        });
      }
      break;
    }
    case 'downloading': {
      const pct = data && data.percent != null ? Math.round(data.percent) : 0;
      showUpdateBanner('info', `Downloading update... ${pct}%`, { progress: pct });
      break;
    }
    case 'downloaded': {
      const ver = data && data.version;
      showUpdateBanner('success', `Update${fmt(ver)} downloaded. Restart to install.`, {
        action: { text: 'Restart & Install', onClick: () => window.api.installUpdate() },
        later: { text: 'Later', onClick: hideUpdateBanner }
      });
      break;
    }
    case 'error':
      showUpdateBanner('error', `Update failed: ${data || 'Unknown error'}`, {
        action: { text: 'Dismiss', onClick: hideUpdateBanner }
      });
      setTimeout(hideUpdateBanner, 10000);
      break;
    default:
      hideUpdateBanner();
  }
}

async function initAutoUpdater() {
  let autoDownload = true;
  try {
    const version = await window.api.getAppVersion();
    window.goldenhopeAppVersion = version;
    document.querySelector('title').textContent = `GoldenHope v${version}`;
  } catch (_) {}

  try {
    const setting = await window.api.getSetting('auto_download_updates');
    if (setting && setting.success && setting.data != null) autoDownload = String(setting.data) === 'true';
    const setRes = await window.api.setAutoDownload(autoDownload);
    if (setRes && setRes.success) autoDownload = setRes.data.autoDownload;
  } catch (_) {}

  window.api.onUpdateEvent((event, data) => {
    applyUpdateEvent(event, data, autoDownload);
  });

  // Reconcile with whatever happened before this page subscribed.
  try {
    const st = await window.api.getUpdateStatus();
    if (st && st.success && st.data) {
      const d = st.data;
      if (d.autoDownload != null) autoDownload = d.autoDownload;
      applyUpdateEvent('status', d, autoDownload);
    }
  } catch (_) {}
}

function createUpdateBanner() {
  const container = document.createElement('div');
  container.id = 'updateBannerContainer';
  container.className = 'update-banner-container hidden';
  container.innerHTML = `
    <div class="update-banner">
      <div class="update-banner-icon" id="updateIcon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </div>
      <span class="update-message" id="updateMessage">Checking for updates...</span>
      <div class="update-progress" id="updateProgress" style="display:none">
        <div class="update-progress-fill" style="width:0%"></div>
      </div>
      <button class="update-action-btn" id="updateActionBtn" style="display:none"></button>
      <button class="update-banner-later" id="updateLaterBtn" style="display:none"></button>
    </div>
  `;
  document.body.appendChild(container);
  return container;
}

// Init auto-updater after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initAutoUpdater, 1000);
});

function handleLogout() {
  showModal('Confirm Logout', '<p>Are you sure you want to logout?</p>',
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); doLogout()">Logout</button>`
  );
}

async function doLogout() {
  const user = getCurrentUser();
  if (user) {
    const userAgent = navigator.userAgent || '';
    await window.api.logActivity(user.id, 'Logout', `User ${user.username} logged out`, '', userAgent, 'Success').catch(err => console.error('Log activity failed:', err));
  }
  sessionStorage.removeItem('currentUser');
  try { await window.api.logout(); } catch (_) {}
  window.location.href = 'login.html';
}

// ===== DROPDOWN FUNCTIONS =====
function toggleDropdown(name) {
  const dropdown = document.querySelector(`.nav-item.dropdown[data-page="${name}"]`);
  const menu = document.getElementById(`${name}Dropdown`);
  if (dropdown && menu) {
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
    menu.classList.toggle('open', !isOpen);
    menu.classList.toggle('hidden', isOpen);
  }
}

function closeDropdown(name) {
  const dropdown = document.querySelector(`.nav-item.dropdown[data-page="${name}"]`);
  const menu = document.getElementById(`${name}Dropdown`);
  if (dropdown && menu) {
    dropdown.classList.remove('open');
    menu.classList.remove('open');
    menu.classList.add('hidden');
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-item.dropdown')) {
    document.querySelectorAll('.nav-item.dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      m.classList.remove('open');
      m.classList.add('hidden');
    });
  }
});
