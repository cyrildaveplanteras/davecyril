# GoldenHope Electron — PostgreSQL Migration & QA — Final Acceptance Report

**App:** GoldenHope Member Management System
**Platform:** Windows (Electron, vanilla JS renderer, Node main process)
**Database:** PostgreSQL 16 (local, port 5433, database `goldenhope_db`)
**Date:** 2026-08-20 → 2026-08-21 (MariaDB restore applied)

---

## 1. Executive Summary

The application has been fully migrated from MySQL (XAMPP) to PostgreSQL and verified end-to-end.
Every SQL dialect construct was rewritten for PostgreSQL, the database driver was replaced with a
`pg`-based wrapper preserving the exact result-row shapes the renderer expects, the schema was
rebuilt (32 tables, including the new `audit_logs` table), all migration, import, reconciliation
and test scripts were ported, and the Activity Log was re-policed so it records **only** the login
lifecycle while all financial/operational actions are written to `audit_logs`.

Acceptance verdict: **PASS** — all automated suites pass, the backup/restore round-trip is exact for
row counts, and the live application boots, loads, logs in, and serves real data through the UI
without errors.

On 2026-08-21, the database was replaced with the MariaDB backup (`goldenhope_backup_20260820_202408.sql`).
The dump was converted via `scripts/convert-mysql-dump-to-pg.js`, loaded into PostgreSQL via psql,
identity sequences reset, §19 audit-log split re-run, and commission normalization applied (208 rows).
All 3 test suites pass; app smoke test passes.

---

## 2. Database Migration (MySQL → PostgreSQL)

| Item | Status | Evidence |
|------|--------|----------|
| PostgreSQL service auto-start | PASS | `auto-postgres: PostgreSQL already running on port 5433` on every boot |
| `ensureDatabase` (creates DB if missing) | PASS | Runs before pool creation at app startup |
| Schema creation (32 tables) | PASS | `scripts/init-db.js` idempotent; runMigrations applies at every startup |
| Migrations idempotent | PASS | Re-run safe; `pg-migrations.js` guard clauses skip applied migrations |
| Data import | PASS | Live data present (see §3) |
| Mixed-case identifiers preserved | PASS | `"Id"`, `"RemittanceNo"`, `"DateDeposit"`, `"TotalDeposit"`, `"BranchId"` etc. quoted correctly; renderer PascalCase access unchanged |
| DATE/TIMESTAMP returned as strings | PASS | Matches legacy `dateStrings:true` behavior |
| MySQL error-code mapping | PASS | ER_NO_REFERENCED_ROW_2, duplicate-key, FK violations surface as friendly messages |
| MySQL-only functions removed | PASS | `DATE_FORMAT`→`to_char`, `DATE_ADD`→`+ INTERVAL`, `CURDATE`→`CURRENT_DATE`, `ON DUPLICATE KEY`→`ON CONFLICT`, `LAST_INSERT_ID`→`RETURNING`, `GET_LOCK`→advisory lock, `SUBSTRING_INDEX`→`split_part` |

---

## 3. Data Reconciliation — Post MariaDB Restore (956-member dataset)

On 2026-08-21, the database was replaced with the MariaDB backup (`goldenhope_backup_20260820_202408.sql`).
The backup was converted from MySQL mysqldump format to PostgreSQL via `scripts/convert-mysql-dump-to-pg.js`.

| Table | Rows (PG) | Notes |
|-------|----------:|-------|
| members | 956 | From MariaDB backup |
| remittances | 28 | Parent slips, `TotalDeposit` recomputed from detail sums |
| remittance_details | 966 | MemberId backfilled for orphaned rows |
| commission_transactions | 965 | Flat ₱120 per qualifying MF remittance |
| sales_coordinators | 17 | — |
| damayan_deductions | 1,292 | — |
| death_cases | 12 | — |
| notifications | 2,531 | — |
| membership_audit_log | — | Not in MariaDB dump (PG-only table) |
| pending_remittances | 108 | — |
| users | 2 | ROGIE T. OYAG + RUELLA JANE I. ENAS (real accounts) |
| ref_provinces / ref_municipalities / ref_barangays | 83 / 1,596 / 40,485 | PSGC 2Q-2026 data |
| barangays / municipalities / provinces (working copy) | 691 / 27 / 1 | PSGC refresh verified |
| activitylogs | 153 | Login lifecycle only (140 Login / 6 Failed / 5 Logout + 2 admin) |
| audit_logs | 14 | 1 Commission Correction + 13 Commission Generated (§19 split re-run) |

Commission normalization applied: 208 Honorary bulk rows corrected (MF≥250, COM=0 → COM=120). All remittance totals recomputed.

Reconciliation totals checked in `scripts/test-db-consistency.js` (10/10 PASS) and
`scripts/test-financial-scenarios.js` (11/11 PASS).

---

## 4. Business-Rule Compliance

| Rule | Implementation | Result |
|------|----------------|--------|
| Membership fee ₱250 / ₱350 tiers | `src/js/business-rules.js` | 19/19 unit tests PASS |
| Sales Coordinator commission flat ₱120 (no ₱100 tier) | Amount-based `calcCommission`; backend authoritative | PASS |
| MSC commission: 0% 1st deposit, 5% 2nd onward | `MSC_COMMISSION_RATE` logic | Verified for 1st/2nd/3rd deposits in financial scenarios |
| Registration remittance earns flat ₱120 commission | `autoAddMemberToSlip` uses purpose `both`; repair script restored 209 first-deposit rows | PASS |
| HDA ₱200 | `hdaDeduction:bulk` + `processHDADeduction` | PASS |
| Remittance posting is atomic | Single transaction (validate → MF → MSC → commission → records → funds → statements → balances → COMMIT/ROLLBACK) | Verified rollback leaves no partial rows |
| Member balances from verified transactions only | SOA recomputed from details | PASS (SOA probe ok, computed_balance correct) |
| Monthly/system lock via `lock_logs` state machine | Scheduled → Active → Expired/Cancelled | PASS |
| Renewal/benefit/payment-milestone checks | Scheduled checks on startup + every 6 h | PASS (no errors in boot log) |

---

## 5. Financial Integrity

| Check | Result | Evidence |
|-------|--------|----------|
| Dashboard totals | PASS | `totalMembers 956`, `totalFunds`/`mscTotalFund`/`companyFund` returned as numbers |
| Per-member balances | PASS | `computed_balance` correct for sampled members (e.g. 300 for renewed members) |
| Commission reversal on member delete | PASS | Reversal deletes commission rows and restores funds |
| MSC deposit count stored as integer | PASS | `MSCDepositCount` [1,2,3] for 1st/2nd/3rd deposits (regression test for the string-concat bug) |
| FK violation surfaces cleanly | PASS | ER_NO_REFERENCED_ROW_2 mapped to friendly message |
| No partial rows on failure | PASS | SAVEPOINT-based atomic rollback test |

---

## 6. Security

| Item | Status | Notes |
|------|--------|-------|
| Passwords bcrypt-hashed (bcryptjs) | PASS | `compareSync` in `auth:login`; seeded users hashed |
| Renderer never sees SQL or credentials | PASS | All DB access in main process; preload exposes whitelisted `window.api.*` |
| Context isolation + sandbox + restrictive CSP | PASS | `contextIsolation:true`, `sandbox:true`, CSP header in `createWindow` |
| Generic login errors (no user enumeration) | PASS | Wrong user and wrong password both return `Invalid username or password` |
| Login rate limit (10/min per session) | PASS | Verified in handler; tested bad-password flow |
| Login lockout after repeated failures | PASS | In-memory + DB `login_attempts` backstop |
| `settings:activityLogs` Admin-only | PASS | `authGuard(event, ['Admin'])` |
| `settings:auditLogs` Admin-only (new) | PASS | `authGuard(event, ['Admin'])` |
| Navigation/URL restrictions | PASS | `will-navigate` + `setWindowOpenHandler` deny external URLs |
| Last-admin guard | PASS | Cannot deactivate/delete the last active Admin (counts now numeric after type-parser fix) |

---

## 7. Activity Log & Audit Trail Policy (Section 19)

| Requirement | Implementation | Result |
|-------------|----------------|--------|
| Activity Log shows ONLY login lifecycle | `settings:activityLogs` filters `Action IN ('Login','Logout','Login Failed')` | PASS |
| Financial/operational actions go to `audit_logs` | New table + `logAudit()` helper; 6 write sites converted (HDA payment, commission generated/reversed, HDA deduction, month lock/unlock) | PASS |
| Backfill of prior financial actions | `migrateActivityLogsToAuditLogs` migration moved 15 rows (Commission Correction 1, Commission Generated 12, Data Reconciliation 2) | PASS |
| External scripts write to audit trail | `reconcile.js`, `repair-registration-commission.js`, `fixCommissionValues` migration | PASS |
| Login events never leak into audit_logs | Verified live — audit_logs contains only Commission/Reconciliation actions | PASS |

**Live evidence:** After MariaDB restore + §19 split: activitylogs = 140 Login + 6 Login Failed + 5 Logout + 2 admin = 153; audit_logs = 14. The restored users (ROGIE T. OYAG / RUELLA JANE I. ENAS) have their original MySQL bcrypt hashes.

---

## 8. Backend SQL Rewrites (Dialect Conversion)

| Pattern | Before (MySQL) | After (PostgreSQL) | Verified in |
|---------|----------------|--------------------|-------------|
| Positional params | `?` | `$1..$n` via wrapper | every query |
| Identifier quoting | backticks | `"Identifier"` for mixed-case | wrapper auto-quotes known identifiers |
| String split | `SUBSTRING_INDEX(full_name, ',', 1)` | `split_part(full_name, ',', 1)` | monthly slip (probe returned REM-202608-0019) |
| Last token | `SUBSTRING_INDEX(full_name, ' ', -1)` | `coalesce(substring(trim(full_name) from '\S+$'), '')` | monthly slip |
| Insert ID | `insertId` | `RETURNING *` | wrapper `prepare` appends `RETURNING *` |
| Date format | `DATE_FORMAT(...)` | `to_char(...)` | reports, slips |
| Date math | `DATE_ADD/CURDATE` | `+ INTERVAL`/`CURRENT_DATE` | renewals, due checks |
| Bigint/count/numeric | JS number | int8→parseInt, numeric→parseFloat type parsers | dashboard, guards, counts |
| Schema introspection | `information_schema.statistics` | `information_schema.tables/columns` | consistency test (uses `current_schema()`) |

---

## 9. Backup & Restore

| Test | Command | Result |
|------|---------|--------|
| Pre-change backup | `pg_dump` → `gh_backup_before_fixes.dump` (4.2 MB) | PASS |
| Round-trip dump | `pg_dump` → `gh_roundtrip.dump` | PASS |
| Restore to scratch DB | `psql` with `ON_ERROR_STOP=1` → `goldenhope_db_restore_test` | PASS (0 errors) |
| Row-count equivalence | 32-table comparison src vs restored | **ALL 33 checks PASS** (every table identical, table set identical) |
| Cleanup | Scratch DB dropped; dump removed | PASS |
| In-app backup handler | `settings:backup` uses `findPgBinary('pg_dump')` + `--clean --if-exists --no-owner --no-privileges` | PASS |
| In-app restore handler | `settings:restore` via `psql` with error capture | PASS |

Note: the app's in-app backup/restore dialogs were not driven through the live UI during this run;
the underlying `pg_dump`/`psql` pipeline they invoke was validated directly via the round-trip above.

---

## 10. Renderer / IPC Smoke Test (live app)

The application was launched with `ELECTRON_ENABLE_LOGGING` and driven through the real preload bridge
(`window.api.*`). Results:

| Probe | Result |
|-------|--------|
| Boot + PG auto-start + migrations | PASS — clean startup, no errors |
| Login page render | PASS — `readyState complete`, title `GoldenHope - Login`, 3 inputs, 2 buttons, login form present, zero renderer console errors |
| Bad-password login | PASS — generic `Invalid username or password`, `Login Failed` activity row |
| Good-password login | PASS — success + session established |
| `auth:me` after login | PASS — authenticated session returned |
| `members:list` | PASS — 956 members |
| Dashboard | PASS — `totalFunds` numeric (exercises the type-parser fix) |
| Monthly remittance slip | PASS — REM-202608-0019, `TotalDeposit 89110` numeric |
| `settings:activityLogs` | PASS — login lifecycle only |
| `settings:auditLogs` | PASS — financial/operational only; Admin-gated |
| Shutdown | PASS — clean exit code 0 |

The temporary smoke-test user (`__smoketest`) was removed afterward; activitylogs returned to baseline.

---

## 11. Automated Test Matrix

| Suite | Command | Result |
|-------|---------|--------|
| Business rules | `node scripts/test-business-rules.js` | **19/19 PASS** |
| DB consistency | `node scripts/test-db-consistency.js` | **10/10 PASS** |
| Financial scenarios | `node scripts/test-financial-scenarios.js` | **11/11 PASS** |
| Backup/restore round-trip | `scripts/_compare_restore.js` (temp, since removed) | **33/33 PASS** |
| Syntax check (all edited files) | `node --check` | PASS |

---

## 12. Code Hygiene & Dead Code Removal

| Item | Action |
|------|--------|
| `ensureNotificationsTable` (MySQL-only, uncalled) | Deleted |
| Retired scripts (MySQL-era) | Deleted: `auto-xampp.js`, `_reset_pg.js`, `_check_mysql_data.js`, `_check_seq.js`, `_dbg.js`, `_replace_boot.js`, `_t.js`, `_test_login_flow.js`, `_test_main_sql.js`, `_test_pg_schema.js`, `_test_quoting.js` |
| `scripts/init-db.js` | Rewritten as PostgreSQL provisioning (ensureDatabase + runMigrations, idempotent) |
| Preload API completeness | Added `getAuditLogs` exposure for the new `settings:auditLogs` handler |
| Renderer null hygiene | `|| undefined` → `|| null` in coordinators/member-list (4 sites) |
| Audit-log writes centralized | `logAudit()` helper used by all financial write sites |

---

## 13. Environment & Deployment Notes

- PostgreSQL 16 runs locally on port 5433; auto-started by the app (`auto-postgres`).
- `.env` holds `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME/DB_TIMEZONE/PG_BIN_DIR/PG_DATA_DIR`.
- Local auth is trust; `pg_dump`/`psql` run without a password prompt in scripts and use `PGPASSWORD` when needed.
- App startup runs `ensureDatabase` + `runMigrations`; a PostgreSQL advisory lock prevents concurrent-migration races across instances.

---

## 14. Known Limitations & Residual Warnings

| Item | Severity | Status |
|------|----------|--------|
| IPC rate-limit map (`checkIpcRateLimit`) never pruned | Warning | In-memory per-session; only `auth:login` uses it (10/min). No functional impact in normal use; could be pruned in a future hardening pass. |
| `rateLimited()` helper is dead code | Warning | Unused wrapper; harmless. |
| `settings:set` accepts any authenticated role | Warning | Behavior preserved from the original app; not a migration regression. Restrict keys if stricter policy is required. |
| `capturePage()` fails on an occluded window (`UnknownVizError`) | Environment | Chromium limitation when the window is covered; not an app defect. Worked around in testing by probing the DOM instead. |
| In-app backup/restore dialogs not UI-driven in this run | Manual | Underlying pg_dump/psql pipeline validated directly (round-trip). |

---

## 15. Recommendations (non-blocking)

1. Prune the IPC rate-limit map or move it to a bounded LRU to bound memory growth.
2. Restrict `settings:set` keys to a whitelist, or gate it to Admin.
3. Consider an encrypted secrets file or Windows DPAPI for the DB password instead of plain `.env`.
4. Add a scheduled maintenance job that vacuums `ActivityLogs`/`audit_logs` and archives rows older than N years.

---

## 16. Sign-off

| Area | Verdict |
|------|---------|
| Migration completeness | PASS |
| Data integrity / reconciliation | PASS |
| Business-rule compliance | PASS |
| Financial correctness | PASS |
| Security posture | PASS (with 2 low-severity warnings, §14) |
| Activity-log policy | PASS |
| Backup & restore | PASS |
| Application runtime | PASS |
| Test coverage | PASS |

**Overall: ACCEPTED**

All suites green, the app runs against real data end-to-end, and the database can be backed up and restored with exact row-count equivalence. The MySQL → PostgreSQL migration is complete.