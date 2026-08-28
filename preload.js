const { contextBridge, ipcRenderer } = require('electron');

// Auto-update event forwarding (payload forwarded so the renderer can show
// version numbers, progress %, errors, and background status).
const updateCallbacks = [];
ipcRenderer.on('update:checking', () => updateCallbacks.forEach(cb => cb('checking')));
ipcRenderer.on('update:available', (_e, info) => updateCallbacks.forEach(cb => cb('available', info)));
ipcRenderer.on('update:not-available', (_e, info) => updateCallbacks.forEach(cb => cb('not-available', info)));
ipcRenderer.on('update:downloading', (_e, progress) => updateCallbacks.forEach(cb => cb('downloading', progress)));
ipcRenderer.on('update:downloaded', (_e, info) => updateCallbacks.forEach(cb => cb('downloaded', info)));
ipcRenderer.on('update:error', (_e, err) => updateCallbacks.forEach(cb => cb('error', err)));
ipcRenderer.on('update:status', (_e, status) => updateCallbacks.forEach(cb => cb('status', status)));

contextBridge.exposeInMainWorld('api', {
  // Auth
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  me: () => ipcRenderer.invoke('auth:me'),

  // Members
  getMembers: (opts) => ipcRenderer.invoke('members:list', opts || {}),
  getMemberOptions: (opts) => ipcRenderer.invoke('members:options', opts || {}),
  getMember: (id) => ipcRenderer.invoke('members:get', { id }),
  saveMember: (member) => ipcRenderer.invoke('members:save', { member }),
  deleteMember: (id) => ipcRenderer.invoke('members:delete', { id }),
  toggleMemberStatus: (id, status) => ipcRenderer.invoke('members:toggleStatus', { id, status }),
  getNextAfNo: () => ipcRenderer.invoke('members:nextAfNo'),
  generateQR: (data) => ipcRenderer.invoke('members:generateQR', { data }),
  getHonoraryProgress: (id) => ipcRenderer.invoke('members:getHonoraryProgress', { id }),
  getDashboard: () => ipcRenderer.invoke('members:dashboard'),

  // Remittances
  getRemittances: (opts) => ipcRenderer.invoke('remittances:list', opts || {}),
  getRemittance: (id) => ipcRenderer.invoke('remittances:get', { id }),
  getMonthlyRemittanceSlip: (params) => ipcRenderer.invoke('remittances:getMonthlySlip', params),
  getCurrentDraft: () => ipcRenderer.invoke('remittances:getCurrentDraft'),
  saveRemittance: (remittance, details, userId) => ipcRenderer.invoke('remittances:save', { remittance, details, userId }),
  deleteRemittance: (id) => ipcRenderer.invoke('remittances:delete', { id }),
  getRemittanceDashboardSummary: (params) => ipcRenderer.invoke('remittances:dashboard-summary', params),

  // Coordinators
  getCoordinators: (type, opts) => ipcRenderer.invoke('coordinators:list', { type, ...opts }),
  saveCoordinator: (type, coordinator) => ipcRenderer.invoke('coordinators:save', { type, coordinator }),
  deleteCoordinator: (type, id) => ipcRenderer.invoke('coordinators:delete', { type, id }),
  getActiveCoordinators: (type) => ipcRenderer.invoke('coordinators:active', { type }),

  // Death Cases
  getDeathCases: () => ipcRenderer.invoke('deathcases:list'),
  processDeathCase: (data) => ipcRenderer.invoke('deathcases:process', data),
  processBulkDeduction: (data) => ipcRenderer.invoke('deduction:bulk', data),
  deductionPreview: (month) => ipcRenderer.invoke('deduction:preview', { month }),
  processIndividualDeduction: (data) => ipcRenderer.invoke('deduction:individual', data),
  processHDADeduction: (data) => ipcRenderer.invoke('hdaDeduction:bulk', data),

  // SOA
  getSOA: (memberId) => ipcRenderer.invoke('soa:get', { memberId }),
  getSOATransactions: (memberId, opts) => ipcRenderer.invoke('soa:transactions', { memberId, ...opts }),

  // Reports
  getReport: (type, params) => ipcRenderer.invoke('reports:get', { type, params }),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', { key }),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  getUsers: () => ipcRenderer.invoke('settings:users'),
  saveUser: (user) => ipcRenderer.invoke('settings:saveUser', { user }),
  toggleUser: (id, isActive, isLocked) => ipcRenderer.invoke('settings:toggleUser', { id, isActive, isLocked }),
  changePassword: (userId, currentPassword, newPassword) => ipcRenderer.invoke('settings:changePassword', { userId, currentPassword, newPassword }),

  deleteUser: (id) => ipcRenderer.invoke('settings:deleteUser', { id }),
  resetPassword: (id) => ipcRenderer.invoke('settings:resetPassword', { id }),

  // Activity Logs
  getActivityLogs: (filters) => ipcRenderer.invoke('settings:activityLogs', filters),
  getAuditLogs: (filters) => ipcRenderer.invoke('settings:auditLogs', filters),
  backupDatabase: () => ipcRenderer.invoke('settings:backup'),
  openRestoreDialog: () => ipcRenderer.invoke('dialog:openFile'),
  restoreDatabase: (filepath) => ipcRenderer.invoke('settings:restore', { filepath }),

  // System Lock (configurable system-wide month lock)
  checkSystemLock: () => ipcRenderer.invoke('lock:check'),
  setSystemLock: (startDate, startTime, endDate, endTime, reason, userId) => ipcRenderer.invoke('lock:set', { startDate, startTime, endDate, endTime, reason, userId }),
  cancelSystemLock: (userId) => ipcRenderer.invoke('lock:cancel', { userId }),

  // PDF Export
  printToPDF: (html, filename) => ipcRenderer.invoke('export:printToPDF', { html, filename }),
  exportPrintToPDFLandscape: (html, filename) => ipcRenderer.invoke('export:printToPDFLandscape', { html, filename }),
  exportPrintToPDFPortrait: (html, filename) => ipcRenderer.invoke('export:printToPDFPortrait', { html, filename }),
  getLogoBase64: () => ipcRenderer.invoke('export:getLogoBase64'),

  // Excel Export
  exportExcel: (data, filename) => ipcRenderer.invoke('export:excel', { data, filename }),

  // Activity Log
  logActivity: (userId, action, description, ipAddress, userAgent, status) => ipcRenderer.invoke('activity:log', { userId, action, description, ipAddress, userAgent, status }),

  // Notifications
  getNotifications: (filter) => ipcRenderer.invoke('notifications:list', { filter: filter || 'all' }),
  getUnreadNotificationCount: () => ipcRenderer.invoke('notifications:unreadCount'),
  markNotificationRead: (id) => ipcRenderer.invoke('notifications:markRead', { id }),
  markAllNotificationsRead: () => ipcRenderer.invoke('notifications:markAllRead'),
  checkRenewals: () => ipcRenderer.invoke('notifications:checkRenewals'),
  checkBirthdays: () => ipcRenderer.invoke('notifications:checkBirthdays'),
  checkBenefitEligibility: () => ipcRenderer.invoke('notifications:checkBenefitEligibility'),
  checkPaymentMilestones: () => ipcRenderer.invoke('notifications:checkPaymentMilestones'),
  checkOverdueRemittances: () => ipcRenderer.invoke('notifications:checkOverdueRemittances'),

  // Pending Remittances
  getPendingRemittances: () => ipcRenderer.invoke('remittances:getPending'),
  addPendingRemittance: (memberId) => ipcRenderer.invoke('remittances:addPending', { memberId }),
  removePendingRemittance: (id) => ipcRenderer.invoke('remittances:removePending', { id }),
  removePendingRemittanceByMemberId: (memberId) => ipcRenderer.invoke('remittances:removePendingByMemberId', { memberId }),
  isMemberPending: (memberId) => ipcRenderer.invoke('remittances:isPending', { memberId }),

  // Commission Config
  getCommissionConfig: () => ipcRenderer.invoke('commission:getConfig'),
  saveCommissionConfig: (config) => ipcRenderer.invoke('commission:saveConfig', config),

  // Central business rules
  getBusinessRules: () => ipcRenderer.invoke('business:getRules'),

  // Cross-device sync
  onSyncDataChanged: (callback) => {
    ipcRenderer.on('sync:data-changed', (_e, changes) => callback(changes));
  },

  // Commission Transactions
  getCommissionsByCoordinator: (coordinatorId, opts) => ipcRenderer.invoke('commissions:getByCoordinator', { coordinatorId, ...opts }),
  getCoordinatorCommissionSummary: (coordinatorId) => ipcRenderer.invoke('commissions:getCoordinatorSummary', { coordinatorId }),
  getCoordinatorCommissionTotals: (coordinatorId, opts) => ipcRenderer.invoke('commissions:getCoordinatorTotals', { coordinatorId, ...opts }),

  // Branches
  getBranches: (opts) => ipcRenderer.invoke('branches:list', opts || {}),
  saveBranch: (branch) => ipcRenderer.invoke('branches:save', { branch }),
  deleteBranch: (id) => ipcRenderer.invoke('branches:delete', { id }),
  getActiveBranches: () => ipcRenderer.invoke('branches:active'),

  // Personnel
  getPersonnel: (opts) => ipcRenderer.invoke('personnel:list', opts || {}),
  getPersonnelByBranch: (branchId) => ipcRenderer.invoke('personnel:listByBranch', { branchId }),
  savePersonnel: (personnel) => ipcRenderer.invoke('personnel:save', { personnel }),
  deletePersonnel: (id) => ipcRenderer.invoke('personnel:delete', { id }),

  // Address
  getRegions: () => ipcRenderer.invoke('address:getRegions'),
  getProvinces: (regionId) => ipcRenderer.invoke('address:getProvinces', { regionId }),
  getMunicipalities: (provinceId) => ipcRenderer.invoke('address:getMunicipalities', { provinceId }),
  getBarangays: (municipalityId) => ipcRenderer.invoke('address:getBarangays', { municipalityId }),
  getAllBarangays: () => ipcRenderer.invoke('address:getAllBarangays'),

  // Dashboard auto-refresh
  onMembersDataChanged: (callback) => {
    ipcRenderer.on('members:data-changed', () => callback());
  },

  // PSGC
  importPsgc: (userId) => ipcRenderer.invoke('psgc:import', { userId }),
  getPsgcImportLogs: () => ipcRenderer.invoke('psgc:getImportLogs'),
  getPsgcMigrationLogs: () => ipcRenderer.invoke('psgc:getMigrationLogs'),
  getPsgcDuplicateRecords: () => ipcRenderer.invoke('psgc:getDuplicateRecords'),
  refreshBrgyLists: () => ipcRenderer.invoke('psgc:refreshBrgyLists'),
  logPsgcAudit: (userId, username, action, description, affectedRecords) => ipcRenderer.invoke('psgc:auditLog', { userId, username, action, description, affectedRecords }),
  getPsgcAuditLogs: () => ipcRenderer.invoke('psgc:getAuditLogs'),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  startUpdateDownload: () => ipcRenderer.invoke('update:startDownload'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getUpdateStatus: () => ipcRenderer.invoke('update:getStatus'),
  setAutoDownload: (enabled) => ipcRenderer.invoke('update:setAutoDownload', { enabled }),
  onUpdateEvent: (callback) => {
    updateCallbacks.push(callback);
  },
  getAppVersion: () => ipcRenderer.invoke('app:getVersion')
});