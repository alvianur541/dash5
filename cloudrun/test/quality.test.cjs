const { scrubLeaks, stripMeasuredValues, stripModelFromQuery, isCasualExact, suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('quality: leak scrub, measured-value strip, casual exact');

  { const leaked = '[DATA MANUAL TERSEDIA]\nDocument: Troubleshooting Manual - ZW140\nSection: Operational Troubleshooting\n\n1. **Prinsip Kerja**\n   - FNR switch mengirim sinyal.';
    const r = scrubLeaks(leaked);
    t(!r.includes('[DATA MANUAL') && !r.includes('Document:') && !r.includes('Section: Operational'), 'leak: label + Document/Section header removed');
    t(r.startsWith('1. **Prinsip Kerja**'), `leak: body preserved from first real line (${JSON.stringify(r.slice(0, 25))})`); }

  { const clean = 'Tegangan `15 V` ke solenoid Forward drop.\n\n*(Troubleshooting Manual — Section: HST Control)*';
    t(scrubLeaks(clean) === clean, 'leak: clean text with citation "Section:" untouched'); }

  { const mid = 'Jawaban normal.\n\n[CONFIDENCE: MEDIUM — data relevan]\nlanjut.';
    t(!scrubLeaks(mid).includes('[CONFIDENCE'), 'leak: mid-text CONFIDENCE label removed'); }

  t(stripMeasuredValues('voltage yg masuk ke solenoid forward hanya 5 volt') === 'voltage yg masuk ke solenoid forward hanya', 'measured: "5 volt" stripped');
  t(stripMeasuredValues('tekanan charge pump 2.5 MPa normal?') === 'tekanan charge pump normal?', 'measured: "2.5 MPa" stripped');
  t(stripMeasuredValues('output reverse 27volt forward 15volt') === 'output reverse forward', 'measured: "27volt"/"15volt" stripped');
  t(stripMeasuredValues('parts 2000 jam') === 'parts 2000 jam', 'measured: interval-only query kept (would collapse to 1 word)');
  t(stripMeasuredValues('fault code 11006-2') === 'fault code 11006-2', 'measured: fault code untouched');
  t(stripModelFromQuery('ZX200-5G berat travel device 310 kg') === 'berat travel device', 'measured: via stripModelFromQuery');

  for (const s of ['tets', 'Test', 'cek cek', 'Halo halo', 'coba']) t(isCasualExact(s), `casual: "${s}" deterministic`);
  for (const s of ['test hst pump', 'cek tekanan', 'coba jelaskan fnr']) t(!isCasualExact(s), `casual: "${s}" NOT casual`);

  return done();
};
