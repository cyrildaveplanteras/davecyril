let dashGrowthChart = null;
let dashCollectionChart = null;
let dashClockInterval = null;
let dashMembershipListenerRegistered = false;
let dashMembershipRefreshInterval = null;
let rcsTrendChart = null;
let rcsBreakdownChart = null;

function getKpiTrend(current, previous) {
  if (!previous || previous === 0) return { dir: 'neutral', label: 'No prior data' };
  const diff = current - previous;
  const pct = ((diff / previous) * 100).toFixed(1);
  if (diff > 0) return { dir: 'up', label: `\u2191 ${diff} this month` };
  if (diff < 0) return { dir: 'down', label: `\u2193 ${Math.abs(diff)} this month` };
  return { dir: 'neutral', label: 'No change' };
}

function getActivityDot(action) {
  const a = (action || '').toLowerCase();
  if (a.includes('login')) return 'orange';
  if (a.includes('logout')) return 'purple';
  return 'blue';
}

function getRenewalStatus(days, mfPaymentCount) {
  if (mfPaymentCount === 0) return { cls: 'danger', label: 'Not renewed' };
  if (days < 0) return { cls: 'danger', label: `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue` };
  if (days === 0) return { cls: 'danger', label: 'Due Today' };
  if (days === 1) return { cls: 'danger', label: 'Tomorrow' };
  if (days <= 7) return { cls: 'warning', label: `${days} day${days !== 1 ? 's' : ''} left` };
  return { cls: 'success', label: `${days} days left` };
}

async function renderDashboard() {
  const area = document.getElementById('contentArea');

  const user = getCurrentUser();
  const avatarLetter = user ? (user.fullName || user.username || 'U').charAt(0).toUpperCase() : 'U';
  const hasProfilePic = user?.profilePicture;

  area.innerHTML = `
<div class="dashboard-page">

  <!-- HEADER -->
  <div class="dashboard-header">
    <div>
      <h1>Dashboard</h1>
      <p class="dash-subtitle">Overview of Membership System Statistics</p>
    </div>
    <div class="dashboard-header-right">
      <div class="dash-clock" id="dashClock"></div>
      <div class="dash-header-actions">
        <button class="dash-header-btn" onclick="navigateTo('notifications')" title="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="dash-notif-dot" id="dashNotifDot"></span>
        </button>
        <button class="dash-header-btn" onclick="navigateTo('settings')" title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <div class="dash-user-avatar ${hasProfilePic ? 'has-img' : ''}" onclick="navigateTo('settings')" title="${escapeHtml(user?.fullName || user?.username || 'User')}">${hasProfilePic ? `<img src="${escapeHtml(user.profilePicture)}" alt="">` : avatarLetter}</div>
      </div>
    </div>
</div>

  <!-- KPI GRID -->
  <div class="dash-kpi-grid" id="dashKpiGrid">
    <div class="dash-kpi-card"><div class="dash-kpi-top"><div class="dash-kpi-icon blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div></div><div class="dash-kpi-value" id="kpiTotal">0</div><div class="dash-kpi-label">Total Members</div><div class="dash-kpi-trend" id="trendTotal"></div></div>
    <div class="dash-kpi-card"><div class="dash-kpi-top"><div class="dash-kpi-icon green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></div></div><div class="dash-kpi-value" id="kpiActive">0</div><div class="dash-kpi-label">Active Members</div><div class="dash-kpi-trend" id="trendActive"></div></div>
    <div class="dash-kpi-card"><div class="dash-kpi-top"><div class="dash-kpi-icon teal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/></svg></div></div><div class="dash-kpi-value" id="kpiMSCTotal">\u20B10.00</div><div class="dash-kpi-label">MSC Total Fund</div><div class="dash-kpi-trend" id="trendMSC"></div></div>
    <div class="dash-kpi-card"><div class="dash-kpi-top"><div class="dash-kpi-icon orange"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg></div></div><div class="dash-kpi-value" id="kpiCompanyFund">\u20B10.00</div><div class="dash-kpi-label">Company Fund</div><div class="dash-kpi-trend" id="trendCompany"></div></div>
  </div>

  <!-- CHARTS -->
  <div class="dash-chart-grid">
    <div class="dash-chart-card">
      <div class="dash-chart-header">
        <h3><svg class="dash-chart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>Member Growth</h3>
        <div class="dash-chart-toggle">
          <button class="active" data-period="12">12 Months</button>
          <button data-period="6">6 Months</button>
        </div>
      </div>
      <div class="dash-chart-body"><canvas id="dashGrowthChart"></canvas></div>
    </div>
    <div class="dash-chart-card">
      <div class="dash-chart-header">
        <h3><svg class="dash-chart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>New Registrations</h3>
        <div class="dash-chart-toggle" id="collectionPeriodToggle">
          <button class="active" data-period="monthly">Monthly</button>
          <button data-period="quarterly">Quarterly</button>
          <button data-period="yearly">Yearly</button>
        </div>
      </div>
      <div class="dash-chart-body"><canvas id="dashCollectionChart"></canvas></div>
    </div>
  </div>

  <!-- MEMBERSHIP STATUS WIDGET -->
  <div class="dash-widget-grid">
    <div class="dash-widget-card dash-membership-card">
      <div class="dash-ms-header">
        <div class="dash-ms-header-left">
          <svg class="dash-ms-header-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <div>
            <h3>Membership Status</h3>
            <span class="dash-ms-timestamp" id="dashMsTimestamp">Loading...</span>
          </div>
        </div>
        <button class="dash-ms-refresh" id="dashMsRefresh" title="Refresh" onclick="if(typeof loadDashboardData==='function')loadDashboardData()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>
      <div class="dash-widget-body dash-ms-body" id="dashMembershipWidget">
        <div class="dash-ms-skeleton">
          <div class="dash-ms-skel-bar"><div class="dash-ms-skel-line w60"></div><div class="dash-ms-skel-line w30"></div></div>
          <div class="dash-ms-skel-bar"><div class="dash-ms-skel-line w60"></div><div class="dash-ms-skel-line w30"></div></div>
          <div class="dash-ms-skel-bar"><div class="dash-ms-skel-line w60"></div><div class="dash-ms-skel-line w30"></div></div>
          <div class="dash-ms-skel-bar"><div class="dash-ms-skel-line w60"></div><div class="dash-ms-skel-line w30"></div></div>
          <div class="dash-ms-skel-bar"><div class="dash-ms-skel-line w60"></div><div class="dash-ms-skel-line w30"></div></div>
          <div class="dash-ms-skel-bar"><div class="dash-ms-skel-line w60"></div><div class="dash-ms-skel-line w30"></div></div>
        </div>
      </div>
    </div>

    <!-- Upcoming Renewals -->
    <div class="dash-widget-card">
      <div class="dash-widget-header">
        <h3><svg class="dash-widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Upcoming Renewals</h3>
      </div>
      <div class="dash-widget-body" id="dashRenewalList"></div>
      <div class="dash-widget-footer">
        <a onclick="navigateTo('notifications')">View All &rarr;</a>
      </div>
    </div>

    <!-- Recent Activities -->
    <div class="dash-widget-card">
      <div class="dash-widget-header">
        <h3><svg class="dash-widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Recent Activities</h3>
      </div>
      <div class="dash-widget-body" id="dashActivityList"></div>
    </div>

    <!-- Remittance Collection Summary -->
    <div class="dash-widget-card rcs-card">
      <div class="rcs-header">
        <div class="rcs-header-left">
          <div class="rcs-title-group">
            <h3>
              <svg class="dash-widget-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Remittance Collection Summary
            </h3>
            <span class="rcs-subtitle">Real-time overview of remittance collections</span>
          </div>
        </div>
        <div class="rcs-header-right">
          <div class="rcs-controls">
            <select id="rcsPeriod">
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month" selected>This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Date</option>
            </select>
            <div class="rcs-custom-date hidden" id="rcsCustomDate">
              <input type="date" id="rcsDateFrom">
              <span>to</span>
              <input type="date" id="rcsDateTo">
            </div>
            <button class="rcs-refresh" id="rcsRefreshBtn" title="Refresh">&#x21bb;</button>
          </div>
          <span class="rcs-updated" id="rcsUpdated">Updated: &mdash;</span>
        </div>
      </div>
      <div class="dash-widget-body rcs-body" id="rcsBody">
        <div class="rcs-loading">
          <div class="rcs-shimmer-line" style="width: 45%"></div>
          <div class="rcs-shimmer-line" style="width: 30%"></div>
          <div class="rcs-shimmer-line" style="width: 60%"></div>
          <div class="rcs-shimmer-line" style="width: 35%"></div>
        </div>
      </div>
    </div>

  </div>

  <!-- QUICK ACTIONS -->
  <div class="dash-quick-actions">
    <div class="dash-quick-btn" onclick="navigateTo('member-registration')">
      <div class="dash-quick-btn-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      </div>
      <div class="dash-quick-btn-label">Register Member</div>
    </div>
    <div class="dash-quick-btn" onclick="navigateTo('remittance')">
      <div class="dash-quick-btn-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/><circle cx="12" cy="12" r="5"/></svg>
      </div>
      <div class="dash-quick-btn-label">Open Remittance</div>
    </div>
    <div class="dash-quick-btn" onclick="navigateTo('reports')">
      <div class="dash-quick-btn-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </div>
      <div class="dash-quick-btn-label">Generate Report</div>
    </div>
    <div class="dash-quick-btn" onclick="navigateTo('soa')">
      <div class="dash-quick-btn-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      </div>
      <div class="dash-quick-btn-label">View Statement</div>
    </div>
    <div class="dash-quick-btn" onclick="navigateTo('notifications')">
      <div class="dash-quick-btn-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </div>
      <div class="dash-quick-btn-label">Notifications</div>
    </div>
  </div>

</div>
  `;

  startDashClock();
  loadDashboardData();
  setupAutoRefresh();
}

function startDashClock() {
  if (dashClockInterval) clearInterval(dashClockInterval);
  function update() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true });
    const el = document.getElementById('dashClock');
    if (el) el.textContent = `${dateStr} ${timeStr} (PHT)`;
  }
  update();
  dashClockInterval = setInterval(update, 1000);
}

async function loadDashboardData() {
  try {
    const result = await window.api.getDashboard();
    if (!result.success) {
      console.error('Dashboard API error:', result.error);
      showToast('Failed to load dashboard: ' + result.error, 'error');
      return;
    }
    const d = result.data;

    // KPI values
    document.getElementById('kpiTotal').textContent = d.totalMembers || 0;
    document.getElementById('kpiActive').textContent = d.activeMembers || 0;
    document.getElementById('kpiMSCTotal').textContent = formatCurrency(d.mscTotalFund || 0);
    document.getElementById('kpiCompanyFund').textContent = formatCurrency(d.companyFund || 0);

    // Trends
    const totalTrend = getKpiTrend(d.totalMembers, d.totalMembersPrev);
    setTrend('trendTotal', totalTrend);
    const activeTrend = getKpiTrend(d.activeMembers, d.activeMembersPrev);
    setTrend('trendActive', activeTrend);
    // MSC and Company fund trends - no previous data, just show updated
    setTrend('trendMSC', { dir: 'up', label: 'Updated' });
    setTrend('trendCompany', { dir: 'up', label: 'Updated' });

    // Notification dot
    const notifDot = document.getElementById('dashNotifDot');
    if (notifDot) {
      notifDot.style.display = (d.notificationCount > 0) ? '' : 'none';
    }

    // --- Charts ---
    if (typeof Chart !== 'undefined') {
      renderDashCharts(d);
    }

    // --- Renewals ---
    renderDashRenewals(d.upcomingRenewals);

    // --- Activities ---
    renderDashActivities(d.recentActivities);

    // --- Membership Status Widget ---
    renderDashMembershipStatus(d);

    // --- Remittance Collection Summary ---
    loadRCSWidget();

    // Chart period toggle - Growth
    document.querySelectorAll('.dash-chart-card:first-child .dash-chart-toggle button').forEach(btn => {
      btn.onclick = function () {
        this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        renderDashCharts(d);
      };
    });

    // Chart period toggle - Collections
    document.querySelectorAll('#collectionPeriodToggle button').forEach(btn => {
      btn.onclick = function () {
        this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        renderDashCharts(d);
      };
    });

  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard data', 'error');
  }
}

function setTrend(id, trend) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'dash-kpi-trend ' + trend.dir;
  el.textContent = trend.label;
}

function aggregateByQuarter(data) {
  const qLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
  const quarters = { 'Jan': 1, 'Feb': 1, 'Mar': 1, 'Apr': 2, 'May': 2, 'Jun': 2, 'Jul': 3, 'Aug': 3, 'Sep': 3, 'Oct': 4, 'Nov': 4, 'Dec': 4 };
  const qData = [0, 0, 0, 0];
  (data || []).forEach(item => {
    const q = quarters[item.month];
    if (q) qData[q - 1] += parseFloat(item.count) || 0;
  });
  return { labels: qLabels, values: qData };
}

function aggregateByYear(data) {
  let total = 0;
  (data || []).forEach(item => { total += parseFloat(item.count) || 0; });
  return { labels: [new Date().getFullYear().toString()], values: [total] };
}

function renderDashCharts(d) {
  const kill = (id) => { const existing = Chart.getChart(id); if (existing) existing.destroy(); };

  // Growth chart
  const period = document.querySelector('.dash-chart-card:first-child .dash-chart-toggle .active')?.dataset?.period || '12';
  const limit = parseInt(period);
  let growthLabels = (d.growthData || []).map(g => g.date);
  let growthCounts = (d.growthData || []).map(g => g.count);
  if (growthLabels.length > limit) {
    growthLabels = growthLabels.slice(-limit);
    growthCounts = growthCounts.slice(-limit);
  }

  kill('dashGrowthChart');
  const growCtx = document.getElementById('dashGrowthChart');
  if (growCtx) {
    const grad = growCtx.getContext('2d').createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(34,197,94,0.15)');
    grad.addColorStop(1, 'rgba(34,197,94,0.01)');
    dashGrowthChart = new Chart(growCtx, {
      type: 'line',
      data: {
        labels: growthLabels,
        datasets: [{
          label: 'New Members',
          data: growthCounts,
          borderColor: '#22C55E',
          backgroundColor: grad,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#22C55E',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#fff',
            bodyColor: '#CBD5E1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: ctx => ctx.parsed.y + ' new member' + (ctx.parsed.y !== 1 ? 's' : '')
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#F3F4F6', drawBorder: false },
            ticks: { color: '#6B7280', font: { size: 10 }, maxTicksLimit: 8 }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#F3F4F6', drawBorder: false },
            ticks: { color: '#6B7280', font: { size: 10 }, stepSize: 1 }
          }
        }
      }
    });
  }

  // New Registrations histogram
  const activityPeriod = document.querySelector('#collectionPeriodToggle .active')?.dataset?.period || 'monthly';
  let actLabels, actTotals;

  if (activityPeriod === 'quarterly') {
    const qData = aggregateByQuarter(d.monthlyRegistrations);
    actLabels = qData.labels;
    actTotals = qData.values;
  } else if (activityPeriod === 'yearly') {
    const yData = aggregateByYear(d.monthlyRegistrations);
    actLabels = yData.labels;
    actTotals = yData.values;
  } else {
    actLabels = (d.monthlyRegistrations || []).map(c => c.month);
    actTotals = (d.monthlyRegistrations || []).map(c => parseInt(c.count) || 0);
  }

  kill('dashCollectionChart');
  const colCtx = document.getElementById('dashCollectionChart');
  if (colCtx) {
    dashCollectionChart = new Chart(colCtx, {
      type: 'bar',
      data: {
        labels: actLabels,
        datasets: [{
          label: 'Members',
          data: actTotals,
          backgroundColor: 'rgba(22,163,74,0.7)',
          borderColor: '#16A34A',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.8,
          categoryPercentage: 0.9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#fff',
            bodyColor: '#CBD5E1',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: ctx => ctx.parsed.y + ' member' + (ctx.parsed.y !== 1 ? 's' : '')
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#6B7280', font: { size: 10 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#F3F4F6', drawBorder: false },
            ticks: { color: '#6B7280', font: { size: 10 }, stepSize: 1 }
          }
        }
      }
    });
  }
}

// ===== REMITTANCE COLLECTION SUMMARY WIDGET =====

async function loadRCSWidget() {
  const body = document.getElementById('rcsBody');
  if (!body) return;

  const period = document.getElementById('rcsPeriod').value;
  let params = { period };

  if (period === 'custom') {
    const from = document.getElementById('rcsDateFrom').value;
    const to = document.getElementById('rcsDateTo').value;
    if (!from || !to) {
      body.innerHTML = '<div class="rcs-empty"><p>Please select a date range</p></div>';
      return;
    }
    params.startDate = from;
    params.endDate = to;
  }

  body.innerHTML = '<div class="rcs-loading"><div class="rcs-shimmer-line" style="width:45%"></div><div class="rcs-shimmer-line" style="width:30%"></div><div class="rcs-shimmer-line" style="width:60%"></div><div class="rcs-shimmer-line" style="width:35%"></div></div>';

  try {
    const result = await window.api.getRemittanceDashboardSummary(params);
    if (!result.success) {
      body.innerHTML = '<div class="rcs-error"><span class="rcs-error-icon">&#x26A0;</span><p class="rcs-error-text">Unable to load remittance data.</p><button class="rcs-error-btn" onclick="loadRCSWidget()">Retry</button></div>';
      return;
    }
    const data = result.data;
    if (!data.totalCollection && data.transactionCount === 0 && (!data.breakdown || data.breakdown.length === 0)) {
      body.innerHTML = '<div class="rcs-empty"><div class="rcs-empty-icon">&#x1F4C4;</div><p class="rcs-empty-text">No remittance data available.</p><span class="rcs-empty-sub">Record a remittance to view financial summaries.</span><button class="rcs-empty-btn" onclick="navigateTo(\'remittance\')">Go to Remittance</button></div>';
      return;
    }
    renderRCSWidget(data);
  } catch (err) {
    body.innerHTML = '<div class="rcs-error"><span class="rcs-error-icon">&#x26A0;</span><p class="rcs-error-text">Unable to load remittance data.</p><button class="rcs-error-btn" onclick="loadRCSWidget()">Retry</button></div>';
  }
}

function renderRCSWidget(data) {
  const body = document.getElementById('rcsBody');
  if (!body) return;

  const { totalCollection, transactionCount, avgTransaction, dailyTrend, breakdown, previousTotal, targetAmount, updatedAt } = data;

  const pctAchieved = targetAmount > 0 ? Math.min(100, (totalCollection / targetAmount) * 100) : 0;
  const pctClass = pctAchieved >= 60 ? '' : (pctAchieved >= 30 ? 'warning' : 'danger');

  let vsLabel = '';
  if (previousTotal > 0) {
    const diff = totalCollection - previousTotal;
    const pct = ((diff / previousTotal) * 100).toFixed(1);
    if (diff >= 0) vsLabel = `<span class="rcs-vs-up">&#x25B2; +${pct}%</span>`;
    else vsLabel = `<span class="rcs-vs-down">&#x25BC; ${pct}%</span>`;
  } else {
    vsLabel = '<span class="rcs-vs-neutral">No prior data</span>';
  }

  const transactionCaption = previousTotal > 0 && transactionCount > 0
    ? `+${Math.round((totalCollection / previousTotal) * transactionCount) - transactionCount} this period`
    : '';

  const breakdownColors = { 'New Registration': '#16A34A', 'Renewal': '#22C55E', 'MSC Deposit': '#F59E0B', 'Other Collections': '#94A3B8' };

  // Build detailed trend labels for tooltip
  const trendLabels = dailyTrend && dailyTrend.length > 0
    ? dailyTrend.map(d => {
        const parts = d.date.split('-');
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return monthNames[month - 1] + ' ' + day;
      })
    : [];

  const maxTrend = dailyTrend && dailyTrend.length > 0 ? Math.max(...dailyTrend.map(d => d.amount), 1) : 1;

  body.innerHTML = `
    <div class="rcs-overview">
      <div class="rcs-overview-left">
        <div class="rcs-collected-amount">
          <span class="rcs-collected-label">Collected Amount</span>
          <span class="rcs-collected-value">${formatCurrency(totalCollection)}</span>
          <span class="rcs-collected-vs">${vsLabel}</span>
        </div>
        <div class="rcs-progress-area">
          <div class="rcs-progress-header">
            <span class="rcs-progress-label">Collection Progress</span>
            <span class="rcs-progress-pct">${pctAchieved.toFixed(0)}%</span>
          </div>
          <div class="rcs-progress-track">
            <div class="rcs-progress-fill ${pctClass}" style="width: ${pctAchieved}%"></div>
          </div>
          <div class="rcs-target-row">
            <span class="rcs-target-label">Target</span>
            <span class="rcs-target-value">${formatCurrency(targetAmount)}</span>
          </div>
        </div>
      </div>
      <div class="rcs-overview-right">
        <div class="rcs-kpi-mini">
          <div class="rcs-kpi-mini-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div class="rcs-kpi-mini-info">
            <span class="rcs-kpi-mini-value">${transactionCount}</span>
            <span class="rcs-kpi-mini-label">Transactions</span>
            ${transactionCaption ? '<span class="rcs-kpi-mini-caption">' + transactionCaption + '</span>' : ''}
          </div>
        </div>
        <div class="rcs-kpi-mini">
          <div class="rcs-kpi-mini-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="rcs-kpi-mini-info">
            <span class="rcs-kpi-mini-value">${formatCurrency(avgTransaction)}</span>
            <span class="rcs-kpi-mini-label">Average Per Transaction</span>
            <span class="rcs-kpi-mini-caption">Average payment</span>
          </div>
        </div>
      </div>
    </div>
    <div class="rcs-bottom">
      <div class="rcs-trend-section">
        <div class="rcs-section-header">
          <span class="rcs-section-title">Collection Trend</span>
        </div>
        <div class="rcs-chart-container">
          <canvas id="rcsTrendChart"></canvas>
        </div>
      </div>
      <div class="rcs-breakdown-section">
        <div class="rcs-section-header">
          <span class="rcs-section-title">Collection Breakdown</span>
        </div>
        <div class="rcs-chart-container rcs-breakdown-chart-container">
          <canvas id="rcsBreakdownChart"></canvas>
        </div>
      </div>
    </div>
    <div class="rcs-insights-bar" id="rcsInsights"></div>
  `;

  // Render charts
  renderRCSTrendChart(dailyTrend, trendLabels);
  renderRCSBreakdownChart(breakdown, breakdownColors);

  // Render insights
  const insights = generateRCSInsights(data);
  const insightsContainer = document.getElementById('rcsInsights');
  if (insightsContainer) {
    if (insights.length > 0) {
      insightsContainer.innerHTML = insights.map(text => {
        const isWarning = text.startsWith('\u26A0');
        return '<span class="rcs-insight-item ' + (isWarning ? 'warning' : '') + '"><span class="rcs-insight-icon">' + (isWarning ? '\u26A0' : '\u25B2') + '</span><span class="rcs-insight-text">' + text + '</span></span>';
      }).join('');
    } else {
      insightsContainer.innerHTML = '';
    }
  }

  // Update timestamp
  const updatedEl = document.getElementById('rcsUpdated');
  if (updatedEl && updatedAt) {
    const d = new Date(updatedAt);
    const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    updatedEl.textContent = 'Updated: ' + dateStr + ' \u2022 ' + timeStr;
  }
}

function renderRCSTrendChart(dailyTrend, trendLabels) {
  if (rcsTrendChart) { rcsTrendChart.destroy(); rcsTrendChart = null; }
  const canvas = document.getElementById('rcsTrendChart');
  if (!canvas || !dailyTrend || dailyTrend.length === 0) return;

  rcsTrendChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: trendLabels,
      datasets: [{
        label: 'Collected',
        data: dailyTrend.map(d => d.amount),
        backgroundColor: 'rgba(22, 163, 74, 0.7)',
        borderColor: '#16A34A',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          titleColor: '#fff',
          bodyColor: '#CBD5E1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: function (items) { return trendLabels[items[0].dataIndex] || ''; },
            label: function (ctx) {
              const d = dailyTrend[ctx.dataIndex];
              return ['Collected: ' + formatCurrency(d.amount), 'Transactions: ' + d.transactions];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94A3B8', font: { size: 10 }, maxTicksLimit: 10 }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#F1F5F9' },
          ticks: { color: '#94A3B8', font: { size: 10 }, callback: function (v) { return '\u20B1' + (v / 1000).toFixed(0) + 'k'; } }
        }
      }
    }
  });
}

function renderRCSBreakdownChart(breakdown, colorMap) {
  if (rcsBreakdownChart) { rcsBreakdownChart.destroy(); rcsBreakdownChart = null; }
  const canvas = document.getElementById('rcsBreakdownChart');
  if (!canvas || !breakdown || breakdown.length === 0) return;

  const colors = breakdown.map(b => colorMap[b.type] || '#94A3B8');
  const total = breakdown.reduce((s, b) => s + b.amount, 0);

  rcsBreakdownChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: breakdown.map(b => b.type),
      datasets: [{
        label: 'Amount',
        data: breakdown.map(b => b.amount),
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.8
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          titleColor: '#fff',
          bodyColor: '#CBD5E1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function (ctx) {
              const pct = total > 0 ? ((ctx.parsed.x / total) * 100).toFixed(1) : '0.0';
              return 'Amount: ' + formatCurrency(ctx.parsed.x) + ' (' + pct + '%)';
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#F1F5F9' },
          ticks: { color: '#94A3B8', font: { size: 10 }, callback: function (v) { return '\u20B1' + (v / 1000).toFixed(0) + 'k'; } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#334155', font: { size: 11, weight: '600' } }
        }
      }
    }
  });
}

function generateRCSInsights(data) {
  const insights = [];
  const { totalCollection, previousTotal, transactionCount, avgTransaction, dailyTrend, breakdown, targetAmount } = data;

  if (previousTotal > 0 && totalCollection > 0) {
    const diff = totalCollection - previousTotal;
    const pct = ((diff / previousTotal) * 100).toFixed(1);
    if (diff >= 0) insights.push('Collection increased by ' + pct + '% compared to last period.');
    else insights.push('\u26A0 Collection is ' + Math.abs(pct) + '% below the expected target.');
  }

  if (breakdown && breakdown.length > 0) {
    const renewalItem = breakdown.find(b => b.type === 'Renewal');
    if (renewalItem && renewalItem.count > 0) {
      insights.push('Renewal payments reached ' + formatCurrency(renewalItem.amount) + '.');
    }
  }

  if (avgTransaction > 0) {
    insights.push('Average payment is ' + formatCurrency(avgTransaction) + '.');
  }

  if (dailyTrend && dailyTrend.length > 0) {
    const highest = dailyTrend.reduce((max, d) => d.amount > max.amount ? d : max, dailyTrend[0]);
    if (highest && highest.amount > 0) {
      const parts = highest.date.split('-');
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const dateLabel = monthNames[parseInt(parts[1]) - 1] + ' ' + parseInt(parts[2]) + ', ' + parts[0];
      insights.push('Highest collection day was ' + dateLabel + '.');
    }
  }

  if (dailyTrend && dailyTrend.length > 0 && targetAmount > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const todayData = dailyTrend.find(d => d.date === today);
    if (todayData && todayData.amount > 0) {
      const dailyTarget = targetAmount / new Date().getDate();
      const todayPct = Math.round((todayData.amount / dailyTarget) * 100);
      insights.push("Today's collection reached " + todayPct + "% of the daily target.");
    }
  }

  return insights;
}

function renderDashRenewals(renewals) {
  const el = document.getElementById('dashRenewalList');
  if (!el) return;

  if (!renewals || renewals.length === 0) {
    el.innerHTML = '<div class="dash-empty">No upcoming renewals</div>';
    return;
  }

  el.innerHTML = renewals.map(m => {
    const initial = (m.full_name || '?').charAt(0).toUpperCase();
    let days = 999;
    if (m.renewal_date) {
      const renDate = new Date(m.renewal_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      days = Math.round((renDate - today) / (1000 * 60 * 60 * 24));
    }
    const status = getRenewalStatus(days, m.mf_payment_count);
    return `<div class="dash-renewal-item">
      <div class="dash-renewal-avatar">${escapeHtml(initial)}</div>
      <div class="dash-renewal-info">
        <div class="dash-renewal-name">${escapeHtml(m.full_name || 'Unknown')}</div>
        <div class="dash-renewal-meta">Due: ${m.renewal_date ? formatDate(m.renewal_date) : 'N/A'} &middot; ${status.label}</div>
      </div>
      <span class="dash-renewal-status ${status.cls}">${status.label}</span>
    </div>`;
  }).join('');
}

function renderDashActivities(activities) {
  const el = document.getElementById('dashActivityList');
  if (!el) return;

  if (!activities || activities.length === 0) {
    el.innerHTML = '<div class="dash-empty">No recent activities</div>';
    return;
  }

  el.innerHTML = activities.map(a => {
    const dot = getActivityDot(a.Action);
    return `<div class="dash-timeline-item">
      <div class="dash-timeline-dot ${dot}"></div>
      <div class="dash-timeline-content">
        <div class="dash-timeline-title">${escapeHtml(a.Action || '')}</div>
        <div class="dash-timeline-desc">${escapeHtml(a.Description || '')}${a.FullName ? ' — ' + escapeHtml(a.FullName) : ''}</div>
      </div>
      <div class="dash-timeline-time">${a.CreatedAt ? timeAgo(a.CreatedAt) : ''}</div>
    </div>`;
  }).join('');
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const days = Math.floor(hr / 24);
  if (days < 7) return days + 'd ago';
  return formatDate(dateStr);
}

// ===== MEMBERSHIP STATUS WIDGET =====

function setupAutoRefresh() {
  if (dashMembershipRefreshInterval) clearInterval(dashMembershipRefreshInterval);
  dashMembershipRefreshInterval = setInterval(() => {
    if (document.getElementById('dashMembershipWidget')) loadDashboardData();
  }, 60000);

  if (!dashMembershipListenerRegistered && window.api.onMembersDataChanged) {
    window.api.onMembersDataChanged(() => {
      if (document.getElementById('dashMembershipWidget')) loadDashboardData();
    });
    dashMembershipListenerRegistered = true;
  }
}

function renderDashMembershipEmpty() {
  return `<div class="dash-ms-empty">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    <p>No members registered yet</p>
    <span>Register your first member to see status distribution</span>
  </div>`;
}

function renderDashMembershipStatus(d) {
  const dist = d.membershipDist;
  const honorary = d.honoraryProgress;
  const insights = d.quickInsights;
  const container = document.getElementById('dashMembershipWidget');
  if (!container) return;
  if (!dist || dist.total === 0) { container.innerHTML = renderDashMembershipEmpty(); return; }

  const total = dist.total;
  const statuses = [
    { label: 'Regular Members', count: dist.regular, color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
    { label: 'Honorary Members', count: dist.honorary, color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
    { label: 'Inactive Members', count: dist.inactive, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    { label: 'Pending Renewal', count: dist.pendingRenewal, color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    { label: 'Deceased Members', count: dist.deceased, color: '#64748B', bg: 'rgba(100,116,139,0.12)' },
    { label: 'Draft Registrations', count: dist.draft, color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' }
  ];

  const barsHtml = statuses.map(s => {
    const pct = total > 0 ? ((s.count / total) * 100).toFixed(1) : '0.0';
    return `<div class="dash-ms-bar-item">
      <div class="dash-ms-bar-info">
        <span class="dash-ms-bar-label"><span class="dash-ms-bar-dot" style="background:${s.color}"></span>${s.label}</span>
        <span class="dash-ms-bar-stats"><strong>${s.count}</strong><span class="dash-ms-bar-pct">${pct}%</span></span>
      </div>
      <div class="dash-ms-bar-track"><div class="dash-ms-bar-fill" style="width:${pct}%;background:${s.color};"></div></div>
    </div>`;
  }).join('');

  const honoraryHtml = honorary.honoraryCount > 0 ? `<div class="dash-ms-section">
    <div class="dash-ms-section-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      Honorary Membership Progress
    </div>
    <div class="dash-ms-stat-cards">
      <div class="dash-ms-stat-card">
        <div class="dash-ms-stat-icon" style="background:rgba(22,163,74,0.12);color:#16A34A;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        </div>
        <div class="dash-ms-stat-value">${honorary.eligibleForPromotion}</div>
        <div class="dash-ms-stat-label">Eligible for Promotion</div>
      </div>
      <div class="dash-ms-stat-card">
        <div class="dash-ms-stat-icon" style="background:rgba(245,158,11,0.12);color:#F59E0B;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <div class="dash-ms-stat-value">${honorary.avgYearsCompleted} <span class="dash-ms-stat-sub">/ 10 Years</span></div>
        <div class="dash-ms-stat-label">Average Progress</div>
      </div>
      <div class="dash-ms-stat-card">
        <div class="dash-ms-stat-icon" style="background:rgba(34,197,94,0.12);color:#22C55E;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="dash-ms-stat-value">${honorary.completingThisYear}</div>
        <div class="dash-ms-stat-label">Completing this Year</div>
      </div>
    </div>
  </div>` : '';

  const activePct = insights.activePct !== undefined ? insights.activePct : (total > 0 ? Math.round(((dist.regular + dist.honorary) / total) * 100) : 0);
  const insightsHtml = `<div class="dash-ms-section">
    <div class="dash-ms-section-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Quick Insights
    </div>
    <ul class="dash-ms-insights">
      <li><span class="dash-ms-insights-dot" style="background:#16A34A"></span>${insights.becomingRegular} members will become Regular Members this year.</li>
      <li><span class="dash-ms-insights-dot" style="background:#F59E0B"></span>${insights.renewalsIn30Days} memberships require renewal within 30 days.</li>
      <li><span class="dash-ms-insights-dot" style="background:#22C55E"></span>Membership growth increased by ${total > 0 ? Math.round((insights.membersLastYear / total) * 100) : 0}%.</li>
      <li><span class="dash-ms-insights-dot" style="background:#16A34A"></span>${activePct}% of members are active.</li>
    </ul>
  </div>`;

  const totalHtml = `<div class="dash-ms-total">
    <span>Total Members</span>
    <strong>${total}</strong>
  </div>`;

  container.innerHTML = `<div class="dash-ms-content">${barsHtml}${totalHtml}${honoraryHtml}${insightsHtml}</div>`;

  // Update timestamp
  const ts = document.getElementById('dashMsTimestamp');
  if (ts) {
    const now = new Date();
    ts.textContent = 'Last updated: ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
}

document.addEventListener('change', function (e) {
  if (e.target.id === 'rcsPeriod') {
    const customDate = document.getElementById('rcsCustomDate');
    if (customDate) {
      customDate.classList.toggle('hidden', e.target.value !== 'custom');
    }
    loadRCSWidget();
  }
});

document.addEventListener('click', function (e) {
  if (e.target.id === 'rcsRefreshBtn') {
    loadRCSWidget();
  }
});

document.addEventListener('change', function (e) {
  if (e.target.id === 'rcsDateFrom' || e.target.id === 'rcsDateTo') {
    loadRCSWidget();
  }
});