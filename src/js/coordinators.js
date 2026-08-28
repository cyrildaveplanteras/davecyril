let coordinatorState = { page: 1, pageSize: 50, search: '' };
let coordinatorEditData = null;
let coordinatorEditType = null;
let coordModalEscHandler = null;
let coordProfilePictureBase64 = null;

// State for the details/SOA page
let _coordDetails = null;
let _coordDetailsType = null;
let _soaState = { page: 1, pageSize: 25, search: '', month: '', year: '', dateFrom: '', dateTo: '', barangay: '', municipality: '' };

async function renderCoordinators(type) {
  coordinatorState.type = type;
  const label = type === 'barangay' ? 'Barangay' : 'Sales';
  const area = document.getElementById('contentArea');
  area.innerHTML = `
    <div class="coord-page">
      <div class="coord-header">
        <div class="coord-header-left">
          <h1>${label} Coordinators</h1>
          <p>Manage ${label.toLowerCase()} coordinator records</p>
        </div>
        <div class="coord-controls">
          <div class="coord-search-wrap">
            <span class="coord-search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input type="text" id="coordSearch" placeholder="Search by name or ${type === 'barangay' ? 'barangay' : 'area'}..." value="${escapeHtml(coordinatorState.search)}">
          </div>
          <button class="coord-add-btn" onclick="showCoordinatorForm('${type}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New ${label} Coordinator
          </button>
        </div>
      </div>
      <div class="coord-card">
        <div class="coord-table-wrap">
          <table class="coord-table">
            <thead><tr>
              <th style="width:40px"></th>
              <th>Full Name</th>
              <th>${type === 'barangay' ? 'Barangay Assigned' : 'Assigned Area'}</th>
              <th>Contact No.</th>
              <th>Email</th>
              <th>Status</th>
              <th style="width:80px">Actions</th>
            </tr></thead>
            <tbody id="coordBody"></tbody>
          </table>
        </div>
        <div class="coord-pagination" id="coordPagination"></div>
      </div>
    </div>`;

  document.getElementById('coordSearch').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') searchCoordinators(type);
  });
  await loadCoordinators(type);
}

async function loadCoordinators(type) {
  const tbody = document.getElementById('coordBody');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:40px;color:var(--text-light)"><div style="display:flex;align-items:center;justify-content:center;gap:10px"><div class="spinner" style="width:18px;height:18px;border-width:2px"></div>Loading...</div></td></tr>`;
  try {
    const result = await window.api.getCoordinators(type, { page: coordinatorState.page, pageSize: coordinatorState.pageSize, search: coordinatorState.search });
  if (!result.success) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:40px;color:var(--danger)">Error loading coordinators</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:50px 20px;color:var(--text-light)">
      <div style="font-size:15px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">No coordinators found</div>
      <div style="font-size:13px;color:var(--text-light)">Click "New ${type === 'barangay' ? 'Barangay' : 'Sales'} Coordinator" to add one</div>
    </td></tr>`;
  } else {
    const areaField = type === 'barangay' ? 'BarangayAssigned' : 'AssignedArea';
    tbody.innerHTML = result.data.map(c => {
      const initial = (c.FullName || '?').charAt(0).toUpperCase();
      const avatarHtml = c.ProfilePicture
        ? `<img src="${escapeHtml(c.ProfilePicture)}" alt="${escapeHtml(c.FullName)}">`
        : `<span>${initial}</span>`;
      const detailsHref = type === 'sales'
        ? `onclick="showCoordinatorDetails('${type}', ${c.Id})"`
        : `onclick="editCoordinator('${type}', ${c.Id})"`;
      return `<tr>
        <td><div class="coord-name-avatar">${avatarHtml}</div></td>
        <td><span class="coord-name-text" style="cursor:pointer;color:var(--primary);font-weight:600" ${detailsHref}>${escapeHtml(c.FullName || '')}</span></td>
        <td style="color:var(--text-secondary)">${escapeHtml(c[areaField] || '')}</td>
        <td style="color:var(--text-secondary)">${escapeHtml(c.ContactNumber || '')}</td>
        <td style="color:var(--text-secondary)">${escapeHtml(c.Email || '')}</td>
        <td><span class="coord-status-badge ${(c.Status || 'Active').toLowerCase()}">${escapeHtml(c.Status || 'Active')}</span></td>
        <td>
          <button class="coord-action-btn edit-btn" onclick="${type === 'sales' ? `showCoordinatorDetails('${type}', ${c.Id})` : `editCoordinator('${type}', ${c.Id})`}" title="View / Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="coord-action-btn delete-btn" onclick="deleteCoordinator('${type}', ${c.Id})" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  const el = document.getElementById('coordPagination');
  el.innerHTML = `
    <span class="coord-pagination-info">${result.total} coordinator${result.total !== 1 ? 's' : ''}</span>
    <div class="coord-pagination-ctrl">
      <button onclick="coordGoPage('${type}', ${result.page - 1})" ${result.page <= 1 ? 'disabled' : ''}>&#8249;</button>
      <span class="coord-page-num">Page ${result.page} of ${result.totalPages}</span>
      <button onclick="coordGoPage('${type}', ${result.page + 1})" ${result.page >= result.totalPages ? 'disabled' : ''}>&#8250;</button>
    </div>`;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:40px;color:var(--danger)">Error: ${escapeHtml(err.message || 'Failed to load coordinators')}</td></tr>`;
  }
}

function coordGoPage(type, page) {
  if (page < 1) return;
  coordinatorState.page = page;
  loadCoordinators(type);
}

function searchCoordinators(type) {
  coordinatorState.search = document.getElementById('coordSearch').value.trim();
  coordinatorState.page = 1;
  loadCoordinators(type);
}

// ===== COORDINATOR DETAILS PAGE (with Statement of Account) =====

async function showCoordinatorDetails(type, id) {
  showLoading();
  _coordDetailsType = type;
  _soaState = { page: 1, pageSize: 25, search: '', month: '', year: '', dateFrom: '', dateTo: '', barangay: '', municipality: '' };
  try {
    const result = await window.api.getCoordinators(type, { pageSize: 1, search: '' });
    if (!result.success) { showToast(result.error, 'error'); hideLoading(); return; }
    const allResult = await window.api.getCoordinators(type, { pageSize: 10000, search: '' });
    const coord = allResult.data.find(c => c.Id === id);
    if (!coord) { showToast('Coordinator not found', 'error'); hideLoading(); return; }
    _coordDetails = coord;

    const label = type === 'barangay' ? 'Barangay' : 'Sales';
    const areaLabel = type === 'barangay' ? 'Barangay Assigned' : 'Assigned Area';
    const areaValue = type === 'barangay' ? coord.BarangayAssigned : coord.AssignedArea;
    const initial = (coord.FullName || '?').charAt(0).toUpperCase();
    const avatarHtml = coord.ProfilePicture
      ? `<img src="${escapeHtml(coord.ProfilePicture)}" alt="${escapeHtml(coord.FullName)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--primary)">`
      : `<div style="width:80px;height:80px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;border:3px solid var(--primary)">${initial}</div>`;

    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
      <div class="coord-page">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <button class="btn btn-outline" onclick="renderCoordinators('${type}')" style="display:inline-flex;align-items:center;gap:6px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to ${label} Coordinators
          </button>
          <div>
            <button class="btn btn-primary" onclick="editCoordinator('${type}', ${coord.Id})" style="display:inline-flex;align-items:center;gap:6px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Profile
            </button>
          </div>
        </div>

        <div class="coord-detail-card" style="background:var(--bg-card);border-radius:12px;padding:24px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <div style="display:flex;gap:24px;align-items:start;flex-wrap:wrap">
            <div>${avatarHtml}</div>
            <div style="flex:1;min-width:200px">
              <h2 style="font-size:22px;margin-bottom:4px">${escapeHtml(coord.FullName)}</h2>
              <p style="color:var(--text-light);font-size:13px;margin-bottom:12px">Coordinator ID: SC-${String(coord.Id).padStart(4,'0')}</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
                <div><strong style="font-size:12px;color:var(--text-light);display:block">${areaLabel}</strong><span>${escapeHtml(areaValue || 'N/A')}</span></div>
                <div><strong style="font-size:12px;color:var(--text-light);display:block">Contact Number</strong><span>${escapeHtml(coord.ContactNumber || 'N/A')}</span></div>
                <div><strong style="font-size:12px;color:var(--text-light);display:block">Email</strong><span>${escapeHtml(coord.Email || 'N/A')}</span></div>
                <div><strong style="font-size:12px;color:var(--text-light);display:block">Date Hired</strong><span>${coord.CreatedAt ? new Date(coord.CreatedAt).toLocaleDateString() : 'N/A'}</span></div>
                <div><strong style="font-size:12px;color:var(--text-light);display:block">Status</strong><span class="coord-status-badge ${(coord.Status || 'Active').toLowerCase()}">${escapeHtml(coord.Status || 'Active')}</span></div>
              </div>
            </div>
          </div>
        </div>

        ${type === 'sales' ? `
        <div id="commissionSummaryCards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">
          <div class="stat-card"><div class="stat-label">Total Members Managed</div><div class="stat-value" id="statMembersManaged">--</div></div>
          <div class="stat-card"><div class="stat-label">Total Remittances Processed</div><div class="stat-value" id="statRemittances">--</div></div>
          <div class="stat-card"><div class="stat-label">Total MSC Collected</div><div class="stat-value" id="statMSCCollected">--</div></div>
          <div class="stat-card"><div class="stat-label">Total Commission Earned</div><div class="stat-value" id="statCommissionEarned">--</div></div>
          <div class="stat-card"><div class="stat-label">Current Month Commission</div><div class="stat-value" id="statCurrentMonth">--</div></div>
          <div class="stat-card"><div class="stat-label">Year-to-Date Commission</div><div class="stat-value" id="statYTD">--</div></div>
          <div class="stat-card"><div class="stat-label">Lifetime Commission</div><div class="stat-value" id="statLifetime">--</div></div>
        </div>

        <div class="coord-card">
          <div class="card-header"><h3>Statement of Account</h3></div>
          <div class="card-body">
            <div class="coord-controls" style="margin-bottom:16px;flex-wrap:wrap;gap:8px">
              <div class="coord-search-wrap" style="flex:1;min-width:150px">
                <span class="coord-search-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                <input type="text" id="soaSearch" placeholder="Search member, AF#, remittance..." style="padding:8px 12px 8px 32px;border:1px solid var(--border);border-radius:8px;width:100%;font-size:13px" value="${escapeHtml(_soaState.search)}">
              </div>
              <select id="soaMonthFilter" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px">
                <option value="">All Months</option>
                ${Array.from({length:12},(_,i)=>`<option value="${i+1}">${new Date(2000,i).toLocaleString('default',{month:'long'})}</option>`).join('')}
              </select>
              <select id="soaYearFilter" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px">
                <option value="">All Years</option>
                ${Array.from({length:5},(_,i)=>`<option value="${new Date().getFullYear()-i}">${new Date().getFullYear()-i}</option>`).join('')}
              </select>
              <input type="date" id="soaDateFrom" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px">
              <input type="date" id="soaDateTo" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px">
              <button class="btn btn-primary btn-sm" onclick="loadCoordinatorSOA(${coord.Id})">Search</button>
              <button class="btn btn-outline btn-sm" onclick="resetSOAFilters(${coord.Id})">Reset</button>
            </div>

            <div style="overflow-x:auto">
              <table class="coord-table">
                <thead><tr>
                  <th>Date</th>
                  <th>Member Name</th>
                  <th>AF No.</th>
                  <th>Remittance No.</th>
                  <th>MSC Amount</th>
                  <th>Commission %</th>
                  <th>Commission Amount</th>
                  <th>Net MSC to Fund</th>
                  <th>Encoder</th>
                  <th>Status</th>
                </tr></thead>
                <tbody id="soaBody">
                  <tr><td colspan="10" class="text-center" style="padding:40px;color:var(--text-light)"><div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto"></div></td></tr>
                </tbody>
              </table>
            </div>

            <div class="coord-pagination" id="soaPagination"></div>

            <div id="soaTotals" style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
              <div class="stat-card"><div class="stat-label">Total MSC Processed</div><div class="stat-value" id="soaTotalMSC">--</div></div>
              <div class="stat-card"><div class="stat-label">Total Commission Earned</div><div class="stat-value" id="soaTotalCommission">--</div></div>
              <div class="stat-card"><div class="stat-label">Avg Commission / Remittance</div><div class="stat-value" id="soaAvgCommission">--</div></div>
              <div class="stat-card"><div class="stat-label">Total Transactions</div><div class="stat-value" id="soaTotalTransactions">--</div></div>
            </div>
          </div>
        </div>
        ` : '<p style="color:var(--text-light);text-align:center;padding:32px">Statement of Account is available for Sales Coordinators only.</p>'}
      </div>`;

    if (type === 'sales') {
      document.getElementById('soaSearch').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') loadCoordinatorSOA(coord.Id);
      });
      document.getElementById('soaMonthFilter').addEventListener('change', () => loadCoordinatorSOA(coord.Id));
      document.getElementById('soaYearFilter').addEventListener('change', () => loadCoordinatorSOA(coord.Id));
      document.getElementById('soaDateFrom').addEventListener('change', () => loadCoordinatorSOA(coord.Id));
      document.getElementById('soaDateTo').addEventListener('change', () => loadCoordinatorSOA(coord.Id));

      await loadCoordinatorSummary(coord.Id);
      await loadCoordinatorSOA(coord.Id);
      await loadCoordinatorTotals(coord.Id);
    }
  } catch (err) {
    showToast(err.message || 'Failed to load coordinator details', 'error');
  }
  hideLoading();
}

async function loadCoordinatorSummary(coordinatorId) {
  try {
    const result = await window.api.getCoordinatorCommissionSummary(coordinatorId);
    if (!result.success) return;
    const d = result.data;
    const fmt = v => '₱' + parseFloat(v || 0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById('statMembersManaged').textContent = d.totalMembersManaged || '0';
    document.getElementById('statRemittances').textContent = d.totalRemittancesProcessed || '0';
    document.getElementById('statMSCCollected').textContent = fmt(d.totalMSCCollected);
    document.getElementById('statCommissionEarned').textContent = fmt(d.totalCommissionEarned);
    document.getElementById('statCurrentMonth').textContent = fmt(d.currentMonthCommission);
    document.getElementById('statYTD').textContent = fmt(d.yearToDateCommission);
    document.getElementById('statLifetime').textContent = fmt(d.lifetimeCommission);
  } catch (err) {
    console.error('loadCoordinatorSummary error:', err);
  }
}

async function loadCoordinatorSOA(coordinatorId) {
  const tbody = document.getElementById('soaBody');
  if (!tbody) return;
  _soaState.search = (document.getElementById('soaSearch')?.value || '').trim();
  _soaState.month = document.getElementById('soaMonthFilter')?.value || '';
  _soaState.year = document.getElementById('soaYearFilter')?.value || '';
  _soaState.dateFrom = document.getElementById('soaDateFrom')?.value || '';
  _soaState.dateTo = document.getElementById('soaDateTo')?.value || '';

  tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:40px;color:var(--text-light)"><div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0 auto"></div></td></tr>`;
  try {
    const result = await window.api.getCommissionsByCoordinator(coordinatorId, {
      page: _soaState.page,
      pageSize: _soaState.pageSize,
      search: _soaState.search,
      month: _soaState.month || null,
      year: _soaState.year || null,
      dateFrom: _soaState.dateFrom || null,
      dateTo: _soaState.dateTo || null
    });
    if (!result.success) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:40px;color:var(--danger)">Error loading statement</td></tr>`;
      return;
    }
    if (result.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:50px 20px;color:var(--text-light)">
        <div style="font-size:15px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">No commission transactions found</div>
        <div style="font-size:13px;color:var(--text-light)">Commissions will appear here after remittances with MSC deposits are processed.</div>
      </td></tr>`;
    } else {
      const fmt = v => '₱' + parseFloat(v || 0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
      tbody.innerHTML = result.data.map(t => {
        const dateStr = t.TransactionDate ? new Date(t.TransactionDate).toLocaleDateString('en-US', {day:'2-digit',month:'short',year:'numeric'}) : '--';
        return `<tr>
          <td style="white-space:nowrap">${dateStr}</td>
          <td>${escapeHtml(t.MemberName || '--')}</td>
          <td>${escapeHtml(t.af_no || '--')}</td>
          <td>${escapeHtml(t.RemittanceNo || '--')}</td>
          <td style="text-align:right">${fmt(t.MSCAmount)}</td>
          <td style="text-align:center">${parseFloat(t.CommissionRate || 0).toFixed(2)}%</td>
          <td style="text-align:right;color:var(--primary);font-weight:600">${fmt(t.CommissionAmount)}</td>
          <td style="text-align:right">${fmt(t.NetMSCAmount)}</td>
          <td>${escapeHtml(t.EncoderName || '--')}</td>
          <td><span class="coord-status-badge ${(t.Status||'Completed').toLowerCase()}">${escapeHtml(t.Status || 'Completed')}</span></td>
        </tr>`;
      }).join('');
    }
    const el = document.getElementById('soaPagination');
    if (el) {
      el.innerHTML = `
        <span class="coord-pagination-info">${result.total} transaction${result.total !== 1 ? 's' : ''}</span>
        <div class="coord-pagination-ctrl">
          <button onclick="soaGoPage(${coordinatorId}, ${result.page - 1})" ${result.page <= 1 ? 'disabled' : ''}>&#8249;</button>
          <span class="coord-page-num">Page ${result.page} of ${result.totalPages}</span>
          <button onclick="soaGoPage(${coordinatorId}, ${result.page + 1})" ${result.page >= result.totalPages ? 'disabled' : ''}>&#8250;</button>
        </div>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:40px;color:var(--danger)">Error: ${escapeHtml(err.message || 'Failed to load statement')}</td></tr>`;
  }
}

async function loadCoordinatorTotals(coordinatorId) {
  try {
    const _s = _soaState;
    const result = await window.api.getCoordinatorCommissionTotals(coordinatorId, {
      search: _s.search,
      month: _s.month || null,
      year: _s.year || null,
      dateFrom: _s.dateFrom || null,
      dateTo: _s.dateTo || null
    });
    if (!result.success) return;
    const d = result.data;
    const fmt = v => '₱' + parseFloat(v || 0).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById('soaTotalMSC').textContent = fmt(d.totalMSCProcessed);
    document.getElementById('soaTotalCommission').textContent = fmt(d.totalCommissionEarned);
    document.getElementById('soaAvgCommission').textContent = fmt(d.avgCommissionPerRemittance);
    document.getElementById('soaTotalTransactions').textContent = d.totalTransactions || '0';
  } catch (err) {
    console.error('loadCoordinatorTotals error:', err);
  }
}

function soaGoPage(coordinatorId, page) {
  if (page < 1) return;
  _soaState.page = page;
  loadCoordinatorSOA(coordinatorId);
  loadCoordinatorTotals(coordinatorId);
}

function resetSOAFilters(coordinatorId) {
  _soaState = { page: 1, pageSize: 25, search: '', month: '', year: '', dateFrom: '', dateTo: '', barangay: '', municipality: '' };
  const searchEl = document.getElementById('soaSearch');
  if (searchEl) searchEl.value = '';
  const monthEl = document.getElementById('soaMonthFilter');
  if (monthEl) monthEl.value = '';
  const yearEl = document.getElementById('soaYearFilter');
  if (yearEl) yearEl.value = '';
  const dfEl = document.getElementById('soaDateFrom');
  if (dfEl) dfEl.value = '';
  const dtEl = document.getElementById('soaDateTo');
  if (dtEl) dtEl.value = '';
  loadCoordinatorSOA(coordinatorId);
  loadCoordinatorTotals(coordinatorId);
}

// ===== END COORDINATOR DETAILS PAGE =====

function showCoordinatorForm(type, data) {
  coordinatorEditType = type;
  coordinatorEditData = data || null;
  coordProfilePictureBase64 = data?.ProfilePicture || null;

  const label = type === 'barangay' ? 'Barangay' : 'Sales';
  const areaField = type === 'barangay' ? 'BarangayAssigned' : 'AssignedArea';
  const areaLabel = type === 'barangay' ? 'Barangay Assigned' : 'Assigned Area';
  const isEdit = !!data;
  const initial = data ? (data.FullName || '?').charAt(0).toUpperCase() : '?';
  const avatarSrc = data?.ProfilePicture || '';

  const overlay = document.createElement('div');
  overlay.className = 'coord-edit-overlay';
  overlay.id = 'coordEditOverlay';
  overlay.innerHTML = `
    <div class="coord-edit-modal">
      <div class="coord-edit-header">
        <h2>${isEdit ? 'Edit' : 'New'} ${label} Coordinator</h2>
        <button class="coord-edit-close" onclick="closeCoordinatorForm()">&times;</button>
      </div>
      <div class="coord-edit-body">
        <div class="coord-edit-left">
          <div class="coord-edit-avatar-wrap" onclick="document.getElementById('coordPhotoInput').click()">
            <div class="coord-edit-avatar-fallback" id="coordAvatarPreviewFallback"${avatarSrc ? ' style="display:none"' : ''}>${initial}</div>
            <img id="coordAvatarPreview" src="${avatarSrc}" alt="Avatar"${avatarSrc ? '' : ' style="display:none"'}>
            <div class="coord-edit-camera-overlay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="12" r="4"/></svg>
            </div>
          </div>
          <input type="file" id="coordPhotoInput" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="previewCoordPhoto(event)">
          <label for="coordPhotoInput" class="coord-edit-upload-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            ${isEdit ? 'Change Photo' : 'Upload Photo'}
          </label>
          <div class="coord-edit-formats">
            <strong>Supported formats:</strong> JPG, PNG, WEBP<br>
            <strong>Max size:</strong> 2MB
          </div>
        </div>
        <div class="coord-edit-right">
          <div class="coord-edit-field">
            <label>Full Name</label>
            <input type="text" id="cName" value="${escapeHtml(data?.FullName || '')}" placeholder="Enter full name">
          </div>
          <div class="coord-edit-field">
            <label>${areaLabel}</label>
            <input type="text" id="cArea" value="${escapeHtml(data?.[areaField] || '')}" placeholder="Enter ${areaLabel.toLowerCase()}">
          </div>
          <div class="coord-edit-field">
            <label>Contact Number</label>
            <input type="text" id="cContact" value="${escapeHtml(data?.ContactNumber || '')}" placeholder="Enter contact number">
          </div>
          <div class="coord-edit-field">
            <label>Email Address</label>
            <input type="email" id="cEmail" value="${escapeHtml(data?.Email || '')}" placeholder="Enter email address">
          </div>
          <div class="coord-edit-field">
            <label>Status</label>
            <select id="cStatus">
              <option value="Active" ${data?.Status === 'Active' || !data ? 'selected' : ''}>Active</option>
              <option value="Inactive" ${data?.Status === 'Inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
      </div>
      <div class="coord-edit-footer">
        <button class="coord-edit-cancel-btn" onclick="closeCoordinatorForm()">Cancel</button>
        <button class="coord-edit-save-btn" onclick="saveCoordinatorForm()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          ${isEdit ? 'Save Changes' : 'Save'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  overlay.addEventListener('click', function(e) {
    if (e.target === this) closeCoordinatorForm();
  });

  coordModalEscHandler = (e) => {
    if (e.key === 'Escape') {
      closeCoordinatorForm();
    }
  };
  document.addEventListener('keydown', coordModalEscHandler);
}

function closeCoordinatorForm() {
  const overlay = document.getElementById('coordEditOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  }
  if (coordModalEscHandler) {
    document.removeEventListener('keydown', coordModalEscHandler);
    coordModalEscHandler = null;
  }
  coordProfilePictureBase64 = null;
  coordinatorEditData = null;
  coordinatorEditType = null;
}

function previewCoordPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be under 2MB', 'error');
    event.target.value = '';
    return;
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showToast('Supported formats: JPG, PNG, WEBP', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    coordProfilePictureBase64 = e.target.result;
    const img = document.getElementById('coordAvatarPreview');
    const fallback = document.getElementById('coordAvatarPreviewFallback');
    if (img) {
      img.src = e.target.result;
      img.style.display = 'block';
    }
    if (fallback) fallback.style.display = 'none';
    showToast('Photo uploaded successfully', 'success');
  };
  reader.readAsDataURL(file);
}

async function saveCoordinatorForm() {
  if (isSystemLocked()) {
    showModal('System Locked', '<p>Data entry is currently disabled. The system is locked for monthly reconciliation.</p>',
      '<button class="btn btn-primary" onclick="closeModal()">OK</button>');
    return;
  }
  const type = coordinatorEditType;
  const id = coordinatorEditData?.Id || null;
  const name = document.getElementById('cName').value.trim();
  const area = document.getElementById('cArea').value.trim();
  const contact = document.getElementById('cContact').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const status = document.getElementById('cStatus').value;
  const profilePicture = coordProfilePictureBase64;
  const areaField = type === 'barangay' ? 'BarangayAssigned' : 'AssignedArea';

  if (!name) { showToast('Full name is required', 'error'); return; }

  closeCoordinatorForm();
  showLoading();
  try {
    const result = await window.api.saveCoordinator(type, {
      Id: id,
      FullName: name,
      [areaField]: area,
      ContactNumber: contact,
      Email: email,
      Status: status,
      ProfilePicture: profilePicture
    });
    if (result.success) {
      showToast(`Coordinator ${id ? 'updated' : 'saved'} successfully`);
      // If we're on the details page, refresh it; otherwise go back to list
      if (_coordDetails && _coordDetails.Id === id) {
        await showCoordinatorDetails(type, id);
      } else {
        coordinatorState.page = 1;
        await loadCoordinators(type);
      }
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'Failed to save coordinator', 'error');
  }
  hideLoading();
}

async function editCoordinator(type, id) {
  showLoading();
  try {
    const result = await window.api.getCoordinators(type, { pageSize: 10000, search: '' });
    if (!result.success) { showToast(result.error, 'error'); hideLoading(); return; }
    const data = result.data.find(c => c.Id === id);
    if (!data) { showToast('Coordinator not found', 'error'); hideLoading(); return; }
    showCoordinatorForm(type, data);
  } catch (err) {
    showToast(err.message || 'Failed to load coordinator', 'error');
  }
  hideLoading();
}

async function deleteCoordinator(type, id) {
  showModal('Delete Coordinator',
    `<div style="text-align:center;padding:8px 0">
      <div style="font-size:48px;margin-bottom:12px;color:var(--danger);opacity:0.6">&#9888;</div>
      <p style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Delete this coordinator?</p>
      <p style="font-size:13px;color:var(--text-secondary)">This action cannot be undone. Related commission records will be unlinked.</p>
    </div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); confirmDelCoord('${type}', ${id})">Delete</button>`
  );
}

async function confirmDelCoord(type, id) {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  showLoading();
  try {
    const result = await window.api.deleteCoordinator(type, id);
    if (result.success) { showToast('Coordinator deleted'); await loadCoordinators(type); }
    else { showToast(result.error, 'error'); }
  } catch (err) {
    showToast(err.message || 'Failed to delete coordinator', 'error');
  }
  hideLoading();
}