const fs = require('fs');
const path = require('path');

// Tests assert 3.7 behavior; set here (not in package.json) so Windows cmd can run them too.
process.env.VERTEX_MODEL ||= 'gemini-3.7-flash';
process.env.GOOGLE_CLOUD_PROJECT ||= 'test-project';

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
