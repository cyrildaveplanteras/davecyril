const assert = require('assert');
const BusinessRules = require('../src/js/business-rules');

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '  →  ' + e.message); }
}

console.log('=== business-rules unit tests ===');

t('commission: MF=250 qualifies → 120', () => {
  assert.strictEqual(BusinessRules.calcCommission(250, 0, 'mf'), 120);
});
t('commission: MF=350 qualifies → 120', () => {
  assert.strictEqual(BusinessRules.calcCommission(350, 0, 'mf'), 120);
});
t('commission: MF=250 with MSC → 120', () => {
  assert.strictEqual(BusinessRules.calcCommission(250, 300, 'both'), 120);
});
t('commission: MF < threshold → 0', () => {
  assert.strictEqual(BusinessRules.calcCommission(100, 0, 'mf'), 0);
});
t('commission: mf present with msc purpose label → 120 (registration)', () => {
  assert.strictEqual(BusinessRules.calcCommission(250, 300, 'msc'), 120);
});
t('commission: registration remittance (mf=250, msc=300, both) → 120', () => {
  assert.strictEqual(BusinessRules.calcCommission(250, 300, 'both'), 120);
});
t('commission: registration remittance (mf=350, msc=300, both) → 120', () => {
  assert.strictEqual(BusinessRules.calcCommission(350, 300, 'both'), 120);
});
t('commission: msc-only deposit (mf=0) → 0 regardless of purpose label', () => {
  assert.strictEqual(BusinessRules.calcCommission(0, 300, 'msc'), 0);
  assert.strictEqual(BusinessRules.calcCommission(0, 300, 'both'), 0);
  assert.strictEqual(BusinessRules.calcCommission(0, 300, undefined), 0);
});
t('commission: no args → 0', () => {
  assert.strictEqual(BusinessRules.calcCommission(0, 0, undefined), 0);
});
t('commission: never returns 100', () => {
  for (const mf of [100, 150, 200, 249, 250, 300, 350, 500]) {
    const v = BusinessRules.calcCommission(mf, 0, 'mf');
    assert.notStrictEqual(v, 100, `MF=${mf} returned 100`);
  }
});
t('MSC commission: 1st deposit → 0', () => {
  assert.strictEqual(BusinessRules.calcMscCommission(300, 0), 0);
});
t('MSC commission: 2nd deposit → 5%', () => {
  assert.strictEqual(BusinessRules.calcMscCommission(300, 1), 15);
});
t('MSC commission: 3rd deposit → 5%', () => {
  assert.strictEqual(BusinessRules.calcMscCommission(1000, 2), 50);
});
t('isQualifyingMF: 250 & 350 qualify', () => {
  assert.ok(BusinessRules.isQualifyingMF(250));
  assert.ok(BusinessRules.isQualifyingMF(350));
  assert.ok(!BusinessRules.isQualifyingMF(200));
  assert.ok(!BusinessRules.isQualifyingMF(300));
});
t('deathBenefitLabel: below 50k → 20000', () => {
  assert.strictEqual(BusinessRules.deathBenefitLabel(49999), 20000);
});
t('deathBenefitLabel: at/above 50k → 50000', () => {
  assert.strictEqual(BusinessRules.deathBenefitLabel(50000), 50000);
});
t('normalizeConfig defaults', () => {
  const c = BusinessRules.normalizeConfig(null);
  assert.strictEqual(c.AltThreshold, 250);
  assert.strictEqual(c.COMAmount, 120);
  assert.strictEqual(c.COMAmountAlt, 120);
  assert.strictEqual(c.MFThreshold, 350);
});
t('normalizeConfig keeps explicit values', () => {
  const c = BusinessRules.normalizeConfig({ AltThreshold: '250', COMAmount: '120', COMAmountAlt: '120', MFThreshold: '350' });
  assert.strictEqual(c.AltThreshold, 250);
  assert.strictEqual(c.COMAmount, 120);
});
t('constants are centralized', () => {
  assert.strictEqual(BusinessRules.RULES.SALES_COORDINATOR_COMMISSION, 120);
  assert.strictEqual(BusinessRules.RULES.MSC_MINIMUM, 300);
  assert.strictEqual(BusinessRules.RULES.MF_ALT, 350);
  assert.strictEqual(BusinessRules.RULES.MF_DEFAULT, 250);
  assert.strictEqual(BusinessRules.RULES.HDA_AMOUNT, 200);
  assert.strictEqual(BusinessRules.RULES.REQUIRED_MSC, 100);
  assert.strictEqual(BusinessRules.RULES.OVERALL_PAYMENT_MIN, 650);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);