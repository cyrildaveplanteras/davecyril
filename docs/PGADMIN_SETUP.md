# pgAdmin 4 — GoldenHope Connection Guide

**DB Engine:** PostgreSQL 17, `127.0.0.1:5433` (`C:\Program Files\PostgreSQL\17\data`)
**Status:** Server running via `pg_ctl` (not Windows service) after `pg_resetwal -f` recovery on 2026-08-26. DB `goldenhope_db` has 32 tables, user `goldenhope` OK.

## 1. Master Password (JUST RESET)
- Previous `pgadmin4.db` backed up to `%APPDATA%\pgAdmin\pgadmin4.db.bak_20260826_105752` and removed.
- **Next launch**, pgAdmin will prompt: `Set Master Password` → choose your own value and confirm it.
  This unlocks the pgAdmin UI only — it is NOT the GoldenHope database password, and it is no longer
  recorded in this repository.

## 2. Register GoldenHope Server (do after setting master)
1. Open pgAdmin 4 (Start Menu).
2. Enter your pgAdmin Master Password if prompted.
3. Right-click `Servers` → `Register` → `Server...`
   - **General** → Name: `GoldenHope Local`
   - **Connection** →
     - Host: `127.0.0.1`
     - Port: `5433`  ← critical, not 5432
     - Maintenance DB: `postgres`
      - Username: `goldenhope`
      - Password: the value you entered during GoldenHope's first-run database setup
        (stored in `%LOCALAPPDATA%\GoldenHope\db-config.json` under `database.password`)
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
- `password authentication failed for user "goldenhope"` → the username and password do not match.
  Either you entered the pgAdmin master password in the DB password field, or the password saved by
  GoldenHope no longer matches PostgreSQL. Check `%LOCALAPPDATA%\GoldenHope\db-config.json`
  (`database.password`) against `SELECT rolpassword FROM pg_authid WHERE rolname='goldenhope';`
  in a superuser session, or reset the role password and re-run first-run setup.
- `connection refused` → ensure Port `5433` and DB running: check `pg_isready -h 127.0.0.1 -p 5433` or `netstat -ano | findstr 5433` should show LISTENING PID 1120 (manual pg_ctl).
- If `pgAdmin` asks to `Reset Master Password` again → enter your own master password (the value you chose on first launch).

## 5. Forgotten admin password
The login window has no password-reset button. That is deliberate: the old
`db:resetDefaultLogin` IPC handler required no authentication, so anyone who could reach the
login window could reset `admin` to a known password. Recovery is a database-side operation:

1. Open pgAdmin 4, expand `Servers → GoldenHope Local → Databases → goldenhope_db → Query Tool`.
2. Reset the application user's password (pick a strong one of your own):
   ```sql
   ALTER USER goldenhope WITH PASSWORD '<new strong password>';
   ```
3. If the `admin` application account itself is locked, or you have no valid login at all:
   ```sql
   UPDATE "users"
      SET "IsLocked" = 0, "IsActive" = 1
    WHERE LOWER("Username") = 'admin';
   DELETE FROM login_attempts WHERE LOWER(username) = 'admin';
   ```
   The failed-attempt counter and lockout expiry are **not** columns on `users`; they live in the
   `login_attempts` row for that username (`attempt_count`, `locked_until`), which the `DELETE`
   above clears.
4. Then reset the login password directly. GoldenHope stores bcrypt hashes, so generate one rather
   than storing plaintext:
   ```sql
   UPDATE "users"
      SET "PasswordHash" = '<bcrypt hash>', "MustChangePassword" = 1
    WHERE LOWER("Username") = 'admin';
   ```
   Generate the hash on the machine running GoldenHope:
   ```powershell
   node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'YourNewPassword'
   ```
5. If you also changed the PostgreSQL role password in step 2, update it in the GoldenHope config
   so the two stay in sync:
   `%LOCALAPPDATA%\GoldenHope\db-config.json` → `database.password`

## 6. Postgres Service Note
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
No GoldenHope credential is recorded in this repository any more. Secrets are entered per machine.

| Purpose | Where it lives |
|---------|----------------|
| pgAdmin Master Password | Operator's choice, set in pgAdmin on first launch |
| DB Host | `db-config.json` → `database.host` (default `127.0.0.1`) |
| DB Port | `db-config.json` → `database.port` (default `5433`) |
| DB User | `db-config.json` → `database.user` (default `goldenhope`) |
| DB Password | Entered in the first-run setup dialog; stored in `%LOCALAPPDATA%\GoldenHope\db-config.json` → `database.password` |
| DB Name | `db-config.json` → `database.name` (default `goldenhope_db`) |

The packaged `db-config.json` ships non-secret defaults with an empty password. If the password is
ever committed by mistake, rotate it in PostgreSQL — changing the file alone does not protect you,
because the old value remains readable in Git history.
