require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const dump = require('./mysql-schema-dump.json');

// Case-sensitive identifiers that must be double-quoted in PostgreSQL to preserve
// their exact casing (MySQL was case-preserving on Windows; PG folds unquoted names).
const idents = new Set();
for (const c of dump.columns) {
  if (/[A-Z]/.test(c.name)) idents.add(c.name);
}
// Extra uppercase aliases used by the app's SQL (not real columns).
const ALIASES = ['BarangayCoordinator', 'SalesCoordinator', 'BranchName', 'BranchAddress', 'MemberName', 'MunicipalityName', 'ProvinceName', 'TotalDepositNew'];
for (const a of ALIASES) idents.add(a);

const list = [...idents].sort();
const moduleBody = `// AUTO-GENERATED from scripts/mysql-schema-dump.json by scripts/generate-pg-schema.js
// Case-sensitive identifiers that must be double-quoted when used in SQL.
module.exports = new Set(${JSON.stringify(list)});
`;
const outPath = path.join(__dirname, '..', 'src', 'js', 'pg-identifiers.js');
fs.writeFileSync(outPath, moduleBody);
console.log(`Generated ${outPath} with ${list.length} identifiers`);