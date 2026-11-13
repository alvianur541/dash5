const { resolveQuestion, isPartsQuery, suite } = require('./helpers.cjs');

const H = (...u) => u.flatMap((c, i) => [{ id: `u${i}`, role: 'user', content: c, timestamp: i * 2 }, { id: `a${i}`, role: 'assistant', content: 'ok', timestamp: i * 2 + 1 }]);

module.exports = async function () {
  const { t, done } = suite('keluhan baru sesudah tanya harga tidak ikut jalur parts');

  const swing = resolveQuestion('unit tidak mau swing', H('cek harga bucket'), 'ZX200-5G');
  t(!isPartsQuery(swing.text) && !/harga|bucket/i.test(swing.text), 'kasus nyata 13 Nov: "cek harga bucket" → "unit tidak mau swing" dicari sebagai keluhan');

  const campur = resolveQuestion('travel kiri lambat', H('pressure pompa 1 normal', 'harga seal kit center joint'), 'ZX200-5G');
  t(campur.text.includes('pressure pompa 1 normal') && !/harga/i.test(campur.text), 'konteks teknis sebelumnya tetap ikut, hanya tanya harga yang dilepas');

  const susulan = resolveQuestion('yang kanan berapa', H('harga filter udara luar'), 'ZX48U-5A');
  t(isPartsQuery(susulan.text), 'lanjutan tanya harga (bukan keluhan) tetap mewarisi niat harga');

  const hargaKeluhan = resolveQuestion('harga pompa yang bocor', H('cek harga bucket'), 'ZX200-5G');
  t(isPartsQuery(hargaKeluhan.text), 'pesan yang sendirinya minta harga tetap jalur parts');
  return done();
};
