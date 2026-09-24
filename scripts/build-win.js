// Local/CI Windows build helper.
//
// Loads code-signing credentials from .env.local (kept out of git) so local
// `npm run dist:win` signs with the same secret-based mechanism GitHub Actions
// uses (CSC_LINK + CSC_KEY_PASSWORD). In CI, .env.local does not exist and the
// variables come from the workflow environment instead.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

// Deliberately NOT code-signing: the only local certificate is a self-signed,
// untrusted one (SmartScreen still warns, and the private key has been inside
// earlier shipped installers). Clear any CSR-related env vars so electron-builder
// always produces an unsigned binary.
delete process.env.CSC_LINK;
delete process.env.CSC_KEY_PASSWORD;
delete process.env.WIN_CSC_LINK;
delete process.env.WIN_CSC_KEY_PASSWORD;

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

try {
  execSync('npx electron-builder --win', { cwd: root, stdio: 'inherit', shell: true });
} catch (err) {
  process.exit(err && err.status ? err.status : 1);
}