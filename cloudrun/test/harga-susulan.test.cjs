const { lengkapiHarga, tanpaHargaDb, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Alvian 5 Okt (nepple grease adjuster): tabel jawaban berisi "Ketik PN untuk cek" padahal 2 dari 3 PN ada di situs.
// Audit 2-5 Okt: 66 dari 79 baris seperti itu sebenarnya punya harga. Jaring pengaman sesudah jawaban selesai.
const WEB = { 8970728231: [{ pn: '8970728231', nama: 'SEAL', harga: 'Rp 1.108.655' }], YA00020592: [{ pn: 'YA00020592', nama: 'VALVE', harga: 'Rp 942.464' }], YA00026375: [{ pn: 'YA00026375', nama: 'VALVE', harga: 'Rp 900.827' }], 4724585: [] };
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
  t(await runWithDeps(d, () => lengkapiHarga(biasa)) === biasa, 'jawaban tanpa tabel harga tidak disentuh');
  {
    // Alvian 5 Okt: HAPDH1-CI4 tidak ada di situs, tapi harga promo lama lolos dari DB karena tag "[New Item]".
    const baris = '  HAPDH1-CI4             | HAP ENG OIL CI4. DRUM                        |     Rp 16.458.600 |   20% |     Rp 13.166.880  [New Item]';
    const b = tanpaHargaDb(baris);
    t(!/Rp/.test(b) && b.includes('HAPDH1-CI4'), `harga DB bertag [New Item] ikut dibuang ("${b.trim()}")`);
    t(tanpaHargaDb('  YB01 | KIT;SEAL | Rp 1.000 | 10% | Rp 900  [Main Pump]').includes('[Main Pump]'), 'tag komponen tetap ada');
    const ngarang = '| Part Number | Nama Part | Harga |\n|---|---|---|\n| `HAPDH1-CI4` | HAP ENG OIL CI4. DRUM | Rp 13.166.880 |\n| `YA00020592` | VALVE | Rp 1.000.000 |\n| `YA00026375` | VALVE | Rp 900.827 |';
    const o2 = await runWithDeps(d, () => lengkapiHarga(ngarang));
    t(o2.includes('| `HAPDH1-CI4` | HAP ENG OIL CI4. DRUM | Belum tersedia |'), 'harga yang tak ada di situs → Belum tersedia');
    t(o2.includes('| `YA00020592` | VALVE | Rp 942.464 |'), 'harga beda dari situs → dikoreksi ke harga situs');
    t(o2.includes('| `YA00026375` | VALVE | Rp 900.827 |'), 'harga yang sudah benar tidak diubah');
  }
  {
    // Alvian 5 Okt: tabel sudah terisi harga, tapi kalimat di bawahnya masih bilang harga belum sempat ditarik.
    const j = 'Ketemu:\n\n| Part Number | Nama Part | Qty | Harga |\n| :--- | :--- | :---: | :--- |\n| `8970728231` | SEAL; OIL,CR/SHF,RR | 1 | Ketik PN untuk cek |\n\nSumber harga: Hexindoparts.com\n\nPart number-nya `8970728231` (posisi item 175 di flywheel housing), tapi harga online-nya belum sempat ditarik di pencarian ini. Mau sekalian saya carikan part number gasket atau komponen lain di sekitar flywheel housing-nya?';
    const o = await runWithDeps(d, () => lengkapiHarga(j));
    t(o.includes('Rp 1.108.655') && !/belum sempat ditarik/.test(o), 'kalimat "harga belum sempat ditarik" dibuang setelah harga terisi');
    t(o.includes('Mau sekalian saya carikan part number gasket'), 'kalimat tawaran lain tetap ada');
  }
  {
    const { pilihPnHarga } = require('./helpers.cjs');
    const c = 'Section: 025 - TIMING GEAR CASE AND FLYWHEEL HOUSING\nParts List:\n       175 | 8970728231     | SEAL; OIL,CR/SHF,RR                    | qty:1\n       176 | 8970728240     | SEAL; OIL,CR/SHF,FR                    | qty:1\n       010 | 1111111111     | GASKET; FLYWHEEL HOUSING               | qty:1';
    const r = pilihPnHarga(c, ['Harga seal cranksfat belakang brpa']);
    t(r[0] === '8970728231', `"seal cranksfat belakang" → SEAL; OIL,CR/SHF,RR dipilih pertama (${r.join(',')})`);
  }
  return done();
};
