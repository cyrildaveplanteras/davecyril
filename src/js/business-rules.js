/* =====================================================================
 * CENTRAL BUSINESS RULES — single source of truth
 *
 * This module is the ONLY place payment amounts, thresholds, commission
 * values and renewal rules live. Both the main process (Node) and the
 * renderer (browser <script>) load this same file, so a rule can never
 * drift between server and client again.
 *
 *   - Node (main.js):  const RULES = require('./src/js/business-rules');
 *   - Browser (renderer):  loaded via <script src="../js/business-rules.js">
 *                          exposes window.BusinessRules
 *
 * Approved business rules (GoldenHope Damayan):
 *   - Membership Fee (MF): ₱250 default, ₱350 optional tier
 *   - MSC minimum deposit: ₱300
 *   - HDA amount: ₱200
 *   - Required MSC for "ready for renewal": ₱100
 *   - Overall payment minimum for Regular members: ₱650
 *   - Sales Coordinator commission: ₱120 flat per qualifying MF (NO ₱100 tier),
 *     including the remittance made upon member registration
 *   - MSC coordinator commission: 5% from the 2nd MSC deposit onward (0 on 1st)
 *   - Honorary member: converts to Regular after 10 annual MF payments
 *   - Initial MF within 90 days of registration does NOT extend the term
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof window !== 'undefined') {
    window.BusinessRules = factory();
  } else {
    root.BusinessRules = factory();
  }
})(this, function () {
  'use strict';

  var RULES = {
    // Payment amounts (₱)
    MF_DEFAULT: 250,
    MF_ALT: 350,
    MF_OPTIONS: [250, 350],
    MSC_MINIMUM: 300,
    HDA_AMOUNT: 200,
    REQUIRED_MSC: 100,
    OVERALL_PAYMENT_MIN: 650,

    // Commission (₱) — centrally locked; there is NO ₱100 tier.
    SALES_COORDINATOR_COMMISSION: 120,
    MF_THRESHOLD: 350,      // "full" threshold (MF = 350)
    ALT_THRESHOLD: 250,     // qualifying threshold (MF >= 250 earns commission)
    MSC_COMMISSION_RATE: 0.05,
    MSC_COMMISSION_START_DEPOSIT: 2, // 2nd deposit onward

    // Membership lifecycle
    HONORARY_TO_REGULAR_YEARS: 10,
    INITIAL_MF_GRACE_DAYS: 90,
    OVERDUE_REMITTANCE_DAYS: 15,

    // Payment milestones (₱)
    PAYMENT_MILESTONES: [10000, 20000, 50000, 100000],

    // Death benefit
    DEATH_BENEFIT_HIGH_THRESHOLD: 50000,
    DEATH_BENEFIT_LOW_AMOUNT: 20000,
    DEATH_BENEFIT_HIGH_AMOUNT: 50000,

    // Sync polling interval (ms) for cross-device change detection
    SYNC_POLL_INTERVAL_MS: 5000
  };

  // Normalized commission config with defaults — mirrors the DB commission_config row.
  function normalizeConfig(cfg) {
    var c = cfg || {};
    return {
      MFThreshold: parseFloat(c.MFThreshold) || RULES.MF_THRESHOLD,
      COMAmount: parseFloat(c.COMAmount) || RULES.SALES_COORDINATOR_COMMISSION,
      COMAmountAlt: parseFloat(c.COMAmountAlt) || RULES.SALES_COORDINATOR_COMMISSION,
      AltThreshold: parseFloat(c.AltThreshold) || RULES.ALT_THRESHOLD
    };
  }

  // THE commission calculation. Single function used by both server and client.
  //   mf, msc: numeric amounts
  //   paymentPurpose: 'mf' | 'msc' | 'both' | 'hda' | undefined
  //   cfg: optional {MFThreshold, COMAmount, COMAmountAlt, AltThreshold}
  // Returns ₱ commission for the detail row.
  function calcCommission(mf, msc, paymentPurpose, cfg) {
    var c = normalizeConfig(cfg);
    var mfNum = parseFloat(mf) || 0;
    // Amount-based and authoritative: any qualifying MF payment (>= AltThreshold)
    // earns the flat ₱120 Sales Coordinator commission — at registration, renewal
    // or any qualifying remittance alike. The purpose label is ignored for the
    // amount, so a deposit carrying a qualifying MF can never be mislabeled to
    // suppress commission. Pure MSC-only deposits (MF = 0) earn no commission.
    if (mfNum >= c.AltThreshold) return c.COMAmountAlt;
    return 0;
  }

  // MSC coordinator commission (5% from 2nd deposit onward; 0 on 1st).
  function calcMscCommission(msc, priorDepositCount) {
    var mscNum = parseFloat(msc) || 0;
    var prior = parseInt(priorDepositCount, 10) || 0;
    if (prior < (RULES.MSC_COMMISSION_START_DEPOSIT - 1)) return 0;
    return Math.round(mscNum * RULES.MSC_COMMISSION_RATE * 100) / 100;
  }

  // True when a completed MF payment qualifies for renewal (MF 250 or 350).
  function isQualifyingMF(mf) {
    var mfNum = parseFloat(mf) || 0;
    return RULES.MF_OPTIONS.indexOf(mfNum) !== -1;
  }

  // Eligible for death benefit label given total paid.
  function deathBenefitLabel(totalPaid) {
    var total = parseFloat(totalPaid) || 0;
    if (total >= RULES.DEATH_BENEFIT_HIGH_THRESHOLD) return RULES.DEATH_BENEFIT_HIGH_AMOUNT;
    return RULES.DEATH_BENEFIT_LOW_AMOUNT;
  }

  return {
    RULES: RULES,
    normalizeConfig: normalizeConfig,
    calcCommission: calcCommission,
    calcMscCommission: calcMscCommission,
    isQualifyingMF: isQualifyingMF,
    deathBenefitLabel: deathBenefitLabel
  };
});