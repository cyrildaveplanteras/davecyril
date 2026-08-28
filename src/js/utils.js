// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'success', duration = 4000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '&#10003;', error: '&#10007;', warning: '&#9888;', info: '&#8505;' };
  toast.innerHTML = `<span>${icons[type] || ''}</span> ${escapeHtml(String(message))}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== MODAL =====
function showModal(title, bodyHtml, footerHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
  }
});

// ===== LOADING =====
function showLoading() {
  document.getElementById('loadingOverlay')?.classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loadingOverlay')?.classList.add('hidden');
}

// ===== FORMAT HELPERS =====
function formatCurrency(amount) {
  return '₱' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(val) {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val.split('T')[0].split(' ')[0]);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

function formatTimeOnly(dateStr) {
  if (!dateStr) return '';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
}

function statusBadge(status) {
  const map = {
    'Active': 'badge-active',
    'Inactive': 'badge-inactive',
    'Deceased': 'badge-deceased',
    'Suspended': 'badge-pending',
    'Pending': 'badge-pending',
    'Locked': 'badge-locked'
  };
  return `<span class="badge ${map[status] || 'badge-active'}">${escapeHtml(status)}</span>`;
}

function roleBadge(role) {
  const adminRoles = ['Admin', 'Branch Manager'];
  const staffRoles = ['Encoder', 'Branch Staff'];
  if (adminRoles.includes(role)) return `<span class="badge badge-admin">${escapeHtml(role)}</span>`;
  if (staffRoles.includes(role)) return `<span class="badge badge-encoder">${escapeHtml(role)}</span>`;
  return `<span class="badge badge-encoder">${escapeHtml(role)}</span>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== GET CURRENT USER =====
function getCurrentUser() {
  const data = sessionStorage.getItem('currentUser');
  return data ? JSON.parse(data) : null;
}

// Cached system lock state (updated by app.js checkSystemLockStatus)
let _cachedLocked = false;
let _cachedSchedule = null; // { Status, LockStart, LockEnd, Reason, LockedBy }
function isSystemLocked() {
  return _cachedLocked;
}
function setSystemLocked(val, schedule) {
  _cachedLocked = !!val;
  if (schedule !== undefined) _cachedSchedule = schedule;
}
function getLockSchedule() {
  return _cachedSchedule;
}
