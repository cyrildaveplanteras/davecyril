let _printLogoDataUrl = null;

async function getPrintLogo() {
  if (_printLogoDataUrl) return _printLogoDataUrl;
  try {
    const result = await window.api.getLogoBase64();
    if (result.success && result.dataUrl) {
      _printLogoDataUrl = result.dataUrl;
      return _printLogoDataUrl;
    }
  } catch (e) {}
  return '';
}

function generateRemittanceSlipHTML(data) {
  const rows = (data.details || []).map((d, i) => {
    const afNo = d.AFNo || '';
    const name = d.MemberName || '';
    const sc = d.SalesCoordinator || '';
    const mf = parseFloat(d.MF) || 0;
    const msc = parseFloat(d.MSC) || 0;
    const hda = parseFloat(d.HDA) || 0;
    const total = parseFloat(d.Total) || 0;
    const com = parseFloat(d.COM) || 0;
    const net = parseFloat(d.NetDeposit) || 0;
    const rowNum = i + 1;
    const honoraryBadge = d.membershipStatus === 'Honorary'
      ? ` <span style="display:inline-block;background:#FEF3C7;border:1px solid #FDE68A;border-radius:3px;padding:0 5px;font-size:9px;font-weight:600;color:#D97706;vertical-align:middle">${parseInt(d.honoraryYears) || 0}/10</span>`
      : '';
    return `<tr>
      <td style="text-align:center">${escapeHtml(afNo)}</td>
      <td style="padding-left:8px">${escapeHtml(name)}${honoraryBadge}</td>
      <td style="padding-left:8px">${escapeHtml(sc)}</td>
      <td class="amt">${mf.toFixed(2)}</td>
      <td class="amt">${msc.toFixed(2)}</td>
      <td class="amt">${hda.toFixed(2)}</td>
      <td class="amt">${total.toFixed(2)}</td>
      <td class="amt">${com.toFixed(2)}</td>
      <td class="amt">${net.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const totals = (data.details || []).reduce((acc, d) => ({
    mf: acc.mf + (parseFloat(d.MF) || 0),
    msc: acc.msc + (parseFloat(d.MSC) || 0),
    hda: acc.hda + (parseFloat(d.HDA) || 0),
    total: acc.total + (parseFloat(d.Total) || 0),
    com: acc.com + (parseFloat(d.COM) || 0),
    net: acc.net + (parseFloat(d.NetDeposit) || 0)
  }), { mf: 0, msc: 0, hda: 0, total: 0, com: 0, net: 0 });

  const dateDeposit = data.DateDeposit ? formatDate(data.DateDeposit) : '';
  const totalDeposit = data.TotalDeposit || totals.net;
  const netDeposit = totals.net;
  const grandTotal = netDeposit;

  const logoHtml = _printLogoDataUrl
    ? `<img src="${_printLogoDataUrl}" alt="GOLDENHOPE Logo" style="height:38px;width:auto;display:block">`
    : `<div style="width:38px;height:38px;background:#1E40AF;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px">GH</div>`;

  const totalMf = totals.mf.toFixed(2);
  const totalMsc = totals.msc.toFixed(2);
  const totalHda = totals.hda.toFixed(2);
  const totalAmt = totals.total.toFixed(2);
  const totalCom = totals.com.toFixed(2);
  const totalNet = totals.net.toFixed(2);
  const totalDep = (parseFloat(totalDeposit) || 0).toFixed(2);
  const grandTot = (parseFloat(grandTotal) || 0).toFixed(2);

  const totalRows = Math.max((data.details || []).length, 20);
  const blankRows = totalRows - (data.details || []).length;
  let blankHtml = '';
  for (let i = 0; i < blankRows; i++) {
    blankHtml += `<tr><td style="text-align:center">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td class="amt">&nbsp;</td><td class="amt">&nbsp;</td><td class="amt">&nbsp;</td><td class="amt">&nbsp;</td><td class="amt">&nbsp;</td><td class="amt">&nbsp;</td></tr>`;
  }
  const totalsRowHtml = `<tr class="totals-row">
    <td colspan="3" style="text-align:right;font-weight:700;padding-right:8px;border:1px solid #000;background:#F0F3F5">GRAND TOTAL</td>
    <td class="amt" style="font-weight:700;border:1px solid #000;background:#F0F3F5">${totalMf}</td>
    <td class="amt" style="font-weight:700;border:1px solid #000;background:#F0F3F5">${totalMsc}</td>
    <td class="amt" style="font-weight:700;border:1px solid #000;background:#F0F3F5">${totalHda}</td>
    <td class="amt" style="font-weight:700;border:1px solid #000;background:#F0F3F5">${totalAmt}</td>
    <td class="amt" style="font-weight:700;border:1px solid #000;background:#F0F3F5">${totalCom}</td>
    <td class="amt" style="font-weight:700;border:1px solid #000;background:#F0F3F5">${totalNet}</td>
  </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Damayan Remittance Slip</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm 8mm 8mm 8mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Arial', sans-serif;
    font-size: 8px;
    color: #000;
    background: #fff;
    line-height: 1.2;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .slip {
    width: 100%;
    border: 1.5px solid #000;
    padding: 4px 8px 4px;
  }
  .header {
    text-align: center;
    padding-bottom: 4px;
    margin-bottom: 3px;
  }
  .header-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .org-name {
    font-size: 10px;
    font-weight: 800;
    color: #1E3A5F;
    letter-spacing: 0.2px;
    text-transform: uppercase;
    line-height: 1.15;
  }
  .org-addr {
    font-size: 7px;
    color: #000;
    font-style: italic;
  }
  .org-sec {
    font-size: 6.5px;
    color: #444;
  }
  .title-row {
    text-align: center;
    margin: 6px 0 10px;
    position: relative;
    padding: 0 150px;
  }
  .title-row h2 {
    font-size: 13px;
    font-weight: 800;
    color: #1E3A5F;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .title-right {
    position: absolute;
    right: 0;
    top: 0;
    text-align: right;
  }
  .tr-field {
    margin-bottom: 2px;
  }
  .tr-label {
    font-size: 7px;
    font-weight: 700;
    color: #222;
    text-transform: uppercase;
  }
  .tr-value {
    font-size: 8px;
    font-weight: 600;
    color: #000;
    display: inline-block;
    min-width: 100px;
    border-bottom: 1px solid #000;
    padding-bottom: 1px;
    text-align: right;
  }
  .tr-label {
    font-size: 7px;
    font-weight: 700;
    color: #222;
    text-transform: uppercase;
  }
  .tr-value {
    font-size: 8px;
    font-weight: 600;
    color: #000;
    display: inline-block;
    min-width: 100px;
    border-bottom: 1px solid #000;
    padding-bottom: 1px;
    text-align: right;
  }
  .tr-field {
    margin-bottom: 2px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5px;
  }
  thead th {
    font-weight: 700;
    font-size: 7px;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    padding: 3px 3px;
    border: 1px solid #000;
    text-align: center;
    vertical-align: middle;
    background: #F0F3F5;
  }
  tbody td {
    padding: 2px 3px;
    border: 1px solid #000;
    color: #000;
    font-size: 7.5px;
    height: 15px;
    vertical-align: middle;
  }
  td.amt {
    text-align: right;
    padding-right: 5px;
    font-variant-numeric: tabular-nums;
  }
  .totals-row td {
    font-weight: 700;
    border-top: 2px solid #000 !important;
    background: #F0F3F5;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    padding-top: 4px;
    align-items: flex-start;
  }
  .sig {
    text-align: left;
    flex: 1;
  }
  .sig-name {
    font-size: 9px;
    font-weight: 600;
    color: #000;
    min-height: 18px;
  }
  .sig-line {
    width: 160px;
    border-bottom: 1px solid #000;
    margin: 2px 0 2px;
    height: 1px;
  }
  .sig-lbl {
    font-size: 7.5px;
    font-weight: 700;
    color: #222;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .print-ts {
    text-align: right;
    font-size: 6px;
    color: #888;
    margin-top: 2px;
  }
  @media print {
    body { margin: 0; padding: 0; }
    thead th { background: #F0F3F5 !important; -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="slip">

<div class="header">
  <div class="header-row">
    ${logoHtml}
    <div>
      <div class="org-name">GOLDENHOPE DAMAYAN ASSOCIATION AND SUPPORT INC.</div>
      <div class="org-addr">${escapeHtml(data.BranchAddress || 'Poblacion, Manukan, Zamboanga del Norte')}</div>
      <div class="org-sec">SEC REG. NO. 2025110227750-03</div>
    </div>
  </div>
</div>

<div class="title-row">
  <h2>DAMAYAN REMITTANCE SLIP</h2>
  <div style="font-size:7px;font-weight:600;color:#444;margin-top:0;margin-bottom:2px">Remittance No: ${escapeHtml(data.RemittanceNo || '')}</div>
  <div class="title-right">
    <div class="tr-field"><span class="tr-label">Date Deposit:</span> <span class="tr-value">${escapeHtml(dateDeposit)}</span></div>
    <div class="tr-field"><span class="tr-label">Total Deposit:</span> <span class="tr-value">&#8369;${totalDep}</span></div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:9%">AF No.</th>
      <th style="width:24%">Member's Name</th>
      <th style="width:16%">Sales Coordinator</th>
      <th style="width:9%">MF</th>
      <th style="width:9%">MSC</th>
      <th style="width:9%">HDA</th>
      <th style="width:10%">Total</th>
      <th style="width:9%">COM</th>
      <th style="width:14%">Net Deposit</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    ${blankHtml}
    ${totalsRowHtml}
  </tbody>
</table>

<div class="footer">
  <div class="sig">
    <div class="sig-name">${data.PreparedBy ? escapeHtml(data.PreparedBy) : '___________________________'}</div>
    <div class="sig-line"></div>
    <div class="sig-lbl">PREPARED BY:</div>
  </div>
  <div class="sig">
    <div class="sig-name">${data.VerifiedBy ? escapeHtml(data.VerifiedBy) : '___________________________'}</div>
    <div class="sig-line"></div>
    <div class="sig-lbl">VERIFIED BY:</div>
  </div>
</div>

<div class="print-ts">Printed: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>

</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()};};<\/script>
</body>
</html>`;
}

function buildPrintRemittanceWindow(html) {
  const printWin = window.open('', '_blank', 'width=1200,height=800');
  if (!printWin) {
    showToast('Please allow pop-ups for this application', 'error');
    return null;
  }
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  return printWin;
}

async function printRemittanceSlipFromData(data) {
  await getPrintLogo();
  const html = generateRemittanceSlipHTML(data);
  buildPrintRemittanceWindow(html);
}

async function printCurrentRemittanceSlip() {
  const user = getCurrentUser();
  if (!remittanceDetails || remittanceDetails.length === 0) {
    showToast('No details to print', 'warning');
    return;
  }

  const date = document.getElementById('rDate')?.value || '';
  const branchSelect = document.getElementById('rBranch');
  const branchAddress = branchSelect?.options[branchSelect.selectedIndex]?.dataset?.address || '';
  const prepSelect = document.getElementById('rPreparedBy');
  const verSelect = document.getElementById('rVerifiedBy');
  const preparedBy = prepSelect?.options[prepSelect.selectedIndex]?.text || '';
  const verifiedBy = verSelect?.options[verSelect.selectedIndex]?.text || '';

  const data = {
    RemittanceNo: document.getElementById('rNo')?.value || '',
    DateDeposit: date,
    BranchAddress: branchAddress,
    PreparedBy: preparedBy,
    VerifiedBy: verifiedBy,
    TotalDeposit: remittanceDetails.reduce((acc, d) => acc + (parseFloat(d.NetDeposit) || 0), 0),
    details: remittanceDetails.map(d => ({
      AFNo: d.AFNo,
      MemberName: d.MemberName,
      SalesCoordinator: d.SalesCoordinator,
      MF: d.MF,
      MSC: d.MSC,
      HDA: d.HDA || 0,
      Total: d.Total,
      COM: d.COM,
      NetDeposit: d.NetDeposit,
      membershipStatus: d.membershipStatus || '',
      honoraryYears: d.honoraryYears || 0
    }))
  };

  await printRemittanceSlipFromData(data);
}

async function printRemittanceHistoryItem(id) {
  showLoading();
  try {
    const result = await window.api.getRemittance(id);
    if (!result.success) {
      showToast(result.error, 'error');
      return;
    }
    const data = result.data;
    await printRemittanceSlipFromData(data);
  } catch (err) {
    showToast('Failed to load remittance data', 'error');
  } finally {
    hideLoading();
  }
}


