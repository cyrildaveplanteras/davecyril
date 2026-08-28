let reportData = null;
let mmlDiedMonthly = {};
let currentReportType = null;
let mmlFilters = {
  month: String(new Date().getMonth() + 1).padStart(2, '0'),
  year: new Date().getFullYear(),
  district: '',
  province: '',
  municipality: '',
  barangay: '',
  coordinator_id: '',
  membership_status: ''
};

let rfrFilters = {
  district: '', barangay: '', coordinator_id: '', membership_status: '', search: ''
};
let rfrSearchTimeout = null;

let dfmFilters = {
  district: '', barangay: '', coordinator_id: '', membership_status: '', search: '', balance_min: '', balance_max: ''
};
let dfmSearchTimeout = null;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function renderReports() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
    <div class="reports-page-anim">
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon report-section-icon-blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <h2 class="report-section-title">Member Reports</h2>
            <p class="report-section-subtitle">Member-related reports and listings</p>
          </div>
        </div>
        <div class="report-cards-grid">
          <div class="report-card report-card-blue report-item" data-report-type="member-master-list" onclick="generateReport('member-master-list')">
            <div class="report-card-icon report-card-icon-blue">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>
            </div>
            <h3 class="report-card-title">Member Master List</h3>
            <p class="report-card-desc">Complete list of all active members with MSC deduction summary</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
          <div class="report-card report-card-blue report-item" data-report-type="active-members" onclick="generateReport('active-members')">
            <div class="report-card-icon report-card-icon-blue">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
            </div>
            <h3 class="report-card-title">Active Members</h3>
            <p class="report-card-desc">List of currently active members with status</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
          <div class="report-card report-card-blue report-item" data-report-type="inactive-members" onclick="generateReport('inactive-members')">
            <div class="report-card-icon report-card-icon-blue">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="9" x2="23" y2="14"/><line x1="23" y1="9" x2="18" y2="14"/></svg>
            </div>
            <h3 class="report-card-title">Inactive Members</h3>
            <p class="report-card-desc">List of inactive members requiring attention</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
          <div class="report-card report-card-blue report-item" data-report-type="deceased-members" onclick="generateReport('deceased-members')">
            <div class="report-card-icon report-card-icon-blue">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M22 12.8V12a10 10 0 0 0-19.4-2.2"/></svg>
            </div>
            <h3 class="report-card-title">Deceased Members</h3>
            <p class="report-card-desc">Record of deceased members and benefits</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
        </div>
      </div>

      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon report-section-icon-green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <h2 class="report-section-title">Financial Reports</h2>
            <p class="report-section-subtitle">Financial summaries and collection data</p>
          </div>
        </div>
        <div class="report-cards-grid">
          <div class="report-card report-card-green report-item" data-report-type="monthly-remittance" onclick="generateReport('monthly-remittance')">
            <div class="report-card-icon report-card-icon-green">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <h3 class="report-card-title">Monthly Remittance</h3>
            <p class="report-card-desc">Monthly remittance records and transactions</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
          <div class="report-card report-card-green report-item" data-report-type="collection-summary" onclick="generateReport('collection-summary')">
            <div class="report-card-icon report-card-icon-green">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><line x1="18" y1="12" x2="18" y2="12.01"/></svg>
            </div>
            <h3 class="report-card-title">Collection Summary</h3>
            <p class="report-card-desc">Summary of all collection efforts and totals</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
          <div class="report-card report-card-green report-item" data-report-type="financial-summary" onclick="generateReport('financial-summary')">
            <div class="report-card-icon report-card-icon-green">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
            </div>
            <h3 class="report-card-title">Financial Summary</h3>
            <p class="report-card-desc">Comprehensive financial breakdown and analysis</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
        </div>
      </div>

      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon report-section-icon-orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <h2 class="report-section-title">Coordinator Reports</h2>
            <p class="report-section-subtitle">Coordinator-related records and reports</p>
          </div>
        </div>
        <div class="report-cards-grid">
          <div class="report-card report-card-orange report-item" data-report-type="barangay-coordinators" onclick="generateReport('barangay-coordinators')">
            <div class="report-card-icon report-card-icon-orange">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <h3 class="report-card-title">Barangay Coordinators</h3>
            <p class="report-card-desc">List of all barangay coordinator records</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
          <div class="report-card report-card-orange report-item" data-report-type="sales-coordinators" onclick="generateReport('sales-coordinators')">
            <div class="report-card-icon report-card-icon-orange">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            </div>
            <h3 class="report-card-title">Sales Coordinators</h3>
            <p class="report-card-desc">List of all sales coordinator records</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
        </div>
      </div>

      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon report-section-icon-green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>
            <h2 class="report-section-title">Membership Reports</h2>
            <p class="report-section-subtitle">Renewal and MSC balance monitoring</p>
          </div>
        </div>
        <div class="report-cards-grid">
          <div class="report-card report-card-green report-item" data-report-type="ready-for-renewal" onclick="generateReport('ready-for-renewal')">
            <div class="report-card-icon report-card-icon-green">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3 class="report-card-title">Ready for Renewal</h3>
            <p class="report-card-desc">Members approaching membership renewal within 2 months</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
          <div class="report-card report-card-green report-item" data-report-type="due-for-msc" onclick="generateReport('due-for-msc')">
            <div class="report-card-icon report-card-icon-green">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/></svg>
            </div>
            <h3 class="report-card-title">Due for MSC</h3>
            <p class="report-card-desc">Members with MSC balance below ₱100.00</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
        </div>
      </div>

      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon report-section-icon-purple">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <div>
            <h2 class="report-section-title">Other Reports</h2>
            <p class="report-section-subtitle">Additional reports and records</p>
          </div>
        </div>
        <div class="report-cards-grid">
          <div class="report-card report-card-purple report-item" data-report-type="damayan-deductions" onclick="generateReport('damayan-deductions')">
            <div class="report-card-icon report-card-icon-purple">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><path d="M9 12l2 2 4-4"/></svg>
            </div>
            <h3 class="report-card-title">Damayan Deductions</h3>
            <p class="report-card-desc">Death benefit deductions and claims records</p>
            <span class="report-card-btn">Generate Report</span>
          </div>
        </div>
      </div>

      <div id="remittanceSlipFilterPanel" class="hidden">
        <div class="mml-filter-card">
          <div class="mml-filter-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            <h3>Monthly Remittance Slip - Filters</h3>
          </div>
          <div class="mml-filter-grid">
            <div class="mml-filter-group">
              <label>Month</label>
              <input type="month" id="rsMonth" class="form-input" value="${new Date().toISOString().slice(0, 7)}">
            </div>
            <div class="mml-filter-group">
              <label>Search Member</label>
              <input type="text" id="rsSearch" class="form-input" placeholder="Search by AF No., Name, Coordinator...">
            </div>
          </div>
          <div class="mml-filter-actions">
            <button class="btn btn-primary" onclick="generateRemittanceSlipReport()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Generate Slip
            </button>
            <button class="btn btn-secondary" onclick="document.getElementById('remittanceSlipFilterPanel')?.classList.add('hidden')">Cancel</button>
          </div>
        </div>
      </div>

      <div id="mmlFilterPanel" class="hidden">
        <div class="mml-filter-card">
          <div class="mml-filter-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
            <h3>Member Master List - Report Filters</h3>
          </div>
          <div class="mml-filter-grid">
            <div class="mml-filter-group">
              <label>Reporting Month</label>
              <select id="mmlMonth">
                ${MONTHS.map((m, i) => `<option value="${String(i+1).padStart(2,'0')}" ${mmlFilters.month === String(i+1).padStart(2,'0') ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <div class="mml-filter-group">
              <label>Reporting Year</label>
              <input type="number" id="mmlYear" value="${mmlFilters.year}" min="2020" max="2100">
            </div>
            <div class="mml-filter-group">
              <label>District</label>
              <select id="mmlDistrict"><option value="">All Districts</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Region</label>
              <select id="mmlRegion"><option value="">All Regions</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Province</label>
              <select id="mmlProvince"><option value="">All Provinces</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Municipality / City</label>
              <select id="mmlMunicipality"><option value="">All Municipalities</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Barangay</label>
              <select id="mmlBarangay"><option value="">All Barangays</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Sales Coordinator</label>
              <select id="mmlCoordinator"><option value="">All Coordinators</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Membership Status</label>
              <select id="mmlMembershipStatus">
                <option value="">All</option>
                <option value="Regular">Regular</option>
                <option value="Honorary">Honorary</option>
                <option value="Inactive">Inactive</option>
                <option value="Pending Renewal">Pending Renewal</option>
                <option value="Deceased">Deceased</option>
              </select>
            </div>

          </div>
          <div class="mml-filter-actions">
            <button class="btn btn-primary" onclick="generateMemberMasterListReport()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Generate Report
            </button>
            <button class="btn btn-secondary" onclick="resetMMLFilters()">Reset Filters</button>
          </div>
        </div>
      </div>

      <div id="rfrFilterPanel" class="hidden">
        <div class="mml-filter-card">
          <div class="mml-filter-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <h3>Ready for Renewal - Report Filters</h3>
          </div>
          <div class="mml-filter-grid">
            <div class="mml-filter-group">
              <label>District</label>
              <select id="rfrDistrict"><option value="">All Districts</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Region</label>
              <select id="rfrRegion"><option value="">All Regions</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Province</label>
              <select id="rfrProvince"><option value="">All Provinces</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Municipality / City</label>
              <select id="rfrMunicipality"><option value="">All Municipalities</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Barangay</label>
              <select id="rfrBarangay"><option value="">All Barangays</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Sales Coordinator</label>
              <select id="rfrCoordinator"><option value="">All Coordinators</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Membership Status</label>
              <select id="rfrMembershipStatus">
                <option value="">All</option>
                <option value="Regular">Regular</option>
                <option value="Honorary">Honorary</option>
                <option value="Inactive">Inactive</option>
                <option value="Pending Renewal">Pending Renewal</option>
                <option value="Deceased">Deceased</option>
              </select>
            </div>
            <div class="mml-filter-group">
              <label>Search Member</label>
              <input type="text" id="rfrSearch" placeholder="Search by AF No., Name, Contact..." oninput="onRFRSearchInput()">
            </div>
          </div>
          <div class="mml-filter-actions">
            <button class="btn btn-primary" onclick="generateReadyForRenewalReport()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Generate Report
            </button>
            <button class="btn btn-secondary" onclick="resetRFRFilters()">Reset Filters</button>
          </div>
        </div>
      </div>

      <div id="dfmFilterPanel" class="hidden">
        <div class="mml-filter-card">
          <div class="mml-filter-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2"/></svg>
            <h3>Due for MSC - Report Filters</h3>
          </div>
          <div class="mml-filter-grid">
            <div class="mml-filter-group">
              <label>District</label>
              <select id="dfmDistrict"><option value="">All Districts</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Region</label>
              <select id="dfmRegion"><option value="">All Regions</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Province</label>
              <select id="dfmProvince"><option value="">All Provinces</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Municipality / City</label>
              <select id="dfmMunicipality"><option value="">All Municipalities</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Barangay</label>
              <select id="dfmBarangay"><option value="">All Barangays</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Sales Coordinator</label>
              <select id="dfmCoordinator"><option value="">All Coordinators</option></select>
            </div>
            <div class="mml-filter-group">
              <label>Membership Status</label>
              <select id="dfmMembershipStatus">
                <option value="">All</option>
                <option value="Regular">Regular</option>
                <option value="Honorary">Honorary</option>
                <option value="Inactive">Inactive</option>
                <option value="Pending Renewal">Pending Renewal</option>
                <option value="Deceased">Deceased</option>
              </select>
            </div>
            <div class="mml-filter-group">
              <label>Search Member</label>
              <input type="text" id="dfmSearch" placeholder="Search by AF No., Name, Contact..." oninput="onDFMSearchInput()">
            </div>
            <div class="mml-filter-group">
              <label>Balance Range</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="number" id="dfmBalanceMin" placeholder="Min" step="0.01" min="0" style="width:80px">
                <span>to</span>
                <input type="number" id="dfmBalanceMax" placeholder="Max" step="0.01" min="0" style="width:80px">
              </div>
            </div>
          </div>
          <div class="mml-filter-actions">
            <button class="btn btn-primary" onclick="generateDueForMSCReport()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Generate Report
            </button>
            <button class="btn btn-secondary" onclick="resetDFMFilters()">Reset Filters</button>
          </div>
        </div>
      </div>

      <div id="reportResultContainer"></div>
    </div>`;
}

function resetMMLFilters() {
  mmlFilters = {
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
    year: new Date().getFullYear(),
    district: '', province: '', municipality: '', barangay: '', coordinator_id: '', membership_status: ''
  };
  document.getElementById('mmlMonth').value = mmlFilters.month;
  document.getElementById('mmlYear').value = mmlFilters.year;
  document.getElementById('mmlDistrict').value = '';
  document.getElementById('mmlProvince').value = '';
  document.getElementById('mmlMunicipality').innerHTML = '<option value="">All Municipalities</option>';
  document.getElementById('mmlBarangay').innerHTML = '<option value="">All Barangays</option>';
  document.getElementById('mmlCoordinator').value = '';
  document.getElementById('mmlMembershipStatus').value = '';
}

async function generateReport(type) {
  if (type === 'member-master-list') { return showMMLFilterPanel(); }
  if (type === 'ready-for-renewal') { return showRFRFilterPanel(); }
  if (type === 'due-for-msc') { return showDFMFilterPanel(); }
  if (type === 'monthly-remittance') { return showMonthlyRemittanceFilterPanel(); }

  try {
    if (type !== 'monthly-remittance') {
      const paramsEl = document.getElementById('reportParams');
      if (paramsEl) paramsEl.classList.add('hidden');
    }

    currentReportType = type;
    showLoading();

    let params = {};
    const result = await window.api.getReport(type, params);
    hideLoading();

    if (!result || !result.success) {
      showToast(result?.error || 'Report failed', 'error');
      return;
    }
    reportData = result.data;

    const items = document.querySelectorAll('.report-item');
    let label = type;
    items.forEach(el => {
      if (el.getAttribute('data-report-type') === type) {
        const titleEl2 = el.querySelector('.report-card-title');
        if (titleEl2) label = titleEl2.textContent.trim();
      }
    });

    let tableHtml = '';
    if (!reportData || reportData.length === 0) {
      tableHtml = '<p class="text-center" style="color:var(--text-light);padding:20px">No data found</p>';
    } else {
      const cols = Object.keys(reportData[0]);
      const currencyCols = ['MF', 'MSC', 'Total', 'COM', 'Net', 'NetDeposit', 'Deposit', 'Fee', 'Payment', 'Savings', 'Amount', 'TotalDeposit'];
      tableHtml = '<table><thead><tr>' + cols.map(c => `<th>${escapeHtml(c.replace(/([A-Z])/g, ' $1').trim())}</th>`).join('') + '</tr></thead><tbody>';
      tableHtml += reportData.map(row => '<tr>' + cols.map(c => {
        const val = row[c];
        if (val === null || val === undefined) return '<td></td>';
        if (typeof val === 'number') {
          if (currencyCols.some(k => c.toLowerCase() === k.toLowerCase())) return `<td class="text-right">${formatCurrency(val)}</td>`;
          if (c.toLowerCase() !== 'items') return `<td class="text-right">${Number(val).toFixed(2)}</td>`;
        }
        if (val instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(val))) return `<td>${formatDate(val)}</td>`;
        return `<td>${escapeHtml(String(val))}</td>`;
      }).join('') + '</tr>').join('');
      tableHtml += '</tbody></table>';
    }

    const container = document.getElementById('reportResultContainer');
    if (container) {
      container.innerHTML = `
        <div class="report-result-wrap">
          <div class="report-result-header">
            <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Back to Reports
            </button>
            <h3>${escapeHtml(label)}</h3>
          </div>
          <div class="card report-result-card report-result-reveal">
            <div class="card-header"><h3 id="reportTitle">${escapeHtml(label)}</h3>
              <div class="btn-group">
                <button class="btn btn-primary btn-sm" onclick="exportReportPDF()">Export PDF</button>
                <button class="btn btn-success btn-sm" onclick="exportReportExcel()">Export Excel</button>
                <button class="btn btn-secondary btn-sm" onclick="exportReportCSV()">Export CSV</button>
                <button class="btn btn-outline btn-sm" onclick="printReport()">Print</button>
              </div>
            </div>
            <div class="card-body"><div id="reportContent" class="table-container">${tableHtml}</div></div>
          </div>
        </div>`;
      setTimeout(() => container.querySelector('.report-result-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  } catch (err) {
    console.error('generateReport error:', err);
    hideLoading();
    showToast('Failed to generate report: ' + err.message, 'error');
  }
}

// ===== MONTHLY REMITTANCE SLIP =====

function parseMemberNameForDisplay(fullName) {
  if (!fullName) return '';
  const parts = fullName.split(',').map(s => s.trim());
  if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
  const sp = fullName.trim().split(/\s+/);
  if (sp.length <= 1) return fullName;
  const last = sp.pop();
  return `${last}, ${sp.join(' ')}`;
}

async function showMonthlyRemittanceFilterPanel() {
  document.getElementById('reportParams')?.classList.add('hidden');
  document.getElementById('mmlFilterPanel')?.classList.add('hidden');
  document.getElementById('rfrFilterPanel')?.classList.add('hidden');
  document.getElementById('dfmFilterPanel')?.classList.add('hidden');
  document.getElementById('reportResultContainer').innerHTML = '';
  const panel = document.getElementById('remittanceSlipFilterPanel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  currentReportType = 'monthly-remittance';
}

async function generateRemittanceSlipReport() {
  const month = document.getElementById('rsMonth')?.value;
  const search = document.getElementById('rsSearch')?.value.trim() || '';
  if (!month) { showToast('Please select a month', 'warning'); return; }
  showLoading();
  try {
    const result = await window.api.getMonthlyRemittanceSlip({ month });
    if (!result.success) { hideLoading(); showToast(result.error, 'error'); return; }
    const data = result.data;
    if (!data.details || data.details.length === 0) {
      hideLoading(); showToast('No remittance records found for this month', 'info'); return;
    }
    let details = data.details;
    if (search) {
      const q = search.toLowerCase();
      details = details.filter(d =>
        (d.AFNo && d.AFNo.toLowerCase().includes(q)) ||
        (d.MemberName && d.MemberName.toLowerCase().includes(q)) ||
        (d.SalesCoordinator && d.SalesCoordinator.toLowerCase().includes(q))
      );
      if (details.length === 0) { hideLoading(); showToast('No matching entries found', 'info'); return; }
    }
    let logoHtml = '';
    try {
      const logoResult = await window.api.getLogoBase64();
      if (logoResult.success && logoResult.dataUrl) {
        logoHtml = logoResult.dataUrl;
      }
    } catch (e) {}
    document.getElementById('remittanceSlipFilterPanel')?.classList.add('hidden');
    document.getElementById('reportParams')?.classList.add('hidden');
    const slipData = { ...data, details, logoDataUrl: logoHtml };
    const container = document.getElementById('reportResultContainer');
    container.innerHTML = buildRemittanceSlipFragment(slipData, month);
    container.dataset.slipHtml = buildRemittanceSlipHTML(slipData);
    window._slipData = slipData;
    hideLoading();
    setTimeout(() => container.querySelector('.report-result-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  } catch (err) {
    hideLoading();
    console.error('Remittance slip error:', err);
    showToast('Failed to generate remittance slip', 'error');
  }
}

function buildRemittanceSlipFragment(data, monthLabel) {
  const details = data.details || [];
  const user = getCurrentUser();
  const userName = user ? (user.fullName || user.username || 'Unknown') : 'Unknown';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateDeposit = data.DateDeposit ? (() => {
    const d = new Date(data.DateDeposit);
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  })() : '';
  const logoHtml = data.logoDataUrl
    ? `<img src="${data.logoDataUrl}" alt="GOLDENHOPE Logo" style="width:35px;height:35px;object-fit:contain;display:block">`
    : `<div style="width:35px;height:35px;border:1px solid #000;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">GH</div>`;

  let totalMF = 0, totalMSC = 0, totalHDA = 0, totalAmount = 0, totalCOM = 0, totalNet = 0;
  const rowsHtml = details.map((d, i) => {
    const mf = parseFloat(d.MF) || 0;
    const msc = parseFloat(d.MSC) || 0;
    const hda = parseFloat(d.HDA) || 0;
    const total = parseFloat(d.Total) || 0;
    const com = parseFloat(d.COM) || 0;
    const net = parseFloat(d.NetDeposit) || 0;
    totalMF += mf; totalMSC += msc; totalHDA += hda; totalAmount += total; totalCOM += com; totalNet += net;
    const name = d.full_name || d.MemberName || '';
    return `<tr>
      <td class="c">${escapeHtml(d.AFNo || '')}</td>
      <td class="l">${escapeHtml(parseMemberNameForDisplay(name))}</td>
      <td class="l">${escapeHtml(d.SalesCoordinator || '')}</td>
      <td class="r">${mf.toFixed(2)}</td>
      <td class="r">${msc.toFixed(2)}</td>
      <td class="r">${hda.toFixed(2)}</td>
      <td class="r">${total.toFixed(2)}</td>
      <td class="r">${com.toFixed(2)}</td>
      <td class="r">${net.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const rowCount = details.length;
  const minRows = 20;
  let blankRows = '';
  if (rowCount < minRows) {
    for (let i = rowCount; i < minRows; i++) {
      blankRows += '<tr><td class="c">&nbsp;</td><td class="l">&nbsp;</td><td class="l">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td></tr>';
    }
  }
  const totalsRowHtml = `<tr class="totals-row">
    <td colspan="3" style="text-align:right;font-weight:700;padding-right:8px;border:1px solid #000;background:#E5E7EB">GRAND TOTAL</td>
    <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalMF.toFixed(2)}</td>
    <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalMSC.toFixed(2)}</td>
    <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalHDA.toFixed(2)}</td>
    <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalAmount.toFixed(2)}</td>
    <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalCOM.toFixed(2)}</td>
    <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalNet.toFixed(2)}</td>
  </tr>`;

  const slipContent = `<style>
  .slip-fragment .org-row { text-align:center;margin-bottom:10px; }
  .slip-fragment .org-row-inner { display:inline-flex;align-items:center;gap:12px;text-align:left; }
  .slip-fragment .org-logo { flex-shrink:0; }
  .slip-fragment .org-logo img { width:45px;height:45px;object-fit:contain;display:block; }
  .slip-fragment .org-name { font-size:13pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;line-height:1.2; }
  .slip-fragment .org-addr { font-size:9pt;line-height:1.3; }
  .slip-fragment .org-sec { font-size:8pt; }
  .slip-fragment .title-row { position:relative;margin:12px 0 8px;text-align:center;padding-bottom:4px; }
  .slip-fragment .title-row h2 { font-size:14pt;font-weight:700;letter-spacing:1px;margin:0; }
  .slip-fragment .date-info { position:absolute;right:0;top:0;text-align:right;font-size:9pt; }
  .slip-fragment .date-info .lbl { font-weight:700; }
  .slip-fragment .date-info .val { display:inline-block;min-width:120px;border-bottom:1px solid #000;text-align:right; }
  .slip-fragment table { width:100%;border-collapse:collapse;font-size:9pt; }
  .slip-fragment thead th { font-size:9pt;font-weight:700;border:1px solid #000;padding:5px 4px;text-align:center;vertical-align:middle;background:#fff; }
  .slip-fragment tbody td { border:1px solid #000;padding:4px;font-size:9pt;vertical-align:middle; }
  .slip-fragment td.c { text-align:center; }
  .slip-fragment td.l { text-align:left;padding-left:6px; }
  .slip-fragment td.r { text-align:right;padding-right:6px;font-variant-numeric:tabular-nums; }
  .slip-fragment .totals-row td { font-weight:700;border-top:2px solid #000;padding:5px 4px; }
  .slip-fragment .sig-section { margin-top:18px; }
  .slip-fragment .sig-row { display:flex;justify-content:space-between; }
  .slip-fragment .sig-box { text-align:center;width:30%; }
  .slip-fragment .sig-line { border-top:1px solid #000;margin-top:36px;height:1px;width:80%;margin-left:auto;margin-right:auto; }
  .slip-fragment .sig-label { font-size:9pt;font-weight:700;margin-top:3px; }
  .slip-fragment .print-info { text-align:center;font-size:7pt;color:#555;margin-top:8px; }
<\/style>
<div class="slip-fragment">
  <div class="org-row">
    <div class="org-row-inner">
      <div class="org-logo">${logoHtml}</div>
      <div>
        <div class="org-name">GOLDENHOPE DAMAYAN ASSOCIATION AND SUPPORT INC.</div>
        <div class="org-addr">${escapeHtml(data.BranchAddress || 'Poblacion, Manukan, Zamboanga del Norte')}</div>
        <div class="org-sec">SEC REG. NO. 2025110227750-03</div>
      </div>
    </div>
  </div>
  <div class="title-row">
    <h2>DAMAYAN REMITTANCE SLIP</h2>
    <div style="font-size:7pt;font-weight:600;color:#444;margin-top:-4px;margin-bottom:2px">Remittance No: ${escapeHtml(data.RemittanceNo || '')}</div>
    <div class="date-info">
      <div><span class="lbl">Date Deposit :</span> <span class="val">${escapeHtml(dateDeposit)}</span></div>
      <div style="margin-top:3px"><span class="lbl">Total Deposit :</span> <span class="val">&#8369;${totalNet.toFixed(2)}</span></div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="width:8%">AF NO.</th>
      <th style="width:22%">MEMBER'S NAME</th>
      <th style="width:14%">SALES COORDINATOR</th>
      <th style="width:8%">MF</th>
      <th style="width:8%">MSC</th>
      <th style="width:8%">HDA</th>
      <th style="width:9%">TOTAL</th>
      <th style="width:8%">COM</th>
      <th style="width:15%">NET DEPOSIT</th>
    </tr></thead>
    <tbody>
      ${rowsHtml}
      ${blankRows}
      ${totalsRowHtml}
    </tbody>
  </table>
  <div class="sig-section">
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line"></div><div class="sig-label">PREPARED BY</div></div>
      <div class="sig-box"><div class="sig-line"></div><div class="sig-label">VERIFIED BY</div></div>
      <div class="sig-box"><div style="font-size:8pt;margin-top:14px;line-height:1.5">
        Page 1 of 1<br>Generated: ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}<br>Generated By: ${escapeHtml(userName)}
      </div></div>
    </div>
  </div>
</div>`;

  const label = `Monthly Remittance Slip — ${escapeHtml(monthLabel || '')}`;
  return `
    <div class="report-result-wrap">
      <div class="report-result-header">
        <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Reports
        </button>
        <h3>${label}</h3>
      </div>
      <div class="card report-result-card report-result-reveal">
        <div class="card-header">
          <h3 id="reportTitle">${label}</h3>
          <div class="btn-group">
            <button class="btn btn-primary btn-sm" onclick="previewRemittanceSlip()">Print Preview</button>
            <button class="btn btn-primary btn-sm" onclick="printReportRemittanceSlip()">Print</button>
            <button class="btn btn-primary btn-sm" onclick="downloadRemittanceSlipPDF(window._slipData)">PDF</button>
            <button class="btn btn-success btn-sm" onclick="downloadRemittanceSlipExcelXLSX(window._slipData)">Excel</button>
            <button class="btn btn-secondary btn-sm" onclick="downloadRemittanceSlipExcel(window._slipData)">CSV</button>
          </div>
        </div>
        <div class="card-body" style="padding:12px;background:#fff;overflow:auto">
          <div id="reportContent" class="table-container" style="background:#fff">${slipContent}</div>
        </div>
      </div>
    </div>`;
}

function buildRemittanceSlipHTML(data) {
  const details = data.details || [];
  const user = getCurrentUser();
  const userName = user ? (user.fullName || user.username || 'Unknown') : 'Unknown';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const dateDeposit = data.DateDeposit ? (() => {
    const d = new Date(data.DateDeposit);
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  })() : '';
  const logoHtml = data.logoDataUrl
    ? `<img src="${data.logoDataUrl}" alt="GOLDENHOPE Logo" style="width:35px;height:35px;object-fit:contain;display:block">`
    : `<div style="width:35px;height:35px;border:1px solid #000;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">GH</div>`;

  let totalMF = 0, totalMSC = 0, totalHDA = 0, totalAmount = 0, totalCOM = 0, totalNet = 0;
  const rowsHtml = details.map((d, i) => {
    const mf = parseFloat(d.MF) || 0;
    const msc = parseFloat(d.MSC) || 0;
    const hda = parseFloat(d.HDA) || 0;
    const total = parseFloat(d.Total) || 0;
    const com = parseFloat(d.COM) || 0;
    const net = parseFloat(d.NetDeposit) || 0;
    totalMF += mf; totalMSC += msc; totalHDA += hda; totalAmount += total; totalCOM += com; totalNet += net;
    const name = d.full_name || d.MemberName || '';
    return `<tr>
      <td class="c">${escapeHtml(d.AFNo || '')}</td>
      <td class="l">${escapeHtml(parseMemberNameForDisplay(name))}</td>
      <td class="l">${escapeHtml(d.SalesCoordinator || '')}</td>
      <td class="r">${mf.toFixed(2)}</td>
      <td class="r">${msc.toFixed(2)}</td>
      <td class="r">${hda.toFixed(2)}</td>
      <td class="r">${total.toFixed(2)}</td>
      <td class="r">${com.toFixed(2)}</td>
      <td class="r">${net.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const rowCount = details.length;
  const minRows = 20;
  let blankRows = '';
  if (rowCount < minRows) {
    for (let i = rowCount; i < minRows; i++) {
      blankRows += '<tr><td class="c">&nbsp;</td><td class="l">&nbsp;</td><td class="l">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td><td class="r">&nbsp;</td></tr>';
    }
  }

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Damayan Remittance Slip</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; background: #fff; line-height: 1.2; }
  .slip-page { width: 100%; padding: 3mm 0; position: relative; }
  .org-row { text-align: center; margin-bottom: 6px; }
  .org-row-inner { display: inline-flex; align-items: center; gap: 12px; text-align: left; }
  .org-logo { flex-shrink: 0; }
  .org-logo img { width: 35px; height: 35px; object-fit: contain; display: block; }
  .org-name { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1.15; }
  .org-addr { font-size: 7pt; line-height: 1.2; }
  .org-sec { font-size: 6.5pt; }
  .title-row { position: relative; margin: 4px 0 4px; text-align: center; border-bottom: 2px solid #000; padding-bottom: 3px; }
  .title-row h2 { font-size: 12pt; font-weight: 700; letter-spacing: 1px; }
  .date-info { position: absolute; right: 0; top: 0; text-align: right; font-size: 7pt; }
  .date-info .lbl { font-weight: 700; }
  .date-info .val { display: inline-block; min-width: 100px; border-bottom: 1px solid #000; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-top: 1px; }
  thead th { font-size: 7pt; font-weight: 700; border: 1px solid #000; padding: 3px 3px; text-align: center; vertical-align: middle; background: #fff; }
  tbody td { border: 1px solid #000; padding: 3px 3px; font-size: 7.5pt; vertical-align: middle; }
  td.c { text-align: center; }
  td.l { text-align: left; padding-left: 6px; }
  td.r { text-align: right; padding-right: 6px; font-variant-numeric: tabular-nums; }
  .totals-row td { font-weight: 700; border-top: 2px solid #000; padding: 3px 4px; }
  .sig-section { margin-top: 10px; width: 100%; }
  .sig-row { display: flex; justify-content: space-between; }
  .sig-box { text-align: center; width: 30%; }
  .sig-line { border-top: 1px solid #000; margin-top: 24px; height: 1px; width: 80%; margin-left: auto; margin-right: auto; }
  .sig-label { font-size: 8pt; font-weight: 700; margin-top: 2px; }
  .print-info { text-align: center; font-size: 6pt; color: #555; margin-top: 4px; }
  .col-af { width: 9%; }
  .col-name { width: 25%; }
  .col-sc { width: 16%; }
  .col-amt { width: 9%; }
  .col-hda { width: 9%; }
  .col-total { width: 10%; }
  .col-net { width: 12%; }
  @media print {
    body { margin:0; padding:0; }
    .slip-page { min-height: auto; }
  }
</style></head><body>
<div class="slip-page">
  <div class="org-row">
    <div class="org-row-inner">
      <div class="org-logo">${logoHtml}</div>
      <div>
        <div class="org-name">GOLDENHOPE DAMAYAN ASSOCIATION AND SUPPORT INC.</div>
        <div class="org-addr">${escapeHtml(data.BranchAddress || 'Poblacion, Manukan, Zamboanga del Norte')}</div>
        <div class="org-sec">SEC REG. NO. 2025110227750-03</div>
      </div>
    </div>
  </div>
  <div class="title-row">
    <h2>DAMAYAN REMITTANCE SLIP</h2>
    <div style="font-size:8pt;font-weight:600;color:#444;margin-top:-4px;margin-bottom:2px">Remittance No: ${escapeHtml(data.RemittanceNo || '')}</div>
    <div class="date-info">
      <div><span class="lbl">Date Deposit :</span> <span class="val">${escapeHtml(dateDeposit)}</span></div>
      <div style="margin-top:3px"><span class="lbl">Total Deposit :</span> <span class="val">&#8369;${totalNet.toFixed(2)}</span></div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th class="col-af" style="width:8%">AF NO.</th>
      <th class="col-name" style="width:24%">MEMBER'S NAME</th>
      <th class="col-sc" style="width:16%">SALES COORDINATOR</th>
      <th class="col-amt" style="width:9%">MF</th>
      <th class="col-amt" style="width:9%">MSC</th>
      <th class="col-hda" style="width:9%">HDA</th>
      <th class="col-total" style="width:10%">TOTAL</th>
      <th class="col-amt" style="width:9%">COM</th>
      <th class="col-net" style="width:15%">NET DEPOSIT</th>
    </tr></thead>
    <tbody>
      ${rowsHtml}
      ${blankRows}
      <tr class="totals-row">
        <td colspan="3" class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">GRAND TOTAL</td>
        <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalMF.toFixed(2)}</td>
        <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalMSC.toFixed(2)}</td>
        <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalHDA.toFixed(2)}</td>
        <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalAmount.toFixed(2)}</td>
        <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalCOM.toFixed(2)}</td>
        <td class="r" style="font-weight:700;border:1px solid #000;background:#E5E7EB">${totalNet.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  <div class="sig-section">
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line"></div><div class="sig-label">PREPARED BY</div></div>
      <div class="sig-box"><div class="sig-line"></div><div class="sig-label">VERIFIED BY</div></div>
      <div class="sig-box"><div style="font-size:8pt;margin-top:14px;line-height:1.5">
        Page 1 of 1<br>Generated: ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}<br>Generated By: ${escapeHtml(userName)}
      </div></div>
    </div>
  </div>
</div>
</body></html>`;
}

function getSlipPrintOverrideStyle() {
  return `<style id="slipPrintOverride">
  body { font-size:7.5pt !important; line-height:1.2 !important; }
  .org-name { font-size:10pt !important; }
  .org-addr { font-size:7pt !important; }
  .org-sec { font-size:6.5pt !important; }
  .title-row h2 { font-size:11pt !important; }
  .date-info { font-size:7pt !important; }
  table { font-size:7pt !important; }
  thead th { font-size:7pt !important; padding:2px 3px !important; }
  tbody td { font-size:7pt !important; padding:2px 3px !important; height:4mm !important; }
  .totals-row td { font-size:7pt !important; padding:2px 3px !important; }
  .sig-label { font-size:7pt !important; }
  .print-info { font-size:6pt !important; }
<\/style>`;
}

async function previewRemittanceSlip() {
  const container = document.getElementById('reportResultContainer');
  const slipHtml = container.dataset.slipHtml;
  if (!slipHtml) return;
  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) { showToast('Please allow pop-ups', 'error'); return; }
  win.document.write(slipHtml);
  win.document.close();
  win.focus();
}

async function printReportRemittanceSlip() {
  const container = document.getElementById('reportResultContainer');
  let slipHtml = container.dataset.slipHtml;
  if (!slipHtml) return;
  slipHtml = slipHtml.replace('</head>', getSlipPrintOverrideStyle() + '</head>');
  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) { showToast('Please allow pop-ups', 'error'); return; }
  win.document.write(slipHtml);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 1500);
}

async function downloadRemittanceSlipPDF(data) {
  showLoading();
  try {
    let html = buildRemittanceSlipHTML(data);
    html = html.replace('</head>', getSlipPrintOverrideStyle() + '</head>');
    const pdfResult = await window.api.printToPDF(html, `Remittance_Slip_${data.RemittanceNo || 'report'}.pdf`);
    if (pdfResult.success) {
      const blob = new Blob([new Uint8Array(pdfResult.data)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfResult.filename || `Remittance_Slip_${data.RemittanceNo || 'report'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('PDF downloaded successfully');
    } else {
      showToast(pdfResult.error || 'Failed to generate PDF', 'error');
    }
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Failed to download PDF', 'error');
  } finally {
    hideLoading();
  }
}

function csvSafe(v) {
  if (typeof v === 'number') return v.toFixed(2);
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function downloadRemittanceSlipExcel(data) {
  const rows = [['AF NO.','MEMBER\'S NAME','SALES COORDINATOR','MF','MSC','TOTAL','COM','NET DEPOSIT']];
  let totalMF=0,totalMSC=0,totalAmt=0,totalCOM=0,totalNet=0;
  const details = data.details || [];
  for (const d of details) {
    const mf=parseFloat(d.MF)||0, msc=parseFloat(d.MSC)||0, tot=parseFloat(d.Total)||0, com=parseFloat(d.COM)||0, net=parseFloat(d.NetDeposit)||0;
    totalMF+=mf; totalMSC+=msc; totalAmt+=tot; totalCOM+=com; totalNet+=net;
    rows.push([d.AFNo||'', parseMemberNameForDisplay(d.full_name||d.MemberName||''), d.SalesCoordinator||'', mf, msc, tot, com, net]);
  }
  rows.push(['','','GRAND TOTAL', totalMF, totalMSC, totalAmt, totalCOM, totalNet]);
  let csv = rows.map(r => r.map(v => {
    const safe = csvSafe(v);
    if (typeof safe === 'string' && (safe.includes(',') || safe.includes('"') || safe.includes('\n'))) return '"'+safe.replace(/"/g,'""')+'"';
    return safe;
  }).join(',')).join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Remittance_Slip_${data.RemittanceNo || 'report'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV downloaded successfully');
}

async function downloadRemittanceSlipExcelXLSX(data) {
  const details = data.details || [];
  const rows = [['AF NO.','MEMBER\'S NAME','SALES COORDINATOR','MF','MSC','TOTAL','COM','NET DEPOSIT']];
  let totalMF=0,totalMSC=0,totalAmt=0,totalCOM=0,totalNet=0;
  for (const d of details) {
    const mf=parseFloat(d.MF)||0, msc=parseFloat(d.MSC)||0, tot=parseFloat(d.Total)||0, com=parseFloat(d.COM)||0, net=parseFloat(d.NetDeposit)||0;
    totalMF+=mf; totalMSC+=msc; totalAmt+=tot; totalCOM+=com; totalNet+=net;
    rows.push([d.AFNo||'', parseMemberNameForDisplay(d.full_name||d.MemberName||''), d.SalesCoordinator||'', mf, msc, tot, com, net]);
  }
  rows.push(['','','GRAND TOTAL', totalMF, totalMSC, totalAmt, totalCOM, totalNet]);
  showLoading();
  try {
    const exportData = rows.map((r, i) => ({ 'AF NO.': r[0], "MEMBER'S NAME": r[1], 'SALES COORDINATOR': r[2], 'MF': r[3], 'MSC': r[4], 'TOTAL': r[5], 'COM': r[6], 'NET DEPOSIT': r[7] }));
    const result = await window.api.exportExcel(exportData, `Remittance_Slip_${data.RemittanceNo || 'report'}.xlsx`);
    if (!result.success) { showToast('Excel Export Failed: ' + result.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(result.data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel exported');
  } catch (e) { showToast('Excel export failed: ' + e.message, 'error'); }
  hideLoading();
}

async function showMMLFilterPanel() {
  const panel = document.getElementById('mmlFilterPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('reportParams')?.classList.add('hidden');
  document.getElementById('reportResultContainer').innerHTML = '';
  currentReportType = 'member-master-list';

  await loadMMLFilterOptions();
}

async function loadMMLFilterOptions() {
  try {
    const districtResult = await window.api.getBranches({ status: 'Active' }).catch(e => (console.error('District load failed:', e), null));
    const coordResult = await window.api.getActiveCoordinators('sales').catch(e => (console.error('Coordinator load failed:', e), null));
    const barangayResult = await window.api.getActiveCoordinators('barangay').catch(e => (console.error('Barangay coord load failed:', e), null));
    const provResult = await window.api.getProvinces().catch(e => (console.error('Province load failed:', e), null));
    const regResult = await window.api.getRegions().catch(e => (console.error('Region load failed:', e), null));
    const districtEl = document.getElementById('mmlDistrict');
    if (districtResult?.success && districtResult.data) {
      districtEl.innerHTML = '<option value="">All Districts</option>' +
        districtResult.data.map(d => `<option value="${escapeHtml(d.Name || d.district || '')}">${escapeHtml(d.Name || d.district || '')}</option>`).join('');
    }
    const coordEl = document.getElementById('mmlCoordinator');
    if (coordResult?.success && coordResult.data) {
      coordEl.innerHTML = '<option value="">All Coordinators</option>' +
        coordResult.data.map(c => `<option value="${c.Id}">${escapeHtml(c.FullName || '')}</option>`).join('');
    }
    const regEl = document.getElementById('mmlRegion');
    const provEl = document.getElementById('mmlProvince');
    if (regResult?.success && regResult.data) {
      regEl.innerHTML = '<option value="">All Regions</option>' +
        regResult.data.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
      regEl.addEventListener('change', async function() {
        provEl.innerHTML = '<option value="">All Provinces</option>';
        document.getElementById('mmlMunicipality').innerHTML = '<option value="">All Municipalities</option>';
        document.getElementById('mmlBarangay').innerHTML = '<option value="">All Barangays</option>';
        if (this.value) {
          const filtered = await window.api.getProvinces(this.value);
          if (filtered?.success && filtered.data) {
            provEl.innerHTML = '<option value="">All Provinces</option>' +
              filtered.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
          }
        } else if (provResult?.success && provResult.data) {
          provEl.innerHTML = '<option value="">All Provinces</option>' +
            provResult.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
        }
      });
    }
    if (provResult?.success && provResult.data) {
      provEl.innerHTML = '<option value="">All Provinces</option>' +
        provResult.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
    }
    const barangayEl = document.getElementById('mmlBarangay');
    if (barangayResult?.success && barangayResult.data) {
      const barangays = barangayResult.data
        .map(c => c.BarangayAssigned)
        .filter(b => b && b.trim())
        .sort((a, b) => a.localeCompare(b));
      barangayEl.innerHTML = '<option value="">All Barangays</option>' +
        barangays.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load MML filter options:', e);
  }
}

async function loadMMLMunicipalities(provinceId) {
  try {
    const result = await window.api.getMunicipalities(provinceId);
    const munEl = document.getElementById('mmlMunicipality');
    if (result?.success && result.data) {
      const sorted = result.data.sort((a, b) => a.name.localeCompare(b.name));
      munEl.innerHTML = '<option value="">All Municipalities</option>' +
        sorted.map(m => `<option value="${m.id}">${escapeHtml(m.name || '')}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load municipalities:', e);
  }
}

async function loadMMLBarangays(municipalityId) {
  try {
    const result = await window.api.getBarangays(municipalityId);
    const brgyEl = document.getElementById('mmlBarangay');
    if (result?.success && result.data) {
      const sorted = result.data.sort((a, b) => a.name.localeCompare(b.name));
      brgyEl.innerHTML = '<option value="">All Barangays</option>' +
        sorted.map(b => `<option value="${b.id}">${escapeHtml(b.name || '')}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load barangays:', e);
  }
}

// Province -> Municipality -> Barangay cascade for MML filters
document.addEventListener('change', function(e) {
  if (e.target.id === 'mmlProvince') {
    const provId = e.target.value;
    const munEl = document.getElementById('mmlMunicipality');
    const brgyEl = document.getElementById('mmlBarangay');
    munEl.innerHTML = '<option value="">All Municipalities</option>';
    brgyEl.innerHTML = '<option value="">All Barangays</option>';
    if (provId) {
      loadMMLMunicipalities(provId);
    }
  } else if (e.target.id === 'mmlMunicipality') {
    const munId = e.target.value;
    const brgyEl = document.getElementById('mmlBarangay');
    brgyEl.innerHTML = '<option value="">All Barangays</option>';
    if (munId) {
      loadMMLBarangays(munId);
    }
  } else if (e.target.id === 'rfrProvince') {
    const provId = e.target.value;
    const munEl = document.getElementById('rfrMunicipality');
    const brgyEl = document.getElementById('rfrBarangay');
    munEl.innerHTML = '<option value="">All Municipalities</option>';
    brgyEl.innerHTML = '<option value="">All Barangays</option>';
    if (provId) {
      loadRFRMunicipalities(provId);
    }
  } else if (e.target.id === 'rfrMunicipality') {
    const munId = e.target.value;
    const brgyEl = document.getElementById('rfrBarangay');
    brgyEl.innerHTML = '<option value="">All Barangays</option>';
    if (munId) {
      loadRFRBarangays(munId);
    }
  } else if (e.target.id === 'dfmProvince') {
    const provId = e.target.value;
    const munEl = document.getElementById('dfmMunicipality');
    const brgyEl = document.getElementById('dfmBarangay');
    munEl.innerHTML = '<option value="">All Municipalities</option>';
    brgyEl.innerHTML = '<option value="">All Barangays</option>';
    if (provId) {
      loadDFMMunicipalities(provId);
    }
  } else if (e.target.id === 'dfmMunicipality') {
    const munId = e.target.value;
    const brgyEl = document.getElementById('dfmBarangay');
    brgyEl.innerHTML = '<option value="">All Barangays</option>';
    if (munId) {
      loadDFMBarangays(munId);
    }
  }
});

async function showRFRFilterPanel() {
  const panel = document.getElementById('rfrFilterPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('reportParams')?.classList.add('hidden');
  document.getElementById('reportResultContainer').innerHTML = '';
  currentReportType = 'ready-for-renewal';

  await loadRFRFilterOptions();
}

async function loadRFRFilterOptions() {
  try {
    const districtResult = await window.api.getBranches({ status: 'Active' }).catch(e => (console.error('District load failed:', e), null));
    const coordResult = await window.api.getActiveCoordinators('sales').catch(e => (console.error('Coordinator load failed:', e), null));
    const barangayResult = await window.api.getActiveCoordinators('barangay').catch(e => (console.error('Barangay coord load failed:', e), null));
    const provResult = await window.api.getProvinces().catch(e => (console.error('Province load failed:', e), null));
    const regResult = await window.api.getRegions().catch(e => (console.error('Region load failed:', e), null));
    const districtEl = document.getElementById('rfrDistrict');
    if (districtResult?.success && districtResult.data) {
      districtEl.innerHTML = '<option value="">All Districts</option>' +
        districtResult.data.map(d => `<option value="${escapeHtml(d.Name || d.district || '')}">${escapeHtml(d.Name || d.district || '')}</option>`).join('');
    }
    const coordEl = document.getElementById('rfrCoordinator');
    if (coordResult?.success && coordResult.data) {
      coordEl.innerHTML = '<option value="">All Coordinators</option>' +
        coordResult.data.map(c => `<option value="${c.Id}">${escapeHtml(c.FullName || '')}</option>`).join('');
    }
    const regEl = document.getElementById('rfrRegion');
    const provEl = document.getElementById('rfrProvince');
    if (regResult?.success && regResult.data) {
      regEl.innerHTML = '<option value="">All Regions</option>' +
        regResult.data.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
      regEl.addEventListener('change', async function() {
        provEl.innerHTML = '<option value="">All Provinces</option>';
        document.getElementById('rfrMunicipality').innerHTML = '<option value="">All Municipalities</option>';
        document.getElementById('rfrBarangay').innerHTML = '<option value="">All Barangays</option>';
        if (this.value) {
          const filtered = await window.api.getProvinces(this.value);
          if (filtered?.success && filtered.data) {
            provEl.innerHTML = '<option value="">All Provinces</option>' +
              filtered.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
          }
        } else if (provResult?.success && provResult.data) {
          provEl.innerHTML = '<option value="">All Provinces</option>' +
            provResult.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
        }
      });
    }
    if (provResult?.success && provResult.data) {
      provEl.innerHTML = '<option value="">All Provinces</option>' +
        provResult.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
    }
    const barangayEl = document.getElementById('rfrBarangay');
    if (barangayResult?.success && barangayResult.data) {
      const barangays = barangayResult.data
        .map(c => c.BarangayAssigned)
        .filter(b => b && b.trim())
        .sort((a, b) => a.localeCompare(b));
      barangayEl.innerHTML = '<option value="">All Barangays</option>' +
        barangays.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load RFR filter options:', e);
  }
}

async function loadRFRMunicipalities(provinceId) {
  try {
    const result = await window.api.getMunicipalities(provinceId);
    const munEl = document.getElementById('rfrMunicipality');
    if (result?.success && result.data) {
      const sorted = result.data.sort((a, b) => a.name.localeCompare(b.name));
      munEl.innerHTML = '<option value="">All Municipalities</option>' +
        sorted.map(m => `<option value="${m.id}">${escapeHtml(m.name || '')}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load municipalities:', e);
  }
}

async function loadRFRBarangays(municipalityId) {
  try {
    const result = await window.api.getBarangays(municipalityId);
    const brgyEl = document.getElementById('rfrBarangay');
    if (result?.success && result.data) {
      const sorted = result.data.sort((a, b) => a.name.localeCompare(b.name));
      brgyEl.innerHTML = '<option value="">All Barangays</option>' +
        sorted.map(b => `<option value="${b.id}">${escapeHtml(b.name || '')}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load barangays:', e);
  }
}

function resetRFRFilters() {
  rfrFilters = { district: '', barangay: '', coordinator_id: '', membership_status: '', search: '' };
  document.getElementById('rfrDistrict').value = '';
  document.getElementById('rfrProvince').value = '';
  document.getElementById('rfrMunicipality').innerHTML = '<option value="">All Municipalities</option>';
  document.getElementById('rfrBarangay').innerHTML = '<option value="">All Barangays</option>';
  document.getElementById('rfrCoordinator').value = '';
  document.getElementById('rfrMembershipStatus').value = '';
  document.getElementById('rfrSearch').value = '';
}

function onRFRSearchInput() {
  if (rfrSearchTimeout) clearTimeout(rfrSearchTimeout);
  rfrSearchTimeout = setTimeout(() => {
    rfrFilters.search = document.getElementById('rfrSearch').value;
    generateReadyForRenewalReport();
  }, 300);
}

async function generateReadyForRenewalReport() {
  rfrFilters.district = document.getElementById('rfrDistrict').value;
  rfrFilters.barangay = document.getElementById('rfrBarangay').value;
  rfrFilters.coordinator_id = document.getElementById('rfrCoordinator').value;
  rfrFilters.membership_status = document.getElementById('rfrMembershipStatus').value;
  rfrFilters.search = document.getElementById('rfrSearch').value;

  showLoading();
  try {
    const result = await window.api.getReport('ready-for-renewal', {
      district: rfrFilters.district,
      province: document.getElementById('rfrProvince').value ? parseInt(document.getElementById('rfrProvince').value) : null,
      municipality: document.getElementById('rfrMunicipality').value ? parseInt(document.getElementById('rfrMunicipality').value) : null,
      barangay: rfrFilters.barangay,
      coordinator_id: rfrFilters.coordinator_id ? parseInt(rfrFilters.coordinator_id) : null,
      membership_status: rfrFilters.membership_status,
      search: rfrFilters.search
    });
    hideLoading();

    if (!result || !result.success) {
      showToast(result?.error || 'Report failed', 'error');
      return;
    }

    reportData = result.data;
    renderRFRResult();
  } catch (e) {
    hideLoading();
    showToast('Failed: ' + e.message, 'error');
  }
}

function renderRFRResult() {
  const container = document.getElementById('reportResultContainer');
  if (!container) return;

  const user = getCurrentUser();
  const userName = user?.fullName || user?.username || 'Unknown';
  const now = new Date();
  const genDate = formatDate(now.toISOString());
  const genTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (!reportData || reportData.length === 0) {
    container.innerHTML = `
      <div class="report-result-wrap">
        <div class="report-result-header">
          <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back to Reports</button>
          <h3>Ready for Renewal</h3>
        </div>
        <div class="card report-result-card report-result-reveal">
          <div class="card-body" style="text-align:center;padding:60px 20px;color:var(--text-light)">
            <div style="font-size:48px;margin-bottom:16px;opacity:0.3">&#128197;</div>
            <div style="font-size:16px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">No members ready for renewal.</div>
            <div style="font-size:13px">No active non-regular members are due for renewal within 2 months or past due.</div>
          </div>
        </div>
      </div>`;
    return;
  }

  let totalShortage = 0;
  const rows = reportData.map((m, idx) => {
    const days = m.days_remaining;
    const daysClass = days <= 30 ? 'text-danger' : days <= 60 ? 'text-warning' : '';
    const balance = parseFloat(m.computed_balance) || 0;
    const shortage = parseFloat(m.balance_shortage) || 0;
    totalShortage += shortage;
    return `<tr>
      <td class="text-center">${idx + 1}</td>
      <td>${escapeHtml(m.af_no || '')}</td>
      <td>${escapeHtml(m.full_name || '')}</td>
      <td>${escapeHtml(m.district || '')}</td>
      <td>${escapeHtml(m.Barangay || '')}</td>
      <td>${escapeHtml(m.SalesCoordinator || '')}</td>
      <td>${escapeHtml(m.membership_status || '')}</td>
      <td>${formatDate(m.registration_date)}</td>
      <td>${formatDate(m.renewal_date)}</td>
      <td class="text-center ${daysClass}">${days >= 0 ? days : 'Expired'}</td>
      <td class="text-right">${formatCurrency(balance)}</td>
      <td class="text-right">${formatCurrency(m.required_msc || 100)}</td>
      <td class="text-right text-danger">${formatCurrency(shortage)}</td>
      <td>${m.last_deposit_date ? formatDate(m.last_deposit_date) : '-'}</td>
      <td>${escapeHtml(m.contact_no || '')}</td>
      <td><span class="badge badge-orange">${escapeHtml(m.remarks || 'Ready for Renewal')}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="report-result-wrap">
      <div class="report-result-header">
        <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Reports
        </button>
        <h3>Ready for Renewal</h3>
        <span class="report-result-count">${reportData.length} members</span>
      </div>

      <div class="mml-summary-bar">
        <div class="mml-summary-item">
          <span class="mml-summary-label">Total Members</span>
          <span class="mml-summary-value">${reportData.length.toLocaleString()}</span>
        </div>
        <div class="mml-summary-item">
          <span class="mml-summary-label">Total Shortage</span>
          <span class="mml-summary-value text-danger">${formatCurrency(totalShortage)}</span>
        </div>
      </div>

      <div class="card report-result-card report-result-reveal">
        <div class="card-header">
          <h3 id="reportTitle">Ready for Renewal</h3>
          <div class="btn-group">
            <button class="btn btn-primary btn-sm" onclick="exportRFRPDF('landscape')">PDF (Landscape)</button>
            <button class="btn btn-primary btn-sm" onclick="exportRFRPDF('portrait')">PDF (Portrait)</button>
            <button class="btn btn-success btn-sm" onclick="exportRFRExcel()">Export Excel</button>
            <button class="btn btn-secondary btn-sm" onclick="exportRFRCSV()">Export CSV</button>
            <button class="btn btn-outline btn-sm" onclick="exportRFRPrint()">Print</button>
          </div>
        </div>
        <div class="card-body">
          <div id="reportContent" class="table-container">
            <div class="mml-meta">
              <span>Generated By: ${escapeHtml(userName)}</span>
              <span>Generated: ${genDate} ${genTime}</span>
            </div>
            <table class="mml-report-table">
              <thead>
                <tr>
                  <th style="width:40px">No.</th>
                  <th>Member ID</th>
                  <th>Member Name</th>
                  <th>District</th>
                  <th>Barangay</th>
                  <th>Sales Coordinator</th>
                  <th>Membership Status</th>
                  <th>Registration Date</th>
                  <th>Renewal Date</th>
                  <th style="width:60px">Days Remaining</th>
                  <th style="width:90px">Current MSC Balance</th>
                  <th style="width:80px">Required MSC</th>
                  <th style="width:90px">Balance Shortage</th>
                  <th style="width:100px">Last Deposit Date</th>
                  <th>Contact Number</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

async function showDFMFilterPanel() {
  const panel = document.getElementById('dfmFilterPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('reportParams')?.classList.add('hidden');
  document.getElementById('reportResultContainer').innerHTML = '';
  currentReportType = 'due-for-msc';

  await loadDFMFilterOptions();
}

async function loadDFMFilterOptions() {
  try {
    const districtResult = await window.api.getBranches({ status: 'Active' }).catch(e => (console.error('District load failed:', e), null));
    const coordResult = await window.api.getActiveCoordinators('sales').catch(e => (console.error('Coordinator load failed:', e), null));
    const barangayResult = await window.api.getActiveCoordinators('barangay').catch(e => (console.error('Barangay coord load failed:', e), null));
    const provResult = await window.api.getProvinces().catch(e => (console.error('Province load failed:', e), null));
    const regResult = await window.api.getRegions().catch(e => (console.error('Region load failed:', e), null));
    const districtEl = document.getElementById('dfmDistrict');
    if (districtResult?.success && districtResult.data) {
      districtEl.innerHTML = '<option value="">All Districts</option>' +
        districtResult.data.map(d => `<option value="${escapeHtml(d.Name || d.district || '')}">${escapeHtml(d.Name || d.district || '')}</option>`).join('');
    }
    const coordEl = document.getElementById('dfmCoordinator');
    if (coordResult?.success && coordResult.data) {
      coordEl.innerHTML = '<option value="">All Coordinators</option>' +
        coordResult.data.map(c => `<option value="${c.Id}">${escapeHtml(c.FullName || '')}</option>`).join('');
    }
    const regEl = document.getElementById('dfmRegion');
    const provEl = document.getElementById('dfmProvince');
    if (regResult?.success && regResult.data) {
      regEl.innerHTML = '<option value="">All Regions</option>' +
        regResult.data.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
      regEl.addEventListener('change', async function() {
        provEl.innerHTML = '<option value="">All Provinces</option>';
        document.getElementById('dfmMunicipality').innerHTML = '<option value="">All Municipalities</option>';
        document.getElementById('dfmBarangay').innerHTML = '<option value="">All Barangays</option>';
        if (this.value) {
          const filtered = await window.api.getProvinces(this.value);
          if (filtered?.success && filtered.data) {
            provEl.innerHTML = '<option value="">All Provinces</option>' +
              filtered.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
          }
        } else if (provResult?.success && provResult.data) {
          provEl.innerHTML = '<option value="">All Provinces</option>' +
            provResult.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
        }
      });
    }
    if (provResult?.success && provResult.data) {
      provEl.innerHTML = '<option value="">All Provinces</option>' +
        provResult.data.map(p => `<option value="${p.id}">${escapeHtml(p.name || '')}</option>`).join('');
    }
    const barangayEl = document.getElementById('dfmBarangay');
    if (barangayResult?.success && barangayResult.data) {
      const barangays = barangayResult.data
        .map(c => c.BarangayAssigned)
        .filter(b => b && b.trim())
        .sort((a, b) => a.localeCompare(b));
      barangayEl.innerHTML = '<option value="">All Barangays</option>' +
        barangays.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load DFM filter options:', e);
  }
}

async function loadDFMMunicipalities(provinceId) {
  try {
    const result = await window.api.getMunicipalities(provinceId);
    const munEl = document.getElementById('dfmMunicipality');
    if (result?.success && result.data) {
      const sorted = result.data.sort((a, b) => a.name.localeCompare(b.name));
      munEl.innerHTML = '<option value="">All Municipalities</option>' +
        sorted.map(m => `<option value="${m.id}">${escapeHtml(m.name || '')}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load municipalities:', e);
  }
}

async function loadDFMBarangays(municipalityId) {
  try {
    const result = await window.api.getBarangays(municipalityId);
    const brgyEl = document.getElementById('dfmBarangay');
    if (result?.success && result.data) {
      const sorted = result.data.sort((a, b) => a.name.localeCompare(b.name));
      brgyEl.innerHTML = '<option value="">All Barangays</option>' +
        sorted.map(b => `<option value="${b.id}">${escapeHtml(b.name || '')}</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load barangays:', e);
  }
}

async function generateMemberMasterListReport() {
  mmlFilters.month = document.getElementById('mmlMonth').value;
  mmlFilters.year = parseInt(document.getElementById('mmlYear').value) || new Date().getFullYear();
  mmlFilters.district = document.getElementById('mmlDistrict').value;
  mmlFilters.province = document.getElementById('mmlProvince').value;
  mmlFilters.municipality = document.getElementById('mmlMunicipality').value;
  mmlFilters.barangay = document.getElementById('mmlBarangay').value;
  mmlFilters.coordinator_id = document.getElementById('mmlCoordinator').value;
  mmlFilters.membership_status = document.getElementById('mmlMembershipStatus').value;

  showLoading();
  try {
    const result = await window.api.getReport('member-master-list', {
      month: mmlFilters.month,
      year: mmlFilters.year,
      district: mmlFilters.district,
      province: mmlFilters.province ? parseInt(mmlFilters.province) : null,
      municipality: mmlFilters.municipality ? parseInt(mmlFilters.municipality) : null,
      barangay: mmlFilters.barangay ? parseInt(mmlFilters.barangay) : null,
      coordinator_id: mmlFilters.coordinator_id ? parseInt(mmlFilters.coordinator_id) : null,
      membership_status: mmlFilters.membership_status
    });
    hideLoading();

    if (!result || !result.success) {
      showToast(result?.error || 'Report failed', 'error');
      return;
    }

    reportData = result.data;
    mmlDiedMonthly = result.diedMonthly || {};
    renderMMLResult();
  } catch (e) {
    hideLoading();
    showToast('Failed: ' + e.message, 'error');
  }
}

function renderMMLResult() {
  const monthName = MONTHS[parseInt(mmlFilters.month) - 1] || 'Unknown';
  const yearLabel = mmlFilters.year;
  const container = document.getElementById('reportResultContainer');
  if (!container) return;

  const user = getCurrentUser();
  const userName = user?.fullName || user?.username || 'Unknown';
  const now = new Date();
  const genDate = formatDate(now.toISOString());
  const genTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (!reportData || reportData.length === 0) {
    container.innerHTML = `
      <div class="report-result-wrap">
        <div class="report-result-header">
          <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back to Reports</button>
          <h3>Member Master List</h3>
        </div>
        <div class="card report-result-card report-result-reveal">
          <div class="card-body" style="text-align:center;padding:60px 20px;color:var(--text-light)">
            <div style="font-size:48px;margin-bottom:16px;opacity:0.3">&#128196;</div>
            <div style="font-size:16px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">No records found.</div>
            <div style="font-size:13px">No members match the selected filter criteria. Try adjusting your filters.</div>
          </div>
        </div>
      </div>`;
    return;
  }

  let totalBalance = 0;

  const rows = reportData.map((m, idx) => {
    const rowNum = idx + 1;
    const balance = parseFloat(m.computed_balance) || 0;
    const due = mmlRenewalDue(m.renewal_date);
    const renewalColor = due ? '#DC2626' : '#2563EB';
    totalBalance += balance;

    return `<tr>
      <td class="text-center">${rowNum}</td>
      <td>${escapeHtml(m.full_name || '')}</td>
      <td>${escapeHtml(m.address || '')}</td>
      <td>${escapeHtml(m.af_no || '')}</td>
      <td style="font-weight:700;color:${renewalColor}">${m.renewal_date ? formatDate(m.renewal_date) : '—'}</td>
      <td class="text-right">${formatCurrency(balance)}</td>
      <td></td>
      <td></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="report-result-wrap">
      <div class="report-result-header">
        <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Reports
        </button>
        <h3>Member Master List - ${monthName} ${yearLabel}</h3>
        <span class="report-result-count">${reportData.length} members</span>
      </div>

      <div class="mml-summary-bar">
        <div class="mml-summary-item">
          <span class="mml-summary-label">Total Members</span>
          <span class="mml-summary-value">${reportData.length.toLocaleString()}</span>
        </div>
        <div class="mml-summary-item">
          <span class="mml-summary-label">Total MSC Balance</span>
          <span class="mml-summary-value">${formatCurrency(totalBalance)}</span>
        </div>
      </div>

      <div class="card report-result-card report-result-reveal">
        <div class="card-header">
          <h3 id="reportTitle">Member Master List - ${monthName} ${yearLabel}</h3>
          <div class="btn-group">
            <button class="btn btn-primary btn-sm" onclick="exportMMLPDF('landscape')">PDF (Landscape)</button>
            <button class="btn btn-primary btn-sm" onclick="exportMMLPDF('portrait')">PDF (Portrait)</button>
            <button class="btn btn-success btn-sm" onclick="exportMMLExcel()">Export Excel</button>
            <button class="btn btn-secondary btn-sm" onclick="exportMMLCSV()">Export CSV</button>
            <button class="btn btn-outline btn-sm" onclick="exportMMLPrint()">Print</button>
          </div>
        </div>
        <div class="card-body">
          <div id="reportContent" class="table-container mml-table-container">
            <div class="mml-meta">
              <span>Generated By: ${escapeHtml(userName)}</span>
              <span>Generated: ${genDate} ${genTime}</span>
            </div>
            <table class="mml-report-table">
              <thead>
                <tr>
                  <th style="width:40px">No.</th>
                  <th>Member's Name</th>
                  <th>Address</th>
                  <th style="width:90px">AF No.</th>
                  <th style="width:120px">Renewal Date</th>
                  <th style="width:90px">Balance</th>
                  <th style="width:80px">Deposit</th>
                  <th style="width:80px">Signature</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

function resetDFMFilters() {
  dfmFilters = { district: '', barangay: '', coordinator_id: '', membership_status: '', search: '', balance_min: '', balance_max: '' };
  document.getElementById('dfmDistrict').value = '';
  document.getElementById('dfmProvince').value = '';
  document.getElementById('dfmMunicipality').innerHTML = '<option value="">All Municipalities</option>';
  document.getElementById('dfmBarangay').innerHTML = '<option value="">All Barangays</option>';
  document.getElementById('dfmCoordinator').value = '';
  document.getElementById('dfmMembershipStatus').value = '';
  document.getElementById('dfmSearch').value = '';
  document.getElementById('dfmBalanceMin').value = '';
  document.getElementById('dfmBalanceMax').value = '';
}

function onDFMSearchInput() {
  if (dfmSearchTimeout) clearTimeout(dfmSearchTimeout);
  dfmSearchTimeout = setTimeout(() => {
    dfmFilters.search = document.getElementById('dfmSearch').value;
    dfmFilters.balance_min = document.getElementById('dfmBalanceMin').value;
    dfmFilters.balance_max = document.getElementById('dfmBalanceMax').value;
    generateDueForMSCReport();
  }, 300);
}

async function generateDueForMSCReport() {
  dfmFilters.district = document.getElementById('dfmDistrict').value;
  dfmFilters.barangay = document.getElementById('dfmBarangay').value;
  dfmFilters.coordinator_id = document.getElementById('dfmCoordinator').value;
  dfmFilters.membership_status = document.getElementById('dfmMembershipStatus').value;
  dfmFilters.search = document.getElementById('dfmSearch').value;
  dfmFilters.balance_min = document.getElementById('dfmBalanceMin').value;
  dfmFilters.balance_max = document.getElementById('dfmBalanceMax').value;

  showLoading();
  try {
    const result = await window.api.getReport('due-for-msc', {
      district: dfmFilters.district,
      province: document.getElementById('dfmProvince').value ? parseInt(document.getElementById('dfmProvince').value) : null,
      municipality: document.getElementById('dfmMunicipality').value ? parseInt(document.getElementById('dfmMunicipality').value) : null,
      barangay: dfmFilters.barangay,
      coordinator_id: dfmFilters.coordinator_id ? parseInt(dfmFilters.coordinator_id) : null,
      membership_status: dfmFilters.membership_status,
      search: dfmFilters.search,
      balance_min: dfmFilters.balance_min !== '' ? parseFloat(dfmFilters.balance_min) : null,
      balance_max: dfmFilters.balance_max !== '' ? parseFloat(dfmFilters.balance_max) : null
    });
    hideLoading();

    if (!result || !result.success) {
      showToast(result?.error || 'Report failed', 'error');
      return;
    }

    reportData = result.data;
    renderDFMResult();
  } catch (e) {
    hideLoading();
    showToast('Failed: ' + e.message, 'error');
  }
}

function renderDFMResult() {
  const container = document.getElementById('reportResultContainer');
  if (!container) return;

  const user = getCurrentUser();
  const userName = user?.fullName || user?.username || 'Unknown';
  const now = new Date();
  const genDate = formatDate(now.toISOString());
  const genTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (!reportData || reportData.length === 0) {
    container.innerHTML = `
      <div class="report-result-wrap">
        <div class="report-result-header">
          <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back to Reports</button>
          <h3>Due for MSC</h3>
        </div>
        <div class="card report-result-card report-result-reveal">
          <div class="card-body" style="text-align:center;padding:60px 20px;color:var(--text-light)">
            <div style="font-size:48px;margin-bottom:16px;opacity:0.3">&#128197;</div>
            <div style="font-size:16px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">All members have sufficient MSC balance.</div>
            <div style="font-size:13px">No members have MSC balance below ₱100.00.</div>
          </div>
        </div>
      </div>`;
    return;
  }

  let totalShortage = 0;
  const rows = reportData.map((m, idx) => {
    const balance = parseFloat(m.computed_balance) || 0;
    const shortage = parseFloat(m.balance_shortage) || 0;
    totalShortage += shortage;
    return `<tr>
      <td class="text-center">${idx + 1}</td>
      <td>${escapeHtml(m.af_no || '')}</td>
      <td>${escapeHtml(m.full_name || '')}</td>
      <td>${escapeHtml(m.district || '')}</td>
      <td>${escapeHtml(m.Barangay || '')}</td>
      <td>${escapeHtml(m.SalesCoordinator || '')}</td>
      <td class="text-right">${formatCurrency(balance)}</td>
      <td class="text-right">${formatCurrency(m.required_msc || 100)}</td>
      <td class="text-right text-danger">${formatCurrency(shortage)}</td>
      <td>${m.last_deposit_date ? formatDate(m.last_deposit_date) : '-'}</td>
      <td>${escapeHtml(m.contact_no || '')}</td>
      <td><span class="badge badge-red">${escapeHtml(m.remarks || 'Subscription')}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="report-result-wrap">
      <div class="report-result-header">
        <button class="report-result-back" onclick="closeReportResult()" title="Back to Reports">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to Reports
        </button>
        <h3>Due for MSC</h3>
        <span class="report-result-count">${reportData.length} members</span>
      </div>

      <div class="mml-summary-bar">
        <div class="mml-summary-item">
          <span class="mml-summary-label">Total Members</span>
          <span class="mml-summary-value">${reportData.length.toLocaleString()}</span>
        </div>
        <div class="mml-summary-item">
          <span class="mml-summary-label">Total Shortage</span>
          <span class="mml-summary-value text-danger">${formatCurrency(totalShortage)}</span>
        </div>
      </div>

      <div class="card report-result-card report-result-reveal">
        <div class="card-header">
          <h3 id="reportTitle">Due for MSC</h3>
          <div class="btn-group">
            <button class="btn btn-primary btn-sm" onclick="exportDFMPDF('landscape')">PDF (Landscape)</button>
            <button class="btn btn-primary btn-sm" onclick="exportDFMPDF('portrait')">PDF (Portrait)</button>
            <button class="btn btn-success btn-sm" onclick="exportDFMExcel()">Export Excel</button>
            <button class="btn btn-secondary btn-sm" onclick="exportDFMCSV()">Export CSV</button>
            <button class="btn btn-outline btn-sm" onclick="exportDFMPrint()">Print</button>
          </div>
        </div>
        <div class="card-body">
          <div id="reportContent" class="table-container mml-table-container">
            <div class="mml-meta">
              <span>Generated By: ${escapeHtml(userName)}</span>
              <span>Generated: ${genDate} ${genTime}</span>
            </div>
            <table class="mml-report-table">
              <thead>
                <tr>
                  <th style="width:40px">No.</th>
                  <th>Member ID</th>
                  <th>Member Name</th>
                  <th>District</th>
                  <th>Barangay</th>
                  <th>Sales Coordinator</th>
                  <th style="width:100px">Current MSC Balance</th>
                  <th style="width:90px">Required MSC</th>
                  <th style="width:90px">Balance Shortage</th>
                  <th style="width:110px">Last Deposit Date</th>
                  <th>Contact Number</th>
                  <th style="width:90px">Remarks</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

function closeReportResult() {
  const container = document.getElementById('reportResultContainer');
  if (container) container.innerHTML = '';
  const topEl = document.querySelector('.reports-page-anim');
  if (topEl) topEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function printReport() {
  const title = document.getElementById('reportTitle').textContent;
  const content = document.getElementById('reportContent').innerHTML;
  const printWin = window.open('', '_blank');
  if (!printWin) {
    showToast('Popup blocked. Please allow popups for this window and try again.', 'error');
    return;
  }
  printWin.document.write(`
    <html><head><title>${escapeHtml(title)}</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:20px}
    h2{color:#16A34A}table{width:100%;border-collapse:collapse}
    th,td{padding:6px 8px;border:1px solid #E5E7EB;font-size:12px}
    th{background:#F8FAFC;font-weight:600;color:#6B7280}.footer{text-align:center;color:#9CA3AF;margin-top:20px;font-size:11px}
    </style></head><body>
    <h2>${escapeHtml(title)}</h2>${content}
    <div class="footer">Generated on: ${formatDateTime(new Date().toISOString())}</div>
    </body></html>`);
  printWin.document.close();
  printWin.print();
}

function exportReportCSV() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  const cols = Object.keys(reportData[0]);
  const csv = [cols.join(',')];
  reportData.forEach(row => {
    csv.push(cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return '';
      return `"${csvSafe(v).replace(/"/g, '""')}"`;
    }).join(','));
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${currentReportType}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}

async function exportReportPDF() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const title = document.getElementById('reportTitle').textContent;
    const cols = Object.keys(reportData[0]);
    const currencyCols = ['MF', 'MSC', 'Total', 'COM', 'Net', 'NetDeposit', 'Deposit', 'Fee', 'Payment', 'Savings', 'Amount', 'TotalDeposit'];
    let rowsHtml = reportData.map(row => {
      return '<tr>' + cols.map(c => {
        const val = row[c];
        if (val === null || val === undefined) return '<td></td>';
        if (typeof val === 'number') {
          if (currencyCols.some(k => c.toLowerCase() === k.toLowerCase())) return `<td class="text-right">${formatCurrency(val)}</td>`;
          return `<td class="text-right">${Number(val).toFixed(2)}</td>`;
        }
        if (val instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(val))) return `<td>${formatDate(val)}</td>`;
        return `<td>${escapeHtml(String(val))}</td>`;
      }).join('') + '</tr>';
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, sans-serif; padding: 40px; color: #1F2937; }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #16A34A; padding-bottom: 16px; }
  .header h1 { color: #16A34A; font-size: 20px; letter-spacing: 1px; }
  .header h2 { color: #1F2937; font-size: 16px; font-weight: 600; margin-top: 4px; }
  .header p { color: #6B7280; font-size: 12px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 16px; }
  th { background: #0B3D2E; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  td { padding: 6px 10px; border-bottom: 1px solid #E5E7EB; color: #1F2937; }
  tr:nth-child(even) td { background: #F8FAFC; }
  .text-right { text-align: right; }
  .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; }
  @page { size: A4 portrait; margin: 15mm 20mm; }
</style></head><body>
<div class="header">
  <h1>GOLDENHOPE</h1>
  <h2>${escapeHtml(title)}</h2>
  <p>Damayan Association and Support Inc.</p>
</div>
<table><thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${rowsHtml}</tbody></table>
<div class="footer">Generated on: ${formatDateTime(new Date().toISOString())}</div>
</body></html>`;

    const pdfResult = await window.api.printToPDF(html, `report_${currentReportType}_${new Date().toISOString().slice(0,10)}.pdf`);
    if (!pdfResult.success) { showToast('PDF Export Failed: ' + pdfResult.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(pdfResult.data)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfResult.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF exported');
  } catch (e) { showToast('PDF export failed: ' + e.message, 'error'); }
  hideLoading();
}

async function exportReportExcel() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const result = await window.api.exportExcel(reportData, `report_${currentReportType}_${new Date().toISOString().slice(0,10)}.xlsx`);
    if (!result.success) { showToast('Excel Export Failed: ' + result.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(result.data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel exported');
  } catch (e) { showToast('Excel export failed: ' + e.message, 'error'); }
  hideLoading();
}

// ===== MEMBER MASTER LIST PROFESSIONAL EXPORT =====

function mmlRenewalDue(renewalDate) {
  if (!renewalDate) return true;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rd = new Date(String(renewalDate).split('T')[0].split(' ')[0] + 'T00:00:00');
  if (isNaN(rd.getTime())) return true;
  const diffDays = Math.round((rd - today) / 86400000);
  return diffDays <= 30;
}

function mmlBuildRows() {
  return reportData.map((m, idx) => ({
    num: idx + 1,
    name: m.full_name || '',
    address: [m.barangay_name, m.municipality_name].filter(Boolean).join(', '),
    afno: m.af_no || '',
    balance: parseFloat(m.computed_balance) || 0,
    renewal_date: m.renewal_date || ''
  }));
}

function generateMMLHTML(logoUrl) {
  const monthName = MONTHS[parseInt(mmlFilters.month) - 1] || 'Unknown';
  const yearLabel = mmlFilters.year;
  const now = new Date();
  const genDate = formatDate(now.toISOString());
  const genTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  const user = getCurrentUser();
  const userName = user?.fullName || user?.username || 'Administrator';

  const rows = mmlBuildRows();

  const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const diedCells = MONTH_ABBR.slice(0, 4).map((abbr, i) =>
    `<span class="died-cell"><span class="died-left">${abbr}: ${mmlDiedMonthly[i + 1] || 0}</span><span class="died-mid">${MONTH_ABBR[i + 4]}: ${mmlDiedMonthly[i + 5] || 0}</span><span class="died-right">${MONTH_ABBR[i + 8]}: ${mmlDiedMonthly[i + 9] || 0}</span></span>`
  ).join('<br>');

  const tableRows = rows.map(r => {
    const due = mmlRenewalDue(r.renewal_date);
    const renewalColor = due ? '#DC2626' : '#2563EB';
    const renewalDateLabel = r.renewal_date ? formatDate(r.renewal_date) : '—';
    return `<tr>
    <td class="c">${r.num}</td>
    <td>${escapeHtml(r.name)}</td>
    <td>${escapeHtml(r.address)}</td>
    <td class="c">${escapeHtml(r.afno)}</td>
    <td class="c" style="color:${renewalColor};font-weight:700">${renewalDateLabel}</td>
    <td class="c">${formatCurrency(r.balance)}</td>
    <td></td>
    <td></td>
  </tr>`;
  }).join('');

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" class="logo-img">`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Member Master List - ${monthName} ${yearLabel}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 15mm 12mm 15mm 12mm;
    @bottom-center {
      content: "Page " counter(page);
      font-size: 8pt;
      color: #555;
      font-family: Arial, sans-serif;
    }
  }
  @media print {
    html, body {
      width: 100%;
      margin: 0;
      padding: 0;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    tr {
      page-break-inside: avoid;
    }
    .no-print {
      display: none;
    }
    .page-break {
      page-break-before: always;
    }
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: Arial, 'Helvetica', sans-serif;
    font-size: 10pt;
    line-height: 1.3;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ===== HEADER ===== */
  .header-row {
    text-align: center;
    margin-bottom: 6px;
  }
  .header-inner {
    display: inline-flex;
    align-items: flex-start;
    text-align: left;
  }
  .header-left {
    width: 75px;
    flex-shrink: 0;
  }
  .logo-img {
    width: 65px;
    height: auto;
    display: block;
  }
  .header-center {
    text-align: center;
  }
  .org-name {
    font-size: 12pt;
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.15;
  }
  .org-address {
    font-size: 8pt;
    color: #000;
    margin-top: 1px;
  }
  .sec-reg {
    font-size: 7.5pt;
    color: #000;
    margin-top: 1px;
  }
  /* ===== TITLE ===== */
  .report-title {
    text-align: center;
    margin: 10px 0 6px 0;
  }
  .report-title h1 {
    font-size: 15pt;
    font-weight: 700;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .month-info {
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    font-weight: 700;
    color: #000;
    margin: 4px 0 6px 0;
  }
  .month-info-right {
    text-align: right;
  }

  .died-reference {
    text-align: left;
    font-size: 10pt;
    font-weight: 700;
    color: #000;
    margin-top: 10px;
    line-height: 1.6;
  }
  .died-cell {
    display: block;
  }
  .died-left, .died-mid, .died-right {
    display: inline-block;
    width: 90px;
  }
  .died-mid { margin-left: 30px; }
  .died-right { margin-left: 30px; }

  /* ===== TABLE ===== */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  thead th {
    font-weight: 700;
    font-size: 10pt;
    padding: 5px 4px;
    border: 1px solid #000;
    text-align: center;
    vertical-align: middle;
    color: #000;
    background: #fff;
  }
  tbody td {
    padding: 4px 4px;
    border: 1px solid #000;
    vertical-align: middle;
    color: #000;
  }
  td.c {
    text-align: center;
  }

</style></head><body>

<div class="header-row">
  <div class="header-inner">
    <div class="header-left">
      ${logoHtml}
    </div>
    <div class="header-center">
      <div class="org-name">GoldenHope Damayan Association and Support Inc.</div>
      <div class="org-address">Poblacion, Manukan, Zamboanga del Norte</div>
      <div class="sec-reg">SEC REG. NO. 2025110227750</div>
    </div>
  </div>
</div>

<div class="report-title">
  <h1>Member Master List</h1>
</div>

<div class="month-info">
  <span class="month-info-left">MONTH UPDATE : ${monthName.toUpperCase()} ${yearLabel}</span>
  <span class="month-info-right">Month of ${monthName} ${yearLabel}</span>
</div>

<table>
  <thead>
    <tr>
      <th style="width:30px">No.</th>
      <th style="width:26%">Member's Name</th>
      <th style="width:22%">Address</th>
      <th style="width:10%">AF No.</th>
      <th style="width:10%">Renewal Date</th>
      <th style="width:10%">Balance</th>
      <th style="width:10%">Deposit</th>
      <th style="width:12%">Signature</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
</table>

<div class="died-reference">DIED REFERENCE NO. OF ${monthName.toUpperCase()} ${yearLabel} MEMBERS :<br>${diedCells}</div>

</body></html>`;
}

async function exportMMLPDF(orientation) {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const logo = await getPrintLogo();
    const html = generateMMLHTML(logo);
    const monthName = MONTHS[parseInt(mmlFilters.month) - 1] || 'Unknown';
    const filename = `MemberMasterList_${monthName}_${mmlFilters.year}.pdf`;

    let pdfResult;
    if (orientation === 'landscape') {
      pdfResult = await window.api.exportPrintToPDFLandscape(html, filename);
    } else {
      pdfResult = await window.api.exportPrintToPDFPortrait(html, filename);
    }

    if (!pdfResult.success) { showToast('PDF Export Failed: ' + pdfResult.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(pdfResult.data)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfResult.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF exported successfully');
  } catch (e) { showToast('PDF export failed: ' + e.message, 'error'); }
  hideLoading();
}

async function exportMMLPrint() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const logo = await getPrintLogo();
    const html = generateMMLHTML(logo);
    const printWin = window.open('', '_blank');
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = function() {
      printWin.print();
    };
  } catch (e) { showToast('Print failed: ' + e.message, 'error'); }
  hideLoading();
}

function exportMMLCSV() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  const monthName = MONTHS[parseInt(mmlFilters.month) - 1] || 'Unknown';
  const headers = ['No.','Member\'s Name','Address','AF No.','Renewal Date','Balance','Deposit','Signature'];
  const csv = [headers.join(',')];
  const rows = mmlBuildRows();
  rows.forEach(r => {
    csv.push([
      r.num, `"${r.name.replace(/"/g, '""')}"`, `"${r.address.replace(/"/g, '""')}"`,
      r.afno, r.renewal_date, r.balance, '', ''
    ].join(','));
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MemberMasterList_${monthName}_${mmlFilters.year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}

async function exportMMLExcel() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const rows = mmlBuildRows();
    const exportData = rows.map(r => ({
      'No.': r.num,
      "Member's Name": r.name,
      'Address': r.address,
      'AF No.': r.afno,
      'Renewal Date': r.renewal_date,
      'Balance': r.balance,
      'Deposit': '',
      'Signature': ''
    }));
    const monthName = MONTHS[parseInt(mmlFilters.month) - 1] || 'Unknown';
    const result = await window.api.exportExcel(exportData, `MemberMasterList_${monthName}_${mmlFilters.year}.xlsx`);
    if (!result.success) { showToast('Excel Export Failed: ' + result.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(result.data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel exported');
  } catch (e) { showToast('Excel export failed: ' + e.message, 'error'); }
  hideLoading();
}

// ===== READY FOR RENEWAL EXPORTS =====

async function exportRFRPDF(orientation) {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const logo = await getPrintLogo();
    const html = generateRFRHTML(logo, orientation);
    const filename = `ReadyForRenewal_${new Date().toISOString().slice(0,10)}.pdf`;

    let pdfResult;
    if (orientation === 'landscape') {
      pdfResult = await window.api.exportPrintToPDFLandscape(html, filename);
    } else {
      pdfResult = await window.api.exportPrintToPDFPortrait(html, filename);
    }

    if (!pdfResult.success) { showToast('PDF Export Failed: ' + pdfResult.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(pdfResult.data)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfResult.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF exported successfully');
  } catch (e) { showToast('PDF export failed: ' + e.message, 'error'); }
  hideLoading();
}

async function exportRFRPrint() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const logo = await getPrintLogo();
    const html = generateRFRHTML(logo, 'landscape');
    const printWin = window.open('', '_blank');
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = function() {
      printWin.print();
    };
  } catch (e) { showToast('Print failed: ' + e.message, 'error'); }
  hideLoading();
}

function exportRFRCSV() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  const headers = ['No.','Member ID','Member Name','District','Barangay','Sales Coordinator','Membership Status','Registration Date','Renewal Date','Days Remaining','Current MSC Balance','Required MSC','Balance Shortage','Last Deposit Date','Contact Number','Remarks'];
  const csv = [headers.join(',')];
  reportData.forEach((m, idx) => {
    const balance = parseFloat(m.computed_balance) || 0;
    const shortage = parseFloat(m.balance_shortage) || 0;
    csv.push([
      idx + 1,
      `"${(m.af_no || '').replace(/"/g, '""')}"`,
      `"${(m.full_name || '').replace(/"/g, '""')}"`,
      `"${(m.district || '').replace(/"/g, '""')}"`,
      `"${(m.Barangay || '').replace(/"/g, '""')}"`,
      `"${(m.SalesCoordinator || '').replace(/"/g, '""')}"`,
      `"${(m.membership_status || '').replace(/"/g, '""')}"`,
      formatDate(m.registration_date),
      formatDate(m.renewal_date),
      m.days_remaining >= 0 ? m.days_remaining : 'Expired',
      balance.toFixed(2),
      (m.required_msc || 100).toFixed(2),
      shortage.toFixed(2),
      `"${m.last_deposit_date ? formatDate(m.last_deposit_date) : '-'}"`,
      `"${(m.contact_no || '').replace(/"/g, '""')}"`,
      `"${(m.remarks || '').replace(/"/g, '""')}"`
    ].join(','));
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ReadyForRenewal_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}

async function exportRFRExcel() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const exportData = reportData.map((m, idx) => ({
      'No.': idx + 1,
      'Member ID': m.af_no || '',
      'Member Name': m.full_name || '',
      'District': m.district || '',
      'Barangay': m.Barangay || '',
      'Sales Coordinator': m.SalesCoordinator || '',
      'Membership Status': m.membership_status || '',
      'Registration Date': formatDate(m.registration_date),
      'Renewal Date': formatDate(m.renewal_date),
      'Days Remaining': m.days_remaining >= 0 ? m.days_remaining : 'Expired',
      'Current MSC Balance': parseFloat(m.computed_balance) || 0,
      'Required MSC': m.required_msc || 100,
      'Balance Shortage': parseFloat(m.balance_shortage) || 0,
      'Last Deposit Date': m.last_deposit_date ? formatDate(m.last_deposit_date) : '',
      'Contact Number': m.contact_no || '',
      'Remarks': m.remarks || ''
    }));
    const result = await window.api.exportExcel(exportData, `ReadyForRenewal_${new Date().toISOString().slice(0,10)}.xlsx`);
    if (!result.success) { showToast('Excel Export Failed: ' + result.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(result.data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel exported');
  } catch (e) { showToast('Excel export failed: ' + e.message, 'error'); }
  hideLoading();
}

function generateRFRHTML(logoUrl, orientation) {
  const now = new Date();
  const genDate = formatDate(now.toISOString());
  const genTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  const user = getCurrentUser();
  const userName = user?.fullName || user?.username || 'Administrator';

  let totalShortage = 0;
  const rows = reportData.map((m, idx) => {
    const days = m.days_remaining;
    const balance = parseFloat(m.computed_balance) || 0;
    const shortage = parseFloat(m.balance_shortage) || 0;
    totalShortage += shortage;
    return `<tr>
      <td class="c">${idx + 1}</td>
      <td>${escapeHtml(m.af_no || '')}</td>
      <td>${escapeHtml(m.full_name || '')}</td>
      <td>${escapeHtml(m.district || '')}</td>
      <td>${escapeHtml(m.Barangay || '')}</td>
      <td>${escapeHtml(m.SalesCoordinator || '')}</td>
      <td>${escapeHtml(m.membership_status || '')}</td>
      <td class="c">${formatDate(m.registration_date)}</td>
      <td class="c">${formatDate(m.renewal_date)}</td>
      <td class="c ${days <= 30 ? 'text-danger' : days <= 60 ? 'text-warning' : ''}">${days >= 0 ? days : 'Expired'}</td>
      <td class="r">${formatCurrency(balance)}</td>
      <td class="r">${formatCurrency(m.required_msc || 100)}</td>
      <td class="r text-danger">${formatCurrency(shortage)}</td>
      <td class="c">${m.last_deposit_date ? formatDate(m.last_deposit_date) : '-'}</td>
      <td>${escapeHtml(m.contact_no || '')}</td>
      <td><span class="badge badge-orange">${escapeHtml(m.remarks || 'Ready for Renewal')}</span></td>
    </tr>`;
  }).join('');

  const isLandscape = orientation === 'landscape';
  const pageSize = isLandscape ? 'Legal landscape' : 'A4 portrait';
  const fontSize = isLandscape ? '8pt' : '7.5pt';
  const headerFontSize = isLandscape ? '7.5pt' : '7pt';

  const logoHtml = logoUrl ? `<img src="${logoUrl}" style="height:55px;width:auto;display:block;margin:0 auto 6px">` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ready for Renewal</title>
<style>
  @page { size: ${pageSize}; margin: 15mm 15mm 20mm 15mm;
    @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #888; font-family: 'Segoe UI', Arial, sans-serif; }
  }
  @media print {
    html, body { width: 100%; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    .no-print { display: none; }
    .page-break { page-break-before: always; }
    tr { page-break-inside: avoid; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Arial', 'Helvetica', sans-serif; font-size: ${fontSize}; line-height: 1.35; color: #1e1e1e; }
  .report-header { text-align: center; margin-bottom: 8px; padding-bottom: 6px; }
  .report-header .org-name { font-size: 12pt; font-weight: 800; letter-spacing: 1.5px; color: #000; text-transform: uppercase; }
  .report-header .org-address { font-size: 8pt; color: #444; margin-top: 2px; }
  .report-header .sec-reg { font-size: 7pt; color: #555; margin-top: 1px; }
  .report-title { text-align: center; margin: 4px 0; }
  .report-title h1 { font-size: 11pt; font-weight: 700; text-transform: uppercase; color: #000; letter-spacing: 0.5px; }
  .report-title h2 { font-size: 9pt; font-weight: 600; color: #333; margin-top: 2px; }
  .report-meta { display: flex; justify-content: space-between; font-size: 7pt; color: #555; margin-bottom: 6px; padding: 3px 0; border-bottom: 1px solid #ccc; }
  table { width: 100%; border-collapse: collapse; font-size: ${fontSize}; }
  th { background: #1e1e1e; color: #fff; padding: 5px 4px; font-weight: 600; font-size: ${headerFontSize}; text-align: center; border: 0.5px solid #333; text-transform: uppercase; letter-spacing: 0.2px; }
  td { padding: 3px 4px; border: 0.5px solid #999; vertical-align: middle; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .c { text-align: center; }
  .r { text-align: right; padding-right: 6px; }
  .text-danger { color: #dc2626; font-weight: 600; }
  .text-warning { color: #d97706; font-weight: 600; }
  .badge { padding: 2px 6px; border-radius: 4px; font-size: 6pt; font-weight: 600; text-transform: uppercase; }
  .badge-orange { background: #fed7aa; color: #c2410c; }
  .report-footer { margin-top: 16px; padding-top: 8px; }
  .report-footer .signature-area { display: flex; justify-content: space-between; margin-top: 20px; padding: 0 10px; }
  .report-footer .signature-box { text-align: center; min-width: 180px; }
  .report-footer .signature-box .line { width: 100%; border-top: 1px solid #000; margin-top: 36px; }
  .report-footer .signature-box .label { font-size: 7.5pt; color: #333; margin-top: 4px; font-weight: 600; }
  .footer-note { text-align: center; font-size: 6.5pt; color: #999; margin-top: 10px; }
</style></head><body>
<div class="report-header">
  ${logoHtml}
  <div class="org-name">GoldenHope Damayan Association and Support Inc.</div>
  <div class="org-address">Population, Manukan, Zamboanga del Norte, Philippines</div>
  <div class="sec-reg">SEC Registration No.: 202510227750</div>
</div>
<div class="report-title">
  <h1>Ready for Renewal</h1>
  <h2>Members Approaching Membership Renewal (Within 2 Months)</h2>
</div>
<div class="report-meta">
  <span>Generated By: ${escapeHtml(userName)}</span>
  <span>Generated On: ${genDate} ${genTime}</span>
</div>
<table>
  <thead>
    <tr>
      <th style="width:30px">No.</th>
      <th>Member ID</th>
      <th>Member Name</th>
      <th>District</th>
      <th>Barangay</th>
      <th>Sales Coordinator</th>
      <th>Membership Status</th>
      <th style="width:70px">Registration Date</th>
      <th style="width:70px">Renewal Date</th>
      <th style="width:50px">Days</th>
      <th style="width:80px">Current MSC Balance</th>
      <th style="width:70px">Required MSC</th>
      <th style="width:80px">Balance Shortage</th>
      <th style="width:90px">Last Deposit</th>
      <th>Contact Number</th>
      <th style="width:90px">Remarks</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="report-footer">
  <div class="signature-area">
    <div class="signature-box">
      <div class="line"></div>
      <div class="label">Prepared By: ${escapeHtml(userName)}</div>
    </div>
    <div class="signature-box">
      <div class="line"></div>
      <div class="label">Checked By:</div>
    </div>
    <div class="signature-box">
      <div class="line"></div>
      <div class="label">Approved By:</div>
    </div>
  </div>
  <div class="footer-note">Total Shortage: ${formatCurrency(totalShortage)} | Printed On: ${genDate} ${genTime} | GoldenHope Damayan Management System</div>
</div>
</body></html>`;
}

// ===== DUE FOR MSC EXPORTS =====

async function exportDFMPDF(orientation) {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const logo = await getPrintLogo();
    const html = generateDFMHTML(logo, orientation);
    const filename = `DueForMSC_${new Date().toISOString().slice(0,10)}.pdf`;

    let pdfResult;
    if (orientation === 'landscape') {
      pdfResult = await window.api.exportPrintToPDFLandscape(html, filename);
    } else {
      pdfResult = await window.api.exportPrintToPDFPortrait(html, filename);
    }

    if (!pdfResult.success) { showToast('PDF Export Failed: ' + pdfResult.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(pdfResult.data)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfResult.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PDF exported successfully');
  } catch (e) { showToast('PDF export failed: ' + e.message, 'error'); }
  hideLoading();
}

async function exportDFMPrint() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const logo = await getPrintLogo();
    const html = generateDFMHTML(logo, 'landscape');
    const printWin = window.open('', '_blank');
    printWin.document.write(html);
    printWin.document.close();
    printWin.onload = function() {
      printWin.print();
    };
  } catch (e) { showToast('Print failed: ' + e.message, 'error'); }
  hideLoading();
}

function exportDFMCSV() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  const headers = ['No.','Member ID','Member Name','District','Barangay','Sales Coordinator','Current MSC Balance','Required MSC','Balance Shortage','Last Deposit Date','Contact Number','Remarks'];
  const csv = [headers.join(',')];
  reportData.forEach((m, idx) => {
    const balance = parseFloat(m.computed_balance) || 0;
    const shortage = parseFloat(m.balance_shortage) || 0;
    csv.push([
      idx + 1,
      `"${(m.af_no || '').replace(/"/g, '""')}"`,
      `"${(m.full_name || '').replace(/"/g, '""')}"`,
      `"${(m.district || '').replace(/"/g, '""')}"`,
      `"${(m.Barangay || '').replace(/"/g, '""')}"`,
      `"${(m.SalesCoordinator || '').replace(/"/g, '""')}"`,
      balance.toFixed(2),
      (m.required_msc || 100).toFixed(2),
      shortage.toFixed(2),
      `"${m.last_deposit_date ? formatDate(m.last_deposit_date) : '-'}"`,
      `"${(m.contact_no || '').replace(/"/g, '""')}"`,
      `"${(m.remarks || '').replace(/"/g, '""')}"`
    ].join(','));
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DueForMSC_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}

async function exportDFMExcel() {
  if (!reportData || reportData.length === 0) { showToast('No data to export', 'warning'); return; }
  showLoading();
  try {
    const exportData = reportData.map((m, idx) => ({
      'No.': idx + 1,
      'Member ID': m.af_no || '',
      'Member Name': m.full_name || '',
      'District': m.district || '',
      'Barangay': m.Barangay || '',
      'Sales Coordinator': m.SalesCoordinator || '',
      'Current MSC Balance': parseFloat(m.computed_balance) || 0,
      'Required MSC': m.required_msc || 100,
      'Balance Shortage': parseFloat(m.balance_shortage) || 0,
      'Last Deposit Date': m.last_deposit_date ? formatDate(m.last_deposit_date) : '',
      'Contact Number': m.contact_no || '',
      'Remarks': m.remarks || ''
    }));
    const result = await window.api.exportExcel(exportData, `DueForMSC_${new Date().toISOString().slice(0,10)}.xlsx`);
    if (!result.success) { showToast('Excel Export Failed: ' + result.error, 'error'); return; }
    const blob = new Blob([new Uint8Array(result.data)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel exported');
  } catch (e) { showToast('Excel export failed: ' + e.message, 'error'); }
  hideLoading();
}

function generateDFMHTML(logoUrl, orientation) {
  const now = new Date();
  const genDate = formatDate(now.toISOString());
  const genTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  const user = getCurrentUser();
  const userName = user?.fullName || user?.username || 'Administrator';

  let totalShortage = 0;
  const rows = reportData.map((m, idx) => {
    const balance = parseFloat(m.computed_balance) || 0;
    const shortage = parseFloat(m.balance_shortage) || 0;
    totalShortage += shortage;
    return `<tr>
      <td class="c">${idx + 1}</td>
      <td>${escapeHtml(m.af_no || '')}</td>
      <td>${escapeHtml(m.full_name || '')}</td>
      <td>${escapeHtml(m.district || '')}</td>
      <td>${escapeHtml(m.Barangay || '')}</td>
      <td>${escapeHtml(m.SalesCoordinator || '')}</td>
      <td class="r">${formatCurrency(balance)}</td>
      <td class="r">${formatCurrency(m.required_msc || 100)}</td>
      <td class="r text-danger">${formatCurrency(shortage)}</td>
      <td class="c">${m.last_deposit_date ? formatDate(m.last_deposit_date) : '-'}</td>
      <td>${escapeHtml(m.contact_no || '')}</td>
      <td><span class="badge badge-red">${escapeHtml(m.remarks || 'Subscription')}</span></td>
    </tr>`;
  }).join('');

  const isLandscape = orientation === 'landscape';
  const pageSize = isLandscape ? 'Legal landscape' : 'A4 portrait';
  const fontSize = isLandscape ? '8pt' : '7.5pt';
  const headerFontSize = isLandscape ? '7.5pt' : '7pt';

  const logoHtml = logoUrl ? `<img src="${logoUrl}" style="height:55px;width:auto;display:block;margin:0 auto 6px">` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Due for MSC</title>
<style>
  @page { size: ${pageSize}; margin: 15mm 15mm 20mm 15mm;
    @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #888; font-family: 'Segoe UI', Arial, sans-serif; }
  }
  @media print {
    html, body { width: 100%; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    .no-print { display: none; }
    .page-break { page-break-before: always; }
    tr { page-break-inside: avoid; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Arial', 'Helvetica', sans-serif; font-size: ${fontSize}; line-height: 1.35; color: #1e1e1e; }
  .report-header { text-align: center; margin-bottom: 8px; padding-bottom: 6px; }
  .report-header .org-name { font-size: 12pt; font-weight: 800; letter-spacing: 1.5px; color: #000; text-transform: uppercase; }
  .report-header .org-address { font-size: 8pt; color: #444; margin-top: 2px; }
  .report-header .sec-reg { font-size: 7pt; color: #555; margin-top: 1px; }
  .report-title { text-align: center; margin: 4px 0; }
  .report-title h1 { font-size: 11pt; font-weight: 700; text-transform: uppercase; color: #000; letter-spacing: 0.5px; }
  .report-title h2 { font-size: 9pt; font-weight: 600; color: #333; margin-top: 2px; }
  .report-meta { display: flex; justify-content: space-between; font-size: 7pt; color: #555; margin-bottom: 6px; padding: 3px 0; border-bottom: 1px solid #ccc; }
  table { width: 100%; border-collapse: collapse; font-size: ${fontSize}; }
  th { background: #1e1e1e; color: #fff; padding: 5px 4px; font-weight: 600; font-size: ${headerFontSize}; text-align: center; border: 0.5px solid #333; text-transform: uppercase; letter-spacing: 0.2px; }
  td { padding: 3px 4px; border: 0.5px solid #999; vertical-align: middle; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .c { text-align: center; }
  .r { text-align: right; padding-right: 6px; }
  .text-danger { color: #dc2626; font-weight: 600; }
  .badge { padding: 2px 6px; border-radius: 4px; font-size: 6pt; font-weight: 600; text-transform: uppercase; }
  .badge-red { background: #fecaca; color: #b91c1c; }
  .report-footer { margin-top: 16px; padding-top: 8px; }
  .report-footer .signature-area { display: flex; justify-content: space-between; margin-top: 20px; padding: 0 10px; }
  .report-footer .signature-box { text-align: center; min-width: 180px; }
  .report-footer .signature-box .line { width: 100%; border-top: 1px solid #000; margin-top: 36px; }
  .report-footer .signature-box .label { font-size: 7.5pt; color: #333; margin-top: 4px; font-weight: 600; }
  .footer-note { text-align: center; font-size: 6.5pt; color: #999; margin-top: 10px; }
</style></head><body>
<div class="report-header">
  ${logoHtml}
  <div class="org-name">GoldenHope Damayan Association and Support Inc.</div>
  <div class="org-address">Population, Manukan, Zamboanga del Norte, Philippines</div>
  <div class="sec-reg">SEC Registration No.: 202510227750</div>
</div>
<div class="report-title">
  <h1>Subscription (Due for MSC)</h1>
  <h2>Members with MSC Balance Below ₱100.00</h2>
</div>
<div class="report-meta">
  <span>Generated By: ${escapeHtml(userName)}</span>
  <span>Generated On: ${genDate} ${genTime}</span>
</div>
<table>
  <thead>
    <tr>
      <th style="width:30px">No.</th>
      <th>Member ID</th>
      <th>Member Name</th>
      <th>District</th>
      <th>Barangay</th>
      <th>Sales Coordinator</th>
      <th style="width:100px">Current MSC Balance</th>
      <th style="width:90px">Required MSC</th>
      <th style="width:90px">Balance Shortage</th>
      <th style="width:110px">Last Deposit Date</th>
      <th>Contact Number</th>
      <th style="width:90px">Remarks</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="report-footer">
  <div class="signature-area">
    <div class="signature-box">
      <div class="line"></div>
      <div class="label">Prepared By: ${escapeHtml(userName)}</div>
    </div>
    <div class="signature-box">
      <div class="line"></div>
      <div class="label">Checked By:</div>
    </div>
    <div class="signature-box">
      <div class="line"></div>
      <div class="label">Approved By:</div>
    </div>
  </div>
  <div class="footer-note">Total Shortage: ${formatCurrency(totalShortage)} | Printed On: ${genDate} ${genTime} | GoldenHope Damayan Management System</div>
</div>
</body></html>`;
}
