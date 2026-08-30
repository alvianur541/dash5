// Runs every *.test.cjs in this folder against the freshly built test bundle.
const fs = require('fs');
const path = require('path');

(async () => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.cjs')).sort();
  let allOk = true;
  for (const f of files) {
    const ok = await require(path.join(__dirname, f))();
    if (!ok) allOk = false;
  }
  console.log(allOk ? 'SEMUA SUITE LOLOS' : 'ADA SUITE GAGAL');
  process.exit(allOk ? 0 : 1);
})();
