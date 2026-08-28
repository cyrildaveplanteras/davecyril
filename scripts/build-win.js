// Local/CI Windows build helper.
//
// Loads code-signing credentials from .env.local (kept out of git) so local
// `npm run dist:win` signs with the same secret-based mechanism GitHub Actions
// uses (CSC_LINK + CSC_KEY_PASSWORD). In CI, .env.local does not exist and the
// variables come from the workflow environment instead.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

try {
  execSync('npx electron-builder --win', { cwd: root, stdio: 'inherit', shell: true });
} catch (err) {
  process.exit(err && err.status ? err.status : 1);
}