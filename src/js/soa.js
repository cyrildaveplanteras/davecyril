let currentSOAMember = null;
let currentSOADeathStats = null;
let soaTransactionState = { page: 1, pageSize: 25, search: '', sortBy: 'effective_date', sortDir: 'DESC' };
let soaMemberId = null;

function soaSearchHandler() {
  soaTransactionState.search = document.getElementById('soaSearchInput').value.trim();
  soaTransactionState.page = 1;
  loadSOATransactions();
}

function renderSOA(memberId) {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
    <div class="soa-wrapper" id="soaWrapper">
      <div class="soa-top-bar">
        <button class="btn btn-outline btn-sm" onclick="backToMemberRecords()">
          <span class="soa-icon">&larr;</span> Back to Member Records
        </button>
        <div class="soa-top-actions">
          <button class="btn btn-primary btn-sm" onclick="printStatement()">
            <span class="soa-icon">&#128424;</span> Print Statement
          </button>
          <button class="btn btn-secondary btn-sm" onclick="exportSOAPDF()">
            <span class="soa-icon">&#128196;</span> Export PDF
          </button>
        </div>
      </div>

      <div class="soa-page-title">
        <h2>Statement of Account</h2>
        <p>Complete contribution and account history of the selected member.</p>
      </div>

      <div id="soaSkeleton" class="soa-skeleton">
        <div class="skeleton-card">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-grid">
            <div><div class="skeleton-line"></div><div class="skeleton-line skeleton-short"></div></div>
            <div><div class="skeleton-line"></div><div class="skeleton-line skeleton-short"></div></div>
            <div><div class="skeleton-line"></div><div class="skeleton-line skeleton-short"></div></div>
            <div><div class="skeleton-line"></div><div class="skeleton-line skeleton-short"></div></div>
          </div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line" style="height:200px"></div>
        </div>
      </div>

      <div id="soaContent" class="soa-content" style="display:none">
        <div class="soa-member-card card">
          <div class="card-header">
            <h3>Member Information</h3>
          </div>
          <div class="card-body">
            <div class="soa-member-grid">
              <div class="soa-field"><span class="soa-label">Name</span><span class="soa-value" id="soaName">-</span></div>
              <div class="soa-field"><span class="soa-label">SC Number</span><span class="soa-value" id="soaSCNo">-</span></div>
              <div class="soa-field"><span class="soa-label">Age</span><span class="soa-value" id="soaAge">-</span></div>
              <div class="soa-field"><span class="soa-label">Gender</span><span class="soa-value" id="soaGender">-</span></div>
              <div class="soa-field"><span class="soa-label">Address</span><span class="soa-value" id="soaAddress">-</span></div>
              <div class="soa-field"><span class="soa-label">Representative</span><span class="soa-value" id="soaRep">-</span></div>
              <div class="soa-field"><span class="soa-label">Contact Number</span><span class="soa-value" id="soaContact">-</span></div>
              <div class="soa-field"><span class="soa-label">Date Registered</span><span class="soa-value" id="soaDateReg">-</span></div>
              <div class="soa-field"><span class="soa-label">Death Benefit</span><span class="soa-value" id="soaDeathBenefit">-</span></div>
              <div class="soa-field"><span class="soa-label">MSC Balance</span><span class="soa-value" id="soaMSCBalance">-</span></div>
              <div class="soa-field"><span class="soa-label">Current Status</span><span class="soa-value" id="soaStatus">-</span></div>
              <div class="soa-field"><span class="soa-label">Membership Type</span><span class="soa-value" id="soaMembershipType">-</span></div>
            </div>
          </div>
        </div>

        <div class="soa-table-card card mt-4">
          <div class="card-header">
            <h3>Statement of Account</h3>
          </div>
          <div class="card-body">
            <div class="soa-table-controls">
              <div class="soa-search-box">
                <input type="text" id="soaSearchInput" placeholder="Search transactions..." value="">
                <span class="soa-search-icon">&#128269;</span>
              </div>
              <span class="soa-member-status-label" id="soaStatusFilterLabel" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary)">Status: <span id="soaStatusFilterValue" class="badge badge-active">Active</span></span>
              <select class="page-size-select" id="soaPageSize" onchange="changeSOAPageSize()">
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <div id="soaEmptyState" class="soa-empty-state" style="display:none">
              <div class="soa-empty-icon">&#128202;</div>
              <h4>No Statement of Account Found</h4>
              <p>This member has no recorded contributions yet.</p>
            </div>
            <div id="soaErrorState" class="soa-error-state" style="display:none">
              <div class="soa-empty-icon">&#9888;</div>
              <h4>Unable to load Statement of Account</h4>
              <p>Please try again.</p>
              <button class="btn btn-primary btn-sm mt-2" onclick="loadSOATransactions()">Retry</button>
            </div>
            <div id="soaTableWrapper" class="soa-table-wrapper">
              <div class="table-container">
                <table class="soa-table" id="soaTable">
                  <thead>
                    <tr>
                      <th data-sort="xf_no" onclick="sortSOATable('xf_no')">XF No. <span class="sort-icon">&#8597;</span></th>
                      <th data-sort="effective_date" onclick="sortSOATable('effective_date')">Effective Date <span class="sort-icon">&#8597;</span></th>
                      <th data-sort="mf_mk" onclick="sortSOATable('mf_mk')">MF / MK <span class="sort-icon">&#8597;</span></th>
                      <th data-sort="msc_savings" onclick="sortSOATable('msc_savings')">MSC Savings (2BRK) <span class="sort-icon">&#8597;</span></th>
                      <th data-sort="hda_amount" onclick="sortSOATable('hda_amount')">HDA <span class="sort-icon">&#8597;</span></th>
                      <th data-sort="total" onclick="sortSOATable('total')">Total <span class="sort-icon">&#8597;</span></th>
                      <th data-sort="status" onclick="sortSOATable('status')">Status <span class="sort-icon">&#8597;</span></th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody id="soaTableBody">
                    <tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-light)">Loading transactions...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="soa-pagination" id="soaPagination"></div>
          </div>
        </div>

        <div class="soa-deaths-card card mt-4">
          <div class="card-header">
            <h3>Number of Deaths <small style="font-weight:400;font-size:11px;color:var(--text-light)">(System-wide)</small></h3>
          </div>
          <div class="card-body">
            <div class="soa-deaths-grid">
              <div class="soa-death-stat">
                <div class="soa-death-num" id="soaDeathTotal">0</div>
                <div class="soa-death-label">Total Death Claims</div>
              </div>
              <div class="soa-death-stat">
                <div class="soa-death-num" id="soaDeathCurYear">0</div>
                <div class="soa-death-label">Current Year</div>
              </div>
              <div class="soa-death-stat">
                <div class="soa-death-num" id="soaDeathPrevYear">0</div>
                <div class="soa-death-label">Previous Year</div>
              </div>
            </div>
          </div>
        </div>

        <div class="soa-footer-text">
          <p>This Statement of Account is system-generated.</p>
          <p>No signature is required.</p>
          <p class="soa-footer-stamp">Generated on: <span id="soaGenDate">-</span></p>
          <p class="soa-footer-stamp">Printed by: <span id="soaPrintedBy">-</span></p>
        </div>
      </div>
    </div>`;

  if (memberId) {
    soaMemberId = memberId;
    loadSOAData(memberId);
  } else {
    document.getElementById('soaSkeleton').style.display = 'none';
    document.getElementById('soaContent').style.display = 'none';
    document.getElementById('soaWrapper').insertAdjacentHTML('beforeend', `
      <div class="soa-empty-state" style="margin-top:40px">
        <div class="soa-empty-icon">&#128200;</div>
        <h4>Select a Member</h4>
        <p>Go to <strong>Member List</strong> and click <strong>View SOA</strong> on any member to view their Statement of Account.</p>
        <button class="btn btn-primary mt-4" onclick="navigateTo('member-list')">Go to Member List</button>
      </div>
    `);
  }
}

async function loadSOAData(memberId) {
  if (memberId == null) {
    showToast('Unable to load Statement of Account: Invalid member ID', 'error');
    return;
  }
  document.getElementById('soaSkeleton').style.display = 'block';
  document.getElementById('soaContent').style.display = 'none';

  const result = await window.api.getSOA(memberId);
  if (!result.success) {
    document.getElementById('soaSkeleton').style.display = 'none';
    document.getElementById('soaContent').style.display = 'block';
    document.getElementById('soaTableWrapper').style.display = 'none';
    document.getElementById('soaErrorState').style.display = 'block';
    showToast('Unable to load Statement of Account: ' + result.error, 'error');
    return;
  }

  currentSOAMember = result.member;
  currentSOADeathStats = result.deathStats;
  updateDeathStats(result.deathStats);

  fillMemberInfo(result.member);
  const benefitEl = document.getElementById('soaDeathBenefit');
  const benefit = result.deathBenefit || 0;
  const memberStatus = result.membershipStatus;
  if (benefit >= 50000) {
    benefitEl.innerHTML = '<span class="badge badge-success" style="background:rgba(16,185,129,0.12);color:#059669;font-weight:700">Eligible for ₱50,000</span>';
  } else if (benefit >= 20000) {
    benefitEl.innerHTML = '<span class="badge badge-success" style="background:rgba(16,185,129,0.12);color:#059669;font-weight:700">Eligible for ₱20,000</span>';
  } else if (memberStatus?.trim()?.toLowerCase() === 'regular') {
    benefitEl.innerHTML = '<span class="badge badge-inactive" style="background:#F1F5F9;color:#64748B">Not eligible</span>';
  } else {
    benefitEl.innerHTML = '<span class="badge badge-inactive" style="background:#F1F5F9;color:#64748B">Not eligible - Regular membership required</span>';
  }

  const balanceEl = document.getElementById('soaMSCBalance');
  const balance = parseFloat(result.member.computed_balance) || 0;
  if (balanceEl) {
    balanceEl.innerHTML = `<strong style="color:#059669">${formatCurrency(balance)}</strong>`;
  }

  const now = new Date();
  document.getElementById('soaGenDate').textContent = formatDateTime(now.toISOString());

  const searchInput = document.getElementById('soaSearchInput');
  searchInput.removeEventListener('input', soaSearchHandler);
  searchInput.addEventListener('input', soaSearchHandler);

  const statusValueEl = document.getElementById('soaStatusFilterValue');
  if (statusValueEl) {
    const badgeClass = {
      'Active': 'badge-active',
      'Inactive': 'badge-inactive',
      'Suspended': 'badge-pending',
      'Deceased': 'badge-deceased'
    }[result.member.member_status] || 'badge-active';
    statusValueEl.className = `badge ${badgeClass}`;
    statusValueEl.textContent = result.member.member_status || 'Active';
  }

  document.getElementById('soaSkeleton').style.display = 'none';
  document.getElementById('soaContent').style.display = 'block';

  loadSOATransactions();
}

function fillMemberInfo(m) {
  document.getElementById('soaName').textContent = m.full_name || '-';
  document.getElementById('soaSCNo').textContent = m.af_no || '-';
  document.getElementById('soaAge').textContent = m.age || '-';
  document.getElementById('soaGender').textContent = m.gender || '-';
  document.getElementById('soaAddress').textContent = m.address || '-';
  document.getElementById('soaRep').textContent = m.family_rep_name || '-';
  document.getElementById('soaContact').textContent = m.contact_no || '-';
  const regDate = m.registration_date ? formatDate(m.registration_date) : '-';
  document.getElementById('soaDateReg').textContent = regDate;

  const status = m.member_status || 'Active';
  const badgeClass = {
    'Active': 'badge-active',
    'Inactive': 'badge-inactive',
    'Suspended': 'badge-pending',
    'Deceased': 'badge-deceased'
  }[status] || 'badge-active';
  document.getElementById('soaStatus').innerHTML = `<span class="badge ${badgeClass}">${escapeHtml(status)}</span>`;

  const memType = m.membership_status || 'Regular';
  const memTypeBadge = memType === 'Honorary'
    ? `<span style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;color:#D97706">Honorary</span>`
    : `<span style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;color:#059669">Regular</span>`;
  document.getElementById('soaMembershipType').innerHTML = memTypeBadge;
}

function updateDeathStats(stats) {
  document.getElementById('soaDeathTotal').textContent = stats?.Total || 0;
  document.getElementById('soaDeathCurYear').textContent = stats?.CurrentYear || 0;
  document.getElementById('soaDeathPrevYear').textContent = stats?.PreviousYear || 0;
}

async function loadSOATransactions() {
  if (!soaMemberId && !currentSOAMember) return;

  const memberId = soaMemberId || (currentSOAMember ? currentSOAMember.Id : null);
  if (memberId == null) return;
  const tbody = document.getElementById('soaTableBody');
  const emptyState = document.getElementById('soaEmptyState');
  const errorState = document.getElementById('soaErrorState');
  const tableWrapper = document.getElementById('soaTableWrapper');

  tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-light)"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  emptyState.style.display = 'none';
  errorState.style.display = 'none';
  tableWrapper.style.display = 'block';

  const result = await window.api.getSOATransactions(memberId, {
    page: soaTransactionState.page,
    pageSize: soaTransactionState.pageSize,
    search: soaTransactionState.search
  });

  if (!result.success) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px;color:var(--danger)">Error loading transactions</td></tr>';
    return;
  }

  if (result.data.length === 0) {
    tbody.innerHTML = '';
    tableWrapper.style.display = 'none';
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    tableWrapper.style.display = 'block';
    let rows = result.data;

    if (soaTransactionState.sortBy) {
      const dir = soaTransactionState.sortDir === 'ASC' ? 1 : -1;
      rows.sort((a, b) => {
        let va = a[soaTransactionState.sortBy] || '';
        let vb = b[soaTransactionState.sortBy] || '';
        if (soaTransactionState.sortBy === 'mf_mk' || soaTransactionState.sortBy === 'msc_savings' || soaTransactionState.sortBy === 'hda_amount' || soaTransactionState.sortBy === 'total') {
          va = parseFloat(va) || 0;
          vb = parseFloat(vb) || 0;
        }
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }

    tbody.innerHTML = rows.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.xf_no || '')}</strong></td>
        <td>${t.effective_date ? formatDate(t.effective_date) : '-'}</td>
        <td class="text-right">${formatCurrency(t.mf_mk)}</td>
        <td class="text-right">${formatCurrency(t.msc_savings)}</td>
        <td class="text-right">${formatCurrency(t.hda_amount)}</td>
        <td class="text-right"><strong>${formatCurrency(t.total)}</strong></td>
        <td>${statusBadge(t.status || 'Active')}</td>
        <td class="soa-remarks">${t.RemittanceNo ? escapeHtml(t.RemittanceNo) : '-'}</td>
      </tr>
    `).join('');
  }

  renderSOAPagination(result.total, result.page, result.totalPages);
}

function renderSOAPagination(total, page, totalPages) {
  const el = document.getElementById('soaPagination');
  if (!total || total <= 0) {
    el.innerHTML = '';
    return;
  }
  let pages = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    pages.push(i);
  }
  el.innerHTML = `
    <span class="pagination-info">Showing ${Math.min((page - 1) * soaTransactionState.pageSize + 1, total)}-${Math.min(page * soaTransactionState.pageSize, total)} of ${total} transactions</span>
    <div class="pagination-controls">
      <button onclick="goToSOAPage(1)" ${page <= 1 ? 'disabled' : ''}>&#171;</button>
      <button onclick="goToSOAPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>&#8249;</button>
      ${pages.map(p => `<button class="${p === page ? 'active' : ''}" onclick="goToSOAPage(${p})">${p}</button>`).join('')}
      <button onclick="goToSOAPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>&#8250;</button>
      <button onclick="goToSOAPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''}>&#187;</button>
    </div>
  `;
}

function goToSOAPage(page) {
  if (page < 1) return;
  soaTransactionState.page = page;
  loadSOATransactions();
}

function changeSOAPageSize() {
  soaTransactionState.pageSize = parseInt(document.getElementById('soaPageSize').value);
  soaTransactionState.page = 1;
  loadSOATransactions();
}

function sortSOATable(column) {
  if (soaTransactionState.sortBy === column) {
    soaTransactionState.sortDir = soaTransactionState.sortDir === 'ASC' ? 'DESC' : 'ASC';
  } else {
    soaTransactionState.sortBy = column;
    soaTransactionState.sortDir = 'DESC';
  }
  document.querySelectorAll('.soa-table th .sort-icon').forEach(el => el.textContent = '\u2197');
  const th = document.querySelector(`.soa-table th[data-sort="${column}"]`);
  if (th) {
    th.querySelector('.sort-icon').textContent = soaTransactionState.sortDir === 'ASC' ? '\u2191' : '\u2193';
  }
  loadSOATransactions();
}

function backToMemberRecords() {
  navigateTo('member-list');
}

async function printStatement() {
  if (!currentSOAMember) return;

  showToast('Preparing print...', 'info');

  const user = getCurrentUser();
  const now = new Date();
  const genDateTime = formatDateTime(now.toISOString());
  const printedBy = user ? user.fullName || user.username : 'Unknown';

  const member = currentSOAMember;
  const deathStats = currentSOADeathStats;
  const status = member.member_status || 'Active';

  const result = await window.api.getSOATransactions(member.Id, { page: 1, pageSize: 500 });
  const rows = result.success && result.data.length > 0
    ? result.data.map(t => `
      <tr>
        <td>${escapeHtml(t.xf_no || '')}</td>
        <td>${t.effective_date ? formatDate(t.effective_date) : '-'}</td>
        <td class="text-right">${formatCurrency(t.mf_mk)}</td>
        <td class="text-right">${formatCurrency(t.msc_savings)}</td>
        <td class="text-right">${formatCurrency(t.hda_amount)}</td>
        <td class="text-right"><strong>${formatCurrency(t.total)}</strong></td>
        <td><span class="badge-print">Active</span></td>
        <td>-</td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:#94A3B8">No transactions found</td></tr>';

  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <html><head><title>SOA - ${escapeHtml(member.full_name)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', -apple-system, sans-serif; padding: 30px; color: #1E293B; }
      .print-header { margin-bottom: 24px; border-bottom: 2px solid #16A34A; padding-bottom: 16px; }
      .print-header-inner { display: flex; align-items: center; justify-content: center; gap: 16px; }
      .print-header img { width: 55px; height: 55px; }
      .print-header-text { text-align: left; }
      .print-header-text h1 { color: #16A34A; font-size: 20px; letter-spacing: 1px; margin: 0; }
      .print-header-text h2 { color: #1F2937; font-size: 16px; font-weight: 600; margin: 2px 0 0 0; }
      .print-header-text p { color: #6B7280; font-size: 12px; margin: 2px 0 0 0; }
      .section-title { font-size: 14px; font-weight: 700; color: #16A34A; margin-bottom: 12px; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 20px; font-size: 12px; }
      .info-grid .field { display: flex; }
      .info-grid .label { color: #64748B; min-width: 120px; font-weight: 500; }
      .info-grid .value { color: #1E293B; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
      th { background: #F8FAFC; padding: 8px 10px; text-align: left; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #E5E7EB; font-size: 10px; }
      td { padding: 7px 10px; border-bottom: 1px solid #E5E7EB; color: #1F2937; }
      tr:nth-child(even) td { background: #F8FAFC; }
      .text-right { text-align: right; }
      .badge-print { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; background: #D1FAE5; color: #065F46; }
      .deaths-grid { display: flex; gap: 16px; margin-bottom: 20px; }
      .death-stat { flex: 1; text-align: center; padding: 12px; background: #F8FAFC; border-radius: 8px; }
      .death-stat .num { font-size: 22px; font-weight: 700; color: #16A34A; }
      .death-stat .lbl { font-size: 11px; color: #6B7280; margin-top: 2px; }
      .print-footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; }
      .print-footer p { font-size: 11px; color: #9CA3AF; margin-bottom: 2px; }
      @media print { body { padding: 20px; } @page { size: A4 portrait; margin: 15mm 20mm; } }
    </style></head><body>
    <div class="print-header">
      <div class="print-header-inner">
        <img src="../../assets/logo.png" onerror="this.style.display='none'" alt="Logo">
        <div class="print-header-text">
          <h1>GOLDENHOPE</h1>
          <h2>Statement of Account</h2>
          <p>Damayan Association and Support Inc.</p>
        </div>
      </div>
    </div>
    <div class="section-title">Member Information</div>
    <div class="info-grid">
      <div class="field"><span class="label">Name</span><span class="value">${escapeHtml(member.full_name || '-')}</span></div>
      <div class="field"><span class="label">SC Number</span><span class="value">${escapeHtml(member.af_no || '-')}</span></div>
      <div class="field"><span class="label">Age</span><span class="value">${member.age || '-'}</span></div>
      <div class="field"><span class="label">Gender</span><span class="value">${escapeHtml(member.gender || '-')}</span></div>
      <div class="field"><span class="label">Address</span><span class="value">${escapeHtml(member.address || '-')}</span></div>
      <div class="field"><span class="label">Representative</span><span class="value">${escapeHtml(member.family_rep_name || '-')}</span></div>
      <div class="field"><span class="label">Contact Number</span><span class="value">${escapeHtml(member.contact_no || '-')}</span></div>
      <div class="field"><span class="label">Date Registered</span><span class="value">${member.registration_date ? formatDate(member.registration_date) : '-'}</span></div>
      <div class="field"><span class="label">MSC Balance</span><span class="value">${formatCurrency(parseFloat(member.computed_balance) || 0)}</span></div>
      <div class="field"><span class="label">Current Status</span><span class="value"><span class="badge-print">${escapeHtml(status)}</span></span></div>
    </div>

    <div class="section-title">Statement of Account</div>
    <table>
      <thead><tr>
        <th>XF No.</th><th>Effective Date</th><th>MF / MK</th><th>MSC Savings (2BRK)</th><th>HDA</th><th>Total</th><th>Status</th><th>Remarks</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="section-title">Number of Deaths <span style="font-weight:400;font-size:10px;color:#9CA3AF">(System-wide)</span></div>
    <div class="deaths-grid">
      <div class="death-stat"><div class="num">${deathStats?.Total || 0}</div><div class="lbl">Total Death Claims</div></div>
      <div class="death-stat"><div class="num">${deathStats?.CurrentYear || 0}</div><div class="lbl">Current Year</div></div>
      <div class="death-stat"><div class="num">${deathStats?.PreviousYear || 0}</div><div class="lbl">Previous Year</div></div>
    </div>

    <div class="print-footer">
      <p>This Statement of Account is system-generated.</p>
      <p>No signature is required.</p>
      <p>Generated on: ${genDateTime}</p>
      <p>Printed by: ${escapeHtml(printedBy)}</p>
    </div>

    <script>window.onload = function() { window.print(); };<\/script>
    </body></html>`);
  printWin.document.close();
}

async function exportSOAPDF() {
  if (!currentSOAMember) return;

  showModal('Export PDF',
    `<p>Generating PDF for <strong>${escapeHtml(currentSOAMember.full_name)}</strong>...</p>
     <div class="spinner" style="margin:16px auto"></div>`,
    ''
  );

  const member = currentSOAMember;
  const deathStats = currentSOADeathStats;
  const user = getCurrentUser();
  const now = new Date();
  const genDateTime = formatDateTime(now.toISOString());
  const printedBy = user ? user.fullName || user.username : 'Unknown';
  const filename = `SOA_${String(member.af_no || '').replace(/[\\/:*?"<>|]/g, '')}_${member.full_name ? member.full_name.replace(/\s+/g, '').replace(/[\\/:*?"<>|]/g, '') : 'Unknown'}_${now.toISOString().slice(0, 10)}.pdf`;

  try {
    const result = await window.api.getSOATransactions(member.Id, { page: 1, pageSize: 500 });
    if (!result.success) {
      closeModal();
      showToast('Failed to load transaction data for PDF', 'error');
      return;
    }

    const rows = result.data.map(t => `
      <tr>
        <td>${escapeHtml(t.xf_no || '')}</td>
        <td>${t.effective_date ? formatDate(t.effective_date) : '-'}</td>
        <td class="text-right">${formatCurrency(t.mf_mk)}</td>
        <td class="text-right">${formatCurrency(t.msc_savings)}</td>
        <td class="text-right">${formatCurrency(t.hda_amount)}</td>
        <td class="text-right"><strong>${formatCurrency(t.total)}</strong></td>
        <td><span class="badge-print">Active</span></td>
        <td>-</td>
      </tr>
    `).join('');

    const status = member.member_status || 'Active';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(filename)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, sans-serif; padding: 40px; color: #1F2937; }
  .header { margin-bottom: 32px; border-bottom: 2px solid #16A34A; padding-bottom: 20px; }
  .header-inner { display: flex; align-items: center; justify-content: center; gap: 16px; }
  .header img { width: 55px; height: 55px; }
  .header-text { text-align: left; }
  .header-text h1 { color: #16A34A; font-size: 22px; letter-spacing: 1px; margin: 0; }
  .header-text h2 { color: #1F2937; font-size: 16px; font-weight: 600; margin: 2px 0 0 0; }
  .header-text p { color: #6B7280; font-size: 12px; margin: 2px 0 0 0; }
  .section-title { font-size: 14px; font-weight: 700; color: #16A34A; margin-bottom: 16px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; margin-top: 24px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin-bottom: 24px; font-size: 12px; }
  .info-grid .field { display: flex; padding: 4px 0; border-bottom: 1px solid #F8FAFC; }
  .info-grid .label { color: #6B7280; min-width: 130px; font-weight: 500; }
  .info-grid .value { color: #1F2937; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 24px; }
  th { background: #F8FAFC; padding: 8px 10px; text-align: left; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #E5E7EB; font-size: 9px; }
  td { padding: 6px 10px; border-bottom: 1px solid #E5E7EB; color: #1F2937; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .text-right { text-align: right; }
  .badge-print { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; background: #D1FAE5; color: #065F46; }
  .deaths { display: flex; gap: 20px; margin-bottom: 24px; }
  .death-stat { flex: 1; text-align: center; padding: 16px; background: #F8FAFC; border-radius: 8px; border: 1px solid #E5E7EB; }
  .death-stat .num { font-size: 24px; font-weight: 700; color: #16A34A; }
  .death-stat .lbl { font-size: 11px; color: #6B7280; margin-top: 4px; }
  .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; }
  .footer p { font-size: 11px; color: #9CA3AF; margin-bottom: 2px; }
  @page { size: A4 portrait; margin: 15mm 20mm; }
</style></head><body>
<div class="header">
  <div class="header-inner">
    <img src="../../assets/logo.png" onerror="this.style.display='none'" alt="Logo">
    <div class="header-text">
      <h1>GOLDENHOPE</h1>
      <h2>Statement of Account</h2>
      <p>Damayan Association and Support Inc. | Generated: ${genDateTime}</p>
    </div>
  </div>
</div>
<div class="section-title">Member Information</div>
<div class="info-grid">
  <div class="field"><span class="label">Name</span><span class="value">${escapeHtml(member.full_name || '-')}</span></div>
  <div class="field"><span class="label">SC Number</span><span class="value">${escapeHtml(member.af_no || '-')}</span></div>
  <div class="field"><span class="label">Age / Gender</span><span class="value">${member.age || '-'} / ${escapeHtml(member.gender || '-')}</span></div>
  <div class="field"><span class="label">Address</span><span class="value">${escapeHtml(member.address || '-')}</span></div>
  <div class="field"><span class="label">Representative</span><span class="value">${escapeHtml(member.family_rep_name || '-')}</span></div>
  <div class="field"><span class="label">Contact Number</span><span class="value">${escapeHtml(member.contact_no || '-')}</span></div>
  <div class="field"><span class="label">Date Registered</span><span class="value">${member.registration_date ? formatDate(member.registration_date) : '-'}</span></div>
  <div class="field"><span class="label">MSC Balance</span><span class="value">${formatCurrency(parseFloat(member.computed_balance) || 0)}</span></div>
  <div class="field"><span class="label">Current Status</span><span class="value"><span class="badge-print">${escapeHtml(status)}</span></span></div>
</div>
<div class="section-title">Statement of Account</div>
    <table>
      <thead><tr><th>XF No.</th><th>Effective Date</th><th>MF / MK</th><th>MSC Savings (2BRK)</th><th>HDA</th><th>Total</th><th>Status</th><th>Remarks</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#94A3B8">No transactions</td></tr>'}</tbody>
    </table>
    <div class="section-title">Number of Deaths <span style="font-weight:400;font-size:10px;color:#9CA3AF">(System-wide)</span></div>
    <div class="deaths">
      <div class="death-stat"><div class="num">${deathStats?.Total || 0}</div><div class="lbl">Total Death Claims</div></div>
      <div class="death-stat"><div class="num">${deathStats?.CurrentYear || 0}</div><div class="lbl">Current Year</div></div>
      <div class="death-stat"><div class="num">${deathStats?.PreviousYear || 0}</div><div class="lbl">Previous Year</div></div>
    </div>
    <div class="footer">
      <p>This Statement of Account is system-generated.</p>
      <p>No signature is required.</p>
      <p>Generated on: ${genDateTime} | Printed by: ${escapeHtml(printedBy)}</p>
    </div>
</body></html>`;

    const pdfResult = await window.api.printToPDF(html, filename);
    closeModal();

    if (!pdfResult.success) {
      showToast('PDF Export Failed: ' + pdfResult.error, 'error');
      return;
    }

    const blob = new Blob([new Uint8Array(pdfResult.data)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('PDF exported successfully: ' + pdfResult.filename);
  } catch (e) {
    closeModal();
    showToast('PDF Export Failed: ' + e.message, 'error');
  }
}