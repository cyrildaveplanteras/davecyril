# GoldenHope Member Management System — Complete Business Logic Audit

**Date:** 2026-08-05
**Mode:** Phase 1 — Read-Only Audit. **No code, database, or config changes were made.**
**Scope:** Electron app (`main.js`, `preload.js`, `src/js/*`, `src/pages/*`, `scripts/*`) + live MySQL database `goldenhope_db` (31 tables, 273 columns, 42 PK/UNIQUE, 15 FKs, 0 triggers, 0 stored routines, 0 views).

> **Update 2026-08-13 (Phase 2 — Implementation).** Commission is now **strictly ₱120** (no ₱100 tier) end-to-end. Business rules were centralized into `src/js/business-rules.js` (consumed by `main.js` AND every renderer script; exposed via `business:getRules`). Cross-device sync was added via a `data_change_log` table + in-transaction event writes + a poller in each app instance (`sync:data-changed` → frontend revalidates the current page). `broadcastDataChanged()` replaced the old single-window `members:data-changed` send. Reconcile tooling lives in `scripts/reconcile.js` (idempotent; `--apply` to commit) and tests in `scripts/test-business-rules.js` / `scripts/test-db-consistency.js`. Historical repair already applied: 208 phantom `MF=250` MSC-only rows were zeroed (matching `fix-af*.js` precedent), `commission_config` deduped from 58 → 1 row, and all remittance `TotalDeposit` values verified equal `SUM(NetDeposit)` (0 mismatches). Released as **v1.3.0**.

> **Update 2026-08-14 (Phase 2.1 — Registration Remittance Commission).** Per directive: **the remittance made upon member registration also earns the flat ₱120 Sales Coordinator commission** — the same amount-based rule as renewals; there is no ₱100 tier anywhere, and the backend is authoritative (it recomputes commission from amounts and rejects any attempt to store ₱100/₱140). Implementation: `src/js/business-rules.js` `calcCommission` is now **amount-based** — a qualifying MF (≥ 250) earns ₱120 regardless of the purpose label; only genuine MSC-only deposits (MF = 0) earn 0. `autoAddMemberToSlip` (`src/js/remittance.js`) now uses purpose `'both'` when the member has a qualifying membership fee, so a newly registered member's first slip earns ₱120 instead of being forced to `'msc'` (which returned 0). Historical repair applied via `scripts/repair-registration-commission.js` (`--apply`): **209 first-deposit registration remittance rows** (Honorary members with membership fee ≥ 250) were restored — MF = `membership_fee`, COM = ₱120, Total/NetDeposit recomputed, parent `TotalDeposit` updated (3 remittances); 67 genuine MSC-only later deposits were left untouched. `commission_config` was also deduped to the single canonical ₱120 row (a stale ₱100 duplicate created by legacy code was deleted; the startup migration and `reconcile.js` now keep only the canonical row). Reconcile classification updated so qualifying rows always earn 120 and are never MF-zeroed. Tests extended (business-rules 19/19, db-consistency 10/10 pass). Released as **v1.4.0**.

---

## 0. Architecture Overview

| Item | Value |
|---|---|
| Stack | Electron (main process = Node + MySQL via `mysql2/promise` pool), renderer = vanilla JS/HTML/CSS |
| Database | `goldenhope_db` (utf8mb4), MySQL/MariaDB via XAMPP auto-start (`auto-xampp.js`) |
| IPC model | `preload.js` exposes ~95 `window.api.*` channels → `ipcMain.handle` in `main.js`; server-side `sessions` Map keyed by `webContents.id`; `authGuard(event, roles?)` enforces auth/roles on handlers |
| Roles | `['Admin', 'Encoder', 'Branch Manager', 'Branch Staff']` (main.js:3763). Live DB uses only Admin(1) + Encoder(1) |
| Frontend session | `sessionStorage.currentUser` (display/gating only; server is authoritative) |
| Timezone | Pool `+08:00` (PH); renderer formats Asia/Manila |
| Data volume | members 729, remittances 23, remittance_details 735, commission_transactions 736, damayan_deductions 1294, notifications 1616, membership_audit_log 716 |

---

## 1. Authentication

| # | Feature | File | Function | Business rule | Status | Risks | Recommended fix |
|---|---|---|---|---|---|---|---|
| 1.1 | Login | main.js | `auth:login` (1384–1454) | 10 attempts/min/session; requires `IsActive=1 AND IsLocked=0`; generic error; bcrypt compare; `LastLogin` update; server session per webContents; `mustChangePassword` flag | Pass | none | — |
| 1.2 | Login lockout | main.js | `isLoginLocked`/`recordLoginFailure` (1251–1287) | 5 failed attempts / 10-min window → 5-min lock (`login_attempts`) | **Failed** | `DATE_ADD(NOW(), INTERVAL ? MILLISECOND)` (line 1282) — `MILLISECOND` is NOT a valid MySQL interval unit → upsert throws, is swallowed → **locked_until never set; brute-force lockout silently fails open** | Use `SECOND` (`LOCKOUT_MS/1000`) or `MICROSECOND`; verify against live MySQL |
| 1.3 | IPC rate limit | main.js | `checkIpcRateLimit` (1302–1334) | Per-session in-memory throttle; only `auth:login` uses it (10/min) | Warning | Map never pruned (memory growth); only per-renderer | Prune entries; `rateLimited()` wrapper (1337–1350) is dead code |
| 1.4 | Logout | main.js | `auth:logout` (1456–1459) | Deletes server session | Pass | no audit entry | optional Logout ActivityLog |
| 1.5 | Session check | main.js | `auth:me` (1461–1465) | Returns session identity | Pass | **`auth:me` never called by any renderer** — after main-process restart sessions Map is empty but UI still shows logged-in | Call `auth:me` on boot |
| 1.6 | Password policy | main.js | `validatePassword` (1374–1382) | 8–128 chars, upper+lower+digit | Pass | none | — |
| 1.7 | Change password | main.js | `settings:changePassword` (3901–3929) | Admin/BM may change anyone; others self; current password required unless `MustChangePassword=1` | Pass | none | — |
| 1.8 | Admin reset | main.js | `settings:resetPassword` (3954–3972) | Admin-only; generates 8-hex temp password (≈32-bit entropy, weak), forces change | Warning | weak entropy; plaintext over IPC | 16+ char/base64; out-of-band |
| 1.9 | Remember me | login.html / main.js | checkbox (no handler) | Checkbox exists with **no listener** | **Failed** | dead UI; session always `sessionStorage` | implement or remove |
| 1.10 | Must-change enforcement | app.js | force-password modal (104–162) | Requires new password on first login | Warning | modal dismissible; backend does not block other IPC while flag set | server-side block until changed |

---

## 2. User Roles & Permissions

**Role matrix (backend `authGuard`):**
- **Admin-only:** `psgc:import`, `settings:saveUser/toggleUser/deleteUser/resetPassword/backup/restore`, `lock:set/cancel`, `commission:saveConfig`, `branches:save/delete`, `personnel:save/delete`, `update:install`
- **Admin+Branch Manager:** `members:delete`, `remittances:delete`, `deduction:bulk/individual`, `hdaDeduction:bulk`, `settings:users`
- **Any authenticated:** all other CRUD/read (members create/edit, remittances save, coordinators save/delete, notifications, exports, settings:set, activityLogs, reports, SOA)
- **No guard (unauthenticated):** `auth:login/logout/me`, `address:*`, `psgc:getLogs/getDuplicateRecords/refreshBrgyLists/getAuditLogs`, `members:nextAfNo`, `remittances:isPending`, `coordinators:active`, `deathcases:list`, `deduction:preview`, `commission:getConfig`, `lock:check`, `branches:list/active`, `personnel:list/listByBranch`, `export:getLogoBase64`, `app:getVersion`

**Frontend `rolePages` (app.js 22–39):** Admin=all 14 pages; Branch Manager=all but psgc-admin; Branch Staff=dashboard/members/remittance/reports/soa/notifications; Encoder=same + settings.

| # | Finding | File | Status | Recommended fix |
|---|---|---|---|---|
| 2.1 | **BM vs backend mismatch:** BM sees Users tab, lock buttons, remittance delete — but backend rejects (Admin-only) | settings.js 25–34, 333–373; app.js 262/284; member-list.js 721 | **Failed** | Single-source permissions object shared UI↔IPC; align frontend role sets |
| 2.2 | `navigateTo()` has no role guard — page render bypass via console | app.js 322–361 | **Failed** | check `rolePages[user.role]` inside navigateTo |
| 2.3 | `coordinators:delete` allows any authenticated user to delete | main.js 2856–2870 | Warning | restrict Admin/BM; block if referenced |
| 2.4 | `settings:set` allows any role to overwrite settings; `settings:activityLogs` lets any role read full audit | main.js 3700, 3974 | Warning | restrict keys / Admin-only |
| 2.5 | Reports & SOA have **no role restriction** (any user can export financial/death data) | reports.js, soa.js | Warning | add role checks |
| 2.6 | Encoder granted `settings` page incl. Activity Logs & Backup UI (backend blocks backup) | app.js 22–39 | Warning | restrict to Security tab |

---

## 3. Member Registration (members.js, main.js `members:save`)

| # | Feature | Rule | Status | Recommended fix |
|---|---|---|---|---|
| 3.1 | AF generation | `MAX(af_no)+1` padded 5 (main.js 2022–2029); frontend fallback `'00001'` | Warning | non-atomic (race), fallback collision risk; generate atomically in INSERT; treat AF read-only |
| 3.2 | AF uniqueness | DB `UNIQUE` on `members.af_no` (live DB) + backend pre-check | Pass | also add duplicate-name warning (name+birthdate) |
| 3.3 | Required fields | Client-side only: FullName, BirthDate, Municipality, Barangay (members.js 1262–1273). **Backend has NO required-field validation** | Warning | move to backend authoritative |
| 3.4 | Defaults | Status Regular, Fee 250, MSC 300, reg=today, renewal=reg+1y, member_status Active, honorary_start_date for Honorary; ZDN/Region IX hardcoded default | Pass | make default region configurable |
| 3.5 | **New-Honorary mismatch** | New Honorary UI shows 1/10 progress but DB stores 0/10 (members.js 347–350 vs main.js 1885) | **Failed** | render from persisted value |
| 3.6 | **House-number data loss** | `getMemberFormData` never returns `HouseNo`; edit UPDATE writes `house_no=''` → silently wipes stored house number (members.js 414–459, main.js 1846) | **Failed** | backfill HouseNo / add input |
| 3.7 | Payment minimums | INSERT clamps MSC≥300 & Overall≥650 for Regular (silent clamp); UPDATE path **no clamp** → create vs edit inconsistent; displayed Overall(550) ≠ stored(650) | Warning | shared validation; clamp display |
| 3.8 | Renewal on edit | reg-date change resets renewal=reg+1y (side effect, no warning) | Warning | confirm before shifting anniversary |
| 3.9 | Workflow | save → `addPendingRemittance` → success modal (Print/Remittance). If pending-add throws, user sees "Failed to save" though member committed | Warning | non-atomic; soft-warn |
| 3.10 | Edit permission | any authenticated user can create/edit (no role restriction) | Warning | restrict to defined roles |

---

## 4. Renewals

| # | Feature | File | Rule | Status | Recommended fix |
|---|---|---|---|---|---|
| 4.1 | Initial renewal | main.js 1882 | reg + 1 year | Pass | — |
| 4.2 | Qualifying trigger | main.js 2455–2461 | Completed remittance with MF ∈ {250,350} → `handleMemberRenewal` once/member/save | Pass | — |
| 4.3 | Extension rule | main.js 5122–5151 | NULL/overdue → today+1y; on-time → preserves anniversary (+1y); sets last_renewed=CURDATE, Active, renewal_success | Pass | document "reset on overdue" |
| 4.4 | Initial MF guard | main.js 5083–5093 | First MF within 90 days of registration does NOT extend term | Pass | make window configurable |
| 4.5 | Due bands | main.js 4844–4928 | 30–16d upcoming_30; 15–8d; 7–1d; due_today; −1..−15 grace (stays Active); **<−15 → member_status='Inactive'** | Pass | runs only on check (startup+6h), not DB scheduler |
| 4.6 | Honorary→Regular | main.js 5095–5120 | +1 per annual MF; at ≥10 auto-convert + audit + upgrade notification | Pass | document; audit trail |
| 4.7 | Manual status switch | main.js 1808–1818 | Honorary↔Regular resets progress; no confirmation | Warning | confirm + reason in audit |
| 4.8 | AF retention | members.js 1844 | AF editable on edit; backend syncs `remittance_details.AFNo` only | Warning | make read-only except Admin; centralize propagation |
| 4.9 | Honorary auto-correct | main.js 488–507 | Startup recomputes years = COUNT(MF 250/350 completed) for Active Honorary | Pass | authoritative |

---

## 5. Remittance (remittance.js + main.js `remittances:save`)

| # | Feature | Rule | Status | Recommended fix |
|---|---|---|---|---|
| 5.1 | COM calc | `calcCOM`/`calcComServer`: **amount-based** — MF≥250 → **₱120** (registration remittance included), MSC-only (MF=0) → 0; no ₱100/₱140 tier | Pass | **centralized in `src/js/business-rules.js`; backend authoritative (2026-08-14)** |
| 5.2 | Row totals | Total=MF+MSC+HDA; NetDeposit=Total−COM; TotalDeposit=Σ Net (server recomputes, ignores renderer) | Pass | — |
| 5.3 | Payment types | msc: MSC≥300; mf: MF≥250 (default 350); both; hda: HDA=200 fixed | **Fixed** | amounts now sourced from `business-rules.js` |
| 5.4 | MSC commission | 5% of MSC from 2nd MSC deposit onward; 0 on 1st; only Completed | Pass | **centralized `calcMscCommission`** |
| 5.5 | Draft flow | `getCurrentDraft`+`loadExistingDraftIntoForm` **never called** — all saves are `Completed` | Warning | wire or remove dead code |
| 5.6 | Auto-add row | MSC default from `business-rules.js`; Savings always 0 | **Fixed** | no longer hardcoded 300 |
| 5.7 | Save validation | ≥1 member; purpose-amounts; date, district, prepared-by; lock check; double-submit guard | Pass | coordinator id → NaN absorbed by `|| null` |
| 5.8 | History/delete | delete button Admin/BM (front+back); delete reverses commissions + renewal heuristically | Pass | renewal reversal heuristic |
| 5.9 | View completed → save | re-saving Completed re-generates commissions; new members only get renewal (guarded) | Warning | make view read-only |

---

## 6. MSC

| # | Feature | Rule | Status | Recommended fix |
|---|---|---|---|---|
| 6.1 | Deposit | MSC≥300 min; deposit via remittance slip (MSC purpose) | Pass | min centralized in `business-rules.js` |
| 6.2 | Balance | `computed_balance = Σ(MSC+HDA) completed − Σ damayan − Σ hda`, matched MemberId OR orphan AFNo | Pass | double-count risk if both present |
| 6.3 | Commission | 5% on 2nd+ deposit (coordinator) | Pass | — |
| 6.4 | **Aggregate totals inconsistency** | `members:list` `total_msc` subtracts damayan but **not** hda_deductions → header totals ≠ sum of rows | **Failed** | align formula |
| 6.5 | Withdrawal | no MSC withdrawal flow exists | — | n/a |

---

## 7. HDA

| # | Feature | Rule | Status | Recommended fix |
|---|---|---|---|---|
| 7.1 | Payment | HDA deposit via remittance (hda purpose, amount 200 fixed) | Pass | amount hardcoded |
| 7.2 | Deduction | `hdaDeduction:bulk` (Admin/BM); amount>0; optional memberIds or all Active; **skips members with insufficient HDA balance** | Pass | batch SQL (N+1) |
| 7.3 | Balance | HDA balance = Σ completed HDA − Σ hda_deductions | Pass | `members.hda_balance` persisted column may drift (reads recompute) |

---

## 8. Deductions

| # | Feature | Rule | Status | Recommended fix |
|---|---|---|---|---|
| 8.1 | Bulk (death) | Admin/BM; qty×₱5/member; optional `month` filter keyed on **registration_date** (likely unintended); creates death_cases | Warning | clarify filter basis |
| 8.2 | Individual | Admin/BM; member must be Active; amount>0 | Pass | — |
| 8.3 | Death case | `deathcases:process`: ₱5 from EVERY Active member; benefit per tiers; notifications | Warning | **does NOT set member_status='Deceased'** — member keeps paying future deductions |
| 8.4 | Deceased flow | member-list two-step: `processDeathCase` then `toggleMemberStatus` — stale status if 2nd fails | Warning | atomic server-side |

---

## 9. Dashboard (dashboard.js + `members:dashboard`, `remittances:dashboard-summary`)

| Card/Metric | Source | Formula | Status |
|---|---|---|---|
| Total/Active Members | `members:dashboard` | count + prev-period trend | Pass |
| MSC Total Fund / Company Fund | `members:dashboard` | Company = Σ(MF−COM); MSC fund mixes NetMSCAmount vs raw MSC basis | Warning (mixed basis, cosmetic trend) |
| Chart toggles | `renderDashCharts` | re-renders from stale `d` snapshot (no refetch) | Warning |
| RCS widget | `remittances:dashboard-summary` | target default ₱500k; non-month target = prev×1.1; classification New/Renewal/MSC/Other | Warning (UTC `toISOString` for "today" vs PH) |
| Membership status bars | `members:dashboard` | count/total % | Pass |
| Honorary progress | `members:dashboard` | avg years/10; eligible/completing | Pass |
| Upcoming renewals | `members:dashboard` | days via `Math.ceil` | Warning (missing date → 999 days) |
| Auto-refresh | `setupAutoRefresh` | 60s poll + `members:data-changed` | Warning (double load) |
| `transactionCaption` | RCS | extrapolation `round(total/prev)*count` presented as real | Warning (misleading) |

---

## 10. Reports (reports.js + `reports:get`)

| Report | Key rule | Status |
|---|---|---|
| member-master-list | filters district/geo/coordinator/status/month/year; per-row deposits/deductions/balance; `mf_payment_count`; `diedMonthly` | Pass; Warning: on-screen address (m.address) ≠ export address (barangay+municipality) |
| active/inactive/deceased | list by member_status | Pass |
| monthly-remittance | classification: HDA > MSC Deposit > Renewal > else **Renewal** — **inconsistent** with dashboard "else Other" | **Failed** (unified classification needed) |
| collection-summary | monthly Σ TotalDeposit + count | Pass |
| financial-summary | 8-line UNION ALL (initial MF, MSC Total Fund, MF, MSC+HDA, HDA, COM, 5% coord commission, Net Deposit) | Warning (MSC fund basis) |
| ready-for-renewal | Active non-Regular; **required_msc=100 hardcoded**; renewal ≤2mo or never paid MF 250/350 | Warning (constant) |
| due-for-msc | Active with `computed_balance < 100` (HAVING); balance range | Warning (constant) |
| Generic PDF export | **every numeric cell rendered as ₱ currency** regardless of type | **Failed** |
| Slip "Excel/XLSX" buttons | produce **CSV** (BOM), labeled Excel | **Failed** |
| SEC reg no | slip `2025110227750-03` vs MML/RFR/DFM `202510227750` — mismatch | Warning |
| Role gating | none on any report | Warning |

---

## 11. Notifications

| Trigger | File/Function | Rule | Status |
|---|---|---|---|
| renewal bands | `checkMemberRenewals` | upcoming/due/grace/inactive (+ auto-inactivate) | Pass |
| birthdays | `checkBirthdays` | active members today | Pass |
| benefit eligible | `checkBenefitEligibility` | uses **UTC `toISOString`** → PH off-by-one day | **Failed** |
| payment milestones | `checkPaymentMilestones` | [10k,20k,50k,100k] vs `overall_payment` (stored snapshot, may be stale) | Warning |
| overdue remittances | `checkOverdueRemittances` | 1–15 days only; days 16–30 gap | Warning |
| registration/status/coordinator/remittance/death/system | various handlers | event-driven | Pass |
| Unread count | `notifications:unreadCount` | **system-wide, not per-user** — every user sees same count; markAllRead affects all users | Warning |
| List | `notifications:list` | LIMIT 100 hardcoded, no pagination | Warning |
| daysRemaining | notifications.js 114–122 | `Math.round` — inconsistent with dashboard `Math.ceil` | Warning (see §21) |

---

## 12. Statement of Account (soa.js + `soa:get`, `soa:transactions`)

| # | Rule | Status | Recommended fix |
|---|---|---|---|
| 12.1 | Balance & benefit (same formulas as §6, §16) | Pass | — |
| 12.2 | Transactions = completed remittance details joined by MemberId OR orphan AFNo; filters page/search; **client-side sort only sorts current page** | Warning | server-side sort |
| 12.3 | **Death stats never rendered on screen** — `updateDeathStats()` (soa.js 268) defined but never called; card stays 0 | **Failed** | call it in `loadSOAData` |
| 12.4 | Print/PDF cap **500 rows**; status hardcoded `'Active'`; Remarks `-` | Warning | paginate/loop; print real status; totals row |

---

## 13. Financial Computations (formula inventory)

| # | Formula | Location | Rule |
|---|---|---|---|
| 13.1 | Age | members.js 398 | `floor((now−birth)/365.25)`, clamp ≥0 |
| 13.2 | OverallPayment | members.js 1249 | `MF + MSC` (readonly) |
| 13.3 | renewal_date | main.js 1882 / 5122 | `reg + 1y`; overdue → `today + 1y` |
| 13.4 | COM | main.js 2367 | tiered flat: 350→120, 250→100, else 0; msc-only→0 |
| 13.5 | Total | main.js 2415 | `MF+MSC+HDA` |
| 13.6 | NetDeposit | main.js 2417 | `Total − COM` |
| 13.7 | TotalDeposit | main.js 2472 | `Σ NetDeposit` (server recompute) |
| 13.8 | computed_balance | main.js (list/get/soa) | `Σ(MSC+HDA) − damayan − hda` |
| 13.9 | MSC commission | main.js 2441 | `MSC × 5%` (2nd+ deposit); NetMSC = MSC − com |
| 13.10 | Death benefit | main.js 3249 | Regular only; pre-Jun16: 20k@+5mo+1d / 50k@+7mo+1d; post: 20k@+7mo+1d / 50k@+9mo+1d |
| 13.11 | Damayan | main.js 3048 | `qty × ₱5` / member; or ₱5 × active count |
| 13.12 | MSC requirement | main.js 3506 | `required_msc = 100`; shortage = `100 − balance` |
| 13.13 | Collection target | main.js 2749 | default ₱500k; non-month = `prev × 1.1` |
| 13.14 | KPI trend | dashboard.js 9 | `(cur−prev)/prev × 100` (pct computed but not displayed) |
| 13.15 | Honorary progress | utils/members | `years/10 × 100` |
| 13.16 | daily target | dashboard.js 777 | `target / dayOfMonth` |

---

## 14. Budget Transparency

No budget-upload/approval/view module exists in the codebase (no table, no IPC, no UI). This feature is **absent** (the prompt's assumption of a Budget Transparency module is not present).

---

## 15. Incident Reporting

No incident-reporting module exists. The closest analogues are the **death-case workflow** (§8), **deduction workflows**, and the **notifications** engine. No dedicated incident table.

---

## 16. Database

**Tables (31):** activitylogs, app_settings, barangays, barangay_coordinators, branches, commission_config, commission_transactions, damayan_deductions, death_cases, hda_deductions, lock_logs, login_attempts, members, membership_audit_log, municipalities, notifications, pending_remittances, personnel, provinces, psgc_audit_log, psgc_import_logs, psgc_migration_logs, ref_barangays, ref_municipalities, ref_provinces, ref_regions, remittances, remittance_details, sales_coordinators, users.

**Foreign keys (15):**
- barangays→municipalities (CASCADE); municipalities→provinces (CASCADE)
- ref_barangays→ref_municipalities (CASCADE); ref_municipalities→ref_provinces (CASCADE); ref_provinces→ref_regions (SET NULL)
- remittance_details→remittances (CASCADE)
- commission_transactions→sales_coordinators/members/users (SET NULL), →remittances (CASCADE)
- damayan_deductions→death_cases (CASCADE); hda_deductions→members (CASCADE); membership_audit_log→members (CASCADE)
- notifications→members (CASCADE, nullable); pending_remittances→members (CASCADE, UNIQUE)

**Notable constraint gaps (app-layer integrity only):**
- `remittance_details.MemberId` — **no FK** (nullable, orphan AFNo allowed by design)
- `members.barangay_coordinator_id / sales_coordinator_id / branch_id / municipality_id / barangay_id` — **no FK** (loose refs)
- `remittances.BranchId / PreparedById / VerifiedById / CreatedBy` — **no FK**
- `membership_audit_log` has no ProcessedBy/user attribution

**Unique/PK (42)** incl. `members.af_no`, `branches.Code`, `users.Username`, `login_attempts.username`, `pending_remittances.member_id`, `app_settings.SettingKey`, `remittances.RemittanceNo`, PSGC `psgc_code` per level.
**Triggers: 0. Stored routines: 0. Views: 0.**
**Indexes:** ~25 non-unique (registration_date, membership_status, member_status, branch_id, DateDeposit, RemittanceId, MemberId, AFNo, created_at, Status cols, etc.)

---

## 17. API (IPC endpoints)

~95 `ipcMain.handle` channels exposed via `preload.js` across namespaces: `auth`(3), `address`(5), `psgc`(7), `members`(10), `remittances`(12), `coordinators`(4), `commissions`(3), `deathcases`(2), `deduction`(3), `hdaDeduction`(1), `soa`(2), `reports`(1), `settings`(10), `dialog`(1), `lock`(3), `export`(5), `activity`(1), `commission`(2), `branches`(4), `personnel`(4), `notifications`(9), `app`(1), `update`(2). Auth/role matrix in §2. Notable unguarded reads/writes noted in §2.3–2.4.

---

## 18. Validation Rules (inventory)

| # | Rule | Layer | Status |
|---|---|---|---|
| 18.1 | Username 3–50 `[A-Za-z0-9._-]` | backend (saveUser) | Pass |
| 18.2 | Password policy 8–128 + upper/lower/digit | backend + frontend | Pass |
| 18.3 | Email regex ≤255 | backend | Pass |
| 18.4 | Role ∈ validRoles | backend | Pass |
| 18.5 | Last-admin protection (demote/delete/toggle) | backend | Pass |
| 18.6 | AF No. uniqueness | backend + DB UNIQUE | Pass |
| 18.7 | Required member fields (FullName/BirthDate/Municipality/Barangay) | **frontend only** | Warning |
| 18.8 | MSC min 300 / MF min 250 / HDA 200 | frontend + INSERT clamp | Warning (create vs edit mismatch) |
| 18.9 | Amount > 0 (deductions/HDA) | backend | Pass |
| 18.10 | Lock no-overlap; end>start | backend | Pass |
| 18.11 | Commission no negatives; COM ≤ MF; AltThreshold ≤ MFThreshold | backend | Pass |
| 18.12 | Restore file `.sql` only | backend | Pass |
| 18.13 | Photo ≤2MB, JPG/PNG/WEBP | frontend | Pass |
| 18.14 | Required fields for coordinators/branches/personnel | frontend (+ backend gaps) | Warning |
| 18.15 | Lock blocks writes (`rejectIfLocked`) | backend + frontend | Pass |

---

## 19. Conditions (key conditional logic)

System-lock gating (writes); status changes (Active/Inactive/Deceased); renewal bands & overdue reset; payment-purpose branches (msc/mf/both/hda); commission tier branches; Honorary vs Regular minimums; coordinator vs personnel PreparedBy; MemberId vs orphan-AFNo join matching; membership_status ↔ honorary fields transitions; `mf_payment_count===0` renewal status priority; first-MSC-deposit 0% commission; within-90-day initial MF guard; last-admin guard; role guards in authGuard; dedupe sets in remittance save; month-lock state transitions; annual Honorary→Regular threshold (≥10); beneficiary-cutoff (pre/post June 15).

---

## 20. Automatic Processes (automations)

| # | Automation | Schedule/Trigger | Status |
|---|---|---|---|
| 20.1 | Startup migrations + honorary_years auto-correct | app boot | Pass |
| 20.2 | Draft-placeholder cleanup | app boot | Pass |
| 20.3 | `checkMemberRenewals` (bands + auto-inactivate >15d overdue) | boot + every 6h | Pass (no scheduler in DB) |
| 20.4 | `checkBirthdays` | boot + 6h | Pass |
| 20.5 | `checkBenefitEligibility` | boot + 6h | **Failed** (UTC date) |
| 20.6 | `checkPaymentMilestones` | boot + 6h | Warning (stale overall_payment) |
| 20.7 | `checkOverdueRemittances` | boot + 6h | Warning (16–30d gap) |
| 20.8 | `handleMemberRenewal` (renewal + honorary + auto-convert) | remittance Completed save | Pass |
| 20.9 | MSC 5% commission generation | remittance Completed save | Pass |
| 20.10 | pending_remittances auto-clear | remittance save | Pass |
| 20.11 | `REM-YYYYMM-NNNN` numbering | remittance save | Pass |
| 20.12 | Lock state transitions (Scheduled→Active→Expired) | `lock:check` polls | Warning (non-transactional read-modify-write) |
| 20.13 | `members:data-changed` broadcast + dashboard 60s refresh | event + timer | **Replaced (2026-08-13)** | now `broadcastDataChanged()` (all windows) + `sync:data-changed` via `data_change_log` poller |
| 20.14 | XAMPP auto-start | app boot | Warning (waitForPort result ignored) |

---

## 21. Cross-Check Summary (Frontend ↔ Backend ↔ Database)

**Verified consistent (Pass):**
- AF uniqueness (UI pre-check + backend + DB UNIQUE)
- Commission calc parity (client `calcCOM` mirrors server `calcComServer` — both now delegate to `src/js/business-rules.js`)
- Total/Net recompute server-side (renderer value ignored)
- Remittance delete role (Admin/BM front + back)
- Password policy (front + back)
- Lock gating (front + back `rejectIfLocked`)
- Pending-remittance lifecycle (add/clear front+back)
- Cross-device sync (2026-08-13): `data_change_log` written in-transaction by every mutating handler; poller → `sync:data-changed` → frontend revalidates current page

**Mismatches / inconsistencies found (Warning/Failed):**
1. **Login lockout SQL invalid** (`MILLISECOND`) — fails open (Failed)
2. **BM frontend enables actions backend denies** — Users tab, lock cancel, etc. (Failed)
3. **`navigateTo` bypasses role gating** (Failed)
4. **New-Honorary progress 1/10 vs 0/10** (Failed)
5. **House number wiped on member edit** (Failed)
6. **Aggregate MSC totals exclude hda_deductions** (Failed)
7. **`benefitEligibility` uses UTC date → off-by-one** (Failed)
8. **Monthly-remittance classification "else Renewal" vs dashboard "else Other"** (Failed)
9. **Generic PDF export forces ₱ on all numerics** (Failed)
10. **Slip "Excel" buttons emit CSV** (Failed)
11. **SOA death stats never rendered** (Failed)
12. **Day-diff rounding mismatch** — `Math.ceil` (dashboard) vs `Math.round` (member-list 12, reports 2011, notifications 120) → a member can appear "due" on one screen and "ok" on another (Failed cross-module)
13. **AF editable → partial propagation** beyond remittance_details (Warning)
14. **Payment minimums create-vs-edit mismatch; silent clamp** (Warning)
15. **SEC reg no mismatch across report templates** (Warning)
16. **Dead code:** `loadExistingDraftIntoForm`, `getReportIndex`, `downloadRemittancePDF`, `updateDeathStats`, `rateLimited`, `psgc:refreshBrgyLists` stub (Warning)
17. **No-role reports/SOA/activity-logs/settings:set** (Warning)
18. **Deduction month filter keyed on registration_date** (Warning)
19. **`overall_payment` stored snapshot not updated by remittances:save** (Warning)
20. **System-wide unread notification count** (Warning)
21. **`members.hda_balance` persisted column may drift** (Warning)

---

## 22. Final Checklist (counts)

| Metric | Count |
|---|---|
| Total business rules discovered | **~120** |
| Total conditions discovered | **~40** (renewal bands, purpose branches, commission tiers, status transitions, guards) |
| Total validations discovered | **~25** |
| Total workflows discovered | **~17** (registration, remittance, death-case, deductions, lock, backup/restore, reset-password, PSGC import, cascade deletes, etc.) |
| Total formulas discovered | **16** (financial core + derived KPIs) |
| Total permission rules discovered | **~30** (authGuard matrix + rolePages + UI gating) |
| Total APIs discovered | **~95 IPC channels** |
| Total database constraints discovered | **42 PK/UNIQUE + 15 FKs + ~25 indexes; 0 triggers; 0 routines; 0 views** |
| Total automations discovered | **14** |
| Total inconsistencies found | **21** (cross-check, §21) |
| Total duplicate logic found | **7** (COM calc front/back; day-diff ×3; slip Excel/CSV ×2; report builders ×2; refresh stubs; role sets ×3) |
| Total missing logic found | **10** (Budget Transparency module; Incident Reporting module; remember-me; MSC withdrawal; server-side required-field validation; navigateTo role guard; auth:me call; SOA death-stats render; per-user unread count; scheduled renewal inactivator) |

---

## 23. Phase 2 — STOPPED

**Audit complete. No changes were made to any code, database, or configuration.**

Per your instructions, implementation waits for your explicit approval. When approved, the recommended fixes are listed per-finding above, prioritized as: **Failed items first** (lockout SQL, role mismatches, house-number wipe, new-Honorary progress, aggregate totals, benefit-eligibility date, classification, PDF/CSV label issues, SOA death stats, day-diff normalization), then **Warnings** (hardcoded constants, dead code, role/read-permission tightening, AF immutability, create/edit parity).

Priority: Accuracy > Stability > Minimal Changes > No Regressions.
