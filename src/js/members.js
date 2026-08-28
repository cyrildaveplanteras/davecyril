const RELIGION_LIST = [
  'Agnostic',
  'Anglican',
  'Atheist',
  'Baháʼí Faith',
  'Baptist',
  'Buddhism',
  'Christianity',
  'Confucianism',
  'Eastern Orthodox',
  'Evangelical',
  'Hinduism',
  'Iglesia ni Cristo',
  'Indigenous/Traditional Beliefs',
  'Islam',
  'Jainism',
  "Jehovah's Witnesses",
  'Judaism',
  'Lutheran',
  'Methodist',
  'Mormon (LDS)',
  'No Religion',
  'Other',
  'Paganism',
  'Presbyterian',
  'Protestant',
  'Rastafari',
  'Roman Catholic',
  'Seventh-day Adventist',
  'Shinto',
  'Shia',
  'Sikhism',
  'Spiritual but Not Religious',
  'Sunni',
  'Taoism',
  'UCCP',
  'Wicca',
  'Zoroastrianism'
];

let editingMemberId = null;

let regionList = [];
let provinceList = [];
let defaultRegionId = null;
let defaultProvinceId = null;
let defaultProvinceName = 'Zamboanga del Norte';

async function renderMemberRegistration(member = null) {
  const isEditing = !!member;
  editingMemberId = isEditing ? member.Id : null;
  const area = document.getElementById('contentArea');
  let barangayCoords = [];
  let salesCoords = [];
  let branches = [];
  try {
    const [coordsResult, regionsResult] = await Promise.all([
      Promise.all([
        window.api.getActiveCoordinators('barangay'),
        window.api.getActiveCoordinators('sales'),
        window.api.getActiveBranches()
      ]),
      window.api.getRegions()
    ]);
    barangayCoords = coordsResult[0].success ? coordsResult[0].data : [];
    salesCoords = coordsResult[1].success ? coordsResult[1].data : [];
    branches = coordsResult[2].success ? coordsResult[2].data : [];
    if (regionsResult.success && regionsResult.data.length > 0) {
      regionList = regionsResult.data.sort((a, b) => a.name.localeCompare(b.name));
      const regionIX = regionList.find(r => r.psgc_code === '09');
      defaultRegionId = regionIX ? regionIX.id : regionList[0].id;
    }
    const provResult = await window.api.getProvinces(defaultRegionId);
    if (provResult.success && provResult.data.length > 0) {
      provinceList = provResult.data.sort((a, b) => a.name.localeCompare(b.name));
      const zdn = provinceList.find(p => p.psgc_code === '097200000' || p.name.includes('Zamboanga del Norte'));
      if (zdn) {
        defaultProvinceId = zdn.id;
        defaultProvinceName = zdn.name;
      } else {
        defaultProvinceId = provinceList[0].id;
        defaultProvinceName = provinceList[0].name;
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to load coordinators/branches/regions', 'error');
  }

  let afNo = '';
  let regDate = '';
  if (isEditing) {
    afNo = member.AFNo || member.af_no || '';
    regDate = (member.RegistrationDate || member.registration_date || '').slice(0, 10);
  } else {
    try {
      const afNoResult = await window.api.getNextAfNo();
      afNo = afNoResult.success ? afNoResult.afNo : '00001';
    } catch (err) {
      showToast(err.message || 'Failed to generate AF number', 'error');
      afNo = '00001';
    }
    regDate = new Date().toISOString().slice(0, 10);
  }

  const membershipStatus = isEditing ? (member.MembershipStatus || member.membership_status || 'Regular') : 'Regular';
  const _rules = (typeof window !== 'undefined' && window.BusinessRules) ? window.BusinessRules : null;
  const membershipFee = isEditing ? (member.MembershipFee || member.membership_fee || 250) : (_rules ? _rules.RULES.MF_DEFAULT : 250);
  const msc = isEditing ? (member.Msc || member.msc || 300) : (_rules ? _rules.RULES.MSC_MINIMUM : 300);
  const overallPayment = isEditing ? (member.OverallPayment || member.overall_payment || (membershipFee + msc)) : (membershipFee + msc);
  const districtId = isEditing ? (member.BranchId || member.branch_id || '') : '';
  const fullName = isEditing ? (member.FullName || member.full_name || '') : '';
  const birthDate = isEditing ? (member.BirthDate || member.birth_date || '').slice(0, 10) : '';
  const age = isEditing ? (member.Age || member.age || 0) : 0;
  const gender = isEditing ? (member.Gender || member.gender || '') : '';
  const occupation = isEditing ? (member.Occupation || member.occupation || '') : '';
  const religion = isEditing ? (member.Religion || member.religion || '') : '';
  const address = isEditing ? (member.Address || member.address || '') : '';
  const civilStatus = isEditing ? (member.CivilStatus || member.civil_status || '') : '';
  const contactNo = isEditing ? (member.ContactNo || member.contact_no || '') : '';
  const famName = isEditing ? (member.FamilyRepName || member.family_rep_name || '') : '';
  const famBirthDate = isEditing ? (member.FamilyRepBirthDate || member.family_rep_birthdate || '').slice(0, 10) : '';
  const famAge = isEditing ? (member.FamilyRepAge || member.family_rep_age || 0) : 0;
  const famGender = isEditing ? (member.FamilyRepGender || member.family_rep_gender || '') : '';
  const famContact = isEditing ? (member.FamilyRepContact || member.family_rep_contact || '') : '';
  const barangayCoordId = isEditing ? (member.BarangayCoordinatorId || member.barangay_coordinator_id || '') : '';
  const salesCoordId = isEditing ? (member.SalesCoordinatorId || member.sales_coordinator_id || '') : '';
  const notes = isEditing ? (member.Notes || member.notes || '') : '';
  const memberProvinceId = isEditing ? (member.province_id || member.ProvinceId || '') : '';
  const memberProvinceName = isEditing ? (member.province_name || '') : '';
  const initialProvName = memberProvinceName || defaultProvinceName;
  const initialProvId = memberProvinceId || defaultProvinceId || 1;
  const memberRegionId = isEditing ? (member.region_id || '') : '';
  const memberRegionName = isEditing ? (member.region_name || '') : '';
  const initialRegionId = memberRegionId || defaultRegionId || '';
  const initialRegionName = memberRegionName || (regionList.find(r => r.id == initialRegionId) ? regionList.find(r => r.id == initialRegionId).name : '');

  area.innerHTML = `
    <div class="mr-wrapper">
      <div class="mr-org-card">
        <div class="mr-org-left">
          <div class="mr-org-logo">
            <img src="../../assets/logo.png" onerror="this.style.display='none'" alt="Logo" style="width:40px;height:40px;object-fit:contain">
          </div>
          <div class="mr-org-info">
            <div class="mr-org-name">GOLDENHOPE</div>
            <div class="mr-org-sub">Damayan Association and Support Inc.</div>
          </div>
        </div>
        <div class="mr-org-right">
          <div class="mr-org-field">
            <label>AF No.</label>
            <input type="text" id="mAFNo" value="${escapeHtml(afNo)}">
          </div>
          <div class="mr-org-field">
            <label>Date</label>
            <input type="date" id="mRegDate" value="${escapeHtml(regDate)}">
          </div>
        </div>
      </div>

      <div class="mr-form-card">
        <div class="mr-card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span>Membership Application</span>
        </div>
        <div class="mr-card-body">
          <div class="mr-form-grid">
            <div class="mr-field"><label>District</label>
              <select id="mDistrict"><option value="">Select District</option>
                ${branches.map(b => `<option value="${b.Id}" ${districtId == b.Id ? 'selected' : ''}>${escapeHtml(b.Name)}</option>`).join('')}
              </select>
            </div>
            <div class="mr-field"><label>Membership Status</label>
              <select id="mMembershipStatus" onchange="onMembershipStatusChange()"><option value="Regular" ${membershipStatus === 'Regular' ? 'selected' : ''}>Regular</option><option value="Honorary" ${membershipStatus === 'Honorary' ? 'selected' : ''}>Honorary</option></select>
            </div>
            <div class="mr-field mr-field-full" id="mMembershipStatusInfo"></div>
            <div class="mr-field"><label>Membership Fee (₱)</label><select id="mMembershipFee" onchange="updateOverallPayment()"><option value="250" ${membershipFee == 250 ? 'selected' : ''}>250</option><option value="350" ${membershipFee == 350 ? 'selected' : ''}>350</option></select></div>
            <div class="mr-field"><label>MSC (₱)</label><input type="number" id="mMsc" min="300" step="0.01" value="${msc}" oninput="updateOverallPayment()"></div>
            <div class="mr-field"><label>Overall Payment (₱)</label><input type="number" id="mOverallPayment" step="0.01" readonly value="${overallPayment}"></div>
          </div>
        </div>
      </div>

      <div class="mr-form-card">
        <div class="mr-card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>Member's Information</span>
        </div>
        <div class="mr-card-body">
          <div class="mr-form-grid">
            <div class="mr-field mr-field-full"><label>Full Name</label><input type="text" id="mFullName" placeholder="Last Name, First Name M.I." value="${escapeHtml(fullName)}"></div>
            <div class="mr-field"><label>Birth Date</label><input type="date" id="mBirthDate" onchange="computeAge()" value="${escapeHtml(birthDate)}"></div>
            <div class="mr-field"><label>Age</label><input type="number" id="mAge" readonly value="${age}"></div>
            <div class="mr-field"><label>Gender</label><select id="mGender"><option value="">Select</option><option ${gender === 'Male' ? 'selected' : ''}>Male</option><option ${gender === 'Female' ? 'selected' : ''}>Female</option></select></div>
            <div class="mr-field"><label>Occupation</label><input type="text" id="mOccupation" value="${escapeHtml(occupation)}"></div>
            <div class="mr-field"><label>Religion</label><div class="combo-wrapper"><input type="text" class="combo-input" id="mReligionSearch" placeholder="Select Religion" autocomplete="off" value="${escapeHtml(religion)}"><input type="hidden" id="mReligion" value="${escapeHtml(religion)}"><div class="combo-dropdown" id="religionDropdown"></div></div></div>
            <div class="mr-field"><label>Civil Status</label><select id="mCivilStatus"><option value="">Select</option><option ${civilStatus === 'Single' ? 'selected' : ''}>Single</option><option ${civilStatus === 'Married' ? 'selected' : ''}>Married</option><option ${civilStatus === 'Widowed' ? 'selected' : ''}>Widowed</option><option ${civilStatus === 'Separated' ? 'selected' : ''}>Separated</option></select></div>
            <div class="mr-field"><label>Contact No.</label><input type="text" id="mContactNo" value="${escapeHtml(contactNo)}"></div>
            <div class="mr-field"><label>Street / Purok / Sitio</label><input type="text" id="mStreet" placeholder="e.g., Purok 2, Mabini St." value="${isEditing ? escapeHtml(member.street || member.street || '') : ''}"></div>
            <input type="hidden" id="mHouseNo" value="${isEditing ? escapeHtml(member.house_no || member.house_no || '') : ''}">
            <div class="mr-field"><label>Region</label>
              <div class="combo-wrapper">
                <input type="text" class="combo-input" id="mRegionSearch" placeholder="Select Region" autocomplete="off" value="${escapeHtml(initialRegionName)}" readonly>
                <input type="hidden" id="mRegionId" value="${initialRegionId}">
                <div class="combo-dropdown" id="regionDropdown"></div>
              </div>
            </div>
            <div class="mr-field"><label>Province</label>
              <div class="combo-wrapper">
                <input type="text" class="combo-input" id="mProvinceSearch" placeholder="Select Province" autocomplete="off" value="${escapeHtml(initialProvName)}" readonly>
                <input type="hidden" id="mProvinceId" value="${initialProvId}">
                <div class="combo-dropdown" id="provinceDropdown"></div>
              </div>
            </div>
            </div>
            <div class="mr-field"><label>Municipality / City <span class="required-star">*</span></label>
              <div class="combo-wrapper">
                <input type="text" class="combo-input" id="mMunicipalitySearch" placeholder="Select Municipality" autocomplete="off" value="${isEditing ? (member.municipality_name || '') : ''}">
                <input type="hidden" id="mMunicipalityId" value="${isEditing ? (member.municipality_id || member.municipality_id || '') : ''}">
                <div class="combo-dropdown" id="municipalityDropdown"></div>
              </div>
            </div>
            <div class="mr-field"><label>Barangay <span class="required-star">*</span></label>
              <div class="combo-wrapper">
                <input type="text" class="combo-input" id="mBarangaySearch" placeholder="${isEditing && (member.municipality_id || member.municipality_id) ? 'Select Barangay' : 'Select Municipality First'}" autocomplete="off" value="${isEditing ? (member.barangay_name || '') : ''}" ${isEditing && !(member.municipality_id || member.municipality_id) ? 'disabled' : ''}>
                <input type="hidden" id="mBarangayId" value="${isEditing ? (member.barangay_id || member.barangay_id || '') : ''}">
                <div class="combo-dropdown" id="barangayDropdown"></div>
              </div>
            </div>
            <div class="mr-field mr-field-full"><label>Complete Address (Auto-Generated)</label>
              <textarea id="mCompleteAddress" rows="2" readonly style="background:#f1f5f9;color:#475569;cursor:default">${isEditing ? (member.complete_address || member.complete_address || '') : ''}</textarea>
            </div>
            <input type="hidden" id="mAddress" value="${escapeHtml(address)}">
          </div>
        </div>
      </div>

      <div class="mr-form-card">
        <div class="mr-card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Family Representative</span>
        </div>
        <div class="mr-card-body">
          <div class="mr-form-grid">
            <div class="mr-field"><label>Full Name</label><input type="text" id="mFamName" value="${escapeHtml(famName)}"></div>
            <div class="mr-field"><label>Gender</label><select id="mFamGender"><option value="">Select</option><option ${famGender === 'Male' ? 'selected' : ''}>Male</option><option ${famGender === 'Female' ? 'selected' : ''}>Female</option></select></div>
            <div class="mr-field"><label>Birth Date</label><input type="date" id="mFamBirthDate" onchange="computeFamAge()" value="${escapeHtml(famBirthDate)}"></div>
            <div class="mr-field"><label>Age</label><input type="number" id="mFamAge" readonly value="${famAge}"></div>
            <div class="mr-field mr-field-full"><label>Contact No.</label><input type="text" id="mFamContact" value="${escapeHtml(famContact)}"></div>
          </div>
        </div>
      </div>

      <div class="mr-form-card">
        <div class="mr-card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <span>Assignment</span>
        </div>
        <div class="mr-card-body">
          <div class="mr-form-grid">
            <div class="mr-field"><label>Barangay Coordinator</label>
              <select id="mBarangayCoord"><option value="">Select Coordinator</option>
                ${barangayCoords.map(c => `<option value="${c.Id}" ${barangayCoordId == c.Id ? 'selected' : ''}>${escapeHtml(c.FullName)}</option>`).join('')}
              </select>
            </div>
            <div class="mr-field"><label>Sales Coordinator</label>
              <select id="mSalesCoord"><option value="">Select Coordinator</option>
                ${salesCoords.map(c => `<option value="${c.Id}" ${salesCoordId == c.Id ? 'selected' : ''}>${escapeHtml(c.FullName)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="mr-form-card">
        <div class="mr-card-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Notes</span>
        </div>
        <div class="mr-card-body">
          <div class="mr-field"><textarea id="mNotes" rows="3" placeholder="Optional notes...">${escapeHtml(notes)}</textarea></div>
        </div>
      </div>

      <div class="mr-actions-bar">
        <button class="mr-btn mr-btn-primary" onclick="saveMember()" ${isSystemLocked() ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          ${isEditing ? 'Update' : 'Save'}
        </button>
        <button class="mr-btn mr-btn-outline" onclick="clearMemberForm()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Clear
        </button>
        <button class="mr-btn mr-btn-outline" onclick="printMemberForm()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print
        </button>
        <button class="mr-btn mr-btn-outline" onclick="exportMemberFormPDF()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>
          Export PDF
        </button>
      </div>
    </div>`;

  updateOverallPayment();
  initReligionCombobox();
  initAddressComboboxes(isEditing);
  if (isEditing) {
    if (membershipStatus === 'Honorary') {
      await loadHonoraryProgress(editingMemberId);
    } else if (membershipStatus === 'Regular') {
      renderMembershipStatusInfo({ membershipStatus: 'Regular' });
    }
  } else {
    onMembershipStatusChange();
  }
  if (isEditing) {
    document.getElementById('pageTitle').textContent = 'Member Registration';
    document.getElementById('pageSubtitle').textContent = `Editing: ${fullName}`;
    window.scrollTo(0, 0);
  }
}

async function loadHonoraryProgress(memberId) {
  try {
    const result = await window.api.getHonoraryProgress(memberId);
    if (result.success && result.data) {
      renderMembershipStatusInfo(result.data);
    }
  } catch (err) {
    showToast(err.message || 'Failed to load honorary progress', 'error');
  }
}

function onMembershipStatusChange() {
  const status = document.getElementById('mMembershipStatus').value;
  if (editingMemberId) {
    if (status === 'Honorary') {
      loadHonoraryProgress(editingMemberId);
    } else if (status === 'Regular') {
      renderMembershipStatusInfo({ membershipStatus: 'Regular' });
    } else {
      document.getElementById('mMembershipStatusInfo').innerHTML = '';
    }
  } else {
    if (status === 'Honorary') {
      renderMembershipStatusInfo({
        membershipStatus: 'Honorary',
        yearsCompleted: 0,
        yearsRequired: 10,
        startDate: document.getElementById('mRegDate').value || new Date().toISOString().slice(0, 10),
        remainingYears: 10
      });
    } else if (status === 'Regular') {
      renderMembershipStatusInfo({ membershipStatus: 'Regular' });
    } else {
      document.getElementById('mMembershipStatusInfo').innerHTML = '';
    }
  }
}

function renderMembershipStatusInfo(data) {
  const el = document.getElementById('mMembershipStatusInfo');
  if (!el) return;
  if (data.membershipStatus === 'Honorary' && !data.isConverted) {
    const pct = Math.min(100, (data.yearsCompleted / data.yearsRequired) * 100);
    el.innerHTML = `
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-top:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-weight:700;font-size:14px;color:#0F172A">Honorary Membership Progress</div>
            <div style="font-size:12px;color:#64748B;margin-top:2px">
              Started: ${data.startDate ? formatDate(data.startDate) : 'N/A'} &middot;
              <strong>${data.yearsCompleted}/${data.yearsRequired}</strong> years completed
            </div>
          </div>
          <div style="background:rgba(245,158,11,0.1);color:#D97706;font-weight:700;font-size:20px;padding:8px 16px;border-radius:10px;white-space:nowrap">${data.remainingYears} yr${data.remainingYears !== 1 ? 's' : ''} left</div>
        </div>
        <div style="background:#E2E8F0;border-radius:8px;height:10px;overflow:hidden">
          <div style="background:linear-gradient(90deg,#F59E0B,#D97706);height:100%;width:${pct}%;border-radius:8px;transition:width 0.5s ease"></div>
        </div>
        <div style="font-size:11px;color:#64748B;margin-top:8px">Complete <strong>${data.yearsRequired} annual payments</strong> to become a Regular Member with full benefits.</div>
      </div>`;
  } else if (data.membershipStatus === 'Regular') {
    el.innerHTML = `
      <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:16px;margin-top:4px;display:flex;align-items:flex-start;gap:12px">
        <div style="background:rgba(16,185,129,0.12);color:#059669;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px;color:#065F46">Regular Member &mdash; Full Benefits</div>
          <div style="font-size:12px;color:#047857;margin-top:3px;line-height:1.5">No annual membership payment required. Entitled to <strong>100% of all membership benefits</strong> according to the organization's policies.</div>
        </div>
      </div>`;
  } else {
    el.innerHTML = '';
  }
}

function computeAge() {
  const bd = document.getElementById('mBirthDate').value;
  if (bd) {
    const age = Math.floor((new Date() - new Date(bd)) / (365.25 * 24 * 60 * 60 * 1000));
    document.getElementById('mAge').value = Math.max(0, age);
  }
}

function computeFamAge() {
  const bd = document.getElementById('mFamBirthDate').value;
  if (bd) {
    const age = Math.floor((new Date() - new Date(bd)) / (365.25 * 24 * 60 * 60 * 1000));
    document.getElementById('mFamAge').value = Math.max(0, age);
  }
}

function getMemberFormData() {
  const districtEl = document.getElementById('mDistrict');
  const districtId = districtEl.value ? parseInt(districtEl.value) : null;
  const districtName = districtId
    ? districtEl.options[districtEl.selectedIndex].text
    : '';
  const municipalityId = document.getElementById('mMunicipalityId').value ? parseInt(document.getElementById('mMunicipalityId').value) : null;
  const barangayId = document.getElementById('mBarangayId').value ? parseInt(document.getElementById('mBarangayId').value) : null;
  const street = document.getElementById('mStreet').value.trim();
  const completeAddress = document.getElementById('mCompleteAddress').value;

  return {
    Id: editingMemberId,
    District: districtName,
    BranchId: districtId,
    AFNo: document.getElementById('mAFNo').value,
    RegistrationDate: document.getElementById('mRegDate').value,
    MembershipStatus: document.getElementById('mMembershipStatus').value,
    MembershipFee: parseFloat(document.getElementById('mMembershipFee').value) || 0,
    Msc: parseFloat(document.getElementById('mMsc').value) || 0,
    OverallPayment: parseFloat(document.getElementById('mOverallPayment').value) || 0,
    FullName: document.getElementById('mFullName').value,
    BirthDate: document.getElementById('mBirthDate').value,
    Age: parseInt(document.getElementById('mAge').value) || 0,
    Gender: document.getElementById('mGender').value,
    Occupation: document.getElementById('mOccupation').value,
    Religion: document.getElementById('mReligion').value,
    Address: completeAddress,
    CivilStatus: document.getElementById('mCivilStatus').value,
    ContactNo: document.getElementById('mContactNo').value,
    FamilyRepName: document.getElementById('mFamName').value,
    FamilyRepBirthDate: document.getElementById('mFamBirthDate').value,
    FamilyRepAge: parseInt(document.getElementById('mFamAge').value) || 0,
    FamilyRepGender: document.getElementById('mFamGender').value,
    FamilyRepContact: document.getElementById('mFamContact').value,
    BarangayCoordinatorId: document.getElementById('mBarangayCoord').value ? parseInt(document.getElementById('mBarangayCoord').value) : null,
    SalesCoordinatorId: document.getElementById('mSalesCoord').value ? parseInt(document.getElementById('mSalesCoord').value) : null,
    Notes: document.getElementById('mNotes').value,
    RegionId: parseInt(document.getElementById('mRegionId').value) || null,
    ProvinceId: parseInt(document.getElementById('mProvinceId').value) || defaultProvinceId || 1,
    MunicipalityId: municipalityId,
    BarangayId: barangayId,
    Street: street,
    HouseNo: document.getElementById('mHouseNo').value,
    CompleteAddress: completeAddress
  };
}

// ===== SEARCHABLE RELIGION COMBOBOX =====
function initReligionCombobox() {
  const searchInput = document.getElementById('mReligionSearch');
  const hiddenInput = document.getElementById('mReligion');
  const dropdown = document.getElementById('religionDropdown');
  if (!searchInput || !hiddenInput || !dropdown) return;

  let isOpen = false;
  let highlightedIndex = -1;
  let currentFilter = '';

  function buildList(filter, selectedValue) {
    dropdown.innerHTML = '';
    highlightedIndex = -1;
    const lower = filter.toLowerCase();
    const filtered = RELIGION_LIST.filter(r => r.toLowerCase().includes(lower));
    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="combo-no-results">No matching religions found</div>';
      return;
    }
    filtered.forEach((religion, idx) => {
      const item = document.createElement('div');
      item.className = 'combo-item';
      if (religion === selectedValue) {
        item.classList.add('selected');
        highlightedIndex = idx;
      }
      item.textContent = religion;
      item.dataset.value = religion;
      item.addEventListener('click', () => selectItem(religion));
      item.addEventListener('mouseenter', () => {
        dropdown.querySelectorAll('.combo-item').forEach(el => el.classList.remove('highlighted'));
        item.classList.add('highlighted');
        highlightedIndex = idx;
      });
      dropdown.appendChild(item);
    });
    if (highlightedIndex >= 0) {
      const highlighted = dropdown.children[highlightedIndex];
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    }
  }

  function selectItem(value) {
    searchInput.value = value;
    hiddenInput.value = value;
    closeDropdown();
    searchInput.focus();
  }

  function openDropdown() {
    if (isOpen) return;
    isOpen = true;
    currentFilter = searchInput.value;
    const selectedValue = hiddenInput.value;
    buildList(currentFilter, selectedValue);
    dropdown.classList.add('show');
    searchInput.classList.add('open');
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  function closeDropdown() {
    if (!isOpen) return;
    isOpen = false;
    dropdown.classList.remove('show');
    searchInput.classList.remove('open');
  }

  function toggleDropdown() {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  // Input click - open dropdown
  searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Focus - if dropdown not already open, open it
  searchInput.addEventListener('focus', () => {
    setTimeout(() => {
      if (!isOpen) openDropdown();
    }, 100);
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.combo-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { openDropdown(); return; }
      if (items.length === 0) return;
      highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
      items.forEach(el => el.classList.remove('highlighted'));
      items[highlightedIndex].classList.add('highlighted');
      items[highlightedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) { openDropdown(); return; }
      if (items.length === 0) return;
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      items.forEach(el => el.classList.remove('highlighted'));
      items[highlightedIndex].classList.add('highlighted');
      items[highlightedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && items[highlightedIndex]) {
        selectItem(items[highlightedIndex].dataset.value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    } else if (e.key === 'Tab') {
      closeDropdown();
    }
  });

  // Type-to-search
  searchInput.addEventListener('input', () => {
    const val = searchInput.value;
    if (!isOpen) openDropdown();
    currentFilter = val;
    const selectedValue = hiddenInput.value;
    // Only show the typed value in the visible field; hidden stays until selection
    buildList(val, selectedValue);
  });

  // Blur - close dropdown with delay to allow click on item
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      // If user typed something not in the list, revert to previous selection
      const val = searchInput.value;
      const stored = hiddenInput.value;
      if (val !== stored && !RELIGION_LIST.includes(val)) {
        searchInput.value = stored || '';
      }
      closeDropdown();
    }, 200);
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    const wrapper = searchInput.closest('.combo-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      closeDropdown();
    }
  });

  // Ensure the visible input always reflects the hidden value on first render
  if (!hiddenInput.value) {
    searchInput.value = '';
  }
}

// ===== SEARCHABLE ADDRESS COMBOBOXES =====
function initAddressComboboxes(isEditing) {
  const regionSearch = document.getElementById('mRegionSearch');
  const regionHidden = document.getElementById('mRegionId');
  const regionDropdown = document.getElementById('regionDropdown');
  const provSearch = document.getElementById('mProvinceSearch');
  const provHidden = document.getElementById('mProvinceId');
  const provDropdown = document.getElementById('provinceDropdown');
  const munSearch = document.getElementById('mMunicipalitySearch');
  const munHidden = document.getElementById('mMunicipalityId');
  const munDropdown = document.getElementById('municipalityDropdown');
  const brgySearch = document.getElementById('mBarangaySearch');
  const brgyHidden = document.getElementById('mBarangayId');
  const brgyDropdown = document.getElementById('barangayDropdown');
  const streetInput = document.getElementById('mStreet');
  const completeAddrArea = document.getElementById('mCompleteAddress');

  let municipalities = [];
  let barangays = [];
  let regionHighlightedIndex = -1;
  let provHighlightedIndex = -1;
  let munHighlightedIndex = -1;
  let brgyHighlightedIndex = -1;
  let regionIsOpen = false;
  let provIsOpen = false;
  let munIsOpen = false;
  let brgyIsOpen = false;
  let selectedMunicipalityId = null;
  let selectedBarangayName = '';

  async function loadProvincesForRegion(regionId) {
    try {
      const result = await window.api.getProvinces(regionId);
      if (result.success) {
        provinceList = result.data.sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (e) {
      console.error('Failed to load provinces for region:', e);
    }
  }

  function generateCompleteAddress() {
    const street = streetInput.value.trim();
    const brgyName = brgySearch.value.trim();
    const munName = munSearch.value.trim();
    const provName = provSearch.value.trim();
    const regionName = regionSearch.value.trim();

    let parts = [];
    if (street) parts.push(street);
    if (brgyName && brgyName !== 'Select Barangay' && brgyName !== 'Select Municipality First') {
      parts.push(brgyName);
    }
    if (munName && munName !== 'Select Municipality') {
      parts.push(munName);
    }
    if (provName) parts.push(provName);
    if (regionName) parts.push(regionName);
    completeAddrArea.value = parts.join(',\n');
  }

  // === REGION ===
  function buildRegionList(filter, selectedValue) {
    regionDropdown.innerHTML = '';
    regionHighlightedIndex = -1;
    const lower = filter.toLowerCase();
    const filtered = regionList.filter(r => r.name.toLowerCase().includes(lower));
    if (filtered.length === 0) {
      regionDropdown.innerHTML = '<div class="combo-no-results">No matching regions found</div>';
      return;
    }
    filtered.forEach((reg, idx) => {
      const item = document.createElement('div');
      item.className = 'combo-item';
      if (reg.id == selectedValue) {
        item.classList.add('selected');
        regionHighlightedIndex = idx;
      }
      item.textContent = reg.name;
      item.dataset.value = reg.id;
      item.addEventListener('click', () => selectRegion(reg));
      item.addEventListener('mouseenter', () => {
        regionDropdown.querySelectorAll('.combo-item').forEach(el => el.classList.remove('highlighted'));
        item.classList.add('highlighted');
        regionHighlightedIndex = idx;
      });
      regionDropdown.appendChild(item);
    });
    if (regionHighlightedIndex >= 0 && regionDropdown.children[regionHighlightedIndex]) {
      regionDropdown.children[regionHighlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectRegion(reg) {
    regionSearch.value = reg.name;
    regionHidden.value = reg.id;
    closeRegionDropdown();
    // Reset dependent fields
    provSearch.value = '';
    provHidden.value = '';
    munSearch.value = '';
    munHidden.value = '';
    brgySearch.value = '';
    brgyHidden.value = '';
    brgySearch.disabled = true;
    brgySearch.placeholder = 'Select Municipality First';
    municipalities = [];
    barangays = [];
    selectedMunicipalityId = null;
    selectedBarangayName = '';
    provinceList = [];
    generateCompleteAddress();
    // Load provinces for this region
    loadProvincesForRegion(reg.id).then(() => {
      openProvDropdown();
      buildProvinceList('', null);
    });
    provSearch.focus();
  }

  function openRegionDropdown() {
    if (regionIsOpen) return;
    if (regionList.length === 0) {
      regionDropdown.innerHTML = '<div class="combo-no-results">No regions available</div>';
      regionDropdown.classList.add('show');
      regionSearch.classList.add('open');
      return;
    }
    regionIsOpen = true;
    buildRegionList('', regionHidden.value);
    regionDropdown.classList.add('show');
    regionSearch.classList.add('open');
    regionSearch.setSelectionRange(regionSearch.value.length, regionSearch.value.length);
  }

  function closeRegionDropdown() {
    if (!regionIsOpen) return;
    regionIsOpen = false;
    regionDropdown.classList.remove('show');
    regionSearch.classList.remove('open');
  }

  // === PROVINCE ===
  function buildProvinceList(filter, selectedValue) {
    provDropdown.innerHTML = '';
    provHighlightedIndex = -1;
    if (provinceList.length === 0) {
      provDropdown.innerHTML = '<div class="combo-no-results">Select a Region first</div>';
      return;
    }
    const lower = filter.toLowerCase();
    const filtered = provinceList.filter(p => p.name.toLowerCase().includes(lower));
    if (filtered.length === 0) {
      provDropdown.innerHTML = '<div class="combo-no-results">No matching provinces found</div>';
      return;
    }
    filtered.forEach((prov, idx) => {
      const item = document.createElement('div');
      item.className = 'combo-item';
      if (prov.id == selectedValue) {
        item.classList.add('selected');
        provHighlightedIndex = idx;
      }
      item.textContent = prov.name;
      item.dataset.value = prov.id;
      item.addEventListener('click', () => selectProvince(prov));
      item.addEventListener('mouseenter', () => {
        provDropdown.querySelectorAll('.combo-item').forEach(el => el.classList.remove('highlighted'));
        item.classList.add('highlighted');
        provHighlightedIndex = idx;
      });
      provDropdown.appendChild(item);
    });
    if (provHighlightedIndex >= 0 && provDropdown.children[provHighlightedIndex]) {
      provDropdown.children[provHighlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectProvince(prov) {
    provSearch.value = prov.name;
    provHidden.value = prov.id;
    closeProvDropdown();
    munSearch.value = '';
    munHidden.value = '';
    brgySearch.value = '';
    brgyHidden.value = '';
    brgySearch.disabled = true;
    brgySearch.placeholder = 'Select Municipality First';
    municipalities = [];
    barangays = [];
    selectedMunicipalityId = null;
    selectedBarangayName = '';
    generateCompleteAddress();
    loadMunicipalities();
    munSearch.focus();
  }

  function openProvDropdown() {
    if (provIsOpen) return;
    if (provinceList.length === 0) {
      if (regionHidden.value) {
        loadProvincesForRegion(regionHidden.value).then(() => { openProvDropdown(); });
      }
      return;
    }
    provIsOpen = true;
    buildProvinceList('', provHidden.value);
    provDropdown.classList.add('show');
    provSearch.classList.add('open');
    provSearch.setSelectionRange(provSearch.value.length, provSearch.value.length);
  }

  function closeProvDropdown() {
    if (!provIsOpen) return;
    provIsOpen = false;
    provDropdown.classList.remove('show');
    provSearch.classList.remove('open');
  }

  // === MUNICIPALITY & BARANGAY (unchanged logic) ===
  async function loadMunicipalities() {
    try {
      const provinceId = parseInt(provHidden.value) || defaultProvinceId || 1;
      const result = await window.api.getMunicipalities(provinceId);
      if (result.success) {
        municipalities = result.data.sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (e) {
      console.error('Failed to load municipalities:', e);
    }
  }

  async function loadBarangays(municipalityId) {
    try {
      const result = await window.api.getBarangays(municipalityId);
      if (result.success) {
        barangays = result.data.sort((a, b) => a.name.localeCompare(b.name));
        if (barangays.length === 0) {
          showToast('No barangays found for this municipality in database', 'warning');
        }
      } else {
        showToast('Failed to load barangays: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (e) {
      console.error('Failed to load barangays:', e);
      showToast('Error loading barangays: ' + e.message, 'error');
    }
  }

  function buildMunicipalityList(filter, selectedValue) {
    munDropdown.innerHTML = '';
    munHighlightedIndex = -1;
    const lower = filter.toLowerCase();
    const filtered = municipalities.filter(m => m.name.toLowerCase().includes(lower));
    if (filtered.length === 0) {
      munDropdown.innerHTML = '<div class="combo-no-results">No matching municipalities found</div>';
      return;
    }
    filtered.forEach((mun, idx) => {
      const item = document.createElement('div');
      item.className = 'combo-item';
      if (mun.id == selectedValue) {
        item.classList.add('selected');
        munHighlightedIndex = idx;
      }
      item.textContent = mun.name;
      item.dataset.value = mun.id;
      item.addEventListener('click', () => selectMunicipality(mun));
      item.addEventListener('mouseenter', () => {
        munDropdown.querySelectorAll('.combo-item').forEach(el => el.classList.remove('highlighted'));
        item.classList.add('highlighted');
        munHighlightedIndex = idx;
      });
      munDropdown.appendChild(item);
    });
    if (munHighlightedIndex >= 0 && munDropdown.children[munHighlightedIndex]) {
      munDropdown.children[munHighlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function buildBarangayList(filter, selectedValue) {
    brgyDropdown.innerHTML = '';
    brgyHighlightedIndex = -1;
    const lower = filter.toLowerCase();
    const filtered = barangays.filter(b => b.name.toLowerCase().includes(lower));
    if (filtered.length === 0) {
      brgyDropdown.innerHTML = '<div class="combo-no-results">No matching barangays found</div>';
      return;
    }
    filtered.forEach((brgy, idx) => {
      const item = document.createElement('div');
      item.className = 'combo-item';
      if (brgy.id == selectedValue) {
        item.classList.add('selected');
        brgyHighlightedIndex = idx;
      }
      item.textContent = brgy.name;
      item.dataset.value = brgy.id;
      item.addEventListener('click', () => selectBarangay(brgy));
      item.addEventListener('mouseenter', () => {
        brgyDropdown.querySelectorAll('.combo-item').forEach(el => el.classList.remove('highlighted'));
        item.classList.add('highlighted');
        brgyHighlightedIndex = idx;
      });
      brgyDropdown.appendChild(item);
    });
    if (brgyHighlightedIndex >= 0 && brgyDropdown.children[brgyHighlightedIndex]) {
      brgyDropdown.children[brgyHighlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectMunicipality(mun) {
    munSearch.value = mun.name;
    munHidden.value = mun.id;
    selectedMunicipalityId = mun.id;
    closeMunDropdown();
    brgySearch.value = '';
    brgyHidden.value = '';
    brgySearch.disabled = false;
    brgySearch.placeholder = 'Select Barangay';
    selectedBarangayName = '';
    barangays = [];
    generateCompleteAddress();
    loadBarangays(mun.id).then(() => {
      openBrgyDropdown();
      buildBarangayList('', null);
    });
    munSearch.focus();
  }

  function selectBarangay(brgy) {
    brgySearch.value = brgy.name;
    brgyHidden.value = brgy.id;
    selectedBarangayName = brgy.name;
    closeBrgyDropdown();
    generateCompleteAddress();
    brgySearch.focus();
  }

  function openMunDropdown() {
    if (munIsOpen || municipalities.length === 0) {
      if (municipalities.length === 0) loadMunicipalities().then(() => { openMunDropdown(); });
      return;
    }
    munIsOpen = true;
    buildMunicipalityList(munSearch.value, munHidden.value);
    munDropdown.classList.add('show');
    munSearch.classList.add('open');
    munSearch.setSelectionRange(munSearch.value.length, munSearch.value.length);
  }

  function closeMunDropdown() {
    if (!munIsOpen) return;
    munIsOpen = false;
    munDropdown.classList.remove('show');
    munSearch.classList.remove('open');
  }

  function openBrgyDropdown() {
    if (brgyIsOpen || !selectedMunicipalityId) return;
    brgyIsOpen = true;
    buildBarangayList(brgySearch.value, brgyHidden.value);
    brgyDropdown.classList.add('show');
    brgySearch.classList.add('open');
    brgySearch.setSelectionRange(brgySearch.value.length, brgySearch.value.length);
  }

  function closeBrgyDropdown() {
    if (!brgyIsOpen) return;
    brgyIsOpen = false;
    brgyDropdown.classList.remove('show');
    brgySearch.classList.remove('open');
  }

  // === REGION EVENTS ===
  regionSearch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (regionIsOpen) closeRegionDropdown(); else openRegionDropdown();
  });
  regionSearch.addEventListener('focus', () => {
    setTimeout(() => { if (!regionIsOpen) openRegionDropdown(); }, 100);
  });
  regionSearch.addEventListener('input', () => {
    if (!regionIsOpen) openRegionDropdown();
    buildRegionList(regionSearch.value, regionHidden.value);
  });
  regionSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (regionIsOpen && regionHighlightedIndex >= 0) {
        const items = regionDropdown.querySelectorAll('.combo-item');
        if (items[regionHighlightedIndex]) items[regionHighlightedIndex].click();
      }
    } else if (e.key === 'Escape') {
      closeRegionDropdown();
    } else if (e.key === 'Tab') {
      closeRegionDropdown();
    }
  });
  regionSearch.addEventListener('blur', () => {
    setTimeout(() => {
      const val = regionSearch.value;
      const stored = regionHidden.value;
      if (val !== stored && !regionList.some(r => r.name === val)) {
        const reg = regionList.find(r => r.id == stored);
        regionSearch.value = reg ? reg.name : '';
        if (!reg) regionHidden.value = '';
      }
      closeRegionDropdown();
    }, 200);
  });

  // === PROVINCE EVENTS ===
  provSearch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (provIsOpen) closeProvDropdown(); else openProvDropdown();
  });
  provSearch.addEventListener('focus', () => {
    setTimeout(() => { if (!provIsOpen) openProvDropdown(); }, 100);
  });
  provSearch.addEventListener('input', () => {
    if (!provIsOpen) openProvDropdown();
    buildProvinceList(provSearch.value, provHidden.value);
  });
  provSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (provIsOpen && provHighlightedIndex >= 0) {
        const items = provDropdown.querySelectorAll('.combo-item');
        if (items[provHighlightedIndex]) items[provHighlightedIndex].click();
      }
    } else if (e.key === 'Escape') {
      closeProvDropdown();
    } else if (e.key === 'Tab') {
      closeProvDropdown();
    }
  });
  provSearch.addEventListener('blur', () => {
    setTimeout(() => {
      const val = provSearch.value;
      const stored = provHidden.value;
      if (val !== stored && !provinceList.some(p => p.name === val)) {
        const prov = provinceList.find(p => p.id == stored);
        provSearch.value = prov ? prov.name : '';
        if (!prov) provHidden.value = '';
      }
      closeProvDropdown();
    }, 200);
  });

  // === MUNICIPALITY EVENTS ===
  munSearch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (munIsOpen) closeMunDropdown(); else openMunDropdown();
  });
  munSearch.addEventListener('focus', () => {
    setTimeout(() => { if (!munIsOpen) openMunDropdown(); }, 100);
  });
  munSearch.addEventListener('input', () => {
    if (!munIsOpen) openMunDropdown();
    buildMunicipalityList(munSearch.value, munHidden.value);
  });
  munSearch.addEventListener('keydown', (e) => {
    const items = munDropdown.querySelectorAll('.combo-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!munIsOpen) { openMunDropdown(); return; }
      if (items.length === 0) return;
      munHighlightedIndex = Math.min(munHighlightedIndex + 1, items.length - 1);
      items.forEach(el => el.classList.remove('highlighted'));
      items[munHighlightedIndex].classList.add('highlighted');
      items[munHighlightedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!munIsOpen) { openMunDropdown(); return; }
      if (items.length === 0) return;
      munHighlightedIndex = Math.max(munHighlightedIndex - 1, 0);
      items.forEach(el => el.classList.remove('highlighted'));
      items[munHighlightedIndex].classList.add('highlighted');
      items[munHighlightedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (munIsOpen && munHighlightedIndex >= 0 && items[munHighlightedIndex]) {
        const id = items[munHighlightedIndex].dataset.value;
        const mun = municipalities.find(m => m.id == id);
        if (mun) selectMunicipality(mun);
      }
    } else if (e.key === 'Escape') {
      closeMunDropdown();
    } else if (e.key === 'Tab') {
      closeMunDropdown();
    }
  });
  munSearch.addEventListener('blur', () => {
    setTimeout(() => {
      const val = munSearch.value;
      const stored = munHidden.value;
      if (val !== stored && !municipalities.some(m => m.name === val)) {
        const mun = municipalities.find(m => m.Id == stored);
        munSearch.value = mun ? mun.name : '';
        if (!mun) munHidden.value = '';
      }
      closeMunDropdown();
    }, 200);
  });

  // === BARANGAY EVENTS ===
  brgySearch.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!selectedMunicipalityId) {
      showToast('Please select a Municipality first', 'warning');
      return;
    }
    if (barangays.length === 0) {
      loadBarangays(selectedMunicipalityId).then(() => {
        closeBrgyDropdown();
        openBrgyDropdown();
      });
      return;
    }
    if (brgyIsOpen) closeBrgyDropdown(); else openBrgyDropdown();
  });
  brgySearch.addEventListener('focus', () => {
    setTimeout(() => {
      if (!selectedMunicipalityId) return;
      if (!brgyIsOpen) {
        if (barangays.length === 0) {
          loadBarangays(selectedMunicipalityId).then(() => openBrgyDropdown());
        } else {
          openBrgyDropdown();
        }
      }
    }, 100);
  });
  brgySearch.addEventListener('input', () => {
    if (!selectedMunicipalityId) return;
    if (!brgyIsOpen) openBrgyDropdown();
    buildBarangayList(brgySearch.value, brgyHidden.value);
  });
  brgySearch.addEventListener('keydown', (e) => {
    const items = brgyDropdown.querySelectorAll('.combo-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!selectedMunicipalityId) return;
      if (!brgyIsOpen) { if (barangays.length === 0) loadBarangays(selectedMunicipalityId).then(() => openBrgyDropdown()); else openBrgyDropdown(); return; }
      if (items.length === 0) return;
      brgyHighlightedIndex = Math.min(brgyHighlightedIndex + 1, items.length - 1);
      items.forEach(el => el.classList.remove('highlighted'));
      items[brgyHighlightedIndex].classList.add('highlighted');
      items[brgyHighlightedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!brgyIsOpen) return;
      if (items.length === 0) return;
      brgyHighlightedIndex = Math.max(brgyHighlightedIndex - 1, 0);
      items.forEach(el => el.classList.remove('highlighted'));
      items[brgyHighlightedIndex].classList.add('highlighted');
      items[brgyHighlightedIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (brgyIsOpen && brgyHighlightedIndex >= 0 && items[brgyHighlightedIndex]) {
        const id = items[brgyHighlightedIndex].dataset.value;
        const brgy = barangays.find(b => b.Id == id);
        if (brgy) selectBarangay(brgy);
      }
    } else if (e.key === 'Escape') {
      closeBrgyDropdown();
    } else if (e.key === 'Tab') {
      closeBrgyDropdown();
    }
  });
  brgySearch.addEventListener('blur', () => {
    setTimeout(() => {
      const val = brgySearch.value;
      const stored = brgyHidden.value;
      if (val !== stored && !barangays.some(b => b.name === val)) {
        const brgy = barangays.find(b => b.Id == stored);
        brgySearch.value = brgy ? brgy.name : '';
        if (!brgy) brgyHidden.value = '';
      }
      closeBrgyDropdown();
    }, 200);
  });

  // Auto-generate address on field changes
  streetInput.addEventListener('input', generateCompleteAddress);

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    const regionWrapper = regionSearch.closest('.combo-wrapper');
    const provWrapper = provSearch.closest('.combo-wrapper');
    const munWrapper = munSearch.closest('.combo-wrapper');
    const brgyWrapper = brgySearch.closest('.combo-wrapper');
    if (regionWrapper && !regionWrapper.contains(e.target)) closeRegionDropdown();
    if (provWrapper && !provWrapper.contains(e.target)) closeProvDropdown();
    if (munWrapper && !munWrapper.contains(e.target)) closeMunDropdown();
    if (brgyWrapper && !brgyWrapper.contains(e.target)) closeBrgyDropdown();
  });

  // Load initial data
  loadMunicipalities().then(() => {
    if (isEditing && munHidden.value) {
      selectedMunicipalityId = parseInt(munHidden.value);
      const mun = municipalities.find(m => m.id == selectedMunicipalityId);
      if (mun) munSearch.value = mun.name;
      loadBarangays(selectedMunicipalityId).then(() => {
        let resolved = false;
        if (brgyHidden.value) {
          const b = barangays.find(b => b.id == brgyHidden.value);
          if (b) {
            brgySearch.value = b.name;
            selectedBarangayName = b.name;
            resolved = true;
          }
        }
        // Only regenerate the address when the member's municipality+barangay
        // resolve in the reference lists; otherwise keep the stored address
        // intact so updates never corrupt it.
        if (resolved && mun) generateCompleteAddress();
      });
    }
  });
}

function clearMemberForm() {
  editingMemberId = null;
  renderMemberRegistration();
  showToast('Form cleared', 'info');
}

function updateOverallPayment() {
  const mf = parseFloat(document.getElementById('mMembershipFee').value) || 0;
  const msc = parseFloat(document.getElementById('mMsc').value) || 0;
  document.getElementById('mOverallPayment').value = (mf + msc).toFixed(2);
}

async function saveMember() {
  if (isSystemLocked()) {
    showModal('System Locked', '<p>Data entry is currently disabled. The system is locked for monthly reconciliation.</p>',
      '<button class="btn btn-primary" onclick="closeModal()">OK</button>');
    return;
  }
  const data = getMemberFormData();
  if (!data.FullName || !data.BirthDate) {
    showToast('Full Name and Birth Date are required', 'error');
    return;
  }
  if (!data.MunicipalityId) {
    showToast('Please select a Municipality / City', 'error');
    return;
  }
  if (!data.BarangayId) {
    showToast('Please select a Barangay', 'error');
    return;
  }
  showLoading();
  try {
    const result = await window.api.saveMember(data);
    hideLoading();
    if (result.success) {
      if (!editingMemberId) {
        await window.api.addPendingRemittance(result.id);
        data.Id = result.id;
        showToast('Member registered successfully');
        showModal('Member Registered Successfully',
          `<p style="font-size:14px;color:#374151;margin-bottom:6px">Member <strong>${escapeHtml(data.FullName)}</strong> (${escapeHtml(data.AFNo)}) has been registered.</p>
           <p style="font-size:13px;color:#6B7280">What would you like to do next?</p>`,
          `<button class="btn btn-secondary" onclick="closeModal(); navigateTo('remittance', ${result.id})">Go to Remittance</button>
           <button class="btn btn-primary" onclick="closeModal(); doPrintAndGo(${result.id})">Print Form &amp; Go to Remittance</button>`
        );
      } else {
        showToast('Member updated successfully');
        editingMemberId = null;
        renderMemberRegistration();
      }
    } else {
      showToast(result.error || 'Save failed', 'error');
    }
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to save member', 'error');
  }
}

async function doPrintAndGo(memberId) {
  await printMemberFormById(memberId);
  navigateTo('remittance', memberId);
}

// ===== MEMBERSHIP APPLICATION FORM PRINTING =====

function f(val) {
  if (val === null || val === undefined || val === '') return '';
  return escapeHtml(String(val));
}

function fl(val) {
  if (!val) return '';
  const d = typeof val === 'string' ? val : '';
  if (d.length >= 10) return d.slice(0, 10);
  return d;
}

async function generateMemberFormHTML(member) {
  let qrDataUrl = '';
  try {
    const qrContent = [
      'GOLDENHOPE Membership',
      'AF:' + (member.AFNo || member.af_no || ''),
      'ID:' + (member.Id || ''),
      'Name:' + (member.FullName || member.full_name || ''),
      'Date:' + (member.RegistrationDate || member.registration_date || '').slice(0, 10)
    ].join('\n');
    const qrResult = await window.api.generateQR(qrContent);
    if (qrResult && qrResult.success) {
      qrDataUrl = qrResult.dataUrl;
    }
  } catch (e) {}

  const afNo = f(member.AFNo || member.af_no);
  const regDate = member.RegistrationDate || member.registration_date || '';
  const district = f(member.District || member.district);
  const status = f(member.MembershipStatus || member.membership_status);
  const fullName = f(member.FullName || member.full_name);
  const birthDate = fl(member.BirthDate || member.birth_date);
  const age = member.Age || member.age || '';
  const gender = f(member.Gender || member.gender);
  const isMale = (gender || '').toLowerCase() === 'male';
  const isFemale = (gender || '').toLowerCase() === 'female';
  const occupation = f(member.Occupation || member.occupation);
  const religion = f(member.Religion || member.religion);
  const address = f(member.Address || member.address);
  const branchAddr = member.BranchAddress || '';
  const civilStatus = f(member.CivilStatus || member.civil_status);
  const contactNo = f(member.ContactNo || member.contact_no);
  const famName = f(member.FamilyRepName || member.family_rep_name);
  const famBirthDate = fl(member.FamilyRepBirthDate || member.family_rep_birthdate);
  const famAge = member.FamilyRepAge || member.family_rep_age || '';
  const famGender = f(member.FamilyRepGender || member.family_rep_gender);
  const famIsMale = (famGender || '').toLowerCase() === 'male';
  const famIsFemale = (famGender || '').toLowerCase() === 'female';
  const famContact = f(member.FamilyRepContact || member.family_rep_contact);
  const notes = f(member.Notes);

  const d = regDate ? new Date(regDate.slice(0, 10)) : new Date();
  const effDay = String(d.getDate()).padStart(2, '0');
  const effMonth = String(d.getMonth() + 1).padStart(2, '0');
  const effYear = String(d.getFullYear());

  const qrBlock = qrDataUrl
    ? `<img src="${qrDataUrl}" alt="QR" style="width:90px;height:90px;display:block">`
    : `<div style="width:90px;height:90px;border:1px dashed #999;display:flex;align-items:center;justify-content:center;font-size:8px;color:#999;text-align:center">QR<br>Code</div>`;

  const arrowCheck = (checked) => checked
    ? '\u2612'
    : '\u2610';

  const html = `<!DOCTYPE html><html lang="en">
<head>
<meta charset="UTF-8">
<title>Membership Application - ${afNo}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 10mm 8mm 10mm; }
  @media print { .no-print { display: none !important; } }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,Helvetica,sans-serif; width:210mm; min-height:297mm; margin:0 auto; padding:18px 30px 12px 30px; background:#fff; color:#000; font-size:9.5pt; line-height:1.4; }
  .no-print { position:fixed; top:0; left:0; right:0; background:#1e293b; color:#fff; padding:8px 20px; display:flex; align-items:center; gap:10px; z-index:999; }
  .no-print button { padding:6px 16px; border:none; border-radius:5px; font-size:12px; font-weight:600; cursor:pointer; }
  .btn-print { background:#fff; color:#1e293b; }
  .no-print .spacer { flex:1; }

  /* ===== GREEN/GOLD THEME ===== */
  .green-bg { background:#1a4a2e; }
  .green-border { border:1px solid #b8860b; }
  .gold-text { color:#d4a017; }
  .white-text { color:#fff; }

  /* ===== HEADER ===== */
  .header { display:flex; align-items:center; margin-bottom:6px; }
  .header-logo { width:60px; height:60px; flex-shrink:0; margin-right:10px; }
  .header-logo img { width:60px; height:60px; object-fit:contain; }
  .header-center { flex:1; text-align:center; }
  .header-center .org-name { font-family:'Times New Roman',Georgia,serif; font-size:20pt; font-weight:bold; color:#1a4a2e; letter-spacing:1px; text-shadow:0.5px 0.5px 0 #000; line-height:1.1; }
  .header-center .org-sub { font-size:8pt; color:#d4a017; font-weight:bold; letter-spacing:0.5px; margin-top:1px; text-transform:uppercase; font-style:italic; }
  .header-center .sec-bar { background:#1a4a2e; color:#fff; font-size:6.5pt; font-weight:bold; padding:2px 0; margin-top:3px; letter-spacing:0.3px; }
  /* ===== FORM TITLE BAR ===== */
  .form-title-bar { background:#1a4a2e; border:1px solid #b8860b; text-align:center; padding:4px 0; margin-bottom:8px; }
  .form-title-bar span { color:#fff; font-size:11pt; font-weight:bold; letter-spacing:1.5px; }

  /* ===== INFO PANEL ===== */
  .info-panel { display:flex; gap:12px; margin-bottom:10px; }
  .info-left { flex:1.2; }
  .info-left .info-head { font-size:7.5pt; font-weight:bold; color:#1a4a2e; }
  .info-left .info-line { font-size:7pt; color:#333; }
  .info-center { flex:1.8; }
  .info-row { display:flex; align-items:center; font-size:7.5pt; margin-bottom:3px; }
  .info-row .ilbl { font-weight:bold; color:#1a4a2e; min-width:65px; }
  .info-row .ival { border-bottom:1px solid #222; min-width:80px; padding:0 3px; font-size:8.5pt; }
  .info-row .ival.f { border-bottom:none; font-weight:500; }
  .info-row .status-group { display:flex; gap:8px; flex-wrap:wrap; }
  .info-row .status-group label { font-size:8pt; display:flex; align-items:center; gap:3px; cursor:default; }
  .info-right { flex:0.8; text-align:right; }
  .info-right .afno-label { font-size:7pt; font-weight:bold; color:#1a4a2e; margin-bottom:2px; }
  .info-right .afno-value { font-size:18pt; font-weight:bold; color:#cc0000; letter-spacing:2px; border:1px solid #999; padding:2px 8px; display:inline-block; min-width:80px; text-align:center; background:#fff; }

  /* ===== SECTION ===== */
  .section { margin-bottom:6px; }
  .section-header { background:#1a4a2e; border:1px solid #b8860b; padding:3px 10px; }
  .section-header span { color:#fff; font-size:8pt; font-weight:bold; letter-spacing:1px; }
  .section-body { border:1px solid #999; border-top:none; padding:6px 10px; }
  .field { display:flex; align-items:baseline; padding:2px 0; border-bottom:1px dotted #ddd; }
  .field:last-child { border-bottom:none; }
  .flbl { font-weight:bold; font-size:7.5pt; color:#222; min-width:75px; flex-shrink:0; }
  .fval { flex:1; font-size:8.5pt; color:#000; padding-left:2px; border-bottom:1px solid #000; min-height:19px; }
  .fval.f { border-bottom:none; font-weight:500; }
  .field-row { display:flex; gap:14px; padding:2px 0; border-bottom:1px dotted #ddd; flex-wrap:wrap; }
  .field-row { display:flex; gap:16px; padding:2px 0; border-bottom:1px dotted #ddd; flex-wrap:wrap; align-items:center; }
  .field-row .fitem { display:inline-flex; align-items:center; gap:4px; font-size:7.5pt; }
  .field-row .fitem .flbl2 { font-weight:bold; color:#222; white-space:nowrap; }
  .field-row .fitem .fval2 { border-bottom:1px solid #000; min-width:50px; padding:0 4px; font-size:8.5pt; }
  .field-row .fitem .fval2.f { border-bottom:none; font-weight:500; }
  .gender-group { display:inline-flex; align-items:center; gap:6px; }
  .gender-group .cbx { font-size:10pt; line-height:1; }
  .gender-group .glbl { font-size:8pt; }
  .checkbox-pair { display:inline-flex; align-items:center; gap:3px; font-size:8pt; }
  .checkbox-pair .chk { font-size:10pt; line-height:1; }

  /* Effective Date boxes */
  .eff-date-group { display:flex; align-items:center; gap:3px; }
  .eff-date-group .dbox { border:1px solid #000; width:22px; height:20px; text-align:center; font-size:7pt; background:transparent; }
  .eff-date-group .dsep { font-size:8pt; font-weight:bold; }

  /* ===== SIGNATURE ===== */
  .sig-declare { font-size:7pt; color:#333; margin-bottom:6px; line-height:1.5; text-align:justify; }
  .sig-area { display:flex; gap:16px; align-items:stretch; }
  .sig-item { flex:1; display:flex; flex-direction:column; }
  .sig-item .sigbl { font-weight:bold; font-size:7.5pt; color:#222; margin-bottom:2px; }
  .sig-line { border-bottom:1.5px solid #000; flex:1; min-height:25px; margin-top:2px; }
  .sig-notes { flex:1.2; display:flex; flex-direction:column; }
  .sig-notes .slbl { font-weight:bold; font-size:7.5pt; color:#222; margin-bottom:2px; }
  .sig-notes .nbox { border:1px solid #000; flex:1; min-height:52px; padding:4px 6px; font-size:8pt; }

  /* ===== DETACH LINE ===== */
  .detach { margin:12px 0 8px 0; display:flex; align-items:center; gap:6px; }
  .detach .dline { flex:1; border-top:2px dashed #666; }
  .detach .dicon { font-size:12pt; color:#666; }
  .detach .dtext { font-size:6pt; color:#666; font-weight:bold; letter-spacing:1px; white-space:nowrap; }

  /* ===== REPRESENTATIVE COPY ===== */
  .rep-header { display:flex; align-items:flex-start; gap:14px; margin-bottom:6px; }
  .rep-header .rep-title { flex:1; }
  .rep-header .rep-title .rep-head { font-size:9pt; font-weight:bold; color:#1a4a2e; }
  .rep-header .rep-title .rep-sub { font-size:6.5pt; color:#666; }
  .rep-body { display:flex; gap:12px; align-items:flex-start; }
  .rep-body .rep-cols { flex:1; }
  .rep-body .rep-qr { flex-shrink:0; }
  .rep-fields { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:6px; }
  .rep-fields .rf { display:flex; align-items:center; gap:3px; font-size:7.5pt; flex-wrap:wrap; }
  .rep-fields .rf .rfl { font-weight:bold; color:#333; }
  .rep-fields .rf .rfv { border-bottom:1px solid #000; min-width:70px; padding:0 3px; font-size:7.5pt; }
  .rep-fields .rf .rfv.f { border-bottom:none; font-weight:500; }
  .rep-cols { display:flex; gap:12px; }
  .rep-col { flex:1; border:1px solid #999; padding:5px 8px; }
  .rep-col .rch { font-size:7pt; font-weight:bold; color:#1a4a2e; border-bottom:1px solid #b8860b; margin-bottom:3px; padding-bottom:2px; }
  .rep-col .rlin { display:flex; font-size:7pt; padding:1px 0; }
  .rep-col .rlin .rlbl { font-weight:bold; color:#444; min-width:65px; }
  .rep-col .rlin .rval { flex:1; }

  /* ===== FOOTER ===== */
  .footer { background:#1a4a2e; border:1px solid #b8860b; text-align:center; padding:3px 0; margin-top:8px; }
  .footer span { color:#fff; font-size:6.5pt; font-weight:bold; letter-spacing:0.5px; }
</style>
</head>
<body>

<div class="no-print">
  <span style="font-size:12px;font-weight:600">Membership Application Form</span>
  <span style="font-size:11px;opacity:0.7">${afNo}</span>
  <div class="spacer"></div>
  <button class="btn-print" onclick="window.print()">Print</button>
</div>

<!-- ===== HEADER ===== -->
<div class="header">
  <div class="header-logo">
    <img src="../../assets/logo.png" onerror="this.style.display='none'" alt="">
  </div>
  <div class="header-center">
    <div class="org-name">GOLDENHOPE</div>
    <div class="org-sub">Damayan Association and Support Inc.</div>
    <div class="sec-bar white-text">SEC REGISTRATION NO. 2025110227750-03</div>
  </div>
</div>

<!-- ===== FORM TITLE ===== -->
<div class="form-title-bar"><span>MEMBERSHIP APPLICATION FORM</span></div>

<!-- ===== INFO PANEL ===== -->
<div class="info-panel">
  <div class="info-left">
    <div class="info-head">More Information:</div>
    ${branchAddr ? branchAddr.split('\n').map(line => `<div class="info-line">${escapeHtml(line)}</div>`).join('\n') : ''}
    <div class="info-line" style="font-size:6.5pt;color:#1a4a2e;">goldenhopedaamgam@gmail.com</div>
  </div>
  <div class="info-center">
    <div class="info-row">
      <span class="ilbl">Date:</span><span class="ival ${regDate ? 'f' : ''}">${regDate ? formatDate(regDate) : ''}</span>
    </div>
    <div class="info-row">
      <span class="ilbl">District:</span><span class="ival ${district ? 'f' : ''}">${district || ''}</span>
    </div>
    <div class="info-row">
      <span class="ilbl">Status:</span>
      <div class="status-group">
        <label><span class="cbx">${arrowCheck(status === 'Volunteer')}</span> Volunteer</label>
        <label><span class="cbx">${arrowCheck(status === 'Honorary')}</span> Honorary</label>
        <label><span class="cbx">${arrowCheck(status === 'Regular')}</span> Regular</label>
      </div>
    </div>
  </div>
  <div class="info-right">
    <div class="afno-label">Application Form No.</div>
    <div class="afno-value">${afNo}</div>
  </div>
</div>

<!-- ===== SECTION A: MEMBER'S INFORMATION ===== -->
<div class="section">
  <div class="section-header green-border"><span>A. MEMBER'S INFORMATION</span></div>
  <div class="section-body">
    <div class="field">
      <span class="flbl">Full Name:</span>
      <span class="fval ${fullName ? 'f' : ''}">${fullName || ''}</span>
    </div>
    <div class="field-row">
      <div class="fitem">
        <span class="flbl2">Birth Date:</span>
        <span class="fval2 ${birthDate ? 'f' : ''}">${birthDate || ''}</span>
      </div>
      <div class="fitem">
        <span class="flbl2">Gender:</span>
        <span class="gender-group">
          <span class="cbx">${arrowCheck(isMale)}</span><span class="glbl">Male</span>
          <span class="cbx" style="margin-left:4px">${arrowCheck(isFemale)}</span><span class="glbl">Female</span>
        </span>
      </div>
      <div class="fitem">
        <span class="flbl2">Age:</span>
        <span class="fval2 ${age ? 'f' : ''}">${age || ''}</span>
      </div>
    </div>
    <div class="field">
      <span class="flbl">Occupation:</span>
      <span class="fval ${occupation ? 'f' : ''}">${occupation || ''}</span>
    </div>
    <div class="field">
      <span class="flbl">Religion:</span>
      <span class="fval ${religion ? 'f' : ''}">${religion || ''}</span>
    </div>
    <div class="field">
      <span class="flbl">Present Address:</span>
      <span class="fval ${address ? 'f' : ''}">${address || ''}</span>
    </div>
    <div class="field-row">
      <div class="fitem">
        <span class="flbl2">Civil Status:</span>
        <span class="fval2 ${civilStatus ? 'f' : ''}">${civilStatus || ''}</span>
      </div>
      <div class="fitem">
        <span class="flbl2">Contact No.:</span>
        <span class="fval2 ${contactNo ? 'f' : ''}" style="min-width:100px">${contactNo || ''}</span>
      </div>
    </div>
  </div>
</div>

<!-- ===== SECTION B: FAMILY REPRESENTATIVE ===== -->
<div class="section">
  <div class="section-header green-border"><span>B. FAMILY REPRESENTATIVE</span></div>
  <div class="section-body">
    <div class="field">
      <span class="flbl">Full Name:</span>
      <span class="fval ${famName ? 'f' : ''}">${famName || ''}</span>
    </div>
    <div class="field-row">
      <div class="fitem">
        <span class="flbl2">Birth Date:</span>
        <span class="fval2 ${famBirthDate ? 'f' : ''}">${famBirthDate || ''}</span>
      </div>
      <div class="fitem">
        <span class="flbl2">Gender:</span>
        <span class="checkbox-pair"><span class="chk">${arrowCheck(famIsMale)}</span> Male</span>
        <span class="checkbox-pair"><span class="chk">${arrowCheck(famIsFemale)}</span> Female</span>
      </div>
      <div class="fitem">
        <span class="flbl2">Age:</span>
        <span class="fval2 ${famAge ? 'f' : ''}">${famAge || ''}</span>
      </div>
    </div>
    <div class="field">
      <span class="flbl">Effective Date:</span>
      <div class="eff-date-group">
        <span class="dbox">${effDay}</span><span class="dsep">/</span>
        <span class="dbox">${effMonth}</span><span class="dsep">/</span>
        <span class="dbox" style="width:30px">${effYear}</span>
      </div>
    </div>
    <div class="field">
      <span class="flbl">Contact No.:</span>
      <span class="fval ${famContact ? 'f' : ''}">${famContact || ''}</span>
    </div>
  </div>
</div>

<!-- ===== SECTION C: SIGNATURE ===== -->
<div class="section">
  <div class="section-header green-border"><span>C. SIGNATURE</span></div>
  <div class="section-body">
    <div class="sig-declare">
      I/We, the undersigned, after having carefully read and understood the terms and conditions of GOLDENHOPE Damayan Association and Support Inc., do hereby confirm my/our membership application. By signing this form and paying the required contributions, I/We agree to abide by the rules and regulations of the organization.
    </div>
    <div class="sig-area">
      <div class="sig-item">
        <div class="sigbl">Member Signature:</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-item">
        <div class="sigbl">Witness Signature / Printed Name:</div>
        <div class="sig-line"></div>
      </div>
      <div class="sig-notes">
        <div class="slbl">Notes:</div>
        <div class="nbox">${notes || ''}</div>
      </div>
    </div>
  </div>
</div>

<!-- ===== DETACH LINE ===== -->
<div class="detach">
  <span class="dicon">&#9986;</span>
  <div class="dline"></div>
  <span class="dtext">REPRESENTATIVE COPY - DETACH HERE</span>
  <div class="dline"></div>
  <span class="dicon">&#9986;</span>
</div>

<!-- ===== REPRESENTATIVE COPY ===== -->
<div class="rep-header">
  <div class="rep-title">
    <div class="rep-head">REPRESENTATIVE COPY</div>
    <div class="rep-sub">GOLDENHOPE Damayan Association and Support Inc.</div>
  </div>
</div>

<div class="rep-fields">
  <div class="rf"><span class="rfl">Full Name:</span><span class="rfv ${fullName ? 'f' : ''}">${fullName || ''}</span></div>
  <div class="rf"><span class="rfl">Birth Date:</span><span class="rfv ${birthDate ? 'f' : ''}">${birthDate || ''}</span></div>
  <div class="rf"><span class="rfl">Gender:</span>
    <span class="checkbox-pair"><span class="chk">${arrowCheck(isMale)}</span>Male</span>
    <span class="checkbox-pair"><span class="chk">${arrowCheck(isFemale)}</span>Female</span>
  </div>
</div>

<div class="rep-fields">
  <div class="rf"><span class="rfl">Application Form No.:</span><span class="rfv f" style="color:#cc0000;font-weight:bold;border:none">${afNo}</span></div>
  <div class="rf"><span class="rfl">Effective Date:</span><span class="rfv f">${effMonth}/${effDay}/${effYear}</span></div>
</div>

<div class="rep-body">
  <div class="rep-cols">
    <div class="rep-col">
      <div class="rch">MEMBER'S COPY</div>
      <div class="rlin"><span class="rlbl">Name:</span><span class="rval">${fullName || ''}</span></div>
      <div class="rlin"><span class="rlbl">Birth Date:</span><span class="rval">${birthDate || ''}</span></div>
      <div class="rlin"><span class="rlbl">Gender:</span><span class="rval">${gender || ''}</span></div>
      <div class="rlin"><span class="rlbl">Contact:</span><span class="rval">${contactNo || ''}</span></div>
    </div>
    <div class="rep-col">
      <div class="rch">REPRESENTATIVE</div>
      <div class="rlin"><span class="rlbl">Name:</span><span class="rval">${famName || ''}</span></div>
      <div class="rlin"><span class="rlbl">Birth Date:</span><span class="rval">${famBirthDate || ''}</span></div>
      <div class="rlin"><span class="rlbl">Gender:</span><span class="rval">${famGender || ''}</span></div>
      <div class="rlin"><span class="rlbl">Contact:</span><span class="rval">${famContact || ''}</span></div>
      <div class="rlin" style="margin-top:3px"><span class="rlbl">Verified By:</span><span class="rval" style="border-bottom:1px solid #000;min-height:14px"></span></div>
    </div>
  </div>
  <div class="rep-qr">${qrBlock}</div>
</div>

<!-- ===== FOOTER ===== -->
<div class="footer"><span>SEC REGISTRATION NO. 20251102277580-03</span></div>

</body></html>`;
  return html;
}

async function printMemberForm() {
  try {
    const data = getMemberFormData();
    // Get branch address for printed form
    if (data.BranchId) {
      const branchesRes = await window.api.getActiveBranches();
      if (branchesRes.success) {
        const branch = branchesRes.data.find(b => b.Id == data.BranchId);
        if (branch) data.BranchAddress = branch.Address;
      }
    }
    const html = await generateMemberFormHTML(data);
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      showToast('Please allow pop-ups to print forms', 'error');
      return;
    }
    printWin.document.write(html);
    printWin.document.close();
  } catch (e) {
    showToast('Print error: ' + e.message, 'error');
    console.error('printMemberForm error:', e);
  }
}

async function printMemberFormById(id) {
  try {
    showLoading();
    const result = await window.api.getMember(id);
    hideLoading();
    if (!result.success || !result.data) {
      showToast('Member not found', 'error');
      return;
    }
    const m = result.data;
    const member = {
      Id: m.Id,
      AFNo: m.af_no,
      RegistrationDate: m.registration_date,
      District: m.district,
      MembershipStatus: m.membership_status,
      FullName: m.full_name,
      BirthDate: m.birth_date,
      Age: m.age,
      Gender: m.gender,
      Occupation: m.occupation,
      Religion: m.religion,
      Address: m.address,
      CivilStatus: m.civil_status,
      ContactNo: m.contact_no,
      FamilyRepName: m.family_rep_name,
      FamilyRepBirthDate: m.family_rep_birthdate,
      FamilyRepAge: m.family_rep_age,
      FamilyRepGender: m.family_rep_gender,
      FamilyRepContact: m.family_rep_contact,
      BranchAddress: m.BranchAddress,
      Notes: m.Notes
    };
    const html = await generateMemberFormHTML(member);
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
      showToast('Please allow pop-ups to print forms', 'error');
      return;
    }
    printWin.document.write(html);
    printWin.document.close();
  } catch (e) {
    hideLoading();
    showToast('Print error: ' + e.message, 'error');
    console.error('printMemberFormById error:', e);
  }
}

async function exportMemberFormPDF() {
  try {
    const data = getMemberFormData();
    if (data.BranchId) {
      const branchesRes = await window.api.getActiveBranches();
      if (branchesRes.success) {
        const branch = branchesRes.data.find(b => b.Id == data.BranchId);
        if (branch) data.BranchAddress = branch.Address;
      }
    }
    const html = await generateMemberFormHTML(data);
    const filename = `Membership_Application_${data.AFNo || 'draft'}.pdf`;
    showLoading();
    const result = await window.api.printToPDF(html, filename);
    hideLoading();
    if (result && result.success) {
      const uint8 = new Uint8Array(result.data);
      const blob = new Blob([uint8], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename || filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('PDF exported successfully');
    } else {
      showToast('Failed to export PDF: ' + (result ? result.error : 'Unknown error'), 'error');
    }
  } catch (e) {
    hideLoading();
    showToast('Export error: ' + e.message, 'error');
    console.error('exportMemberFormPDF error:', e);
  }
}

async function editMember(id) {
  showLoading();
  let result;
  try {
    result = await window.api.getMember(id);
  } catch (err) {
    hideLoading();
    showToast(err.message || 'Failed to load member', 'error');
    return;
  }
  hideLoading();
  if (!result.success || !result.data) {
    showToast('Member not found', 'error');
    return;
  }
  const m = result.data;
  const member = {
    Id: m.Id,
    AFNo: m.af_no,
    RegistrationDate: m.registration_date,
    BranchId: m.branch_id,
    MembershipStatus: m.membership_status,
    MembershipFee: m.membership_fee,
    Msc: m.msc,
    OverallPayment: m.overall_payment,
    FullName: m.full_name,
    BirthDate: m.birth_date,
    Age: m.age,
    Gender: m.gender,
    Occupation: m.occupation,
    Religion: m.religion,
    Address: m.complete_address || m.address,
    CivilStatus: m.civil_status,
    ContactNo: m.contact_no,
    FamilyRepName: m.family_rep_name,
    FamilyRepBirthDate: m.family_rep_birthdate,
    FamilyRepAge: m.family_rep_age,
    FamilyRepGender: m.family_rep_gender,
    FamilyRepContact: m.family_rep_contact,
    BarangayCoordinatorId: m.barangay_coordinator_id,
    SalesCoordinatorId: m.sales_coordinator_id,
    Notes: m.Notes,
    province_id: m.province_id,
    province_name: m.province_name,
    region_id: m.region_id,
    region_name: m.region_name,
    municipality_id: m.municipality_id,
    barangay_id: m.barangay_id,
    municipality_name: m.municipality_name,
    barangay_name: m.barangay_name,
    house_no: m.house_no,
    street: m.street,
    complete_address: m.complete_address
  };
  await renderMemberRegistration(member);
}
