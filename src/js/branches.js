let branchState = { page: 1, pageSize: 50, search: '' };

async function renderBranches() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
    <div class="ml-wrapper">
      <div class="ml-toolbar">
        <div class="ml-search-box">
          <span class="ml-search-icon">&#128269;</span>
          <input type="text" id="branchSearch" placeholder="Search by name, code, or address..." value="${escapeHtml(branchState.search)}">
        </div>
        <button class="ml-btn ml-btn-primary" onclick="searchBranches()">Search</button>
        <div class="ml-toolbar-spacer"></div>
        <button class="ml-btn ml-btn-primary ml-btn-with-icon" onclick="showBranchForm()">
          <span class="ml-btn-icon">&#10010;</span> Add District
        </button>
      </div>

      <div class="ml-table-card">
        <div class="ml-table-header">
          <div class="ml-table-header-left">
            <h3>District</h3>
            <span class="ml-table-count" id="branchTotalCount">Loading...</span>
          </div>
        </div>
        <div class="ml-table-wrapper">
          <table class="ml-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Address</th>
                <th>Contact No.</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="branchBody"></tbody>
          </table>
        </div>
        <div class="ml-table-footer" id="branchPagination"></div>
      </div>
    </div>`;

  document.getElementById('branchSearch').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') searchBranches();
  });

  await loadBranches();
}

function searchBranches() {
  branchState.search = document.getElementById('branchSearch').value.trim();
  branchState.page = 1;
  loadBranches();
}

async function loadBranches() {
  const tbody = document.getElementById('branchBody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px 20px;color:var(--text-light)"><div class="ml-loading-spinner"></div><div style="margin-top:12px">Loading districts...</div></td></tr>';
  try {
    const result = await window.api.getBranches({
      page: branchState.page,
      pageSize: branchState.pageSize,
      search: branchState.search
    });

  if (!result.success) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:40px 20px;color:var(--danger)">Error: ${escapeHtml(result.error)}</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:40px 20px;color:var(--text-light)">No districts found</td></tr>';
  } else {
    tbody.innerHTML = result.data.map(b => `
      <tr>
        <td><strong>${escapeHtml(b.Code || '')}</strong></td>
        <td>${escapeHtml(b.Name || '')}</td>
        <td>${escapeHtml(b.Address || '')}</td>
        <td>${escapeHtml(b.ContactNo || '') || '<span class="ml-na">—</span>'}</td>
        <td><span class="badge ${b.Status === 'Active' ? 'badge-success' : 'badge-warning'}">${escapeHtml(b.Status || 'Active')}</span></td>
        <td>
          <div class="ml-action-group">
            <button class="ml-btn-icon-sm ml-btn-edit" onclick="editBranch(${b.Id})" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="ml-btn-icon-sm ml-btn-delete" onclick="deleteBranch(${b.Id})" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  const totalEl = document.getElementById('branchTotalCount');
  if (totalEl && result.data.length > 0) {
    totalEl.textContent = `${result.total} district${result.total !== 1 ? 's' : ''}`;
  } else if (totalEl) {
    totalEl.textContent = '0 districts';
  }

  renderBranchPagination(result.total, result.page, result.totalPages);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:40px 20px;color:var(--danger)">Error loading districts: ${escapeHtml(err.message || 'Unknown error')}</td></tr>`;
  }
}

function renderBranchPagination(total, page, totalPages) {
  const el = document.getElementById('branchPagination');
  if (!el) return;
  let pages = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    pages.push(i);
  }
  const from = Math.min((page - 1) * branchState.pageSize + 1, total);
  const to = Math.min(page * branchState.pageSize, total);
  el.innerHTML = `
    <div class="ml-pagination-info">
      Showing <strong>${from}</strong>–<strong>${to}</strong> of <strong>${total}</strong> districts
    </div>
    <div class="ml-pagination-controls">
      <button class="ml-page-btn" onclick="goToBranchPage(1)" ${page <= 1 ? 'disabled' : ''} title="First">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
      </button>
      <button class="ml-page-btn" onclick="goToBranchPage(${page - 1})" ${page <= 1 ? 'disabled' : ''} title="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div class="ml-page-numbers">
        ${pages.map(p => `<button class="ml-page-btn ${p === page ? 'active' : ''}" onclick="goToBranchPage(${p})">${p}</button>`).join('')}
      </div>
      <button class="ml-page-btn" onclick="goToBranchPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''} title="Next">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="ml-page-btn" onclick="goToBranchPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''} title="Last">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
      </button>
    </div>
  `;
}

function goToBranchPage(page) {
  branchState.page = page;
  loadBranches();
}

function showBranchForm(data) {
  const isEdit = !!data;
  const overlay = document.createElement('div');
  overlay.className = 'user-drawer-overlay';
  overlay.innerHTML = `
    <div class="user-drawer">
      <div class="user-drawer-header">
        <h3>${isEdit ? 'Edit District' : 'Add District'}</h3>
        <button class="modal-close" onclick="this.closest('.user-drawer-overlay').remove()">&times;</button>
      </div>
      <div class="user-drawer-body">
        <div class="form-grid">
          <div class="form-group">
            <label>District Code <span class="req">*</span></label>
            <input type="text" id="bCode" value="${escapeHtml(data?.Code || '')}" placeholder="e.g. MO, QC, MNL" maxlength="20">
          </div>
          <div class="form-group">
            <label>District Name <span class="req">*</span></label>
            <input type="text" id="bName" value="${escapeHtml(data?.Name || '')}" placeholder="e.g. Main Office, Quezon City">
          </div>
          <div class="form-group mr-field-full">
            <label>Address <span class="req">*</span></label>
            <textarea id="bAddress" rows="3" placeholder="Full district address">${escapeHtml(data?.Address || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Contact No.</label>
            <input type="text" id="bContact" value="${escapeHtml(data?.ContactNo || '')}" placeholder="Optional">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="bStatus">
              <option value="Active" ${data?.Status === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Inactive" ${data?.Status === 'Inactive' ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
      </div>
      <div class="user-drawer-footer">
        <button class="btn btn-secondary" onclick="this.closest('.user-drawer-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="saveBranchForm(${data?.Id || 'null'}); this.closest('.user-drawer-overlay').remove()">${isEdit ? 'Update' : 'Add District'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);
  overlay.addEventListener('click', function(e) {
    if (e.target === this) this.remove();
  });
}

async function editBranch(id) {
  showLoading();
  try {
    const result = await window.api.getBranches({ page: 1, pageSize: 1000, search: '' });
    if (result.success) {
      const branch = result.data.find(b => b.Id === id);
      if (branch) showBranchForm(branch);
      else showToast('District not found', 'error');
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'Failed to load district', 'error');
  }
  hideLoading();
}

async function saveBranchForm(id) {
  const code = document.getElementById('bCode').value.trim();
  const name = document.getElementById('bName').value.trim();
  const address = document.getElementById('bAddress').value.trim();
  const contact = document.getElementById('bContact').value.trim();
  const status = document.getElementById('bStatus').value;

  if (isSystemLocked()) {
    showModal('System Locked', '<p>Data entry is currently disabled. The system is locked for monthly reconciliation.</p>',
      '<button class="btn btn-primary" onclick="closeModal()">OK</button>');
    return;
  }
  if (!code || !name || !address) {
    showToast('Code, Name, and Address are required', 'error');
    return;
  }

  showLoading();
  try {
    const result = await window.api.saveBranch({ Id: id, Code: code, Name: name, Address: address, ContactNo: contact, Status: status });
    if (result.success) {
      showToast(id ? 'District updated successfully' : 'District added successfully');
      loadBranches();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'Failed to save district', 'error');
  }
  hideLoading();
}

async function deleteBranch(id) {
  // Fetch branch name for confirmation
  const result = await window.api.getBranches({ page: 1, pageSize: 1000, search: '' });
  const branch = result.success ? result.data.find(b => b.Id === id) : null;
  const name = branch ? branch.Name : 'this district';

  showModal('Delete District',
    `<p>Are you sure you want to delete <strong>${escapeHtml(name)}</strong>?</p>
     <p style="font-size:13px;color:var(--text-secondary);margin-top:8px">This action cannot be undone.</p>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); confirmDeleteBranch(${id})">Delete</button>`
  );
}

async function confirmDeleteBranch(id) {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  showLoading();
  try {
    const result = await window.api.deleteBranch(id);
    if (result.success) {
      showToast('District deleted successfully');
      loadBranches();
    } else {
      showToast(result.error, 'error');
    }
  } catch (err) {
    showToast(err.message || 'Failed to delete district', 'error');
  }
  hideLoading();
}
