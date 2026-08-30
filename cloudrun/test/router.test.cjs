const { detectFaultCodeInQuery, extractPartNumber, isPartsQuery, suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('router: fault-code detection & part-number extraction');

  // Real formats per model family (see CLAUDE.md "Format fault code suffix").
  const faultYes = [
    ['11006-2', '11006-2'],                 // ZX200 (1-digit suffix, as stored)
    ['13006-02', '13006-02'],               // ZX200 monitor shows leading zero
    ['11302-4', '11302-4'],                 // ZX138
    ['ENG:00436-04', 'ENG:00436-04'],       // Yanmar 2-digit suffix
    ['ENG:0001D-02', 'ENG:0001D-02'],       // hex letter inside (Yanmar)
    ['ENG:0006E-00', 'ENG:0006E-00'],
    ['fault engine eng:0001d-02 muncul, maksudnya apa', 'eng:0001d-02'],
    ['W:1208', 'W:1208'],
    ['CA2769', 'CA2769'],
    ['524286', '524286'],                   // ZW140 6-digit
    ['fault 11302-4 kadang muncul pas boom raise', '11302-4'],
    ['kode 11006-2 muncul kadang-kadang, unit jadi lambat', '11006-2'],
    ['di menu informasi 20101-02', '20101-02'],
  ];
  for (const [q, code] of faultYes) {
    const r = detectFaultCodeInQuery(q);
    t(r.isFaultCode && r.faultQuery.toUpperCase().includes(code.toUpperCase()), `fault code: "${q}" -> ${r.faultQuery}`);
  }
  const faultNo = ['blade naik turun lambat', 'cafe', 'CAFE-01', 'dead-1', 'berat operating 20000 kg', 'service 2000 jam',
    'berapa kapasitas oli mesin', 'swing lambat', 'PN YB60000068', 'valve clearance 4tnv88'];
  for (const q of faultNo) t(!detectFaultCodeInQuery(q).isFaultCode, `not a fault code: "${q}"`);

  // Part numbers across catalogs.
  const pnYes = [
    ['PN YB60000068', 'YB60000068'],          // Hitachi body
    ['YNM129150-14200', 'YNM129150-14200'],   // Yanmar engine
    ['harga 1153004210', '1153004210'],       // Isuzu pure 10-digit
    ['YZ0108060850', 'YZ0108060850'],         // KCM Isuzu
    ['34820-66720', '34820-66720'],           // KCM body 5-5
    ['263E7-17091 ada stok?', '263E7-17091'], // ZW140 body
  ];
  for (const [q, pn] of pnYes) t(extractPartNumber(q) === pn, `PN: "${q}" -> ${extractPartNumber(q)}`);
  for (const q of ['berapa kapasitas oli mesin', 'swing lambat', 'service 2000 jam'])
    t(extractPartNumber(q) === null, `no PN in "${q}"`);

  // Deterministic parts routing only fires on explicit keywords / PN / "harga <komponen>";
  // phrasing like "cek part seal kit lift cylinder" is left to analyzeIntent on purpose.
  for (const q of ['part number seal dust swing bearing', 'berapa harga roller bawah', 'harga seal kit swing', 'harga promo idler', 'PN YB60000068'])
    t(isPartsQuery(q), `parts query: "${q}"`);
  for (const q of ['swing lambat', 'berapa kapasitas oli mesin', 'cek part seal kit lift cylinder'])
    t(!isPartsQuery(q), `left to analyzeIntent: "${q}"`);

  return done();
};
