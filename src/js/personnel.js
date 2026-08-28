let personnelState = { page: 1, pageSize: 50, search: '', branchId: '' };

async function renderPersonnel() {
  const area = document.getElementById('contentArea');
  const branchesResult = await window.api.getActiveBranches();
  const branches = branchesResult.success ? branchesResult.data : [];

  area.innerHTML = `
    <div class="ml-wrapper">
      <div class="ml-toolbar">
        <div class="ml-search-box">
          <span class="ml-search-icon">&#128269;</span>
          <input type="text" id="personnelSearch" placeholder="Search by name or position..." value="${escapeHtml(personnelState.search)}">
        </div>
        <select id="personnelBranchFilter" class="ml-select" onchange="onPersonnelBranchFilter()">
          <option value="">All Districts</option>
          ${branches.map(b => `<option value="${b.Id}" ${personnelState.branchId == b.Id ? 'selected' : ''}>${escapeHtml(b.Name)}</option>`).join('')}
        </select>
        <button class="ml-btn ml-btn-primary" onclick="searchPersonnel()">Search</button>
        <div class="ml-toolbar-spacer"></div>
        <button class="ml-btn ml-btn-primary ml-btn-with-icon" onclick="showPersonnelForm()">
          <span class="ml-btn-icon">&#10010;</span> Add Personnel
        </button>
      </div>

      <div class="ml-table-card">
        <div class="ml-table-header">
          <div class="ml-table-header-left">
            <h3>Personnel</h3>
            <span class="ml-table-count" id="personnelTotalCount">Loading...</span>
          </div>
        </div>
        <div class="ml-table-wrapper">
          <table class="ml-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Position</th>
                <th>District</th>
                <th>Contact No.</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="personnelBody"></tbody>
          </table>
        </div>
        <div class="ml-table-footer" id="personnelPagination"></div>
      </div>
    </div>`;

  document.getElementById('personnelSearch').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') searchPersonnel();
  });

  await loadPersonnel();
}

function onPersonnelBranchFilter() {
  personnelState.branchId = document.getElementById('personnelBranchFilter').value;
  personnelState.page = 1;
  loadPersonnel();
}

function searchPersonnel() {
  personnelState.search = document.getElementById('personnelSearch').value.trim();
  personnelState.page = 1;
  loadPersonnel();
}

async function loadPersonnel() {
  const tbody = document.getElementById('personnelBody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:40px 20px;color:var(--text-light)"><div class="ml-loading-spinner"></div><div style="margin-top:12px">Loading personnel...</div></td></tr>';

  const result = await window.api.getPersonnel({
    page: personnelState.page,
    pageSize: personnelState.pageSize,
    search: personnelState.search,
    branchId: personnelState.branchId || null
  });

  if (!result.success) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:40px 20px;color:var(--danger)">Error: ${escapeHtml(result.error)}</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:40px 20px;color:var(--text-light)">No personnel found</td></tr>';
  } else {
    tbody.innerHTML = result.data.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.FullName || '')}</strong></td>
        <td>${escapeHtml(p.Position || '') || '<span class="ml-na">—</span>'}</td>
        <td>${escapeHtml(p.BranchName || '')}</td>
        <td>${escapeHtml(p.ContactNo || '') || '<span class="ml-na">—</span>'}</td>
        <td>${escapeHtml(p.Email || '') || '<span class="ml-na">—</span>'}</td>
        <td><span class="badge ${p.Status === 'Active' ? 'badge-success' : 'badge-warning'}">${escapeHtml(p.Status || 'Active')}</span></td>
        <td>
          <div class="ml-action-group">
            <button class="ml-btn-icon-sm ml-btn-edit" onclick="editPersonnel(${p.Id})" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="ml-btn-icon-sm ml-btn-delete" onclick="deletePersonnel(${p.Id})" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  const totalEl = document.getElementById('personnelTotalCount');
  if (totalEl && result.data.length > 0) {
    totalEl.textContent = `${result.total} personnel`;
  } else if (totalEl) {
    totalEl.textContent = '0 personnel';
  }

  renderPersonnelPagination(result.total, result.page, result.totalPages);
}

function renderPersonnelPagination(total, page, totalPages) {
  const el = document.getElementById('personnelPagination');
  if (!el) return;
  let pages = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    pages.push(i);
  }
  const from = Math.min((page - 1) * personnelState.pageSize + 1, total);
  const to = Math.min(page * personnelState.pageSize, total);
  el.innerHTML = `
    <div class="ml-pagination-info">
      Showing <strong>${from}</strong>–<strong>${to}</strong> of <strong>${total}</strong> personnel
    </div>
    <div class="ml-pagination-controls">
      <button class="ml-page-btn" onclick="goToPersonnelPage(1)" ${page <= 1 ? 'disabled' : ''} title="First">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
      </button>
      <button class="ml-page-btn" onclick="goToPersonnelPage(${page - 1})" ${page <= 1 ? 'disabled' : ''} title="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="ml-page-numbers">
        ${pages.map(p => `<button class="ml-page-btn ${p === page ? 'active' : ''}" onclick="goToPersonnelPage(${p})">${p}</button>`).join('')}
      </div>
      <button class="ml-page-btn" onclick="goToPersonnelPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''} title="Next">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="ml-page-btn" onclick="goToPersonnelPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''} title="Last">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
      </button>
    </div>
  `;
}

function goToPersonnelPage(page) {
  personnelState.page = page;
  loadPersonnel();
}

function showPersonnelForm(data) {
  const isEdit = !!data;
  window.api.getActiveBranches().then(result => {
    const branches = result.success ? result.data : [];
    const overlay = document.createElement('div');
    overlay.className = 'user-drawer-overlay';
    overlay.innerHTML = `
      <div class="user-drawer">
        <div class="user-drawer-header">
          <h3>${isEdit ? 'Edit Personnel' : 'Add Personnel'}</h3>
          <button class="modal-close" onclick="this.closest('.user-drawer-overlay').remove()">&times;</button>
        </div>
        <div class="user-drawer-body">
          <div class="form-grid">
            <div class="form-group mr-field-full">
              <label>Full Name <span class="req">*</span></label>
              <input type="text" id="pFullName" value="${escapeHtml(data?.FullName || '')}" placeholder="Last Name, First Name M.I.">
            </div>
            <div class="form-group">
              <label>Position</label>
              <input type="text" id="pPosition" value="${escapeHtml(data?.Position || '')}" placeholder="e.g. Manager, Staff">
            </div>
            <div class="form-group">
              <label>District <span class="req">*</span></label>
              <select id="pBranch">
                <option value="">Select District</option>
                ${branches.map(b => `<option value="${b.Id}" ${data?.BranchId == b.Id ? 'selected' : ''}>${escapeHtml(b.Name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Contact No.</label>
              <input type="text" id="pContact" value="${escapeHtml(data?.ContactNo || '')}" placeholder="Optional">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="pEmail" value="${escapeHtml(data?.Email || '')}" placeholder="Optional">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="pStatus">
                <option value="Active" ${data?.Status === 'Active' ? 'selected' : ''}>Active</option>
                <option value="Inactive" ${data?.Status === 'Inactive' ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div class="user-drawer-footer">
          <button class="btn btn-secondary" onclick="this.closest('.user-drawer-overlay').remove()">Cancel</button>
          <button class="btn btn-primary" onclick="savePersonnelForm(${data?.Id || 'null'}); this.closest('.user-drawer-overlay').remove()">${isEdit ? 'Update' : 'Add Personnel'}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);
    overlay.addEventListener('click', function(e) {
      if (e.target === this) this.remove();
    });
  });
}

function editPersonnel(id) {
  showLoading();
  window.api.getPersonnel({ page: 1, pageSize: 1000, search: '' }).then(result => {
    hideLoading();
    if (result.success) {
      const p = result.data.find(x => x.Id === id);
      if (p) showPersonnelForm(p);
      else showToast('Personnel not found', 'error');
    } else {
      showToast(result.error, 'error');
    }
  });
}

async function savePersonnelForm(id) {
  if (isSystemLocked()) {
    showModal('System Locked', '<p>Data entry is currently disabled. The system is locked for monthly reconciliation.</p>',
      '<button class="btn btn-primary" onclick="closeModal()">OK</button>');
    return;
  }
  const fullName = document.getElementById('pFullName').value.trim();
  const position = document.getElementById('pPosition').value.trim();
  const branchId = document.getElementById('pBranch').value;
  const contact = document.getElementById('pContact').value.trim();
  const email = document.getElementById('pEmail').value.trim();
  const status = document.getElementById('pStatus').value;

  if (!fullName || !branchId) {
    showToast('Full Name and District are required', 'error');
    return;
  }

  showLoading();
  const result = await window.api.savePersonnel({ Id: id, FullName: fullName, Position: position, BranchId: parseInt(branchId), ContactNo: contact, Email: email, Status: status });
  hideLoading();
  if (result.success) {
    showToast(id ? 'Personnel updated successfully' : 'Personnel added successfully');
    loadPersonnel();
  } else {
    showToast(result.error, 'error');
  }
}

async function deletePersonnel(id) {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  showModal('Delete Personnel',
    `<p>Are you sure you want to delete this personnel record?</p>
     <p style="font-size:13px;color:var(--text-secondary);margin-top:8px">This action cannot be undone.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); confirmDeletePersonnel(${id})">Delete</button>`
  );
}

async function confirmDeletePersonnel(id) {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  showLoading();
  try {
    const result = await window.api.deletePersonnel(id);
    if (result.success) {
      showToast('Personnel deleted successfully');
      loadPersonnel();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'Failed to delete personnel', 'error');
  }
  hideLoading();
}
