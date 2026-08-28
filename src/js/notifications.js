let notificationPageFilter = 'all';

async function renderNotifications() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);margin-right:6px"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>Notifications</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="notifPageFilter" onchange="onNotifFilterChange(this.value)" class="form-select" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
            <option value="all" ${notificationPageFilter === 'all' ? 'selected' : ''}>All</option>
            <option value="upcoming" ${notificationPageFilter === 'upcoming' ? 'selected' : ''}>Upcoming Renewal</option>
            <option value="due_today" ${notificationPageFilter === 'due_today' ? 'selected' : ''}>Due Today</option>
            <option value="grace_period" ${notificationPageFilter === 'grace_period' ? 'selected' : ''}>Grace Period</option>
            <option value="inactive" ${notificationPageFilter === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="renewal_success" ${notificationPageFilter === 'renewal_success' ? 'selected' : ''}>Renewals & Upgrades</option>
            <option value="member_registered" ${notificationPageFilter === 'member_registered' ? 'selected' : ''}>New Members</option>
            <option value="member_status_changed" ${notificationPageFilter === 'member_status_changed' ? 'selected' : ''}>Status Changes</option>
            <option value="benefit_eligible" ${notificationPageFilter === 'benefit_eligible' ? 'selected' : ''}>Benefit Eligibility</option>
            <option value="birthday" ${notificationPageFilter === 'birthday' ? 'selected' : ''}>Birthdays</option>
            <option value="payment_milestone" ${notificationPageFilter === 'payment_milestone' ? 'selected' : ''}>Payment Milestones</option>
            <option value="remittance" ${notificationPageFilter === 'remittance' ? 'selected' : ''}>Remittance</option>
            <option value="death_case" ${notificationPageFilter === 'death_case' ? 'selected' : ''}>Death Cases</option>
            <option value="coordinator" ${notificationPageFilter === 'coordinator' ? 'selected' : ''}>Coordinators</option>
            <option value="system" ${notificationPageFilter === 'system' ? 'selected' : ''}>System</option>
          </select>
          <button class="btn btn-sm btn-outline" onclick="checkAllNotifications()" title="Run all checks now">Refresh Checks</button>
          <button class="btn btn-sm btn-outline" onclick="markAllNotificationsRead()">Mark All Read</button>
        </div>
      </div>
      <div class="card-body" id="notifPageList">
        <div class="notif-loading">Loading...</div>
      </div>
    </div>
  `;
  await loadNotificationsPage();
  await refreshNotificationBadge();
}

function onNotifFilterChange(value) {
  notificationPageFilter = value;
  loadNotificationsPage();
}

async function checkAllNotifications() {
  showLoading();
  await Promise.all([
    window.api.checkRenewals().catch(() => {}),
    window.api.checkBirthdays().catch(() => {}),
    window.api.checkBenefitEligibility().catch(() => {}),
    window.api.checkPaymentMilestones().catch(() => {}),
    window.api.checkOverdueRemittances().catch(() => {})
  ]);
  hideLoading();
  await renderNotifications();
  showToast('All notification checks completed');
}

async function loadNotificationsPage() {
  const list = document.getElementById('notifPageList');
  if (!list) return;
  list.innerHTML = '<div class="notif-loading">Loading...</div>';

  const filter = notificationPageFilter || 'all';
  const result = await window.api.getNotifications(filter).catch(() => ({ data: [] }));
  if (!result.success || !result.data || result.data.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications</div>';
    return;
  }

  list.innerHTML = result.data.map(n => {
    const priorityClass = n.priority || 'info';
    const statusClass = n.status === 'unread' ? 'unread' : '';
    const daysRemaining = n.renewal_date ? getDaysRemaining(n.renewal_date) : null;
    return `<div class="notif-item ${statusClass}" onclick="handleNotifClick(${n.Id}, ${n.member_id || 'null'})">
      <div class="notif-priority-dot ${priorityClass}"></div>
      <div class="notif-content">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        <div class="notif-message">${escapeHtml(n.message)}</div>
        <div class="notif-meta">
          ${n.member_name ? `<span>${escapeHtml(n.member_name)}</span>` : ''}
          ${n.af_no ? `<span>${escapeHtml(n.af_no)}</span>` : ''}
          ${daysRemaining !== null ? `<span>${daysRemaining} days remaining</span>` : ''}
          <span>${n.member_status ? statusBadge(n.member_status) : ''}</span>
          <span>${formatDateTime(n.created_at)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(refreshNotificationBadge, 1000);
});

async function refreshNotificationBadge() {
  const result = await window.api.getUnreadNotificationCount().catch(() => ({ count: 0 }));
  const sidebarBadge = document.getElementById('sidebarNotificationBadge');
  const topBarBadge = document.getElementById('topBarNotifBadge');
  const count = result.count || 0;
  const badgeText = count > 99 ? '99+' : count;
  [sidebarBadge, topBarBadge].forEach(badge => {
    if (badge) {
      if (count > 0) {
        badge.textContent = badgeText;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  });
}

function getDaysRemaining(renewalDate) {
  if (!renewalDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);
  const diff = Math.round((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

async function handleNotifClick(id, memberId) {
  if (id) {
    await window.api.markNotificationRead(id).catch(err => console.error('Mark notification read failed:', err));
    await refreshNotificationBadge();
  }
  if (memberId) {
    navigateTo('soa', memberId);
  } else {
    renderNotifications();
  }
}

async function markAllNotificationsRead() {
  await window.api.markAllNotificationsRead().catch(err => console.error('Mark all notifications read failed:', err));
  renderNotifications();
  await refreshNotificationBadge();
  showToast('All notifications marked as read');
}
