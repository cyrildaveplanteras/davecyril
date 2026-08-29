const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Custom sign function - passes RAW password to signtool.exe (bypasses electron-builder's hashing bug)
// and skips timestamping so builds still succeed on machines/network that cannot
// reach public timestamp servers.
//
// Code signing is OPTIONAL. electron-builder only resolves cscInfo when
// CSC_LINK / CSC_KEY_PASSWORD are present. When no certificate is configured,
// signing is skipped entirely (the build proceeds with an unsigned binary)
// instead of failing the build.
async function customSign(configuration, packager) {
  const { path: filePath, cscInfo, hash, isNest, name, site } = configuration;

  // No certificate resolved -> leave the binary unsigned.
  if (!cscInfo) {
    console.log(`[SIGN] No code-signing certificate configured (CSC_LINK not set); skipping signing for ${filePath}`);
    return;
  }

  const password = cscInfo.password || process.env.CSC_KEY_PASSWORD;
  let certificateFile = cscInfo.file;
  if (!certificateFile) {
    certificateFile = packager.config?.win?.signtoolOptions?.certificateFile;
  }
  if (!certificateFile) {
    console.log(`[SIGN] No certificate file resolved; skipping signing for ${filePath}`);
    return;
  }
  certificateFile = path.resolve(packager.projectDir, certificateFile);

  const toolsets = packager.config?.toolsets || {};
  const winCodeSignVersion = toolsets.winCodeSign || '0.0.0';
  
  let signtoolPath;
  if (winCodeSignVersion === '0.0.0') {
    signtoolPath = path.join(
      process.env.USERPROFILE,
      'AppData', 'Local', 'electron-builder', 'Cache',
      'winCodeSign-2.6.0', 'winCodeSign-2.6.0-5puky', 'windows-10', 'x64', 'signtool.exe'
    );
  } else {
    signtoolPath = path.join(
      process.env.USERPROFILE,
      'AppData', 'Local', 'electron-builder', 'Cache',
      `win-codesign@${winCodeSignVersion}`, 'windows-kits-bundle-10_0_26100_0-1pell', 'x64', 'signtool.exe'
    );
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  if (!fs.existsSync(signtoolPath)) throw new Error(`signtool.exe not found at ${signtoolPath}`);

  // Skip timestamping - network blocks timestamp servers
  // const timestampServer = 'http://timestamp.acs.microsoft.com';
  // const rfc3161TimeStampServer = 'http://timestamp.acs.microsoft.com';
  
  const isRfc3161 = isNest || hash === 'sha256';
  // const timestampArg = isRfc3161 ? '/tr' : '/t';
  // const timestampUrl = isRfc3161 ? rfc3161TimeStampServer : timestampServer;

  const args = ['sign'];
  // args.push(timestampArg, timestampUrl);  // Skip timestamping
  
  const isLegacyToolset = winCodeSignVersion === '0.0.0';
  if (!isLegacyToolset || hash !== 'sha1') {
    args.push('/fd', hash.toLowerCase());
    if (!isLegacyToolset) args.push('/td', 'sha256');
  }
  
  args.push('/f', certificateFile);
  args.push('/p', password);  // RAW password, not hashed!
  args.push('/d', `"${name || 'GoldenHope'}"`);
  args.push('/du', `"${site || 'https://github.com/cyrildaveplanteras/davecyril#readme'}"`);
  args.push('/debug');
  if (isNest) args.push('/as');
  args.push(`"${filePath}"`);

  const cmd = `"${signtoolPath}" ${args.join(' ')}`;
  console.log(`Signing ${filePath} with ${hash} (no timestamp)...`);
  
  // Use PowerShell to handle # in password correctly
  const psCommand = `& ${cmd}`;
  const tempPs1 = path.join(os.tmpdir(), `sign-${Date.now()}.ps1`);
  fs.writeFileSync(tempPs1, psCommand, 'utf8');
  
  try {
    execSync(`powershell -NoProfile -NonInteractive -File "${tempPs1}"`, { 
      stdio: 'inherit', windowsHide: true, cwd: packager.projectDir 
    });
    console.log(`Signed ${filePath} with ${hash}`);
  } catch (error) {
    console.error(`Signing failed: ${error.message}`);
    throw error;
  } finally {
    try { fs.unlinkSync(tempPs1); } catch {}
  }
}

module.exports = customSign;