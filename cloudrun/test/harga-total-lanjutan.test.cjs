const { lengkapiHarga, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Regresi 10 Okt (sesi 2a35a5d9): "Hitung totalny" sesudah tabel paket 2000 jam -> tabel total tanpa PN,
// dulu semua sel jadi "Gagal dicek, kirim ulang" karena harga per PN ada di jawaban sebelumnya.
const SEBELUMNYA = [
  '| Part Number | Nama Part | Qty | Harga |',
  '| :--- | :--- | :--- | :--- |',
  '| `YA00058283` | Engine Oil Filter | 1 | Rp 607.437 |',
  '| `4616545` | Primary Fuel Filter | 2 | Rp 274.198 |',
  '| `HTCDH1C` | Eng Oil Can | 1 | Rp 502.860 |',
].join('\n');

const TOTAL = [
  '| Keterangan | Total Biaya |',
  '| :--- | :--- |',
  '| **Total Harga Normal** (Hexindoparts.com) | Rp 9.999.999 |',
  '| **Total Harga Promo** (Hemat diskon) | Rp 1.658.693 |',
].join('\n');

module.exports = async () => {
  const { t, done } = suite('tabel total lanjutan dihitung dari jawaban sebelumnya');
  resetHargaWebCache();
  const web = { YA00058283: 'Rp 759.296', '4616545': 'Rp 342.748', HTCDH1C: 'Rp 628.575' };
  const { d } = mockDeps([[]], { webPrice: async pn => web[pn] ? [{ pn, nama: 'X', harga: web[pn] }] : [] });
  const promo = new Map([['YA00058283', new Set(['759296', '607437'])], ['4616545', new Set(['342748', '274198'])], ['HTCDH1C', new Set(['628575', '502860'])]]);

  const out = await runWithDeps(d, () => lengkapiHarga(TOTAL, promo, SEBELUMNYA));
  // promo: 607.437 + 2x274.198 + 502.860 = 1.658.693; normal: 759.296 + 2x342.748 + 628.575 = 2.073.367
  t(out.includes('Rp 1.658.693'), `total promo benar dipertahankan (${out.split('\n')[3]})`);
  t(out.includes('Rp 2.073.367') && !out.includes('9.999.999'), `total normal salah dihitung ulang (${out.split('\n')[2]})`);
  t(!out.includes('Gagal dicek'), 'tidak ada "Gagal dicek" lagi');

  resetHargaWebCache();
  const tanpa = await runWithDeps(d, () => lengkapiHarga(TOTAL, new Map(), SEBELUMNYA));
  t(tanpa.includes('Rp 2.073.367') && /Promo[^\n]*Rp 1\.658\.693/.test(tanpa), `tanpa data promo: normal dari web, promo = harga tampil (${tanpa.split('\n').slice(2).join(' / ')})`);

  const sendiri = await runWithDeps(d, () => lengkapiHarga(TOTAL, promo, ''));
  t(sendiri.includes('Gagal dicek'), 'tanpa jawaban sebelumnya perilaku lama tetap (total tak terverifikasi)');
  return done();
};
