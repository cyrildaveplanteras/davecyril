let remittanceState = { page: 1, pageSize: 25, search: '' };
let remittanceDetails = [];
let editingRemittanceId = null;
let remittanceRowCounter = 0;
let commissionConfig = null;

// Central Sales Coordinator commission: exactly ₱120 per qualifying transaction.
// Single source of truth: src/js/business-rules.js (mirrors main.js).
const RULES = (typeof window !== 'undefined' && window.BusinessRules) ? window.BusinessRules : { RULES: { SALES_COORDINATOR_COMMISSION: 120, MF_THRESHOLD: 350, ALT_THRESHOLD: 250, MSC_MINIMUM: 300 }, calcCommission: (mf, msc, purpose, cfg) => { const c = cfg || { MFThreshold: 350, COMAmount: 120, COMAmountAlt: 120, AltThreshold: 250 }; if ((parseFloat(mf) || 0) >= c.AltThreshold) return 120; return 0; }, normalizeConfig: (c) => c };
const SALES_COORDINATOR_COMMISSION = RULES.RULES.SALES_COORDINATOR_COMMISSION;
const MSC_MINIMUM = RULES.RULES.MSC_MINIMUM;

async function getCommissionConfig() {
  if (commissionConfig) return commissionConfig;
  try {
    const result = await window.api.getBusinessRules();
    if (result.success) {
      commissionConfig = result.commission;
      return commissionConfig;
    }
  } catch (err) {
    console.error('getBusinessRules error:', err);
  }
  try {
    const result = await window.api.getCommissionConfig();
    if (result.success) {
      commissionConfig = result.config;
    } else {
      commissionConfig = RULES.normalizeConfig(null);
    }
  } catch (err) {
    console.error('getCommissionConfig error:', err);
    commissionConfig = RULES.normalizeConfig(null);
  }
  return commissionConfig;
}

function calcCOM(mf, msc, cfg, paymentPurpose) {
  return RULES.calcCommission(mf, msc, paymentPurpose, cfg || commissionConfig || null);
}

async function renderRemittance(newMemberId) {
  try {
    commissionConfig = null;
    editingRemittanceId = null;
    remittanceDetails = [];
remittanceRowCounter = 0;

    const area = document.getElementById('contentArea');
    if (!area) return;

    const pendingResult = await window.api.getPendingRemittances();
    const pendingMembers = (pendingResult.success ? pendingResult.data : []);

    const pendingHtml = pendingMembers.length === 0
      ? '<p style="color:var(--text-light);text-align:center;padding:16px">No members waiting for remittance</p>'
      : `<table class="ml-table"><thead><tr>
           <th style="width:110px">AF No.</th>
           <th>Member Name</th>
           <th style="width:130px">Registration Date</th>
           <th style="width:100px">Action</th>
         </tr></thead><tbody>
           ${pendingMembers.map(p => `
             <tr${newMemberId && p.member_id === newMemberId ? ' style="background:var(--primary-light)"' : ''}>
               <td><strong>${escapeHtml(p.af_no)}</strong></td>
               <td>${escapeHtml(p.full_name)}</td>
               <td>${formatDate(p.registration_date)}</td>
               <td><button class="btn btn-primary btn-sm" onclick="loadPendingMember(${p.member_id})" style="font-size:11px;padding:4px 10px">Process</button></td>
             </tr>`).join('')}
         </tbody></table>`;

    // Fetch branches and personnel for dropdowns
    const branchesResult = await window.api.getActiveBranches();
    const activeBranches = branchesResult.success ? branchesResult.data : [];

    area.innerHTML = `
      <div class="card" id="pendingRemittanceCard">
        <div class="card-header">
          <h3>
            <span style="display:inline-block;width:10px;height:10px;background:#F59E0B;border-radius:50%;margin-right:8px;vertical-align:middle"></span>
            Waiting for Remittance
          </h3>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:13px;color:var(--text-secondary)" id="pendingCount">${pendingMembers.length} member(s) pending</span>
            <button class="btn btn-success btn-sm" id="processAllBtn" onclick="processAllPendingMembers()" ${pendingMembers.length === 0 ? 'disabled' : ''} style="font-size:11px;padding:4px 10px">Process All</button>
          </div>
        </div>
        <div class="card-body" id="pendingBody">${pendingHtml}</div>
      </div>

      <div class="card mt-4" id="remittanceFormCard">
        <div class="card-header"><h3>Monthly Remittance Slip</h3>
          <div class="btn-group">
            <button class="btn btn-primary" onclick="saveRemittanceSlip()" ${isSystemLocked() ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>Save & Complete Remittance</button>
            <button class="btn btn-outline" onclick="clearRemittanceForm()">Clear</button>
            <button class="btn btn-secondary" onclick="printRemittanceSlip()">Print Slip</button>
          </div>
        </div>
        <div class="card-body">
          <div class="slip-header">
            <h2>GOLDENHOPE</h2>
            <p>Monthly Remittance Slip</p>
            <div class="form-grid mt-2">
              <div class="form-group"><label>Remittance No.</label><input type="text" id="rNo" readonly placeholder="Auto-generated"></div>
              <div class="form-group"><label>Date of Deposit</label><input type="date" id="rDate"></div>
              <div class="form-group"><label>District</label><select id="rBranch" onchange="onBranchChange()"><option value="">Select District</option>
                ${activeBranches.map(b => `<option value="${b.Id}" data-address="${escapeHtml(b.Address)}">${escapeHtml(b.Name)}</option>`).join('')}
              </select></div>
              <div class="form-group"><label>Prepared By</label><select id="rPreparedBy"><option value="">Select Personnel / Coordinator</option></select></div>
              <div class="form-group"><label>Verified By</label><select id="rVerifiedBy"><option value="">Select Personnel / Coordinator</option></select></div>
            </div>
          </div>

          <div class="toolbar">
            <button class="btn btn-primary" onclick="addBlankRow()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Member
            </button>
            <span class="spacer"></span>
            <span style="font-size:13px;color:var(--text-secondary)" id="rRowCount">0 member(s)</span>
          </div>

          <div class="detail-table" style="max-height:420px;overflow-y:auto">
            <table><thead><tr>
              <th style="width:40px">#</th>
              <th style="width:100px">AF No.</th>
              <th>Member Name</th>
              <th style="width:130px">Sales Coordinator</th>
              <th style="width:140px">Payment Type</th>
              <th style="width:110px">MF (₱)</th>
              <th style="width:90px">MSC (₱)</th>
              <th style="width:90px">Total (₱)</th>
              <th style="width:90px">COM (₱)</th>
              <th style="width:100px">Net Deposit (₱)</th>
              <th style="width:90px">Actions</th>
            </tr></thead>
            <tbody id="rDetailsBody"></tbody>
          </table></div>

          <div class="detail-row mt-4" style="grid-template-columns:1fr 1fr 1fr 1fr 1fr">
            <span class="detail-label">Total MF:</span><span class="detail-value" id="rTotalMF">₱0.00</span>
            <span class="detail-label">Total MSC:</span><span class="detail-value" id="rTotalMSC">₱0.00</span>
            <span class="detail-label">Total HDA:</span><span class="detail-value" id="rTotalHDA">₱0.00</span>
            <span class="detail-label">Total COM:</span><span class="detail-value" id="rTotalCOM">₱0.00</span>
            <span class="detail-label" style="color:var(--primary);font-weight:700">Total Net Deposit:</span>
            <span class="detail-value" id="rTotalNet" style="color:var(--primary);font-weight:700">₱0.00</span>
          </div>
        </div>
      </div>

      <div class="card mt-4">
        <div class="card-header"><h3>Remittance History</h3></div>
        <div class="card-body">
          <div class="search-bar">
            <input type="text" id="rhSearch" placeholder="Search remittance no. or prepared by..." value="${escapeHtml(remittanceState.search)}">
            <button class="btn btn-primary btn-sm" onclick="searchRemittanceHistory()">Search</button>
          </div>
          <div class="table-container"><table class="ml-table"><thead><tr>
            <th>Remittance No.</th><th>Date</th><th>Prepared By</th><th>Verified By</th><th>Status</th><th>Items</th><th>Total Deposit</th><th>Actions</th>
          </tr></thead><tbody id="rhBody"></tbody></table></div>
          <div class="pagination" id="rhPagination"></div>
        </div>
      </div>`;

    document.getElementById('rDate').value = new Date().toISOString().slice(0, 10);
    const rhSearch = document.getElementById('rhSearch');
    if (rhSearch) {
      rhSearch.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') searchRemittanceHistory();
      });
    }

    if (newMemberId) {
      await autoAddMemberToSlip(newMemberId);
    } else if (pendingMembers.length > 0) {
      await autoAddMemberToSlip(pendingMembers[0].member_id);
    }

    loadRemittanceHistory();
  } catch (err) {
    console.error('renderRemittance error:', err);
    const area = document.getElementById('contentArea');
    if (area) {
      area.innerHTML = '<div class="card"><div class="card-body"><p style="color:var(--danger);text-align:center;padding:20px">Failed to load remittance page. Please try again.</p></div></div>';
    }
  }
}

async function autoAddMemberToSlip(memberId) {
  try {
  const result = await window.api.getMember(memberId);
  if (!result.success || !result.data) {
    showToast('Could not load member details', 'error');
    return;
  }
  const m = result.data;
  const cfg = await getCommissionConfig();
  const mf = parseFloat(m.membership_fee) || 0;
  const msc = MSC_MINIMUM;
  // Registration remittance: the member's membership fee (MF) qualifies for the
  // flat ₱120 Sales Coordinator commission, exactly like a renewal. Only when
  // the member has no qualifying MF is this an MSC-only deposit (COM = 0).
  const paymentPurpose = mf >= RULES.RULES.ALT_THRESHOLD ? 'both' : 'msc';
  const com = calcCOM(mf, msc, cfg, paymentPurpose);
  remittanceRowCounter++;
  remittanceDetails.push({
    rowId: remittanceRowCounter,
    memberId: m.Id,
    AFNo: m.af_no,
    MemberName: m.full_name,
    SalesCoordinator: m.SalesCoordinator || '',
    membershipStatus: m.membership_status || '',
    honoraryYears: m.honorary_years_completed || 0,
    paymentPurpose,
    MF: mf,
    MSC: msc,
    Savings: 0,
    Total: mf + msc,
    COM: com,
    NetDeposit: mf + msc - com
  });
  renderRemittanceDetails();
  showToast(`${m.full_name} added to remittance slip`);
  } catch (err) {
    console.error('autoAddMemberToSlip error:', err);
    showToast(err.message || 'Failed to add member to slip', 'error');
  }
}

async function processAllPendingMembers() {
  try {
    const result = await window.api.getPendingRemittances();
    const pendingMembers = result.success ? result.data : [];
    if (pendingMembers.length === 0) {
      showToast('No members waiting for remittance', 'info');
      return;
    }
    const existingIds = new Set(remittanceDetails.map(d => d.memberId));
    const toProcess = pendingMembers.filter(p => !existingIds.has(p.member_id));
    if (toProcess.length === 0) {
      showToast('All pending members are already in the slip', 'info');
      return;
    }
    for (const p of toProcess) {
      await autoAddMemberToSlip(p.member_id);
    }
    showToast(`${toProcess.length} member(s) added to remittance slip`);
  } catch (err) {
    console.error('processAllPendingMembers error:', err);
    showToast(err.message || 'Failed to process pending members', 'error');
  }
}

async function loadPendingMember(memberId) {
  try {
    const exists = remittanceDetails.some(d => d.memberId === memberId);
    if (exists) {
      showToast('Member is already in the remittance slip', 'warning');
      return;
    }
    await autoAddMemberToSlip(memberId);
  } catch (err) {
    console.error('loadPendingMember error:', err);
    showToast('Failed to load member', 'error');
  }
}

async function refreshPendingList() {
  try {
    const pendingBody = document.getElementById('pendingBody');
    const pendingCount = document.getElementById('pendingCount');
    const processAllBtn = document.getElementById('processAllBtn');
    if (!pendingBody) return;
    const result = await window.api.getPendingRemittances();
    const pendingMembers = result.success ? result.data : [];
    if (pendingCount) pendingCount.textContent = `${pendingMembers.length} member(s) pending`;
    if (processAllBtn) processAllBtn.disabled = pendingMembers.length === 0;
    if (pendingMembers.length === 0) {
      pendingBody.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:16px">No members waiting for remittance</p>';
    } else {
      pendingBody.innerHTML = `<table class="ml-table"><thead><tr>
        <th style="width:110px">AF No.</th>
        <th>Member Name</th>
        <th style="width:130px">Registration Date</th>
        <th style="width:100px">Action</th>
      </tr></thead><tbody>
        ${pendingMembers.map(p => `
          <tr>
            <td><strong>${escapeHtml(p.af_no)}</strong></td>
            <td>${escapeHtml(p.full_name)}</td>
            <td>${formatDate(p.registration_date)}</td>
            <td><button class="btn btn-primary btn-sm" onclick="loadPendingMember(${p.member_id})" style="font-size:11px;padding:4px 10px">Process</button></td>
          </tr>`).join('')}
      </tbody></table>`;
    }
  } catch (err) {
    console.error('refreshPendingList error:', err);
  }
}

function addBlankRow() {
  remittanceRowCounter++;
  const rowId = remittanceRowCounter;
  const cfg = commissionConfig || RULES.normalizeConfig(null);
  const defaultMF = RULES.RULES.MF_OPTIONS[0];
  const com = calcCOM(defaultMF, 0, cfg);
  remittanceDetails.push({
    rowId,
    memberId: null,
    AFNo: '',
    MemberName: '',
    SalesCoordinator: '',
    membershipStatus: '',
    honoraryYears: 0,
    paymentPurpose: 'msc',
    MF: defaultMF,
    MSC: 0,
    Savings: 0,
    Total: defaultMF,
    COM: com,
    NetDeposit: defaultMF - com
  });
  renderRemittanceDetails();
}

async function populatePersonnelDropdowns(branchId, prepValue, verValue) {
  const prepSelect = document.getElementById('rPreparedBy');
  const verSelect = document.getElementById('rVerifiedBy');
  if (!prepSelect || !verSelect) return;
  prepSelect.innerHTML = '<option value="">Select Personnel / Coordinator</option>';
  verSelect.innerHTML = '<option value="">Select Personnel / Coordinator</option>';
  let personnelHtml = '';
  let coordHtml = '';
  if (branchId) {
    const [pResult, cResult] = await Promise.all([
      window.api.getPersonnelByBranch(parseInt(branchId)),
      window.api.getActiveCoordinators('sales')
    ]);
    if (pResult.success && pResult.data.length > 0) {
      personnelHtml = pResult.data.map(p => `<option value="${p.Id}">${escapeHtml(p.FullName)}</option>`).join('');
    }
    if (cResult.success && cResult.data.length > 0) {
      coordHtml = cResult.data.map(c => `<option value="coord_${c.Id}">${escapeHtml(c.FullName)}</option>`).join('');
    }
  }
  let html = '<option value="">Select Personnel / Coordinator</option>';
  if (personnelHtml) {
    html += '<optgroup label="Personnel">' + personnelHtml + '</optgroup>';
  }
  if (coordHtml) {
    html += '<optgroup label="Sales Coordinators">' + coordHtml + '</optgroup>';
  }
  prepSelect.innerHTML = html;
  verSelect.innerHTML = html;
  if (prepValue) {
    const found = prepSelect.querySelector(`option[value="${prepValue}"]`);
    if (found) prepSelect.value = prepValue;
  }
  if (verValue) {
    const found = verSelect.querySelector(`option[value="${verValue}"]`);
    if (found) verSelect.value = verValue;
  }
}

async function onBranchChange() {
  try {
  const branchId = document.getElementById('rBranch').value;
  if (!branchId) {
    const prepSelect = document.getElementById('rPreparedBy');
    const verSelect = document.getElementById('rVerifiedBy');
    if (prepSelect) prepSelect.innerHTML = '<option value="">Select Personnel / Coordinator</option>';
    if (verSelect) verSelect.innerHTML = '<option value="">Select Personnel / Coordinator</option>';
    return;
  }
  await populatePersonnelDropdowns(branchId, null, null);
  } catch (err) {
    console.error('onBranchChange error:', err);
    showToast(err.message || 'Failed to load personnel', 'error');
  }
}

function removeRow(index) {
  remittanceDetails.splice(index, 1);
  renderRemittanceDetails();
}

function clearRow(index) {
  const d = remittanceDetails[index];
  const cfg = commissionConfig || RULES.normalizeConfig(null);
  const defaultMF = RULES.RULES.MF_OPTIONS[0];
  const com = calcCOM(defaultMF, 0, cfg);
  d.memberId = null;
  d.AFNo = '';
  d.MemberName = '';
  d.SalesCoordinator = '';
  d.paymentPurpose = 'mf';
  d.MF = defaultMF;
  d.MSC = 0;
  d.Savings = 0;
  d.Total = defaultMF;
  d.COM = com;
  d.NetDeposit = defaultMF - com;
  renderRemittanceDetails();
}

async function selectMemberForRow(index) {
  try {
  const result = await window.api.getMemberOptions();
  const members = result.data || [];
  if (!result.success || members.length === 0) {
    showToast('No members found', 'warning');
    return;
  }

  const options = members.map(m =>
    `<option value="${m.Id}" data-afno="${escapeHtml(m.af_no)}" data-name="${escapeHtml(m.full_name)}" data-sc="${escapeHtml(m.SalesCoordinator || '')}" data-hy="${m.honorary_years_completed || 0}" data-ms="${escapeHtml(m.membership_status || 'Regular')}">${escapeHtml(m.af_no)} - ${escapeHtml(m.full_name)} (${escapeHtml(m.membership_status || 'Regular')})</option>`
  ).join('');

  showModal('Select Member',
    `<div class="form-group"><label>Search and select a member</label>
     <input type="text" id="memberSearchInput" placeholder="Type to filter..." onkeyup="filterMemberOptions()" style="margin-bottom:8px">
     <select id="selectMember" size="6" style="min-height:160px;width:100%">${options}</select></div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-primary" onclick="assignMemberToRow(${index})">Select Member</button>`
  );
  document.getElementById('memberSearchInput').focus();
  } catch (err) {
    console.error('selectMemberForRow error:', err);
    showToast(err.message || 'Failed to load members', 'error');
  }
}

function filterMemberOptions() {
  const q = document.getElementById('memberSearchInput').value.toLowerCase();
  Array.from(document.getElementById('selectMember').options).forEach(opt => {
    opt.style.display = opt.text.toLowerCase().includes(q) ? '' : 'none';
  });
}

async function assignMemberToRow(index) {
  const sel = document.getElementById('selectMember');
  if (!sel.value) { showToast('Please select a member', 'warning'); return; }
  const opt = sel.options[sel.selectedIndex];
  const memberId = parseInt(opt.value);
  const afNo = opt.dataset.afno;
  const name = opt.dataset.name;
  const sc = opt.dataset.sc;

  const isDuplicate = remittanceDetails.some((d, i) => i !== index && d.memberId === memberId && d.AFNo);
  if (isDuplicate) {
    showToast(`${name} is already in this remittance slip`, 'warning');
    return;
  }

  closeModal();
  const d = remittanceDetails[index];
  d.memberId = memberId;
  d.AFNo = afNo;
  d.MemberName = name;
  d.SalesCoordinator = sc;
  d.membershipStatus = opt.dataset.ms || 'Regular';
  d.honoraryYears = parseInt(opt.dataset.hy) || 0;
  await updateRowCalculations(index);
  renderRemittanceDetails();
}

async function updateRowPurpose(index) {
  const d = remittanceDetails[index];
  const mscMin = RULES.RULES.MSC_MINIMUM;
  const mfDefault = RULES.RULES.MF_DEFAULT;
  const mfAlt = RULES.RULES.MF_ALT;
  const hdaAmt = RULES.RULES.HDA_AMOUNT;
  if (d.paymentPurpose === 'msc') {
    if (!d.MSC || d.MSC < mscMin) d.MSC = mscMin;
    d.MF = 0;
    d.HDA = 0;
  } else if (d.paymentPurpose === 'mf') {
    d.MSC = 0;
    d.HDA = 0;
    if (!d.MF || d.MF < mfDefault) d.MF = mfAlt;
  } else if (d.paymentPurpose === 'both') {
    d.HDA = 0;
    if (!d.MF || d.MF < mfDefault) d.MF = mfAlt;
    if (!d.MSC || d.MSC < mscMin) d.MSC = mscMin;
  } else if (d.paymentPurpose === 'hda') {
    d.MF = 0;
    d.MSC = 0;
    d.HDA = hdaAmt;
  }
  await updateRowCalculations(index);
  renderRemittanceDetails();
}

async function updateRowCalculations(index) {
  const d = remittanceDetails[index];
  const mf = parseFloat(d.MF) || 0;
  const msc = parseFloat(d.MSC) || 0;
  const hda = parseFloat(d.HDA) || 0;
  const cfg = await getCommissionConfig();
  const com = calcCOM(mf, msc, cfg, d.paymentPurpose);
  const total = mf + msc + hda;
  d.COM = com;
  d.Total = total;
  d.NetDeposit = total - com;
}

async function recalcRow(rowId, field, value) {
  const d = remittanceDetails.find(r => r.rowId === rowId);
  if (!d) return;
  d[field] = parseFloat(value) || 0;
  await updateRowCalculations(remittanceDetails.indexOf(d));
  renderRemittanceDetails();
}

function renderRemittanceDetails() {
  const tbody = document.getElementById('rDetailsBody');
  if (remittanceDetails.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center" style="padding:24px;color:var(--text-light)">No members added yet. Click <strong>Add Member</strong> to begin.</td></tr>';
  } else {
    tbody.innerHTML = remittanceDetails.map((d, i) => {
      const hasMember = !!(d.memberId || d.AFNo);
      return `<tr>
        <td style="text-align:center;font-weight:600;color:var(--text-secondary)">${i + 1}</td>
        <td>${hasMember ? escapeHtml(d.AFNo) : '<span style="color:var(--text-light)">—</span>'}</td>
        <td>
          ${hasMember
            ? `<div style="display:flex;align-items:center;gap:6px"><span style="font-weight:600">${escapeHtml(d.MemberName)}</span>${d.membershipStatus === 'Honorary' ? `<span style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;color:#D97706;white-space:nowrap">${d.honoraryYears}/10</span>` : ''}</div>`
            : `<button class="btn btn-primary btn-sm" onclick="selectMemberForRow(${i})" style="font-size:11px;padding:4px 10px">Select Member</button>`
          }
        </td>
        <td style="color:var(--text-secondary);font-size:12px">${escapeHtml(d.SalesCoordinator) || '<span style="color:var(--text-light)">—</span>'}</td>
        <td>
          <select onchange="remittanceDetails[${i}].paymentPurpose=this.value;updateRowPurpose(${i})"
            style="width:100%;padding:5px 6px;font-size:12px;font-weight:600;border:1.5px solid var(--border);border-radius:6px;outline:none;cursor:pointer;
              background:${d.paymentPurpose === 'msc' ? '#0D9488' : d.paymentPurpose === 'both' ? '#8B5CF6' : d.paymentPurpose === 'hda' ? '#D97706' : 'var(--primary)'};color:#fff">
            <option value="mf" ${d.paymentPurpose === 'mf' ? 'selected' : ''} style="background:#fff;color:#1F2937;font-weight:400">MF</option>
            <option value="msc" ${d.paymentPurpose === 'msc' ? 'selected' : ''} style="background:#fff;color:#1F2937;font-weight:400">MSC</option>
            <option value="both" ${d.paymentPurpose === 'both' ? 'selected' : ''} style="background:#fff;color:#1F2937;font-weight:400">Both</option>
            <option value="hda" ${d.paymentPurpose === 'hda' ? 'selected' : ''} style="background:#fff;color:#1F2937;font-weight:400">HDA</option>
          </select>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:3px;opacity:${d.paymentPurpose === 'msc' || d.paymentPurpose === 'hda' ? '0.4' : '1'}">
            <span style="font-size:13px;font-weight:700;color:var(--text-secondary)">₱</span>
            <select ${d.paymentPurpose === 'msc' || d.paymentPurpose === 'hda' ? 'disabled' : ''}
              onchange="remittanceDetails[${i}].MF=parseFloat(this.value);recalcRow(${d.rowId},'MF',this.value)"
              style="flex:1;min-width:0;padding:4px 4px;font-size:12px;font-weight:600;border:1.5px solid var(--border);border-radius:6px;outline:none;cursor:pointer;background:var(--bg-card);color:var(--text-primary)">
              ${![250, 350].some(v => Math.abs(d.MF - v) < 0.01) && d.memberId ? `<option value="${d.MF}" selected>${d.MF}</option>` : ''}
              <option value="250" ${Math.abs(d.MF - 250) < 0.01 ? 'selected' : ''}>250</option>
              <option value="350" ${Math.abs(d.MF - 350) < 0.01 ? 'selected' : ''}>350</option>
            </select>
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:3px;opacity:${d.paymentPurpose === 'mf' || d.paymentPurpose === 'hda' ? '0.4' : '1'}">
            <span style="font-size:13px;font-weight:700;color:var(--text-secondary)">₱</span>
            <input type="number" step="0.01" min="${RULES.RULES.MSC_MINIMUM}" value="${d.MSC || RULES.RULES.MSC_MINIMUM}" ${d.paymentPurpose === 'mf' || d.paymentPurpose === 'hda' ? 'disabled' : ''}
              onchange="recalcRow(${d.rowId},'MSC',this.value)"
              style="flex:1;min-width:0;padding:4px 4px;font-size:12px;border:1.5px solid var(--border);border-radius:6px;outline:none;text-align:right">
          </div>
        </td>
        <td style="text-align:right;font-weight:600">${formatCurrency(d.Total)}</td>
        <td style="text-align:right;color:var(--text-secondary)">${formatCurrency(d.COM)}</td>
        <td style="text-align:right;font-weight:700;color:var(--primary)">${formatCurrency(d.NetDeposit)}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="ml-btn-icon-sm ml-btn-edit" onclick="clearRow(${i})" title="Clear Row">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <button class="ml-btn-icon-sm ml-btn-delete" onclick="removeRow(${i})" title="Remove Row">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  const countEl = document.getElementById('rRowCount');
  if (countEl) {
    const valid = remittanceDetails.filter(d => d.memberId).length;
    countEl.textContent = `${valid} member(s)`;
  }

  const totals = remittanceDetails.reduce((acc, d) => ({
    mf: acc.mf + d.MF,
    msc: acc.msc + d.MSC,
    hda: acc.hda + (d.HDA || 0),
    com: acc.com + d.COM,
    net: acc.net + d.NetDeposit
  }), { mf: 0, msc: 0, hda: 0, com: 0, net: 0 });

  const mfEl = document.getElementById('rTotalMF');
  const mscEl = document.getElementById('rTotalMSC');
  const hdaEl = document.getElementById('rTotalHDA');
  const comEl = document.getElementById('rTotalCOM');
  const netEl = document.getElementById('rTotalNet');
  if (mfEl) mfEl.textContent = formatCurrency(totals.mf);
  if (mscEl) mscEl.textContent = formatCurrency(totals.msc);
  if (hdaEl) hdaEl.textContent = formatCurrency(totals.hda);
  if (comEl) comEl.textContent = formatCurrency(totals.com);
  if (netEl) netEl.textContent = formatCurrency(totals.net);
}

let _savingRemittance = false;
function _resetSaveGuard() { _savingRemittance = false; const b = document.querySelector('button[onclick="saveRemittanceSlip()"]'); if (b) b.disabled = false; }

async function saveRemittanceSlip() {
  if (_savingRemittance) return;
  _savingRemittance = true;
  const btn = document.querySelector('button[onclick="saveRemittanceSlip()"]');
  if (btn) btn.disabled = true;
  try {
    const user = getCurrentUser();
    if (remittanceDetails.length === 0) { showToast('Add at least one member to the slip', 'error'); return; }

    const date = document.getElementById('rDate').value;
    const branchId = document.getElementById('rBranch').value;
    const prepSelect = document.getElementById('rPreparedBy');
    const verSelect = document.getElementById('rVerifiedBy');
    let preparedById = prepSelect.value;
    let verifiedById = verSelect.value;
    let preparedBy = prepSelect.options[prepSelect.selectedIndex]?.text || '';
    let verifiedBy = verSelect.options[verSelect.selectedIndex]?.text || '';
    // Handle sales coordinator selection (prefixed with coord_)
    if (preparedById && preparedById.startsWith('coord_')) {
      preparedById = null;
      if (preparedBy && !preparedBy.includes('(Sales Coordinator)')) {
        preparedBy = preparedBy.trim() + ' (Sales Coordinator)';
      }
    } else if (preparedById) {
      preparedById = parseInt(preparedById);
    }
    if (verifiedById && verifiedById.startsWith('coord_')) {
      verifiedById = null;
      if (verifiedBy && !verifiedBy.includes('(Sales Coordinator)')) {
        verifiedBy = verifiedBy.trim() + ' (Sales Coordinator)';
      }
    } else if (verifiedById) {
      verifiedById = parseInt(verifiedById);
    }
    if (!date || !branchId) { showToast('Date and District are required', 'error'); return; }
    if (!preparedById && !preparedBy) { showToast('Please select Prepared By personnel', 'error'); return; }

    const errors = [];
    const validRows = [];
    remittanceDetails.forEach((d, i) => {
      if (!d.memberId) {
        errors.push(`Row ${i + 1}: No member selected`);
        return;
      }
      if ((d.paymentPurpose === 'mf' || d.paymentPurpose === 'both') && (d.MF <= 0)) {
        errors.push(`Row ${i + 1} (${d.MemberName}): Enter a membership fee`);
        return;
      }
      if ((d.paymentPurpose === 'msc' || d.paymentPurpose === 'both') && (d.MSC <= 0)) {
        errors.push(`Row ${i + 1} (${d.MemberName}): Enter an MSC deposit amount`);
        return;
      }
      if (d.paymentPurpose === 'hda' && (!d.HDA || d.HDA <= 0)) {
        errors.push(`Row ${i + 1} (${d.MemberName}): HDA amount is required`);
        return;
      }
      validRows.push(d);
    });

    if (errors.length > 0) {
      showModal('Validation Errors',
        `<div style="color:var(--danger);font-weight:600;margin-bottom:8px">Please fix the following errors:</div>
         <ul style="font-size:13px;color:var(--text-secondary);padding-left:20px">
           ${errors.map(e => `<li style="margin-bottom:4px">${e}</li>`).join('')}
         </ul>`,
        `<button class="btn btn-primary" onclick="closeModal()">OK</button>`
      );
      return;
    }

    if (validRows.length === 0) { showToast('No valid rows to save', 'error'); return; }

    const totals = validRows.reduce((acc, d) => ({ deposit: acc.deposit + d.NetDeposit }), { deposit: 0 });

    if (isSystemLocked()) {
      showModal('System Locked',
        `<p>The system is currently locked for monthly reconciliation. You cannot save remittances while the system is locked.</p>`,
        '<button class="btn btn-primary" onclick="closeModal()">OK</button>'
      );
      return;
    }

    showLoading();
    const now = new Date();
    const currentDateDeposit = now.toISOString().slice(0, 10);
    try {
      const result = await window.api.saveRemittance(
        { Id: editingRemittanceId, DateDeposit: date || currentDateDeposit, TotalDeposit: totals.deposit, BranchId: parseInt(branchId), PreparedBy: preparedBy, PreparedById: parseInt(preparedById), VerifiedBy: verifiedBy, VerifiedById: verifiedById ? parseInt(verifiedById) : null, Status: 'Completed' },
        validRows,
        user?.id
      );
      hideLoading();

      if (result.success) {
        for (const d of validRows) {
          if (d.memberId) {
            await window.api.removePendingRemittanceByMemberId(d.memberId);
          }
        }
        showToast(`${validRows.length} member payment(s) were successfully recorded`);
        clearRemittanceForm();
        loadRemittanceHistory();
        refreshNotificationBadge();
        await refreshPendingList();
      } else {
        showToast(result.error, 'error');
      }
    } catch (err) {
      hideLoading();
      showToast(err.message || 'Failed to save remittance slip', 'error');
    }
  } finally {
    _resetSaveGuard();
  }
}

function clearRemittanceForm() {
  editingRemittanceId = null;
  remittanceDetails = [];
  remittanceRowCounter = 0;
  const noEl = document.getElementById('rNo');
  if (noEl) noEl.value = '';
  const dateEl = document.getElementById('rDate');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
  const branchEl = document.getElementById('rBranch');
  if (branchEl) branchEl.value = '';
  const prepEl = document.getElementById('rPreparedBy');
  if (prepEl) { prepEl.innerHTML = '<option value="">Select Personnel / Coordinator</option>'; }
  const verEl = document.getElementById('rVerifiedBy');
  if (verEl) { verEl.innerHTML = '<option value="">Select Personnel / Coordinator</option>'; }
  renderRemittanceDetails();
}

function printRemittanceSlip() {
  printCurrentRemittanceSlip();
}

async function loadRemittanceHistory() {
  try {
    const tbody = document.getElementById('rhBody');
    if (!tbody) return;
    const _canManage = ['Admin', 'Branch Manager'].includes(getCurrentUser()?.role);
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:20px;color:var(--text-light)">Loading...</td></tr>';
    const result = await window.api.getRemittances({ page: remittanceState.page, pageSize: remittanceState.pageSize, search: remittanceState.search });
    if (!result.success) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:20px;color:var(--danger)">Error loading history</td></tr>`;
      return;
    }
    if (result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:20px;color:var(--text-light)">No remittances found</td></tr>';
    } else {
      tbody.innerHTML = result.data.map(r =>
        `<tr>
          <td><strong>${escapeHtml(r.RemittanceNo || '')}</strong></td>
          <td>${formatDate(r.DateDeposit)}</td>
          <td>${escapeHtml(r.PreparedBy || '')}</td>
          <td>${escapeHtml(r.VerifiedBy || '')}</td>
          <td><span class="badge ${r.Status === 'Completed' ? 'badge-success' : 'badge-warning'}">${escapeHtml(r.Status || 'Draft')}</span></td>
          <td class="text-center">${r.ItemCount || 0}</td>
          <td>${formatCurrency(r.TotalDeposit)}</td>
<td style="white-space:nowrap">
            <button class="btn btn-primary btn-sm" onclick="printRemittanceHistoryItem(${r.Id})" title="Print Slip" style="padding:4px 8px;font-size:10px">Print</button>
            ${_canManage ? `<button class="btn btn-danger btn-sm" onclick="deleteRemittance(${r.Id})" style="padding:4px 8px;font-size:10px">Delete</button>` : ''}
          </td>
        </tr>`
      ).join('');
    }
    renderRemPagination(result.total, result.page, result.totalPages);
  } catch (err) {
    console.error('loadRemittanceHistory error:', err);
    const tbody = document.getElementById('rhBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:20px;color:var(--danger)">Failed to load history</td></tr>';
  }
}

function renderRemPagination(total, page, totalPages) {
  const el = document.getElementById('rhPagination');
  if (!el) return;
  let pages = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) pages.push(i);
  el.innerHTML = `
    <span class="pagination-info">${total} remittances</span>
    <div class="pagination-controls">
      <button onclick="goRemPage(1)" ${page <= 1 ? 'disabled' : ''}>&#171;</button>
      <button onclick="goRemPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>&#8249;</button>
      ${pages.map(p => `<button class="${p === page ? 'active' : ''}" onclick="goRemPage(${p})">${p}</button>`).join('')}
      <button onclick="goRemPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>&#8250;</button>
      <button onclick="goRemPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''}>&#187;</button>
    </div>`;
}

function goRemPage(page) {
  remittanceState.page = page;
  loadRemittanceHistory();
}

function searchRemittanceHistory() {
  remittanceState.search = document.getElementById('rhSearch').value.trim();
  remittanceState.page = 1;
  loadRemittanceHistory();
}

async function deleteRemittance(id) {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  showModal('Delete Remittance', '<p>Are you sure you want to delete this remittance?</p>',
    `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
     <button class="btn btn-danger" onclick="closeModal(); confirmDeleteRemittance(${id})">Delete</button>`
  );
}

async function confirmDeleteRemittance(id) {
  if (isSystemLocked()) { showToast('System is locked. Changes cannot be made.', 'error'); return; }
  showLoading();
  try {
    const result = await window.api.deleteRemittance(id);
    if (result.success) { showToast('Remittance deleted'); loadRemittanceHistory(); }
    else { showToast(result.error, 'error'); }
  } catch (err) {
    showToast(err.message || 'Failed to delete remittance', 'error');
  }
  hideLoading();
}
