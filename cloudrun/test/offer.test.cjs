const { extractLastOffer, resolveAffirmative, suite } = require('./helpers.cjs');

const H = (aiText) => [
  { id: '1', role: 'user', content: 'kapasitas oli hidrolik', timestamp: 1 },
  { id: '2', role: 'assistant', content: aiText, timestamp: 2 },
];

module.exports = async function () {
  const { t, done } = suite('offer: affirmative reply resolves to previous AI offer');

  const long = 'Kapasitas hydraulic tank `135.0 L`.\n\nCatatan: kalau kosong total `201 L`.\n\nMau sekalian cek part number suction strainer atau return filter-nya?';
  t(extractLastOffer(H(long)) === 'part number suction strainer dan return filter', `strainer/filter → ${extractLastOffer(H(long))}`);
  t(extractLastOffer(H('Berat `310 kg`.\n\nMau saya tampilkan torque baut mounting-nya sekalian?')) === 'torque baut mounting', 'torque baut mounting');
  t(extractLastOffer(H('Data ok.\n\nMau kita cek relief pressure spec-nya sekalian?')) === 'relief pressure spec', 'relief pressure spec');
  t(extractLastOffer(H('Kalau ada P-code dari MPDr, kirim — saya cari prosedur di Engine Manual.')) === null, 'no question → null');
  t(extractLastOffer(H('Ada 3 PN terkait di section yang sama, mau saya tampilkan sekalian?')) === 'Ada 3 PN terkait di section yang sama', `mid-sentence offer → ${extractLastOffer(H('Ada 3 PN terkait di section yang sama, mau saya tampilkan sekalian?'))}`);

  for (const a of ['Mau', 'ya', 'iya', 'boleh dong', 'oke', 'Lanjut', 'sekalian', 'Ya, mau']) {
    t(resolveAffirmative(a, H(long)) !== null, `affirmative "${a}" resolves`);
  }
  for (const q of ['mau tanya torque', 'ya tapi berapa tekanannya', 'part number swing motor', 'oke makasih ya bro sip']) {
    t(resolveAffirmative(q, H(long)) === null, `not bare affirmative: "${q}"`);
  }
  t(resolveAffirmative('mau', []) === null, 'no history → null');
  return done();
};
