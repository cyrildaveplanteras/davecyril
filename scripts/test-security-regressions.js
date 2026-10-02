// Pure Node regression tests for the renderer-side security fixes. No
// database, no browser: utils.js and settings.js are evaluated in a VM with
// minimal stubs, and the rest are static assertions on the source.
//
// Run: node scripts/test-security-regressions.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// ---------------------------------------------------------------------------
// 1. utils.js: escapeHtml + csvCell
// ---------------------------------------------------------------------------
const utilsSrc = read('src/js/utils.js');
const sandbox = {
  window: {},
  document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {} } }) },
  sessionStorage: { getItem: () => null, setItem() {} }
};
vm.createContext(sandbox);
vm.runInContext(utilsSrc, sandbox);
const { escapeHtml, csvCell } = sandbox;

console.log('\n[escapeHtml]');
check('escapes script tags', escapeHtml('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;');
check('escapes quotes (attribute breakout)', escapeHtml('a" onmouseover="x') === 'a&quot; onmouseover=&quot;x');
check('escapes ampersand', escapeHtml('a&b') === 'a&amp;b');
check('keeps plain text', escapeHtml('Juan Dela Cruz') === 'Juan Dela Cruz');

console.log('\n[csvCell]');
check('neutralizes leading =', csvCell('=cmd|calc') === "'=cmd|calc");
check('neutralizes leading +', csvCell('+1234') === "'+1234");
check('neutralizes leading @', csvCell('@SUM(A1)') === "'@SUM(A1)");
check('neutralizes leading tab', csvCell('\tx') === "'\tx");
check('keeps negative numbers numeric', csvCell('-100.00') === '-100.00');
check('still neutralizes -formula', csvCell('-2+3') === "'-2+3");
check('quotes commas (RFC 4180)', csvCell('Dela Cruz, Juan') === '"Dela Cruz, Juan"');
check('doubles embedded quotes', csvCell('say "hi", ok') === '"say ""hi"", ok"');
check('null -> empty', csvCell(null) === '');
check('number passthrough', csvCell(350) === '350');

// ---------------------------------------------------------------------------
// 2. HTML sinks escape database values
// ---------------------------------------------------------------------------
console.log('\n[HTML sink fixes]');
function has(rel, needle, name) { check(name, read(rel).includes(needle)); }
function missing(rel, needle, name) { check(name, !read(rel).includes(needle)); }

has('src/js/members.js', "escapeHtml(member.municipality_name || '')", 'members: municipality_name escaped');
has('src/js/members.js', "escapeHtml(member.barangay_name || '')", 'members: barangay_name escaped');
has('src/js/members.js', 'escapeHtml(member.complete_address', 'members: complete_address escaped');
missing('src/js/member-list.js', "onchange=\"updateDeathBenefitDisplay('${m.registration_date", 'member-list: interpolated inline handler removed');
has('src/js/member-list.js', "addEventListener('change'", 'member-list: dcDate listener wired in JS');
has('src/js/coordinators.js', 'escapeHtml((c.Status', 'coordinators: list status class escaped');
has('src/js/coordinators.js', 'escapeHtml((coord.Status', 'coordinators: detail status class escaped');
has('src/js/coordinators.js', 'escapeHtml((t.Status', 'coordinators: transactions status class escaped');
has('src/js/reports.js', 'escapeHtml(data.logoDataUrl)', 'reports: logoDataUrl escaped');
missing('src/js/reports.js', '? `<img src="${data.logoDataUrl}"', 'reports: raw logo sink gone');
has('main.js', 'function withPdfCsp', 'main: PDF CSP helper present');
has('main.js', 'withPdfCsp(html)', 'main: PDF loader applies CSP');

// ---------------------------------------------------------------------------
// 3. CSV exports use the shared helper
// ---------------------------------------------------------------------------
console.log('\n[CSV fixes]');
has('src/js/utils.js', 'function csvCell', 'utils: shared csvCell exists');
has('src/js/member-list.js', '.map(csvCell).join', 'member-list: member export uses csvCell');
const reportsCsvUses = (read('src/js/reports.js').match(/\.map\(csvCell\)/g) || []).length;
check('reports: raw CSV sites map(csvCell)', reportsCsvUses >= 3, `found ${reportsCsvUses}`);

// ---------------------------------------------------------------------------
// 4. Single canonical SEC registration number
// ---------------------------------------------------------------------------
console.log('\n[organization identity]');
const CANON = '2025110227750-03';
const jsDir = path.join(ROOT, 'src/js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
check('utils.js defines ORG_SEC_REG_NO', new RegExp(`const ORG_SEC_REG_NO = '${CANON}'`).test(utilsSrc));
let divergent = [];
for (const f of jsFiles) {
  if (f === 'utils.js') continue;
  const bad = read(`src/js/${f}`).match(/2025\d{6,}(-03)?/g) || [];
  if (bad.length) divergent.push(`${f}: ${bad.join(', ')}`);
}
check('no divergent SEC literals', divergent.length === 0, divergent.join('; '));
let secLabels = 0;
for (const f of jsFiles) {
  read(`src/js/${f}`).split('\n').forEach(line => {
    if (/SEC (REG|Registration)/i.test(line) && /<div|<span/.test(line)) {
      secLabels++;
      check(`${f}: SEC label uses constant`, line.includes('${ORG_SEC_REG_NO}'), line.trim());
    }
  });
}
check('found the expected SEC label sites', secLabels >= 7, `found ${secLabels}`);

// ---------------------------------------------------------------------------
// 5. Every renderer api.X() call is actually exposed by preload.js
// ---------------------------------------------------------------------------
console.log('\n[preload API surface]');
function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some(x => p.endsWith(x))) out.push(p);
  }
  return out;
}
const preloadSrc = read('preload.js');
const apiMethods = new Set();
let am;
const apiDeclRe = /^\s{2}([A-Za-z_$][\w$]*)\s*:/gm;
while ((am = apiDeclRe.exec(preloadSrc)) !== null) apiMethods.add(am[1]);
const rendererText = walk(path.join(ROOT, 'src'), ['.js', '.html'])
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
const called = new Set();
let cm;
const apiCallRe = /\.api\.([A-Za-z_$][\w$]*)\s*\(/g;
while ((cm = apiCallRe.exec(rendererText)) !== null) called.add(cm[1]);
const missingMethods = [...called].filter(name => !apiMethods.has(name));
check('every api.X() call exists in preload.js', missingMethods.length === 0, missingMethods.join(', '));
check('renderer error logging is wired', apiMethods.has('logRendererError') && called.has('logRendererError'));

// ---------------------------------------------------------------------------
// 6. settings.js avatar state machine (cancel must not drop the saved photo)
// ---------------------------------------------------------------------------
console.log('\n[avatar state machine]');
function makeEl(init) {
  return Object.assign({
    src: '', value: '', textContent: '', disabled: false,
    style: { display: '', setProperty() {} },
    classList: { add() {}, remove() {} },
    querySelector() { return null; }, appendChild() {}, click() {}
  }, init || {});
}
const elements = {};
const settingsSrc = read('src/js/settings.js')
  + '\nglobalThis.__peek = () => ({ photo: userDrawerPhotoBase64, saved: userDrawerSavedPhoto });'
  + '\nglobalThis.__set = (p, s) => { userDrawerPhotoBase64 = p; userDrawerSavedPhoto = s; };';
const sbox = {
  console,
  document: { getElementById: (id) => (elements[id] || (elements[id] = makeEl())), addEventListener() {}, createElement: () => makeEl(), querySelector: () => null },
  window: {}, sessionStorage: { getItem: () => null, setItem() {} },
  showToast() {}, escapeHtml: (s) => String(s == null ? '' : s), setTimeout: (f) => f && f(), clearTimeout() {},
  getCurrentUser: () => ({ role: 'Admin', id: 1 })
};
vm.createContext(sbox);
vm.runInContext(settingsSrc, sbox);

const OLD = 'data:image/png;base64,OLD';
const NEW = 'data:image/png;base64,NEW';
sbox.__set(NEW, OLD);
sbox.cancelAvatarEdit();
check('cancel keeps the existing (committed) photo', sbox.__peek().photo === OLD, sbox.__peek());
sbox.__set(NEW, OLD);
sbox.document.getElementById('userAvatarEditorImg').src = NEW;
sbox.applyAvatarEdit();
check('apply promotes the pending photo', sbox.__peek().saved === NEW, sbox.__peek());
sbox.__set(OLD, OLD);
sbox.removeUserPhoto();
check('remove clears the photo', sbox.__peek().photo === null && sbox.__peek().saved === null, sbox.__peek());

console.log(`\n${failures === 0 ? '=== ALL PASS ===' : '=== ' + failures + ' FAILURE(S) ==='}`);
process.exit(failures ? 1 : 0);
