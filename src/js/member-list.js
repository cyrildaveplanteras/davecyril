let memberListState = { page: 1, pageSize: 500, search: '', status: 'All', registration_month: '' };
let selectedMemberId = null;
let searchDebounceTimer = null;
let memberListRequestId = 0;

function renewalNeedsRenewal(renewalDate, mfPaymentCount) {
  if (!renewalDate) return true;
  if (!mfPaymentCount) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rd = new Date(String(renewalDate).split('T')[0].split(' ')[0] + 'T00:00:00');
  if (isNaN(rd.getTime())) return true;
  const diffDays = Math.round((rd - today) / 86400000);
  return diffDays <= 30;
}

function renderMembershipTypeBadge(membershipStatus, honoraryYears) {
  if (membershipStatus === 'Honorary') {
    const pct = Math.min(100, (honoraryYears / 10) * 100);
    return `<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;color:#D97706;white-space:nowrap">
      <span>Honorary</span>
      <span style="font-weight:400;color:#A16207">${honoraryYears}/10</span>
      <div style="width:32px;height:4px;background:#E2E8F0;border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#F59E0B,#D97706);border-radius:2px"></div>
      </div>
    </div>`;
  }
  if (membershipStatus === 'Regular') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;color:#059669;white-space:nowrap">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Regular
    </span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(100,116,139,0.08);border:1px solid rgba(100,116,139,0.12);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;color:#64748B;white-space:nowrap">${escapeHtml(membershipStatus)}</span>`;
}

async function renderMemberList() {
  const area = document.getElementById('contentArea');
  const _canManage = ['Admin', 'Branch Manager'].includes(getCurrentUser()?.role);
  area.innerHTML = `
    <div class="ml-wrapper">
      <div class="ml-toolbar">
        <div class="ml-search-box">
          <svg class="ml-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="mlSearch" placeholder="Search by Member ID, Name, District, Status..." value="${escapeHtml(memberListState.search)}" autocomplete="off">
          <button class="ml-search-clear" id="mlSearchClear" title="Clear search" style="${memberListState.search ? 'display:flex' : 'display:none'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <select id="mlStatusFilter" class="ml-select">
          <option value="All" ${memberListState.status === 'All' ? 'selected' : ''}>All Status</option>
          <option value="Active" ${memberListState.status === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${memberListState.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          <option value="Deceased" ${memberListState.status === 'Deceased' ? 'selected' : ''}>Deceased</option>
        </select>
        <input type="month" id="mlMonthFilter" class="ml-select" style="max-width:180px" value="${escapeHtml(memberListState.registration_month)}" title="Filter by registration month">
        <div class="ml-toolbar-spacer"></div>
        <button class="ml-btn ml-btn-outline" onclick="exportMemberListCSV()" title="Export CSV">
          <span class="ml-btn-icon">&#128229;</span> Export
        </button>
        <button class="ml-btn ml-btn-outline" onclick="window.print()" title="Print">
          <span class="ml-btn-icon">&#128424;</span> Print
        </button>
        <button class="ml-btn ml-btn-outline" id="mlLockBtn" onclick="confirmMonthLock()" title="Month Lock" style="display:none">
          <span class="ml-btn-icon">&#128274;</span> Lock
        </button>
      </div>

      <div class="ml-table-card">
        <div class="ml-table-header">
          <div class="ml-table-header-left">
            <h3>Member Records</h3>
            <span class="ml-table-count" id="mlTotalCount">Loading...</span>
          </div>
          <div class="ml-table-header-right">
            <div class="ml-show-entries">
              <label>Show</label>
              <select class="ml-page-size-select" id="mlPageSize" onchange="changeMemberPageSize()">
                <option value="15" ${memberListState.pageSize === 15 ? 'selected' : ''}>15</option>
                <option value="25" ${memberListState.pageSize === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${memberListState.pageSize === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${memberListState.pageSize === 100 ? 'selected' : ''}>100</option>
                <option value="500" ${memberListState.pageSize === 500 ? 'selected' : ''}>500</option>
              </select>
              <label>entries</label>
            </div>
            <button class="ml-btn ml-btn-primary ml-btn-with-icon" onclick="navigateTo('member-registration')">
              <span class="ml-btn-icon">&#10010;</span> New Member
            </button>
          </div>
        </div>
        <div class="ml-table-wrapper">
          <table class="ml-table">
            <thead>
              <tr>
                <th>AF No.</th>
                <th>Full Name</th>
                <th>Birth Date</th>
                <th>Gender</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Membership</th>
                <th>Renewal</th>
                <th>MF (₱)</th>
                <th>MSC Balance (₱)</th>
                <th>District</th>
                <th>Province</th>
                <th>Municipality</th>
                <th>Barangay</th>
                <th>Complete Address</th>
                <th>Barangay Coord.</th>
                <th>Sales Coord.</th>
                <th class="ml-print-hide">Actions</th>
              </tr>
            </thead>
            <tbody id="mlBody"></tbody>
            <tfoot id="mlFoot"></tfoot>
          </table>
        </div>
        <div class="ml-table-footer" id="mlPagination"></div>
      </div>

      <div class="ml-bottom-area">
        <div class="ml-bottom-actions">
          <button class="ml-btn ml-btn-secondary ml-btn-lg" id="mlMarkDeceasedBtn" onclick="markSelectedDeceased()">
            <span class="ml-btn-icon">&#9878;</span> Mark as Deceased
          </button>
          ${_canManage ? `
          <button class="ml-btn ml-btn-orange ml-btn-lg" onclick="openBulkDeduction()">
            <span class="ml-btn-icon">&#128176;</span> Bulk Deduction
          </button>
          <button class="ml-btn ml-btn-purple ml-btn-lg" onclick="openHDADeduction()">
            <span class="ml-btn-icon">&#128176;</span> HDA Deduction
          </button>` : ''}
        </div>
      </div>
    </div>`;

  const searchInput = document.getElementById('mlSearch');
  searchInput.addEventListener('input', function() {
    const clearBtn = document.getElementById('mlSearchClear');
    if (this.value.trim()) {
      clearBtn.style.display = 'flex';
    } else {
      clearBtn.style.display = 'none';
    }
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      performSearch();
    }, 300);
  });
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      performSearch();
    }
  });
  document.getElementById('mlStatusFilter').addEventListener('change', function() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    memberListState.search = document.getElementById('mlSearch').value.trim();
    memberListState.status = this.value;
    memberListState.page = 1;
    loadMemberList();
  });
  document.getElementById('mlMonthFilter').addEventListener('change', function() {
    memberListState.registration_month = this.value || '';
    memberListState.page = 1;
    loadMemberList();
  });
  document.getElementById('mlSearchClear').addEventListener('click', function() {
    document.getElementById('mlSearch').value = '';
    this.style.display = 'none';
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    memberListState.search = '';
    memberListState.page = 1;
    loadMemberList();
  });

  // Show Month Lock button only for admins
  const user = getCurrentUser();
  const lockBtn = document.getElementById('mlLockBtn');
  if (lockBtn && user && user.role === 'Admin') {
    lockBtn.style.display = 'inline-flex';
    updateLockButton();
  }

  // Disable New Member button if locked
  const newMemberBtn = document.querySelector('.ml-table-header-right .ml-btn-primary');
  if (newMemberBtn && isSystemLocked()) {
    newMemberBtn.disabled = true;
    newMemberBtn.style.opacity = '0.5';
    newMemberBtn.style.cursor = 'not-allowed';
    newMemberBtn.title = 'Data entry is disabled while the system is locked';
  }

  // Disable Mark Deceased and Bulk Deduction if locked
  if (isSystemLocked()) {
    const deceasedBtn = document.getElementById('mlMarkDeceasedBtn');
    if (deceasedBtn) { deceasedBtn.disabled = true; deceasedBtn.style.opacity = '0.5'; deceasedBtn.style.cursor = 'not-allowed'; }
    const bulkBtn = document.querySelector('.ml-btn-orange');
    if (bulkBtn) { bulkBtn.disabled = true; bulkBtn.style.opacity = '0.5'; bulkBtn.style.cursor = 'not-allowed'; }
    const hdaBtn = document.querySelector('.ml-btn-purple');
    if (hdaBtn) { hdaBtn.disabled = true; hdaBtn.style.opacity = '0.5'; hdaBtn.style.cursor = 'not-allowed'; }
  }

  await loadMemberList();
}

async function loadMemberList() {
  const tbody = document.getElementById('mlBody');
  const _canManage = ['Admin', 'Branch Manager'].includes(getCurrentUser()?.role);
        tbody.innerHTML = '<tr><td colspan="18" class="text-center" style="padding:60px 20px;color:var(--text-light)"><div class="ml-loading-spinner"></div><div style="margin-top:12px;font-size:14px">Loading members...</div></td></tr>';

  // Track the latest request so a stale (older) response can never overwrite a
  // newer search/filter result (race-condition guard).
  const thisRequest = ++memberListRequestId;

  let result;
  try {
    result = await window.api.getMembers({
      page: memberListState.page,
      pageSize: memberListState.pageSize,
      search: memberListState.search,
      status: memberListState.status === 'All' ? null : memberListState.status,
      registration_month: memberListState.registration_month || null
    });
  } catch (err) {
    if (thisRequest !== memberListRequestId) return; // superseded by a newer request
    tbody.innerHTML = `<tr><td colspan="18" class="text-center" style="padding:60px 20px;color:var(--danger)"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">&#9888;</div><div style="font-size:15px;font-weight:600;margin-bottom:4px">Error Loading Members</div><div style="font-size:13px;color:var(--text-secondary)">${escapeHtml(err.message || 'Failed to load members')}</div></td></tr>`;
    return;
  }

  if (thisRequest !== memberListRequestId) return; // superseded by a newer request

  if (!result.success) {
    tbody.innerHTML = `<tr><td colspan="18" class="text-center" style="padding:60px 20px;color:var(--danger)"><div style="font-size:40px;margin-bottom:12px;opacity:0.5">&#9888;</div><div style="font-size:15px;font-weight:600;margin-bottom:4px">Error Loading Members</div><div style="font-size:13px;color:var(--text-secondary)">${escapeHtml(result.error)}</div></td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="18" class="text-center" style="padding:60px 20px;color:var(--text-light)"><div style="font-size:40px;margin-bottom:12px;opacity:0.3">&#128269;</div><div style="font-size:15px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">No matching members found.</div><div style="font-size:13px;color:var(--text-light)">Try adjusting your search or filter criteria</div></td></tr>';
  } else {
    tbody.innerHTML = result.data.map(m => `
      <tr data-member-id="${m.Id}" onclick="selectMemberRow(this, ${m.Id})" class="${selectedMemberId === m.Id ? 'selected' : ''}">
        <td><span class="ml-afno">${escapeHtml(m.af_no || '')}</span></td>
        <td><span class="ml-name">${escapeHtml(m.full_name || '')}</span></td>
        <td class="ml-cell-muted">${m.birth_date ? formatDate(m.birth_date) : '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted ml-cell-nowrap">${escapeHtml(m.gender || '')}</td>
        <td class="ml-cell-muted ml-cell-nowrap">${escapeHtml(m.contact_no || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-nowrap">${statusBadge(m.member_status || 'Active')}</td>
        <td class="ml-cell-nowrap">${renderMembershipTypeBadge(m.membership_status || 'Regular', m.honorary_years_completed || 0)}</td>
        <td class="ml-cell-nowrap ${renewalNeedsRenewal(m.renewal_date, m.mf_payment_count) ? 'ml-renewal-due' : 'ml-renewal-ok'}">${m.renewal_date ? formatDate(m.renewal_date) : '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted ml-cell-nowrap">${formatCurrency(m.membership_fee || 0)}</td>
        <td class="ml-cell-muted ml-cell-nowrap">${formatCurrency(parseFloat(m.computed_balance) || 0)}</td>
        <td class="ml-cell-muted">${escapeHtml(m.district || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted">${escapeHtml(m.province_name || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted">${escapeHtml(m.municipality_name || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted">${escapeHtml(m.barangay_name || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted">${escapeHtml(m.complete_address || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted">${escapeHtml(m.BarangayCoordinator || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-muted">${escapeHtml(m.SalesCoordinator || '') || '<span class="ml-na">—</span>'}</td>
        <td class="ml-cell-nowrap ml-print-hide">
          <div class="ml-action-group">
            <button class="ml-btn-icon-sm ml-btn-soa" onclick="event.stopPropagation(); viewSOAFromList(${m.Id})" title="View SOA">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="ml-btn-icon-sm ml-btn-edit" onclick="event.stopPropagation(); editMember(${m.Id})" title="Edit" ${isSystemLocked() ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="ml-btn-icon-sm ml-btn-print" onclick="event.stopPropagation(); printMemberFormById(${m.Id})" title="Print Application Form">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>
            <button class="ml-btn-icon-sm ml-btn-deduction" onclick="event.stopPropagation(); openIndividualDeduction(${m.Id}, '${escapeHtml(m.full_name)}', '${escapeHtml(m.af_no)}')" title="Individual Deduction" ${isSystemLocked() ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12H7"/><path d="M15 6l6 6-6 6"/><line x1="5" y1="12" x2="3" y2="12"/></svg>
            </button>
            ${_canManage ? `<button class="ml-btn-icon-sm ml-btn-delete" onclick="event.stopPropagation(); deleteMember(${m.Id})" title="Delete" ${isSystemLocked() ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>` : ''}
            <button class="ml-btn-icon-sm ml-btn-deceased" onclick="event.stopPropagation(); processDeathCase(${m.Id})" title="Mark Deceased" ${isSystemLocked() ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  const totalEl = document.getElementById('mlTotalCount');
  if (totalEl && result.data.length > 0) {
    totalEl.textContent = `${result.total} member${result.total !== 1 ? 's' : ''}`;
  } else if (totalEl) {
    totalEl.textContent = '0 members';
  }

  renderMemberPagination(result.total, result.page, result.totalPages);

  const footEl = document.getElementById('mlFoot');
  if (footEl) {
    footEl.innerHTML = '';
  }
}

function renderMemberPagination(total, page, totalPages) {
  const el = document.getElementById('mlPagination');
  let pages = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    pages.push(i);
  }
  const from = Math.min((page - 1) * memberListState.pageSize + 1, total);
  const to = Math.min(page * memberListState.pageSize, total);
  el.innerHTML = `
    <div class="ml-pagination-info">
      Showing <strong>${from}</strong>–<strong>${to}</strong> of <strong>${total}</strong> members
    </div>
    <div class="ml-pagination-controls">
      <button class="ml-page-btn" onclick="goToMemberPage(1)" ${page <= 1 ? 'disabled' : ''} title="First">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
      </button>
      <button class="ml-page-btn" onclick="goToMemberPage(${page - 1})" ${page <= 1 ? 'disabled' : ''} title="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="ml-page-numbers">
        ${pages.map(p => `<button class="ml-page-btn ${p === page ? 'active' : ''}" onclick="goToMemberPage(${p})">${p}</button>`).join('')}
      </div>
      <button class="ml-page-btn" onclick="goToMemberPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''} title="Next">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="ml-page-btn" onclick="goToMemberPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''} title="Last">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
      </button>
    </div>
  `;
}

function performSearch() {
  const raw = document.getElementById('mlSearch').value;
  memberListState.search = raw.trim().replace(/\s+/g, ' ');
  memberListState.status = document.getElementById('mlStatusFilter').value;
  memberListState.page = 1;
  loadMemberList();
}

function goToMemberPage(page) {
  memberListState.page = page;
  loadMemberList();
}

function changeMemberPageSize() {
  memberListState.pageSize = parseInt(document.getElementById('mlPageSize').value);
  memberListState.page = 1;
  loadMemberList();
}

function selectMemberRow(row, id) {
  document.querySelectorAll('.ml-table tbody tr').forEach(r => r.classList.remove('selected'));
  if (selectedMemberId === id) {
    selectedMemberId = null;
  } else {
    row.classList.add('selected');
    selectedMemberId = id;
  }
}

function markSelectedDeceased() {
  if (!selectedMemberId) {
    showToast('Please click a member row first to select them', 'warning');
    return;
  }
  processDeathCase(selectedMemberId);
}

async function deleteMember(id) {
  if (isSystemLocked()) {
    showModal('System Locked', '<p>Data entry is currently disabled. The system is locked for monthly reconciliation.</p>',
      '<button class="btn btn-primary" onclick="closeModal()">OK</button>');
    return;
  }
  showModal('Delete Member', '<p>Are you sure you want to delete this member? This action cannot be undone.</p>',
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); confirmDeleteMember(${id})">Delete</button>`
  );
}

async function confirmDeleteMember(id) {
  if (isSystemLocked()) {
    showModal('System Locked', '<p>Data entry is currently disabled. The system is locked for monthly reconciliation.</p>',
      '<button class="btn btn-primary" onclick="closeModal()">OK</button>');
    return;
  }
  showLoading();
  try {
    const result = await window.api.deleteMember(id);
    hideLoading();
    if (result.success) {
      showToast('Member deleted successfully');
      loadMemberList();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to delete member', 'error');
  }
}

async function processDeathCase(memberId) {
  showLoading();
  let member;
  try {
    member = await window.api.getMember(memberId);
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to load member data', 'error');
    return;
  }
  hideLoading();
  if (!member.success || !member.data) {
    showToast('Member not found', 'error');
    return;
  }
  const m = member.data;
  showModal('Process Death Case',
    `<div class="form-grid">
      <div class="form-group"><label>Member</label><input type="text" value="${escapeHtml(m.full_name)}" readonly></div>
      <div class="form-group"><label>Deceased Name</label><input type="text" id="dcName" value="${escapeHtml(m.full_name)}"></div>
      <div class="form-group"><label>Date of Death</label><input type="date" id="dcDate" onchange="updateDeathBenefitDisplay('${m.registration_date || ''}', '${m.membership_status || 'Regular'}')"></div>
      <div class="form-group"><label>Cause of Death</label><input type="text" id="dcCause"></div>
      <div class="form-group"><label>Beneficiary</label><input type="text" id="dcBeneficiary"></div>
    </div>
    <div id="dcBenefitDisplay" style="padding:10px 14px;border-radius:8px;margin-top:12px;font-size:13px;background:#F1F5F9;color:#64748B">Checking eligibility...</div>
    <p class="mt-4" style="font-size:13px;color:var(--text-secondary)">This will deduct ₱5.00 from every active member for the damayan fund.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="confirmDeathCase(${memberId})">Process</button>`
  );
  document.getElementById('dcDate').value = new Date().toISOString().slice(0, 10);
  if (m.registration_date) updateDeathBenefitDisplay(m.registration_date, m.membership_status);
}

function updateDeathBenefitDisplay(regDateStr, memberStatus) {
  const dateInput = document.getElementById('dcDate');
  const display = document.getElementById('dcBenefitDisplay');
  if (!regDateStr || !dateInput || !display) return;
  if (memberStatus && memberStatus.trim().toLowerCase() !== 'regular') {
    display.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span style="background:#F1F5F9;color:#64748B;padding:4px 12px;border-radius:20px;font-weight:600;font-size:13px">Not eligible</span><span style="color:#94A3B8;font-size:12px">Only Regular members qualify for death benefit</span></div>';
    display.style.background = '#F8FAFC';
    return;
  }
  const reg = new Date(regDateStr);
  const asOf = new Date(dateInput.value || new Date());
  const add = (d, m, dy) => { const r = new Date(d); r.setMonth(r.getMonth() + m); r.setDate(r.getDate() + dy); return r; };
  const beforeCutoff = (reg.getMonth() + 1 < 6) || (reg.getMonth() + 1 === 6 && reg.getDate() <= 15);
  let benefit = 0;
  if (beforeCutoff) {
    if (add(reg, 7, 1) <= asOf) benefit = 50000;
    else if (add(reg, 5, 1) <= asOf) benefit = 20000;
  } else {
    if (add(reg, 9, 1) <= asOf) benefit = 50000;
    else if (add(reg, 7, 1) <= asOf) benefit = 20000;
  }
  if (benefit >= 50000) {
    display.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span style="background:rgba(16,185,129,0.12);color:#059669;padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px">Eligible for ₱50,000</span><span style="color:#64748B;font-size:12px">Death Benefit</span></div>';
    display.style.background = 'rgba(16,185,129,0.06)';
  } else if (benefit >= 20000) {
    display.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span style="background:rgba(16,185,129,0.12);color:#059669;padding:4px 12px;border-radius:20px;font-weight:700;font-size:13px">Eligible for ₱20,000</span><span style="color:#64748B;font-size:12px">Death Benefit</span></div>';
    display.style.background = 'rgba(16,185,129,0.06)';
  } else {
    display.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span style="background:#F1F5F9;color:#64748B;padding:4px 12px;border-radius:20px;font-weight:600;font-size:13px">Not eligible</span></div>';
    display.style.background = '#F8FAFC';
  }
}

async function confirmDeathCase(memberId) {
  if (isSystemLocked()) {
    showModal('System Locked', '<p>Data entry is currently disabled. The system is locked for monthly reconciliation.</p>',
      '<button class="btn btn-primary" onclick="closeModal()">OK</button>');
    return;
  }
  const user = getCurrentUser();
  const name = document.getElementById('dcName').value;
  const date = document.getElementById('dcDate').value;
  const cause = document.getElementById('dcCause').value;
  const beneficiary = document.getElementById('dcBeneficiary').value;
  if (!name || !date) { showToast('Deceased name and date are required', 'error'); return; }
  closeModal();
  showLoading();
  let result;
  try {
    result = await window.api.processDeathCase({ memberId, deceasedName: name, dateOfDeath: date, causeOfDeath: cause, beneficiary, processedBy: user?.id });
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to process death case', 'error');
    return;
  }
  hideLoading();
  if (result.success) {
    const benefitText = result.benefitAmount ? ` Beneficiary eligible for ₱${(result.benefitAmount || 0).toLocaleString()}.` : '';
    showToast(`Death case processed. ₱${(result.totalDeduction || 0).toFixed(2)} deducted from ${result.membersAffected} members.${benefitText}`);
    await window.api.toggleMemberStatus(memberId, 'Deceased');
    loadMemberList();
  } else {
    showToast(result.error, 'error');
  }
}

async function exportMemberListCSV() {
  showLoading();
  let result;
  try {
    result = await window.api.getMembers({ page: 1, pageSize: 10000, exportAll: true, search: memberListState.search, status: memberListState.status === 'All' ? null : memberListState.status });
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to export CSV', 'error');
    return;
  }
  hideLoading();
  if (!result.success) { showToast(result.error, 'error'); return; }

  const headers = ['AFNo', 'FullName', 'BirthDate', 'Age', 'Gender', 'ContactNo', 'Address', 'District', 'MemberStatus', 'BarangayCoordinator', 'SalesCoordinator'];
  const csv = [headers.join(',')];
  result.data.forEach(m => {
    csv.push([m.af_no, `"${(m.full_name || '').replace(/"/g, '""')}"`, m.birth_date || '', m.age || '', m.gender || '',
      m.contact_no || '', `"${(m.address || '').replace(/"/g, '""')}"`, m.district || '', m.member_status || '',
      `"${(m.BarangayCoordinator || '').replace(/"/g, '""')}"`, `"${(m.SalesCoordinator || '').replace(/"/g, '""')}"`].join(','));
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `members_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV exported successfully');
}

function viewSOAFromList(memberId) {
  navigateTo('soa', memberId);
}

function openBulkDeduction() {
  const now = new Date();
  const defaultMonth = now.toISOString().slice(0, 7);
  showModal('Bulk Damayan Deduction',
    `<div class="form-grid">
      <div class="form-group">
        <label>Number of Deceased / Deductions</label>
        <input type="number" id="bdQuantity" min="1" value="1" oninput="updateBulkPreview()">
      </div>
      <div class="form-group">
        <label>Deduction per Member</label>
        <input type="text" id="bdPreview" value="1 \u00d7 \u20B15.00 = \u20B15.00" readonly style="font-weight:600;background:#f4f5f7">
      </div>
      <div class="form-group">
        <label>Registration Month (deduct members registered this month)</label>
        <input type="month" id="bdMonth" value="${defaultMonth}" onchange="updateBulkPreview()">
        <div style="font-size:12px;color:var(--text-light);margin-top:4px">Leave empty to apply to all active members.</div>
      </div>
      <div class="form-group">
        <label>Affected Members</label>
        <input type="text" id="bdAffected" value="Loading..." readonly style="font-weight:600;background:#f4f5f7">
      </div>
      <div class="form-group">
        <label>Reason (optional)</label>
        <input type="text" id="bdReason" placeholder="e.g., Monthly damayan collection">
      </div>
    </div>
    <p class="mt-4" style="font-size:13px;color:var(--text-secondary)">
      This will deduct the total amount from every active member registered in the selected month.
    </p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="confirmBulkDeduction()">Process Deduction</button>`
  );
  updateBulkPreview();
}

async function updateBulkPreview() {
  const qty = parseInt(document.getElementById('bdQuantity').value) || 1;
  const total = qty * 5;
  document.getElementById('bdPreview').value = `${qty} \u00d7 \u20B15.00 = \u20B1${total}.00`;
  const month = document.getElementById('bdMonth').value || '';
  const affectedEl = document.getElementById('bdAffected');
  if (!affectedEl) return;
  affectedEl.value = 'Loading...';
  try {
    const result = await window.api.deductionPreview(month || null);
    if (result.success) {
      const label = month ? `members registered ${month}` : 'all active members';
      affectedEl.value = `${result.count} ${label}`;
    } else {
      affectedEl.value = 'Unable to load count';
    }
  } catch (e) {
    affectedEl.value = 'Unable to load count';
  }
}

async function confirmBulkDeduction() {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  const user = getCurrentUser();
  const qty = parseInt(document.getElementById('bdQuantity').value) || 1;
  const month = document.getElementById('bdMonth').value || '';
  const reason = document.getElementById('bdReason').value || (month ? `Bulk deduction (${qty} \u00d7 \u20B15.00) for ${month}` : `Bulk deduction (${qty} \u00d7 \u20B15.00)`);
  if (qty < 1) { showToast('Please enter a valid number', 'error'); return; }
  closeModal();
  showLoading();
  try {
    const result = await window.api.processBulkDeduction({ quantity: qty, reason, month: month || null, processedBy: user?.id });
    if (result.success) {
      showToast(`Deduction processed. \u20B1${(result.totalDeduction || 0).toFixed(2)} deducted from ${result.membersAffected} members.`);
      loadMemberList();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'Bulk deduction failed', 'error');
  }
  hideLoading();
}

// ===== HDA DEDUCTION FUNCTIONS =====

function openHDADeduction() {
  const selectedRows = document.querySelectorAll('#mlBody tr.selected');
  const selectedCount = selectedRows.length;
  showModal('HDA Deduction',
    `<div class="form-grid">
      <div class="form-group">
        <label>Selected Members</label>
        <input type="text" value="${selectedCount > 0 ? selectedCount + ' member(s) selected' : 'No members selected — will apply to all active members'}" readonly style="font-weight:600;background:#f4f5f7">
      </div>
      <div class="form-group">
        <label>Deduction Amount (₱) <span class="req">*</span></label>
        <input type="number" id="hdaAmount" min="1" step="1" value="5" placeholder="Enter amount">
      </div>
      <div class="form-group">
        <label>Reason (optional)</label>
        <input type="text" id="hdaReason" placeholder="e.g., Cash assistance, loan deduction">
      </div>
    </div>
    <p class="mt-4" style="font-size:13px;color:var(--text-secondary)">
      This will deduct the specified amount from each selected member's HDA Balance.
      Members with insufficient balance will be skipped.
    </p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="confirmHDADeduction()">Process HDA Deduction</button>`
  );
}

async function confirmHDADeduction() {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  const user = getCurrentUser();
  const amount = parseFloat(document.getElementById('hdaAmount').value) || 0;
  const reason = document.getElementById('hdaReason').value || 'HDA Deduction';
  if (amount <= 0) { showToast('Please enter a valid deduction amount', 'error'); return; }

  // Get selected member IDs or use all active members
  const selectedRows = document.querySelectorAll('#mlBody tr.selected');
  let memberIds = [];
  if (selectedRows.length > 0) {
    selectedRows.forEach(row => {
      const id = row.dataset.memberId;
      if (id) memberIds.push(parseInt(id));
    });
  }

  closeModal();
  showLoading();
  try {
    const result = await window.api.processHDADeduction({ memberIds, amount, reason, processedBy: user?.id });
    if (result.success) {
      showToast(`HDA Deduction processed. ₱${(result.totalDeduction || 0).toFixed(2)} deducted from ${result.processed} member(s). ${result.skipped > 0 ? `${result.skipped} member(s) skipped (insufficient balance).` : ''}`);
      loadMemberList();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'HDA deduction failed', 'error');
  }
  hideLoading();
}

// ===== INDIVIDUAL DEDUCTION FUNCTIONS =====

function openIndividualDeduction(memberId, memberName, memberAfNo) {
  showModal('Individual Deduction',
    `<div class="form-grid">
      <div class="form-group"><label>Member</label><input type="text" value="${escapeHtml(memberName)} (${escapeHtml(memberAfNo)})" readonly></div>
      <div class="form-group"><label>Deduction Amount (₱) <span class="req">*</span></label><input type="number" id="indDedAmount" min="0.01" step="0.01" placeholder="Enter amount"></div>
      <div class="form-group"><label>Reason (optional)</label><input type="text" id="indDedReason" placeholder="e.g., Loan payment, penalty"></div>
    </div>
    <p class="mt-4" style="font-size:13px;color:var(--text-secondary)">This will deduct the amount from <strong>only this member</strong>.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); confirmIndividualDeduction(${memberId})">Apply Deduction</button>`
  );
}

async function confirmIndividualDeduction(memberId) {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  const user = getCurrentUser();
  const amount = parseFloat(document.getElementById('indDedAmount').value) || 0;
  const reason = document.getElementById('indDedReason').value || 'Individual Deduction';
  if (amount <= 0) { showToast('Please enter a valid amount', 'error'); return; }

  showLoading();
  try {
    const result = await window.api.processIndividualDeduction({ memberId, amount, reason, processedBy: user?.id });
    if (result.success) {
      showToast(`Deduction of ₱${amount.toFixed(2)} applied to ${result.memberName}`);
      loadMemberList();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'Deduction failed', 'error');
  }
  hideLoading();
}

// ===== MONTH LOCK FUNCTIONS =====

function confirmMonthLock() {
  const user = getCurrentUser();
  if (!user || user.role !== 'Admin') {
    showToast('You do not have permission to lock the system', 'error');
    return;
  }
  const now = new Date();
  const defaultStart = new Date(now.getTime() + 3600000); // 1 hour from now
  const defaultEnd = new Date(now.getTime() + 3 * 86400000); // 3 days from now
  const fmtDate = (d) => d.toISOString().slice(0, 10);
  const fmtTime = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  showModal('Configure System Lock',
    `<div class="form-grid" style="grid-template-columns:1fr 1fr">
      <div class="form-group">
        <label style="font-weight:600;font-size:13px;color:var(--text-secondary)">Lock Start Date</label>
        <input type="date" id="lockStartDate" value="${fmtDate(defaultStart)}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px">
      </div>
      <div class="form-group">
        <label style="font-weight:600;font-size:13px;color:var(--text-secondary)">Lock Start Time</label>
        <input type="time" id="lockStartTime" value="${fmtTime(defaultStart)}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px">
      </div>
      <div class="form-group">
        <label style="font-weight:600;font-size:13px;color:var(--text-secondary)">Unlock Date</label>
        <input type="date" id="lockEndDate" value="${fmtDate(defaultEnd)}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px">
      </div>
      <div class="form-group">
        <label style="font-weight:600;font-size:13px;color:var(--text-secondary)">Unlock Time</label>
        <input type="time" id="lockEndTime" value="${fmtTime(defaultEnd)}" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px">
      </div>
    </div>
    <div class="form-group" style="margin-top:8px">
      <label style="font-weight:600;font-size:13px;color:var(--text-secondary)">Reason (Optional)</label>
      <input type="text" id="lockReason" placeholder="e.g., Monthly Financial Closing" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px">
    </div>
    <div id="lockPreview" style="margin-top:12px;padding:10px 14px;border-radius:8px;background:#F1F5F9;font-size:13px;color:#64748B"></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" id="lockConfirmBtn" onclick="closeModal(); doScheduleLock()">Activate Lock</button>`
  );
  updateLockPreview();
  document.getElementById('lockStartDate').addEventListener('change', updateLockPreview);
  document.getElementById('lockStartTime').addEventListener('change', updateLockPreview);
  document.getElementById('lockEndDate').addEventListener('change', updateLockPreview);
  document.getElementById('lockEndTime').addEventListener('change', updateLockPreview);
}

function updateLockPreview() {
  const sd = document.getElementById('lockStartDate')?.value;
  const st = document.getElementById('lockStartTime')?.value;
  const ed = document.getElementById('lockEndDate')?.value;
  const et = document.getElementById('lockEndTime')?.value;
  const preview = document.getElementById('lockPreview');
  if (!preview) return;
  if (!sd || !st || !ed || !et) { preview.textContent = 'Please fill in all date and time fields.'; return; }
  const start = new Date(sd + 'T' + st);
  const end = new Date(ed + 'T' + et);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) { preview.textContent = 'Invalid date or time.'; return; }
  if (end <= start) { preview.innerHTML = '<span style="color:#DC2626">Error: Unlock date/time must be later than lock start date/time.</span>'; return; }
  const fmt = (d) => d.toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const diff = end - start;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  preview.innerHTML = `Lock will activate: <strong>${fmt(start)}</strong><br>Auto-unlock: <strong>${fmt(end)}</strong><br>Duration: <strong>${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}</strong>`;
}

async function doScheduleLock() {
  const user = getCurrentUser();
  if (!user) return;
  const sd = document.getElementById('lockStartDate')?.value || '';
  const st = document.getElementById('lockStartTime')?.value || '';
  const ed = document.getElementById('lockEndDate')?.value || '';
  const et = document.getElementById('lockEndTime')?.value || '';
  const reason = document.getElementById('lockReason')?.value || '';

  const start = new Date(sd + 'T' + st);
  const end = new Date(ed + 'T' + et);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) { showToast('Invalid date or time', 'error'); return; }
  if (end <= start) { showToast('Unlock date/time must be later than lock start', 'error'); return; }

  showLoading();
  let result;
  try {
    result = await window.api.setSystemLock(sd, st, ed, et, reason, user.id);
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to configure lock', 'error');
    return;
  }
  hideLoading();
  if (result.success) {
    const isActive = result.data?.status === 'Active';
    showToast(isActive ? 'System lock is now active' : 'System lock has been scheduled');
    setSystemLocked(isActive, { LockStart: result.data?.lockStart, LockEnd: result.data?.lockEnd, Reason: reason, LockedBy: user.fullName || user.username });
    updateLockButton();
    if (typeof checkSystemLockStatus === 'function') checkSystemLockStatus();
  } else {
    showToast(result.error || 'Failed to configure lock', 'error');
  }
}

function updateLockButton() {
  const lockBtn = document.getElementById('mlLockBtn');
  if (!lockBtn) return;
  const schedule = getLockSchedule();
  if (isSystemLocked()) {
    lockBtn.innerHTML = '<span class="ml-btn-icon">&#128275;</span> Cancel Lock';
    lockBtn.onclick = function() { confirmMonthUnlock(); };
    lockBtn.className = 'ml-btn ml-btn-danger-outline';
  } else if (schedule && schedule.Status === 'Scheduled') {
    lockBtn.innerHTML = '<span class="ml-btn-icon">&#128197;</span> Scheduled';
    lockBtn.onclick = function() { confirmMonthUnlock(); };
    lockBtn.className = 'ml-btn ml-btn-outline';
  } else {
    lockBtn.innerHTML = '<span class="ml-btn-icon">&#128274;</span> Lock';
    lockBtn.onclick = function() { confirmMonthLock(); };
    lockBtn.className = 'ml-btn ml-btn-outline';
  }
}

function confirmMonthUnlock() {
  const schedule = getLockSchedule();
  const isActive = isSystemLocked();
  showModal(isActive ? 'Cancel System Lock' : 'Cancel Scheduled Lock',
    `<p>Are you sure you want to cancel this ${isActive ? 'active' : 'scheduled'} lock? All data-entry functions will be restored.</p>
     ${schedule ? `<p style="font-size:13px;color:var(--text-light);margin-top:8px">Schedule: ${new Date(schedule.LockStart).toLocaleString()} until ${new Date(schedule.LockEnd).toLocaleString()}</p>` : ''}`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); doCancelLock()">${isActive ? 'Unlock' : 'Cancel Schedule'}</button>`
  );
}

async function doCancelLock() {
  const user = getCurrentUser();
  if (!user) return;
  showLoading();
  let result;
  try {
    result = await window.api.cancelSystemLock(user.id);
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to cancel lock', 'error');
    return;
  }
  hideLoading();
  if (result.success) {
    showToast('System lock has been cancelled');
    setSystemLocked(false, null);
    updateLockButton();
    if (typeof checkSystemLockStatus === 'function') checkSystemLockStatus();
    renderMemberList();
  } else {
    showToast(result.error || 'Failed to cancel lock', 'error');
  }
}
