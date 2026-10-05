const { lengkapiHarga, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Alvian 5 Okt (nepple grease adjuster): tabel jawaban berisi "Ketik PN untuk cek" padahal 2 dari 3 PN ada di situs.
// Audit 2-5 Okt: 66 dari 79 baris seperti itu sebenarnya punya harga. Jaring pengaman sesudah jawaban selesai.
const WEB = { YA00020592: [{ pn: 'YA00020592', nama: 'VALVE', harga: 'Rp 942.464' }], YA00026375: [{ pn: 'YA00026375', nama: 'VALVE', harga: 'Rp 900.827' }], 4724585: [] };
const JAWAB = 'Untuk nipple grease adjuster:\n\n| Part Number | Nama Part | Harga |\n| :--- | :--- | :--- |\n| `4724585` | VALVE | Ketik PN untuk cek |\n| `YA00020592` | VALVE | Ketik PN untuk cek |\n| `YA00026375` | VALVE | Ketik PN untuk cek |\n\nSumber harga: Hexindoparts.com\n\nKetik salah satu part number di atas kalau mau dicek harganya.';

module.exports = async () => {
  const { t, done } = suite('harga susulan: baris "Ketik PN untuk cek" diisi sesudah jawaban');
  resetHargaWebCache();
  const dicek = [];
  const { d } = mockDeps([[]], { webPrice: async pn => { dicek.push(pn); if (pn === 'BOOM') throw new Error('500'); return WEB[pn] ?? []; } });
  const out = await runWithDeps(d, () => lengkapiHarga(JAWAB));
  t(out.includes('| `YA00020592` | VALVE | Rp 942.464 |') && out.includes('Rp 900.827'), 'PN yang ada di situs → harga terisi');
  t(out.includes('| `4724585` | VALVE | Belum tersedia |'), 'PN tak terdaftar → Belum tersedia');
  t(!/Ketik PN untuk cek/.test(out) && !/Ketik salah satu part number/.test(out), 'tak ada sisa "Ketik PN", tawaran cek ikut dibuang');
  t(out.includes('Sumber harga: Hexindoparts.com'), 'catatan sumber tetap');
  const biasa = 'Tekanan pilot 3,9 MPa.';
  t(await runWithDeps(d, () => lengkapiHarga(biasa)) === biasa && dicek.length === 3, 'jawaban tanpa tabel harga tidak disentuh');
  return done();
};
