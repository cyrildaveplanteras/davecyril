# GoldenHope Automatic Updates

This document explains how the app's automatic update system works and how to
ship a new version to every installed PC.

## Architecture

- **Updater engine:** `electron-updater` (already a dependency). It runs in the
  main process (`main.js`) and talks to GitHub Releases.
- **Update feed:** configured via the `build.publish` block in `package.json`
  (`provider: "github"`). electron-updater reads `owner`/`repo` from there and
  resolves `latest.yml` from the release assets.
- **Renderer:** the update banner in `src/js/app.js` shows checking/downloading/
  downloaded/error states, the current vs. new version, and lets the user skip
  a version or download manually. An "Application Updates" panel lives in
  **Settings → General**.
- **CI/CD:** GitHub Actions under `.github/workflows`:
  - `test.yml` — runs on every push/PR (syntax check + test packaging).
  - `release.yml` — runs when a `v*` tag is pushed: builds, signs, and uploads
    the NSIS installer plus `latest.yml`.

## Component behavior

### Main process (`main.js`)

| Setting | Default | Where |
|---------|---------|-------|
| Auto-download | `true` | `autoUpdater.autoDownload` |
| Install on quit | `true` | `autoUpdater.autoInstallOnAppQuit` |
| Prerelease allowance | `false` | `autoUpdater.allowPrerelease` |
| Check frequency | every 4 h | `UPDATER_CHECK_INTERVAL_MS` |

- First check runs 5 s after the login window finishes loading; then every 4 hours.
- Checks are skipped in unpackaged/dev builds (`!app.isPackaged`) and whenever
  the publish config is not a real repository (placeholders like
  `YOUR_GITHUB_OWNER` disable the updater so the app never phones a fake host).
- The updater state is tracked in `updaterState` and pushed to the renderer
  through the `update:*` channels (including a full-state `update:status`
  broadcast so the banner recovers after page navigation).

### IPC surface (`preload.js` → `window.api`)

| Method | Purpose |
|--------|---------|
| `checkForUpdates()` | Manual check (also triggers on startup) |
| `startUpdateDownload()` | Start download when auto-download is off |
| `installUpdate()` | Quit & install (Admin only) |
| `getUpdateStatus()` | Current status / versions / configured / autoDownload |
| `setAutoDownload(enabled)` | Toggle auto-download preference |
| `getAppVersion()` | Running app version |
| `onUpdateEvent(cb)` | Subscribe to update events |

### User preference

"Automatically download updates when available" is stored in the database
(`app_settings.auto_download_updates`). The renderer reads it on startup and
applies it to the engine via `setAutoDownload`. "Not now" on the banner records
the skipped version in the renderer's `localStorage`.

## Shipping a new release

1. Bump the version (must be **higher** than the previous release):

   ```bash
   npm version patch   # 1.4.0 -> 1.4.1  (or minor / major)
   ```

2. Commit, push, then push the tag:

   ```bash
   git push origin main
   git push origin v1.4.1
   ```

3. `release.yml` builds/ signs/ publishes the installer + `latest.yml` to the
   `v1.4.1` GitHub Release. Installed apps detect the new version on their next
   check (startup or up to 4 h later) and update themselves.

## Required GitHub repository setup

The publish config in `package.json` is already set to `cyrildaveplanteras/davecyril`.
The repository must exist on GitHub (create it at https://github.com/new when ready).

1. Ensure the publish config matches the real repository:

   ```json
   "repository": { "type": "git", "url": "https://github.com/cyrildaveplanteras/davecyril.git" },
   "build": { "publish": { "provider": "github", "owner": "cyrildaveplanteras", "repo": "davecyril" } }
   ```

2. Repository secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |--------|-------|
   | `CSC_LINK` | Base64 of `goldenhope-code-signing.pfx` (or the path, in CI use base64) |
   | `CSC_KEY_PASSWORD` | The certificate password |

   GitHub's built-in `GITHUB_TOKEN` (with `contents: write`, already granted in
   `release.yml`) is used for publishing; no extra token is required.

   To Base64-encode the certificate on Windows:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("D:\goldenhope-electron\goldenhope-code-signing.pfx"))
   ```

## Local (dev machine) builds & signing

- `npm start` — run the app unpackaged (no update checks run).
- `npm run pack` — unsigned test build to `release/win-unpacked`.
- `npm run dist:win` — builds the installer; loads signing credentials from
  `.env.local` via `scripts/build-win.js` (same `CSC_LINK` / `CSC_KEY_PASSWORD`
  variables the CI uses). See `.env.local.example`.

The certificate password is **no longer stored in package.json**. It lives only
in `.env.local` (local machine, git-ignored) and in the GitHub secrets.

## Database safety

The updater only replaces installed application files. The PostgreSQL data
directory, `%LOCALAPPDATA%\GoldenHope\db-config.json`, and the database itself
are untouched by updates; schema changes ship via the additive, idempotent
migrations in `src/js/pg-migrations.js`.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| App never checks for updates | `owner`/`repo` not matching the real public repo, running unpackaged (`npm start`), or running with a generic-config export. Ensure `build.publish` points at `cyrildaveplanteras/davecyril`. |
| Release build succeeds but no GitHub Release asset | `GH_TOKEN` not set in the workflow environment, or release already exists for that tag. |
| Installer not code-signed | `CSC_LINK` / `CSC_KEY_PASSWORD` missing from secrets (or `.env.local` for local builds). |
| "latest.yml missing" on CI | electron-builder did not publish; check token/scope and that the tag matches `v*`. |
| Update never downloads | Auto-download preference off — user can press "Download update" on the banner, or toggle the setting in Settings → General. |
| Update downloads but won't install | App must have `nsis` target (it does) and needs a restart; `installUpdate()` quits and runs the installer. |
| Slow/over-broad downloaded each time | Ensure `latest.yml` + blockmaps are uploaded (they are). Large jumps between major versions download the full block — expected. |