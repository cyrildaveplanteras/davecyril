async function renderPsgcAdmin() {
  const area = document.getElementById('contentArea');
  area.innerHTML = `
    <div class="psgc-wrapper" style="max-width:1100px;margin:0 auto;padding:0 20px">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px">
        <div class="card" style="cursor:pointer" onclick="psgcImportData()">
          <div class="card-body" style="text-align:center;padding:24px">
            <div style="font-size:36px;margin-bottom:8px">&#128230;</div>
            <h3 style="margin:0 0 4px">Import PSGC Data</h3>
            <p style="margin:0;font-size:13px;color:var(--text-light)">Import from PSGC Excel file</p>
          </div>
        </div>
        <div class="card" style="cursor:pointer" onclick="psgcShowImportLogs()">
          <div class="card-body" style="text-align:center;padding:24px">
            <div style="font-size:36px;margin-bottom:8px">&#128203;</div>
            <h3 style="margin:0 0 4px">Import Logs</h3>
            <p style="margin:0;font-size:13px;color:var(--text-light)">View import history</p>
          </div>
        </div>
        <div class="card" style="cursor:pointer" onclick="psgcShowMigrationLogs()">
          <div class="card-body" style="text-align:center;padding:24px">
            <div style="font-size:36px;margin-bottom:8px">&#128260;</div>
            <h3 style="margin:0 0 4px">Migration Logs</h3>
            <p style="margin:0;font-size:13px;color:var(--text-light)">Member address migration records</p>
          </div>
        </div>
        <div class="card" style="cursor:pointer" onclick="psgcShowAuditLogs()">
          <div class="card-body" style="text-align:center;padding:24px">
            <div style="font-size:36px;margin-bottom:8px">&#128270;</div>
            <h3 style="margin:0 0 4px">Audit Logs</h3>
            <p style="margin:0;font-size:13px;color:var(--text-light)">PSGC admin activity log</p>
          </div>
        </div>
        <div class="card" style="cursor:pointer" onclick="psgcShowDuplicates()">
          <div class="card-body" style="text-align:center;padding:24px">
            <div style="font-size:36px;margin-bottom:8px">&#128264;</div>
            <h3 style="margin:0 0 4px">Check Duplicates</h3>
            <p style="margin:0;font-size:13px;color:var(--text-light)">Find duplicate records</p>
          </div>
        </div>
        <div class="card" style="cursor:pointer" onclick="psgcBrowseData()">
          <div class="card-body" style="text-align:center;padding:24px">
            <div style="font-size:36px;margin-bottom:8px">&#128269;</div>
            <h3 style="margin:0 0 4px">Browse Data</h3>
            <p style="margin:0;font-size:13px;color:var(--text-light)">View PSGC hierarchy</p>
          </div>
        </div>
      </div>
      <div id="psgcDetailArea" class="card">
        <div class="card-body" style="text-align:center;padding:40px;color:var(--text-light)">
          <div style="font-size:48px;margin-bottom:12px;opacity:0.4">&#127758;</div>
          <h3 style="margin:0 0 4px;color:var(--text-secondary)">PSGC Location Management</h3>
          <p style="margin:0;font-size:14px">Select an option above to manage geographic data</p>
        </div>
      </div>
    </div>`;
}

async function psgcImportData() {
  const area = document.getElementById('psgcDetailArea');
  const user = getCurrentUser();
  area.innerHTML = `
    <div class="card-body" style="padding:24px">
      <h3 style="margin:0 0 16px">Import PSGC Data</h3>
      <p style="margin:0 0 16px;color:var(--text-light);font-size:14px">
        This will import the official Philippine Standard Geographic Code (PSGC) from the Excel file located at <code>data/psgc/PSGC-2Q-2026-Publication-Datafile.xlsx</code>.
        Existing records will be preserved (duplicates skipped).
      </p>
      <button class="btn btn-primary" onclick="psgcRunImport()" id="psgcImportBtn">
        &#128230; Start Import
      </button>
      <div id="psgcImportResult" style="margin-top:16px"></div>
    </div>`;
}

async function psgcRunImport() {
  const btn = document.getElementById('psgcImportBtn');
  const resultDiv = document.getElementById('psgcImportResult');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  resultDiv.innerHTML = '<div class="spinner"></div><p>Importing PSGC data, please wait...</p>';
  try {
    const user = getCurrentUser();
    const result = await window.api.importPsgc(user?.id || null);
    if (result.success) {
      resultDiv.innerHTML = `
        <div style="padding:16px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;color:#166534">
          <strong>&#10004; Import Successful</strong>
          <ul style="margin:8px 0 0;padding-left:20px">
            <li>Provinces imported: ${result.provinces || 0}</li>
            <li>Municipalities imported: ${result.municipalities || 0}</li>
            <li>Barangays imported: ${result.barangays || 0}</li>
            <li>Duplicates skipped: ${result.duplicates || 0}</li>
          </ul>
        </div>`;
      await window.api.logPsgcAudit(user?.id || null, user?.username || 'System', 'IMPORT', 'PSGC data import completed', (result.provinces || 0) + (result.municipalities || 0) + (result.barangays || 0));
    } else {
      resultDiv.innerHTML = `<div style="padding:16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;color:#991B1B"><strong>&#10008; Import Failed</strong><p style="margin:4px 0 0">${escapeHtml(result.error || 'Unknown error')}</p></div>`;
    }
  } catch (e) {
    resultDiv.innerHTML = `<div style="padding:16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;color:#991B1B"><strong>&#10008; Error</strong><p style="margin:4px 0 0">${escapeHtml(e.message)}</p></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Start Import';
  }
}

async function psgcShowImportLogs() {
  const area = document.getElementById('psgcDetailArea');
  area.innerHTML = '<div class="card-body" style="padding:24px"><h3 style="margin:0 0 16px">Import Logs</h3><div id="psgcImportLogsContent"><div class="spinner"></div><p>Loading...</p></div></div>';
  try {
    const result = await window.api.getPsgcImportLogs();
    const content = document.getElementById('psgcImportLogsContent');
    if (result.success && result.data.length > 0) {
      content.innerHTML = `<table class="table table-striped">
        <thead><tr><th>Date</th><th>Status</th><th>Provinces</th><th>Municipalities</th><th>Barangays</th><th>Skipped</th><th>Errors</th></tr></thead>
        <tbody>${result.data.map(r => `<tr>
          <td>${escapeHtml(r.import_date || '')}</td>
          <td><span style="color:${r.status === 'Success' ? '#16A34A' : '#DC2626'}">${escapeHtml(r.status)}</span></td>
          <td>${r.provinces_imported || 0}</td>
          <td>${r.municipalities_imported || 0}</td>
          <td>${r.barangays_imported || 0}</td>
          <td>${r.duplicates_skipped || 0}</td>
          <td>${escapeHtml(r.errors || '')}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } else {
      content.innerHTML = '<p style="color:var(--text-light)">No import logs found.</p>';
    }
  } catch (e) {
    document.getElementById('psgcImportLogsContent').innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(e.message)}</p>`;
  }
}

async function psgcShowMigrationLogs() {
  const area = document.getElementById('psgcDetailArea');
  area.innerHTML = '<div class="card-body" style="padding:24px"><h3 style="margin:0 0 16px">Migration Logs</h3><div id="psgcMigrationLogsContent"><div class="spinner"></div><p>Loading...</p></div></div>';
  try {
    const result = await window.api.getPsgcMigrationLogs();
    const content = document.getElementById('psgcMigrationLogsContent');
    if (result.success && result.data.length > 0) {
      content.innerHTML = `<table class="table table-striped">
        <thead><tr><th>Date</th><th>Member ID</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>${result.data.map(r => `<tr>
          <td>${escapeHtml(r.migrated_at || '')}</td>
          <td>${r.member_id || ''}</td>
          <td><span style="color:${r.status === 'Success' ? '#16A34A' : '#DC2626'}">${escapeHtml(r.status)}</span></td>
          <td>${escapeHtml(r.notes || '')}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } else {
      content.innerHTML = '<p style="color:var(--text-light)">No migration logs found.</p>';
    }
  } catch (e) {
    document.getElementById('psgcMigrationLogsContent').innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(e.message)}</p>`;
  }
}

async function psgcShowAuditLogs() {
  const area = document.getElementById('psgcDetailArea');
  area.innerHTML = '<div class="card-body" style="padding:24px"><h3 style="margin:0 0 16px">Audit Logs</h3><div id="psgcAuditLogsContent"><div class="spinner"></div><p>Loading...</p></div></div>';
  try {
    const result = await window.api.getPsgcAuditLogs();
    const content = document.getElementById('psgcAuditLogsContent');
    if (result.success && result.data.length > 0) {
      content.innerHTML = `<table class="table table-striped">
        <thead><tr><th>Date</th><th>User</th><th>Action</th><th>Description</th><th>Records</th></tr></thead>
        <tbody>${result.data.map(r => `<tr>
          <td>${escapeHtml(r.created_at || '')}</td>
          <td>${escapeHtml(r.username || '')}</td>
          <td><span class="badge badge-info">${escapeHtml(r.action)}</span></td>
          <td>${escapeHtml(r.description || '')}</td>
          <td>${r.affected_records || 0}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } else {
      content.innerHTML = '<p style="color:var(--text-light)">No audit logs found.</p>';
    }
  } catch (e) {
    document.getElementById('psgcAuditLogsContent').innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(e.message)}</p>`;
  }
}

async function psgcShowDuplicates() {
  const area = document.getElementById('psgcDetailArea');
  area.innerHTML = '<div class="card-body" style="padding:24px"><h3 style="margin:0 0 16px">Duplicate Records</h3><div id="psgcDupsContent"><div class="spinner"></div><p>Checking...</p></div></div>';
  try {
    const result = await window.api.getPsgcDuplicateRecords();
    const content = document.getElementById('psgcDupsContent');
    if (result.success) {
      let html = '';
      const munDups = result.data.municipalityDuplicates || [];
      const brgyDups = result.data.barangayDuplicates || [];
      if (munDups.length === 0 && brgyDups.length === 0) {
        html = '<p style="color:var(--text-light)">No duplicate records found.</p>';
      } else {
        if (munDups.length > 0) {
          html += '<h4 style="margin:0 0 8px">Municipality Duplicates</h4><table class="table table-striped"><thead><tr><th>Name</th><th>Count</th></tr></thead><tbody>';
          munDups.forEach(d => { html += `<tr><td>${escapeHtml(d.name)}</td><td>${d.cnt}</td></tr>`; });
          html += '</tbody></table>';
        }
        if (brgyDups.length > 0) {
          html += '<h4 style="margin:12px 0 8px">Barangay Duplicates</h4><table class="table table-striped"><thead><tr><th>Barangay</th><th>Municipality</th><th>Count</th></tr></thead><tbody>';
          brgyDups.forEach(d => { html += `<tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.municipality || '')}</td><td>${d.cnt}</td></tr>`; });
          html += '</tbody></table>';
        }
      }
      content.innerHTML = html;
    } else {
      content.innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(result.error)}</p>`;
    }
  } catch (e) {
    document.getElementById('psgcDupsContent').innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(e.message)}</p>`;
  }
}

async function psgcBrowseData() {
  const area = document.getElementById('psgcDetailArea');
  area.innerHTML = `
    <div class="card-body" style="padding:24px">
      <h3 style="margin:0 0 16px">Browse PSGC Data</h3>
      <div style="margin-bottom:16px">
        <label style="display:block;margin-bottom:4px;font-weight:600">Province</label>
        <select id="psgcBrowseProvince" class="form-control" onchange="psgcBrowseLoadMunicipalities(this.value)">
          <option value="">Select Province</option>
        </select>
      </div>
      <div id="psgcBrowseContent" style="color:var(--text-light);font-size:14px">Select a province to view municipalities and barangays.</div>
    </div>`;
  try {
    const provResult = await window.api.getProvinces();
    if (provResult.success) {
      const sel = document.getElementById('psgcBrowseProvince');
      provResult.data.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
        sel.innerHTML += `<option value="${p.id}">${escapeHtml(p.name)} (${p.psgc_code || ''})</option>`;
      });
    }
  } catch (e) {
    document.getElementById('psgcBrowseContent').innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(e.message)}</p>`;
  }
}

async function psgcBrowseLoadMunicipalities(provinceId) {
  const content = document.getElementById('psgcBrowseContent');
  if (!provinceId) { content.innerHTML = '<p style="color:var(--text-light)">Select a province to view municipalities and barangays.</p>'; return; }
  content.innerHTML = '<div class="spinner"></div><p>Loading...</p>';
  try {
    const munResult = await window.api.getMunicipalities(provinceId);
    if (!munResult.success) { content.innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(munResult.error)}</p>`; return; }
    const sorted = munResult.data.sort((a, b) => a.name.localeCompare(b.name));
    if (sorted.length === 0) { content.innerHTML = '<p style="color:var(--text-light)">No municipalities found for this province.</p>'; return; }
    let html = '<h4 style="margin:0 0 8px">Municipalities / Cities</h4><table class="table table-striped"><thead><tr><th>PSGC Code</th><th>Name</th><th>Type</th><th>Barangays</th></tr></thead><tbody>';
    for (const mun of sorted) {
      const brgyResult = await window.api.getBarangays(mun.id);
      const brgyCount = brgyResult.success ? (brgyResult.data || []).length : 0;
      html += `<tr>
        <td style="font-family:monospace">${escapeHtml(mun.psgc_code || '')}</td>
        <td><strong>${escapeHtml(mun.name)}</strong></td>
        <td>${escapeHtml(mun.municipality_type || '')}</td>
        <td><a href="#" onclick="psgcBrowseShowBarangays(${mun.id},'${escapeHtml(mun.name)}');return false">${brgyCount} barangays</a></td>
      </tr>`;
    }
    html += '</tbody></table>';
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(e.message)}</p>`;
  }
}

async function psgcBrowseShowBarangays(municipalityId, municipalityName) {
  const content = document.getElementById('psgcBrowseContent');
  content.innerHTML = `<p><a href="#" onclick="psgcBrowseLoadMunicipalities(document.getElementById('psgcBrowseProvince').value);return false">&larr; Back to municipalities</a></p><div class="spinner"></div><p>Loading barangays...</p>`;
  try {
    const result = await window.api.getBarangays(municipalityId);
    if (!result.success) { content.innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(result.error)}</p>`; return; }
    const sorted = (result.data || []).sort((a, b) => a.name.localeCompare(b.name));
    let html = `<h4 style="margin:0 0 8px">Barangays of ${escapeHtml(municipalityName)}</h4>`;
    if (sorted.length === 0) {
      html += '<p style="color:var(--text-light)">No barangays found.</p>';
    } else {
      html += '<table class="table table-striped"><thead><tr><th>PSGC Code</th><th>Name</th></tr></thead><tbody>';
      sorted.forEach(b => {
        html += `<tr><td style="font-family:monospace">${escapeHtml(b.psgc_code || '')}</td><td>${escapeHtml(b.name)}</td></tr>`;
      });
      html += '</tbody></table>';
    }
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<p style="color:#DC2626">Error: ${escapeHtml(e.message)}</p>`;
  }
}