// ===== PROFESSIONAL SETTINGS PAGE =====
// Settings > Users enhanced with enterprise-grade user management.
// Scope is limited to the Settings > Users tab only.

// Users module state
let allUsers = [];
let filteredUsers = [];
let currentUsersPage = 1;
let usersRowsPerPage = 10;
let userSearchTimeout = null;

// Activity Logs state
let logsPage = 1;
let logsPageSize = 20;
let logsTotal = 0;

// Backup & Restore state
let restoreFilePath = null;

async function renderSettings() {
  const area = document.getElementById('contentArea');
  const user = getCurrentUser();
  const isAdmin = ['Admin', 'Branch Manager'].includes(user?.role);
  const isSuperAdmin = user?.role === 'Admin';

  area.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="tabs">
          <div class="tab active" data-tab="general" onclick="switchSettingsTab('general')">General</div>
          <div class="tab" data-tab="security" onclick="switchSettingsTab('security')">Security</div>
          ${isAdmin ? '<div class="tab" data-tab="users" onclick="switchSettingsTab(\'users\')">Users</div>' : ''}
          ${isSuperAdmin ? '<div class="tab" data-tab="logs" onclick="switchSettingsTab(\'logs\')">Activity Logs</div>' : ''}
          <div class="tab" data-tab="backup" onclick="switchSettingsTab(\'backup\')">Backup &amp; Restore</div>
        </div>

        <div class="tab-content active" id="tab-general">
          <div class="form-grid">
            <div class="form-group"><label>Organization Name</label><input type="text" id="sOrgName" value="GoldenHope"></div>
            <div class="form-group"><label>Address</label><input type="text" id="sAddress"></div>
            <div class="form-group"><label>Contact Number</label><input type="text" id="sContact"></div>
            <div class="form-group"><label>Email</label><input type="email" id="sEmail"></div>
          </div>
          <div class="mt-4"><button class="btn btn-primary" onclick="saveGeneralSettings()">Save Settings</button></div>

          <div class="card mt-4" style="padding:20px;border:1px solid var(--border)">
            <h4 style="margin:0 0 4px;font-size:15px;font-weight:700">Application Updates</h4>
            <p style="margin:0 0 14px;font-size:13px;color:var(--text-light)">Keep this app up to date through GitHub Releases.</p>
            <div class="form-grid">
              <div class="form-group"><label>Current Version</label><input type="text" id="sAppVersion" disabled></div>
              <div class="form-group"><label>Latest Version</label><input type="text" id="sLatestVersion" disabled></div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:var(--text-secondary);margin:6px 0 14px">
              <input type="checkbox" id="sAutoDownload" onchange="onAutoDownloadToggle()">
              Automatically download updates when available
            </label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="manualCheckForUpdates()">Check for Updates</button>
              <span id="sUpdateStatus" style="font-size:13px;color:var(--text-light)"></span>
            </div>
          </div>
        </div>

        <div class="tab-content" id="tab-security">
          <div class="form-grid">
            <div class="form-group"><label>Current Password</label><input type="password" id="sCurPass"></div>
            <div class="form-group"><label>New Password</label><input type="password" id="sNewPass"></div>
            <div class="form-group"><label>Confirm New Password</label><input type="password" id="sConfirmPass"></div>
          </div>
          <div class="mt-4"><button class="btn btn-primary" onclick="changeMyPassword()">Change Password</button></div>
        </div>

        ${isAdmin ? `<div class="tab-content" id="tab-users">
          <div class="users-toolbar">
            <div class="users-toolbar-left">
              <div class="users-search-box">
                <svg class="users-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="userSearchInput" placeholder="Search username, name or email..." autocomplete="off" oninput="onUserSearchInput()">
                <button class="users-search-clear" id="userSearchClear" onclick="clearUserSearch()" title="Clear search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <select id="userRoleFilter" onchange="applyUserFilters()">
                <option value="">All Roles</option>
                <option value="Admin">Admin</option>
                <option value="Branch Manager">Branch Manager</option>
                <option value="Branch Staff">Branch Staff</option>
              </select>
              <select id="userStatusFilter" onchange="applyUserFilters()">
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Locked">Locked</option>
              </select>
              <select id="userSortBy" onchange="applyUserFilters()">
                <option value="username">Sort: Username</option>
                <option value="lastlogin">Sort: Last Login</option>
              </select>
            </div>
            <div class="users-toolbar-right">
              <span class="users-total" id="usersTotalCount">0 users</span>
              ${isSuperAdmin ? '<button class="btn btn-primary btn-sm" onclick="openUserDrawer()">+ New User</button>' : ''}
            </div>
          </div>

          <div class="table-container">
            <table class="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody id="settingsUsersBody"></tbody>
            </table>
            <div id="usersEmptyState" class="empty-state hidden">
              <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <h4>No users found</h4>
              <p>Try adjusting your search or filters.</p>
            </div>
            <div id="usersSkeleton" class="skeleton-table hidden"></div>
          </div>

          <div class="users-pagination">
            <div class="rows-per-page">
              <span>Rows per page</span>
              <select id="usersRowsPerPage" onchange="onRowsPerPageChange()">
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div class="pager">
              <button class="btn btn-secondary btn-sm" id="usersPrevBtn" onclick="changeUsersPage(-1)">Prev</button>
              <span id="usersPageInfo">Page 1 of 1</span>
              <button class="btn btn-secondary btn-sm" id="usersNextBtn" onclick="changeUsersPage(1)">Next</button>
            </div>
          </div>
        </div>` : ''}

        <div class="tab-content" id="tab-logs">
          <div class="logs-toolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center">
            <input type="text" id="logSearch" placeholder="Search by user..." style="flex:1;min-width:160px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" oninput="onLogFilterChange()">
            <select id="logActionFilter" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" onchange="onLogFilterChange()">
              <option value="">All Activities</option>
              <option value="Login">Login</option>
              <option value="Logout">Logout</option>
              <option value="Login Failed">Login Failed</option>
            </select>
            <input type="date" id="logDateFrom" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" onchange="onLogFilterChange()">
            <input type="date" id="logDateTo" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)" onchange="onLogFilterChange()">
          </div>
          <div class="table-container"><table><thead><tr>
            <th>User Name</th><th>User Role</th><th>Activity</th><th>Status</th><th>Date</th><th>Time</th>
          </tr></thead><tbody id="activityLogsBody"></tbody></table></div>
          <div class="logs-pagination" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
            <span id="logsPageInfo" style="font-size:13px;color:var(--text-light)">Page 1 of 1</span>
            <div>
              <button class="btn btn-secondary btn-sm" id="logsPrevBtn" onclick="changeLogsPage(-1)">Prev</button>
              <button class="btn btn-secondary btn-sm" id="logsNextBtn" onclick="changeLogsPage(1)">Next</button>
            </div>
          </div>
        </div>

        <div class="tab-content" id="tab-backup">
          <div class="form-grid">
            <div class="card" style="padding:20px;text-align:center;border:2px dashed var(--border)">
              <p style="font-size:14px;margin-bottom:12px;color:var(--text-secondary)">Create a backup of the entire database</p>
              <button class="btn btn-primary" onclick="backupDatabase()">&#128190; Create Backup</button>
            </div>
            <div class="card" style="padding:20px;text-align:center;border:2px dashed var(--border)">
              <p style="font-size:14px;margin-bottom:12px;color:var(--text-secondary)">Restore database from a backup file</p>
              <button class="btn btn-danger" onclick="restoreDatabase()">&#128190; Restore Backup</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  loadGeneralSettings();
  loadUpdateSection();
  if (isAdmin) loadUsers();
  if (isSuperAdmin) loadActivityLogs();
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));
}

async function loadGeneralSettings() {
  const keys = ['org_name', 'org_address', 'org_contact', 'org_email'];
  const results = await Promise.all(keys.map(k => window.api.getSetting(k)));
  const map = { org_name: 'sOrgName', org_address: 'sAddress', org_contact: 'sContact', org_email: 'sEmail' };
  keys.forEach((k, i) => {
    if (results[i].success && results[i].data) {
      document.getElementById(map[k]).value = results[i].data;
    }
  });
}

async function saveGeneralSettings() {
  const settings = {
    org_name: document.getElementById('sOrgName').value,
    org_address: document.getElementById('sAddress').value,
    org_contact: document.getElementById('sContact').value,
    org_email: document.getElementById('sEmail').value
  };
  showLoading();
  for (const [key, value] of Object.entries(settings)) {
    await window.api.setSetting(key, value);
  }
  hideLoading();
  showToast('Settings saved');
}

// ===== APPLICATION UPDATES =====

function updateStatusLabel(status) {
  const map = {
    idle: 'Idle',
    checking: 'Checking for updates...',
    available: 'Update available',
    downloading: 'Downloading update...',
    downloaded: 'Update ready to install',
    'not-available': 'You have the latest version',
    error: 'Update check failed'
  };
  return map[status] || status || '';
}

async function refreshUpdateStatus() {
  const versionInput = document.getElementById('sAppVersion');
  const latestInput = document.getElementById('sLatestVersion');
  const statusEl = document.getElementById('sUpdateStatus');
  try {
    const st = await window.api.getUpdateStatus();
    if (!st || !st.success || !st.data) return;
    const d = st.data;
    if (versionInput) versionInput.value = d.appVersion || '';
    if (latestInput) latestInput.value = d.availableVersion ? 'v' + d.availableVersion : '\u2014';
    if (statusEl) {
      statusEl.textContent = d.configured
        ? updateStatusLabel(d.status)
        : 'Auto-updates are not configured.';
    }
  } catch (_) {}
}

async function loadUpdateSection() {
  const checkbox = document.getElementById('sAutoDownload');
  try {
    await refreshUpdateStatus();
  } catch (_) {}
  window.api.onUpdateEvent(() => {
    refreshUpdateStatus();
  });
}

async function onAutoDownloadToggle() {
  const checkbox = document.getElementById('sAutoDownload');
  const enabled = !!(checkbox && checkbox.checked);
  try {
    const res = await window.api.setAutoDownload(enabled);
    await window.api.setSetting('auto_download_updates', String(enabled));
    if (res && res.success && checkbox) checkbox.checked = !!res.data.autoDownload;
    showToast(enabled ? 'Updates will download automatically' : 'Updates will wait for your approval');
  } catch (_) {
    if (checkbox) checkbox.checked = !enabled;
    showToast('Failed to update the download preference', 'error');
  }
}

async function manualCheckForUpdates() {
  const statusEl = document.getElementById('sUpdateStatus');
  if (statusEl) statusEl.textContent = 'Checking for updates...';
  const result = await window.api.checkForUpdates();
  if (result && !result.success) {
    if (statusEl) statusEl.textContent = result.error || 'Update check failed';
    showToast(result.error || 'Failed to check for updates', 'error');
    return;
  }
  setTimeout(refreshUpdateStatus, 3000);
}

async function changeMyPassword() {
  const user = getCurrentUser();
  const cur = document.getElementById('sCurPass').value;
  const newp = document.getElementById('sNewPass').value;
  const confirm = document.getElementById('sConfirmPass').value;
  if (!cur || !newp || !confirm) { showToast('Fill in all password fields', 'error'); return; }
  if (newp !== confirm) { showToast('Passwords do not match', 'error'); return; }
  if (newp.length < 8 || !/[A-Z]/.test(newp) || !/[a-z]/.test(newp) || !/[0-9]/.test(newp)) {
    showToast('Password must be at least 8 characters and include uppercase, lowercase, and a number', 'error'); return;
  }
  showLoading();
  const result = await window.api.changePassword(user.id, cur, newp);
  hideLoading();
  if (result.success) {
    showToast('Password changed successfully');
    document.getElementById('sCurPass').value = '';
    document.getElementById('sNewPass').value = '';
    document.getElementById('sConfirmPass').value = '';
  } else {
    showToast(result.error, 'error');
  }
}

// ===== USERS MANAGEMENT =====

function getUserStatus(u) {
  if (u.IsLocked) return 'Locked';
  return u.IsActive ? 'Active' : 'Inactive';
}

async function loadUsers() {
  const tbody = document.getElementById('settingsUsersBody');
  const skeleton = document.getElementById('usersSkeleton');
  const empty = document.getElementById('usersEmptyState');
  if (skeleton) skeleton.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');
  if (tbody) tbody.innerHTML = '';

  const result = await window.api.getUsers();
  if (skeleton) skeleton.classList.add('hidden');

  if (!result.success) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error loading users</td></tr>';
    return;
  }
  allUsers = result.data || [];
  currentUsersPage = 1;
  applyUserFilters();
}

function onUserSearchInput() {
  const val = document.getElementById('userSearchInput')?.value || '';
  document.getElementById('userSearchClear').style.display = val ? 'inline-flex' : 'none';
  if (userSearchTimeout) clearTimeout(userSearchTimeout);
  userSearchTimeout = setTimeout(() => { currentUsersPage = 1; applyUserFilters(); }, 250);
}

function clearUserSearch() {
  document.getElementById('userSearchInput').value = '';
  document.getElementById('userSearchClear').style.display = 'none';
  currentUsersPage = 1;
  applyUserFilters();
}

function applyUserFilters() {
  const search = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('userRoleFilter')?.value || '';
  const statusFilter = document.getElementById('userStatusFilter')?.value || '';
  const sortBy = document.getElementById('userSortBy')?.value || 'username';

  filteredUsers = allUsers.filter(u => {
    const matchesSearch = !search ||
      (u.Username || '').toLowerCase().includes(search) ||
      (u.FullName || '').toLowerCase().includes(search) ||
      (u.Email || '').toLowerCase().includes(search);
    const matchesRole = !roleFilter || u.Role === roleFilter;
    const matchesStatus = !statusFilter || getUserStatus(u) === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  filteredUsers.sort((a, b) => {
    if (sortBy === 'lastlogin') {
      const da = a.LastLogin ? new Date(a.LastLogin).getTime() : 0;
      const db = b.LastLogin ? new Date(b.LastLogin).getTime() : 0;
      return db - da;
    }
    return (a.Username || '').localeCompare(b.Username || '');
  });

  const totalEl = document.getElementById('usersTotalCount');
  if (totalEl) totalEl.textContent = `${filteredUsers.length} user${filteredUsers.length === 1 ? '' : 's'}`;

  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById('settingsUsersBody');
  const empty = document.getElementById('usersEmptyState');
  if (!tbody) return;

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / usersRowsPerPage));
  if (currentUsersPage > totalPages) currentUsersPage = totalPages;
  if (currentUsersPage < 1) currentUsersPage = 1;

  const start = (currentUsersPage - 1) * usersRowsPerPage;
  const pageUsers = filteredUsers.slice(start, start + usersRowsPerPage);

  if (filteredUsers.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
  } else {
    if (empty) empty.classList.add('hidden');
    tbody.innerHTML = pageUsers.map(u => renderUserRow(u)).join('');
  }

  const pageInfo = document.getElementById('usersPageInfo');
  if (pageInfo) pageInfo.textContent = `Page ${currentUsersPage} of ${totalPages}`;
  const prev = document.getElementById('usersPrevBtn');
  const next = document.getElementById('usersNextBtn');
  if (prev) prev.disabled = currentUsersPage <= 1;
  if (next) next.disabled = currentUsersPage >= totalPages;
}

function renderUserRow(u) {
  const status = getUserStatus(u);
  const me = getCurrentUser();
  const canManage = me.role === 'Admin';
  const isSelf = me.id === u.Id;
  const targetIsAdmin = u.Role === 'Admin';
  // Branch Managers cannot modify Admin accounts
  const blockedByRole = me.role === 'Branch Manager' && targetIsAdmin && !isSelf;

  const editDisabled = blockedByRole ? 'disabled title="Cannot modify Admin accounts"' : '';
  const deleteDisabled = !canManage || isSelf || targetIsAdmin ? 'disabled title="Admin only"' : '';
  const activateLabel = status === 'Active' ? 'Deactivate' : (status === 'Locked' ? 'Unlock' : 'Activate');
  const activateAction = status === 'Active' ? 'deactivate' : (status === 'Locked' ? 'unlock' : 'activate');

  const avatar = u.ProfilePicture
    ? `<img src="${escapeHtml(u.ProfilePicture)}" alt="" class="avatar-img">`
    : `<span class="avatar-initials">${(u.FullName || u.Username || '?').charAt(0).toUpperCase()}</span>`;

  return `<tr>
    <td>
      <div class="user-cell">
        <div class="avatar">${avatar}</div>
        <div>
          <div class="user-name">${escapeHtml(u.FullName || u.Username || '')}</div>
          <div class="user-sub">@${escapeHtml(u.Username || '')}</div>
        </div>
      </div>
    </td>
    <td>${roleBadge(u.Role)}</td>
    <td>${statusBadge(status)}</td>
    <td>${u.LastLogin ? formatDateTime(u.LastLogin) : 'Never'}</td>
    <td class="text-right">
      <div class="row-actions">
        <button class="btn btn-primary btn-sm" onclick="openUserDrawer(${u.Id})" ${editDisabled}>Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="confirmUserAction(${u.Id}, '${activateAction}')" ${editDisabled}>${activateLabel}</button>
        <button class="btn btn-outline btn-sm" onclick="resetUserPassword(${u.Id})" ${editDisabled}>Reset Password</button>
        <button class="btn btn-danger btn-sm" onclick="confirmUserAction(${u.Id}, 'delete')" ${deleteDisabled}>Delete</button>
      </div>
    </td>
  </tr>`;
}

function onRowsPerPageChange() {
  usersRowsPerPage = parseInt(document.getElementById('usersRowsPerPage')?.value || '10', 10);
  currentUsersPage = 1;
  renderUsersTable();
}

function changeUsersPage(dir) {
  currentUsersPage += dir;
  renderUsersTable();
}

// ===== USER DRAWER (Edit / New) =====

// Drawer & avatar state
let userDrawerCurrentId = null;
let userDrawerPhotoBase64 = null;
let userDrawerIsNew = false;
let userDrawerZoom = 1;
let userDrawerRotate = 0;
let userDrawerEscHandler = null;

function openUserDrawer(id) {
  const me = getCurrentUser();
  userDrawerIsNew = id == null;
  userDrawerCurrentId = id;
  userDrawerPhotoBase64 = null;
  userDrawerZoom = 1;
  userDrawerRotate = 0;

  let data = null;
  if (!userDrawerIsNew) {
    data = allUsers.find(u => u.Id === id);
    if (!data) { showToast('User not found', 'error'); return; }
    if (me.role === 'Branch Manager' && data.Role === 'Admin' && me.id !== data.Id) {
      showToast('You cannot modify Admin accounts', 'error');
      return;
    }
    userDrawerPhotoBase64 = data.ProfilePicture || null;
  }

  const isEdit = !userDrawerIsNew;
  const readOnlyUser = isEdit ? 'readonly' : '';
  const initial = data ? (data.FullName || data.Username || '?').charAt(0).toUpperCase() : '?';
  const showPasswordFields = isEdit ? `<div class="form-group">
      <label>New Password <small style="color:var(--text-light);font-weight:400">(leave blank to keep current)</small></label>
      <input type="password" id="uPassword" oninput="updatePasswordStrength()">
      <div class="password-strength"><div class="password-strength-bar" id="pwBar"></div></div>
      <small class="field-hint" id="pwHint"></small>
    </div>
    <div class="form-group">
      <label>Confirm New Password</label>
      <input type="password" id="uConfirmPassword">
    </div>` : `
    <div class="form-group">
      <label>Password <span class="req">*</span></label>
      <input type="password" id="uPassword" oninput="updatePasswordStrength()">
      <div class="password-strength"><div class="password-strength-bar" id="pwBar"></div></div>
      <small class="field-hint" id="pwHint"></small>
    </div>
    <div class="form-group">
      <label>Confirm Password <span class="req">*</span></label>
      <input type="password" id="uConfirmPassword">
    </div>`;

  const hasPhoto = !!userDrawerPhotoBase64;
  const photoStyle = hasPhoto ? '' : ' style="display:none"';
  const initialsStyle = hasPhoto ? ' style="display:none"' : '';

  const overlay = document.createElement('div');
  overlay.className = 'user-drawer-overlay';
  overlay.id = 'userDrawerOverlay';
  overlay.innerHTML = `
    <div class="user-drawer">
      <div class="user-drawer-header">
        <h3>${isEdit ? 'Edit User' : 'New User'}</h3>
        <button class="user-drawer-close" onclick="closeUserDrawer()">&times;</button>
      </div>
      <div class="user-drawer-body">
        <!-- Avatar Upload Section -->
        <div class="avatar-upload-section" id="userAvatarUploadSection">
          <div class="avatar-upload-preview" id="userAvatarPreview" onclick="document.getElementById('userPhotoInput').click()" title="Click to upload photo">
            <div class="avatar-initials-large" id="userAvatarInitials"${initialsStyle}>${initial}</div>
            <img id="userAvatarImg" src="${escapeHtml(userDrawerPhotoBase64 || '')}" alt="Avatar"${photoStyle}>
            <div class="avatar-camera-overlay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <input type="file" id="userPhotoInput" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="previewUserPhoto(event)">
          <div class="avatar-upload-progress" id="userPhotoProgress"><div class="avatar-upload-progress-bar" id="userPhotoProgressBar"></div></div>

          <div class="avatar-editor" id="userAvatarEditor">
            <div class="avatar-editor-preview-wrap">
              <div class="avatar-editor-preview" id="userAvatarEditorPreview">
                <img id="userAvatarEditorImg" src="" alt="Preview">
              </div>
            </div>
            <div class="avatar-editor-controls">
              <div class="avatar-editor-row">
                <label>Zoom</label>
                <input type="range" id="userAvatarZoom" min="0.5" max="3" step="0.05" value="1" oninput="onAvatarZoomChange()">
                <span class="zoom-value" id="userAvatarZoomValue">1.0x</span>
              </div>
              <div class="avatar-editor-row">
                <label>Rotate</label>
                <button class="btn btn-outline btn-sm" onclick="rotateAvatar(-90)">&larr; Left</button>
                <button class="btn btn-outline btn-sm" onclick="rotateAvatar(90)">Right &rarr;</button>
                <button class="btn btn-outline btn-sm" onclick="resetAvatarTransform()">Reset</button>
              </div>
            </div>
            <div class="avatar-editor-actions">
              <button class="btn btn-primary btn-sm" onclick="applyAvatarEdit()">Apply Photo</button>
              <button class="btn btn-outline btn-sm" onclick="cancelAvatarEdit()">Cancel</button>
            </div>
          </div>

          <div class="avatar-upload-hint">
            <strong>Click the avatar</strong> or drag &amp; drop an image here.<br>
            Supported: JPG, PNG, WEBP &middot; Max 2MB
          </div>

          <div style="display:flex;gap:8px">
            <label class="btn btn-outline btn-sm" for="userPhotoInput" style="cursor:pointer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              ${isEdit ? 'Change Photo' : 'Upload Photo'}
            </label>
            <button class="btn btn-outline btn-sm" id="userPhotoRemoveBtn" onclick="removeUserPhoto()"${photoStyle}>Remove</button>
          </div>
        </div>

        <!-- Form Fields -->
        <div class="form-grid">
          <div class="form-group">
            <label>Username <span class="req">*</span></label>
            <input type="text" id="uUsername" value="${escapeHtml(data?.Username || '')}" ${readOnlyUser}>
          </div>
          <div class="form-group">
            <label>Full Name <span class="req">*</span></label>
            <input type="text" id="uFullName" value="${escapeHtml(data?.FullName || '')}">
          </div>
          <div class="form-group">
            <label>Email Address <span class="req">*</span></label>
            <input type="email" id="uEmail" value="${escapeHtml(data?.Email || '')}">
          </div>
          <div class="form-group">
            <label>Mobile Number</label>
            <input type="text" id="uMobile" value="${escapeHtml(data?.Mobile || '')}">
          </div>
          <div class="form-group">
            <label>Role <span class="req">*</span></label>
            <select id="uRole">
              <option value="Admin" ${data?.Role === 'Admin' ? 'selected' : ''}>Admin</option>
              <option value="Encoder" ${data?.Role === 'Encoder' ? 'selected' : ''}>Encoder</option>
              <option value="Branch Manager" ${data?.Role === 'Branch Manager' ? 'selected' : ''}>Branch Manager</option>
              <option value="Branch Staff" ${data?.Role === 'Branch Staff' ? 'selected' : ''}>Branch Staff</option>
            </select>
          </div>
          <div class="form-group">
            <label>Branch Assignment</label>
            <select id="uBranch"><option value="">Unassigned</option></select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="uStatus">
              <option value="Active" ${(data && data.IsActive && !data.IsLocked) ? 'selected' : ''}>Active</option>
              <option value="Inactive" ${(data && !data.IsActive && !data.IsLocked) ? 'selected' : ''}>Inactive</option>
              <option value="Locked" ${(data && data.IsLocked) ? 'selected' : ''}>Locked</option>
            </select>
          </div>
          ${showPasswordFields}
        </div>
      </div>
      <div class="user-drawer-footer">
        <button class="btn btn-secondary" onclick="closeUserDrawer()">Cancel</button>
        <button class="btn btn-primary" id="saveUserBtn" onclick="saveUserForm()">${isEdit ? 'Update' : 'Create User'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  // Load branches dynamically
  window.api.getActiveBranches().then(result => {
    const branchSelect = document.getElementById('uBranch');
    if (!branchSelect) return;
    if (result.success) {
      const currentVal = data?.Branch || '';
      branchSelect.innerHTML = '<option value="">Unassigned</option>' +
        result.data.map(b => `<option value="${escapeHtml(b.Name)}" ${currentVal === b.Name ? 'selected' : ''}>${escapeHtml(b.Name)}</option>`).join('');
    }
  });

  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === this) closeUserDrawer();
  });

  // Close on Escape
  userDrawerEscHandler = (e) => {
    if (e.key === 'Escape') closeUserDrawer();
  };
  document.addEventListener('keydown', userDrawerEscHandler);

  // Init form validation
  setupUserFormValidation();
  initUserPhotoDragDrop();
}

function closeUserDrawer() {
  const overlay = document.getElementById('userDrawerOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }
  if (userDrawerEscHandler) {
    document.removeEventListener('keydown', userDrawerEscHandler);
    userDrawerEscHandler = null;
  }
  userDrawerPhotoBase64 = null;
  userDrawerCurrentId = null;
}

function setupUserFormValidation() {
  const check = () => {
    const saveBtn = document.getElementById('saveUserBtn');
    if (!saveBtn) return;
    const username = document.getElementById('uUsername')?.value.trim();
    const fullName = document.getElementById('uFullName')?.value.trim();
    const email = document.getElementById('uEmail')?.value.trim();
    const password = document.getElementById('uPassword')?.value;
    const confirmPw = document.getElementById('uConfirmPassword')?.value;
    let valid = !!username && !!fullName && !!email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (userDrawerIsNew) {
      valid = valid && !!password && password.length >= 8 && password === confirmPw;
    }
    saveBtn.disabled = !valid;
  };
  ['uUsername', 'uFullName', 'uEmail', 'uPassword', 'uConfirmPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', check);
  });
  document.getElementById('uRole')?.addEventListener('change', check);
  check();
}

// ===== AVATAR UPLOAD & EDITOR =====

function initUserPhotoDragDrop() {
  const section = document.getElementById('userAvatarUploadSection');
  if (!section) return;
  section.addEventListener('dragover', (e) => {
    e.preventDefault();
    section.classList.add('dragover');
  });
  section.addEventListener('dragleave', () => section.classList.remove('dragover'));
  section.addEventListener('drop', (e) => {
    e.preventDefault();
    section.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processUserPhotoFile(file);
  });
}

function previewUserPhoto(event) {
  const file = event.target.files[0];
  if (file) processUserPhotoFile(file);
  event.target.value = '';
}

function processUserPhotoFile(file) {
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be under 2MB', 'error');
    return;
  }
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showToast('Supported formats: JPG, PNG, WEBP', 'error');
    return;
  }

  // Show upload progress
  const progress = document.getElementById('userPhotoProgress');
  const bar = document.getElementById('userPhotoProgressBar');
  if (progress) progress.classList.add('show');

  let progressVal = 0;
  const progressInterval = setInterval(() => {
    progressVal = Math.min(progressVal + 15, 90);
    if (bar) bar.style.width = progressVal + '%';
  }, 80);

  const reader = new FileReader();
  reader.onload = function(e) {
    clearInterval(progressInterval);
    if (bar) bar.style.width = '100%';
    setTimeout(() => {
      if (progress) progress.classList.remove('show');
      if (bar) bar.style.width = '0%';
    }, 400);

    // Store the raw photo and show editor
    userDrawerPhotoBase64 = e.target.result;
    userDrawerZoom = 1;
    userDrawerRotate = 0;
    showAvatarEditor(e.target.result);
  };
  reader.readAsDataURL(file);
}

function showAvatarEditor(src) {
  const img = document.getElementById('userAvatarEditorImg');
  const editor = document.getElementById('userAvatarEditor');
  if (img) img.src = src;
  if (editor) editor.classList.add('show');
  updateAvatarPreviewTransform();
}

function onAvatarZoomChange() {
  const slider = document.getElementById('userAvatarZoom');
  const valDisplay = document.getElementById('userAvatarZoomValue');
  if (slider && valDisplay) {
    userDrawerZoom = parseFloat(slider.value);
    valDisplay.textContent = userDrawerZoom.toFixed(1) + 'x';
    updateAvatarPreviewTransform();
  }
}

function rotateAvatar(degrees) {
  userDrawerRotate = (userDrawerRotate + degrees) % 360;
  updateAvatarPreviewTransform();
}

function resetAvatarTransform() {
  userDrawerZoom = 1;
  userDrawerRotate = 0;
  const slider = document.getElementById('userAvatarZoom');
  const valDisplay = document.getElementById('userAvatarZoomValue');
  if (slider) slider.value = '1';
  if (valDisplay) valDisplay.textContent = '1.0x';
  updateAvatarPreviewTransform();
}

function updateAvatarPreviewTransform() {
  const preview = document.getElementById('userAvatarEditorPreview');
  if (preview) {
    preview.style.setProperty('--zoom', userDrawerZoom);
    preview.style.setProperty('--rotate', userDrawerRotate + 'deg');
  }
}

function applyAvatarEdit() {
  const editorImg = document.getElementById('userAvatarEditorImg');
  if (!editorImg || !editorImg.src) return;

  // Use the raw image data directly (CSS handles circular crop + object-fit)
  // The zoom/rotate controls were just for preview in the editor.
  // The actual image is stored as-is; circular crop is CSS-only on sidebar/navbar/table.
  const previewImg = document.getElementById('userAvatarImg');
  const initials = document.getElementById('userAvatarInitials');
  if (previewImg) { previewImg.src = editorImg.src; previewImg.style.display = 'block'; }
  if (initials) initials.style.display = 'none';

  // Hide editor
  const editor = document.getElementById('userAvatarEditor');
  if (editor) editor.classList.remove('show');

  // Show remove button
  const removeBtn = document.getElementById('userPhotoRemoveBtn');
  if (removeBtn) removeBtn.style.display = 'inline-flex';

  showToast('Photo applied', 'success');

  // Enable save
  const saveBtn = document.getElementById('saveUserBtn');
  if (saveBtn) saveBtn.disabled = false;
}

function cancelAvatarEdit() {
  const editor = document.getElementById('userAvatarEditor');
  if (editor) editor.classList.remove('show');
  userDrawerPhotoBase64 = null;
  // If there was a previous photo, keep showing it
  const previewImg = document.getElementById('userAvatarImg');
  if (previewImg && !previewImg.src) {
    previewImg.style.display = 'none';
    const initials = document.getElementById('userAvatarInitials');
    if (initials) initials.style.display = 'flex';
  }
}

function removeUserPhoto() {
  userDrawerPhotoBase64 = null;
  const previewImg = document.getElementById('userAvatarImg');
  const initials = document.getElementById('userAvatarInitials');
  if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
  if (initials) initials.style.display = 'flex';
  const removeBtn = document.getElementById('userPhotoRemoveBtn');
  if (removeBtn) removeBtn.style.display = 'none';
}

// ===== GLOBAL AVATAR SYNC =====

function updateGlobalAvatar(pictureSrc, fallbackText) {
  // Sidebar avatar
  const sidebarAvatar = document.getElementById('userAvatar');
  if (sidebarAvatar) {
    if (pictureSrc) {
      sidebarAvatar.textContent = '';
      sidebarAvatar.classList.add('has-img');
      let img = sidebarAvatar.querySelector('img');
      if (!img) { img = document.createElement('img'); sidebarAvatar.appendChild(img); }
      img.src = pictureSrc;
    } else {
      sidebarAvatar.classList.remove('has-img');
      const img = sidebarAvatar.querySelector('img');
      if (img) img.remove();
      sidebarAvatar.textContent = fallbackText || 'U';
    }
  }

  // Top bar avatar
  const topBarAvatar = document.getElementById('topBarAvatar');
  if (topBarAvatar) {
    if (pictureSrc) {
      topBarAvatar.textContent = '';
      topBarAvatar.classList.add('has-img');
      let img = topBarAvatar.querySelector('img');
      if (!img) { img = document.createElement('img'); topBarAvatar.appendChild(img); }
      img.src = pictureSrc;
    } else {
      topBarAvatar.classList.remove('has-img');
      const img = topBarAvatar.querySelector('img');
      if (img) img.remove();
      topBarAvatar.textContent = fallbackText || 'U';
    }
  }

  // Dashboard avatar (if currently on dashboard, the dash-user-avatar exists)
  const dashAvatar = document.querySelector('.dash-user-avatar');
  if (dashAvatar) {
    const existingImg = dashAvatar.querySelector('img');
    if (pictureSrc) {
      dashAvatar.classList.add('has-img');
      if (!existingImg) {
        const img = document.createElement('img');
        img.src = pictureSrc;
        img.alt = '';
        dashAvatar.textContent = '';
        dashAvatar.appendChild(img);
      } else {
        existingImg.src = pictureSrc;
        dashAvatar.textContent = '';
        dashAvatar.appendChild(existingImg);
      }
    } else {
      dashAvatar.classList.remove('has-img');
      if (existingImg) existingImg.remove();
      dashAvatar.textContent = fallbackText || 'U';
    }
  }
}

function updatePasswordStrength() {
  const pw = document.getElementById('uPassword')?.value || '';
  const bar = document.getElementById('pwBar');
  const hint = document.getElementById('pwHint');
  if (!bar) return;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['#e53e3e', '#e53e3e', '#dd6b20', '#3182ce', '#38a169'];
  bar.style.width = ((score + 1) / 5 * 100) + '%';
  bar.style.background = colors[score];
  if (hint) hint.textContent = pw ? `Strength: ${levels[score]}` : '';
}

async function saveUserForm(id) {
  id = id != null ? id : userDrawerCurrentId;
  const photo = userDrawerPhotoBase64;
  const username = document.getElementById('uUsername')?.value.trim();
  const fullName = document.getElementById('uFullName')?.value.trim();
  const email = document.getElementById('uEmail')?.value.trim();
  const mobile = document.getElementById('uMobile')?.value.trim();
  const role = document.getElementById('uRole')?.value;
  const branch = document.getElementById('uBranch')?.value;
  const status = document.getElementById('uStatus')?.value;
  const password = document.getElementById('uPassword')?.value;
  const confirm = document.getElementById('uConfirmPassword')?.value;

  const me = getCurrentUser();
  if (me.role !== 'Admin' && !id) {
    showToast('Only admins can create users', 'error');
    return;
  }

  if (!username || !fullName || !email) { showToast('Username, Full Name and Email are required', 'error'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('Enter a valid email address', 'error'); return; }
  if (!id) {
    if (!password) { showToast('Password is required for new users', 'error'); return; }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      showToast('Password must be at least 8 characters and include uppercase, lowercase, and a number', 'error'); return;
    }
    if (password !== confirm) { showToast('Passwords do not match', 'error'); return; }
  }

  const payload = {
    Id: id || null,
    Username: username,
    FullName: fullName,
    Email: email,
    Mobile: mobile,
    Role: role,
    Branch: branch,
    IsActive: status === 'Active',
    IsLocked: status === 'Locked',
    Password: id ? (password || null) : password,
    ProfilePicture: photo || null
  };

  closeUserDrawer();
  showLoading();
  const result = await window.api.saveUser(payload);
  hideLoading();
  if (result.success) {
    showToast(`User ${id ? 'updated' : 'created'}`);

    // If the saved/edited user is the current user, update sessionStorage and global avatars
    // Use loose equality to handle any type mismatch between me.id and result.id
    if (me.id == result.id || me.id == id) {
      const savedUser = getCurrentUser();
      if (savedUser) {
        savedUser.profilePicture = photo || null;
        sessionStorage.setItem('currentUser', JSON.stringify(savedUser));
        const initial = (savedUser.fullName || savedUser.username || 'U').charAt(0).toUpperCase();
        updateGlobalAvatar(photo, initial);
      }
    }

    loadUsers();
  } else {
    showToast(result.error || 'Failed to save user', 'error');
  }
}

async function confirmUserAction(id, action) {
  const user = allUsers.find(u => u.Id === id);
  if (!user) { showToast('User not found', 'error'); return; }
  const me = getCurrentUser();

  if (action === 'delete') {
    if (me.role !== 'Admin') { showToast('Only admins can delete users', 'error'); return; }
    if (me.id === id) { showToast('You cannot delete your own account', 'error'); return; }
    if (user.Role === 'Admin') { showToast('Admin accounts cannot be deleted', 'error'); return; }
    showModal('Delete User',
      `<p>Are you sure you want to delete <strong>${escapeHtml(user.FullName || user.Username)}</strong>? This action cannot be undone.</p>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-danger" onclick="closeModal(); performUserAction(${id}, 'delete')">Delete</button>`);
    return;
  }

  if (action === 'deactivate' || action === 'activate' || action === 'unlock') {
    if (me.role === 'Branch Manager' && user.Role === 'Admin' && me.id !== id) {
      showToast('Branch Managers cannot modify Admin accounts', 'error');
      return;
    }
    const label = action === 'deactivate' ? 'Deactivate' : (action === 'unlock' ? 'Unlock' : 'Activate');
    const verb = action === 'deactivate' ? 'deactivate' : (action === 'unlock' ? 'unlock' : 'activate');
    showModal(`${label} User`,
      `<p>Are you sure you want to ${verb} <strong>${escapeHtml(user.FullName || user.Username)}</strong>?</p>`,
      `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="closeModal(); performUserAction(${id}, '${action}')">${label}</button>`);
    return;
  }
}

async function performUserAction(id, action) {
  showLoading();
  let result;
  if (action === 'delete') {
    result = await (window.api.deleteUser ? window.api.deleteUser(id) : { success: false, error: 'Delete not supported' });
  } else if (action === 'unlock') {
    result = await window.api.toggleUser(id, true, false);
  } else if (action === 'activate') {
    result = await window.api.toggleUser(id, true);
  } else if (action === 'deactivate') {
    result = await window.api.toggleUser(id, false);
  }
  hideLoading();
  if (result && result.success) {
    const verb = action === 'delete' ? 'deleted' : (action === 'unlock' ? 'unlocked' : (action === 'activate' ? 'activated' : 'deactivated'));
    showToast(`User ${verb}`);
    loadUsers();
  } else {
    showToast((result && result.error) || 'Action failed', 'error');
  }
}

async function resetUserPassword(id) {
  const user = allUsers.find(u => u.Id === id);
  if (!user) { showToast('User not found', 'error'); return; }
  showModal('Reset Password',
    `<p>Send a password reset for <strong>${escapeHtml(user.FullName || user.Username)}</strong>? A temporary password will be generated.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="closeModal(); doResetPassword(${id})">Reset Password</button>`);
}

async function doResetPassword(id) {
  showLoading();
  const result = await (window.api.resetPassword ? window.api.resetPassword(id) : { success: false, error: 'Reset not supported' });
  hideLoading();
  if (result.success) {
    showModal('Password Reset',
      `<p>Password has been reset successfully.</p>
       <p style="margin-top:12px;font-size:13px;color:var(--text-secondary)">Temporary password:</p>
       <p style="font-size:18px;font-weight:800;color:var(--primary);letter-spacing:1px;text-align:center;padding:8px;background:var(--bg-main);border-radius:8px;margin-top:4px">${escapeHtml(result.tempPassword || '')}</p>
       <p style="margin-top:8px;font-size:12px;color:var(--text-light)">Please share this temporary password with the user. They will be prompted to change it on next login.</p>`,
      `<button class="btn btn-primary" onclick="closeModal()">Done</button>`);
  } else {
    showToast(result.error || 'Reset failed', 'error');
  }
}

function onLogFilterChange() {
  logsPage = 1;
  loadActivityLogs();
}

function changeLogsPage(delta) {
  const totalPages = Math.ceil(logsTotal / logsPageSize) || 1;
  const newPage = logsPage + delta;
  if (newPage < 1 || newPage > totalPages) return;
  logsPage = newPage;
  loadActivityLogs();
}

async function loadActivityLogs() {
  const tbody = document.getElementById('activityLogsBody');
  const search = document.getElementById('logSearch')?.value?.trim() || '';
  const action = document.getElementById('logActionFilter')?.value || '';
  const dateFrom = document.getElementById('logDateFrom')?.value || '';
  const dateTo = document.getElementById('logDateTo')?.value || '';

  const result = await window.api.getActivityLogs({ search, action, dateFrom, dateTo, page: logsPage, pageSize: logsPageSize });
  if (!result.success || result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--text-light)">No activities logged</td></tr>';
    document.getElementById('logsPageInfo').textContent = 'Page 1 of 1';
    document.getElementById('logsPrevBtn').disabled = true;
    document.getElementById('logsNextBtn').disabled = true;
    return;
  }

  logsTotal = result.total || 0;
  const totalPages = Math.ceil(logsTotal / logsPageSize) || 1;

  tbody.innerHTML = result.data.map(a => {
    const date = a.CreatedAt ? formatDateOnly(a.CreatedAt) : '';
    const time = a.CreatedAt ? formatTimeOnly(a.CreatedAt) : '';
    const statusLabel = a.Status === 'Failed' ? 'Failed' : 'Success';
    const statusClass = a.Status === 'Failed' ? 'status-failed' : 'status-success';
    return `<tr>
      <td>${escapeHtml(a.FullName || 'System')}</td>
      <td>${escapeHtml(a.Role || '')}</td>
      <td>${escapeHtml(a.Action)}</td>
      <td><span class="${statusClass}">${statusLabel}</span></td>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(time)}</td>
    </tr>`;
  }).join('');

  document.getElementById('logsPageInfo').textContent = `Page ${logsPage} of ${totalPages}`;
  document.getElementById('logsPrevBtn').disabled = logsPage <= 1;
  document.getElementById('logsNextBtn').disabled = logsPage >= totalPages;
}

async function backupDatabase() {
  showLoading();
  const result = await window.api.backupDatabase();
  hideLoading();
  if (result.success) {
    showToast(`Backup saved to: ${result.path}`);
  } else {
    showToast(result.error || 'Backup failed. Ensure PostgreSQL pg_dump is available.', 'error');
  }
}

async function restoreDatabase() {
  showLoading();
  const result = await window.api.openRestoreDialog();
  hideLoading();
  if (!result.success) return;
  restoreFilePath = result.path;
  showModal('Restore Database',
    `<p>Restore from: <strong>${escapeHtml(restoreFilePath)}</strong></p>
     <p style="margin-top:8px;color:var(--danger-text);font-weight:600">This will overwrite all current data. Are you sure?</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); confirmRestore()">Restore</button>`
  );
}

async function confirmRestore() {
  showLoading();
  const result = await window.api.restoreDatabase(restoreFilePath);
  hideLoading();
  restoreFilePath = null;
  if (result.success) {
    showToast('Database restored successfully. Reloading to apply changes…', 'success', 2500);
    // The main process reloads the window automatically; this is a fallback in
    // case the reload signal is missed.
    setTimeout(() => { try { window.location.reload(); } catch (_) {} }, 2600);
  } else {
    showToast(result.error || 'Restore failed', 'error');
  }
}

