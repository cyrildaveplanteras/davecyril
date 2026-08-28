# pgAdmin 4 — GoldenHope Connection Guide

**DB Engine:** PostgreSQL 17, `127.0.0.1:5433` (`C:\Program Files\PostgreSQL\17\data`)
**Status:** Server running via `pg_ctl` (not Windows service) after `pg_resetwal -f` recovery on 2026-08-26. DB `goldenhope_db` has 32 tables, user `goldenhope` OK.

## 1. Master Password (JUST RESET)
- Previous `pgadmin4.db` backed up to `%APPDATA%\pgAdmin\pgadmin4.db.bak_20260826_105752` and removed.
- **Next launch**, pgAdmin will prompt: `Set Master Password` → enter:
  ```
  GOLDENHOPE#2026_db
  ```
  Confirm same value. This unlocks pgAdmin UI only — NOT the DB password.

## 2. Register GoldenHope Server (do after setting master)
1. Open pgAdmin 4 (Start Menu).
2. Enter Master Password `GOLDENHOPE#2026_db` if prompted.
3. Right-click `Servers` → `Register` → `Server...`
   - **General** → Name: `GoldenHope Local`
   - **Connection** →
     - Host: `127.0.0.1`
     - Port: `5433`  ← critical, not 5432
     - Maintenance DB: `postgres`
     - Username: `goldenhope`
      - Password: `GoldenHopenDamayan`  ← DB password from `db-config.json:6` / `.env:4`
     - Save password: checked
   - **SSL** → Mode: `Prefer`
   - Click `Save`.

## 3. Verify
- Expand `Servers → GoldenHope Local → Databases → goldenhope_db` → `Query Tool` → run:
  ```sql
  SELECT current_user, current_database(); -- should be goldenhope, goldenhope_db
  SELECT count(*) FROM information_schema.tables WHERE table_schema='public'; -- 32
  ```

## 4. Troubleshooting
- `password authentication failed for user "goldenhope"` → you entered master password in DB password field. Use `GoldenHopenDamayan` for DB.
- `connection refused` → ensure Port `5433` and DB running: check `pg_isready -h 127.0.0.1 -p 5433` or `netstat -ano | findstr 5433` should show LISTENING PID 1120 (manual pg_ctl).
- If `pgAdmin` asks to `Reset Master Password` again → enter `GOLDENHOPE#2026_db`.

## 5. Postgres Service Note
- Windows service `postgresql-x64-17` is currently **Stopped** (needs admin to restart after crash). Server is running manually via:
  ```
  "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\17\data" start
  ```
- On reboot, either run that command or open **PowerShell as Administrator** and run:
  ```
  net start postgresql-x64-17
  ```
  If it fails again, run `pg_ctl start` instead.

## Credentials Summary
| Purpose | Value |
|---------|-------|
| pgAdmin Master Password | `GOLDENHOPE#2026_db` |
| DB Host | `127.0.0.1` |
| DB Port | `5433` |
| DB User | `goldenhope` |
| DB Password | `GoldenHopenDamayan` |
| DB Name | `goldenhope_db` |
