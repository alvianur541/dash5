const { lengkapiHarga, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Regresi 10 Okt (paket 2000 jam ZX48U-5A): kolom Subtotal qty>1 ditimpa harga satuan web (591.600, 1.861.800).
const JAWAB = [
  '| Part Number | Nama Part | Qty | Harga Satuan (Promo) | Subtotal |',
  '| :--- | :--- | :---: | :--- | :--- |',
  '| `4665128` | Engine Oil Filter | 1 | Rp 344.819 | Rp 344.819 |',
  '| `HTCDH1C` | Eng Oil Can | 2 | Rp 502.860 | Rp 591.600 |',
  '| `HTC46TPP` | Hyd Oil Pail | 4 | Rp 1.582.530 | Rp 1.861.800 |',
  '| **Total** | | | | **Rp 9.999.999** |',
].join('\n');

module.exports = async () => {
  const { t, done } = suite('subtotal = harga satuan x qty, total = jumlah subtotal');
  resetHargaWebCache();
  const web = { '4665128': 'Rp 431.024', HTCDH1C: 'Rp 591.600', HTC46TPP: 'Rp 1.861.800' };
  const { d } = mockDeps([[]], { webPrice: async pn => web[pn] ? [{ pn, nama: 'X', harga: web[pn] }] : [] });
  const promo = new Map([['4665128', new Set(['431024', '344819'])], ['HTCDH1C', new Set(['591600', '502860'])], ['HTC46TPP', new Set(['1861800', '1582530'])]]);
  const out = await runWithDeps(d, () => lengkapiHarga(JAWAB, promo));
  const L = out.split('\n');
  t(/Rp 502\.860 \|\s*Rp 1\.005\.720/.test(L[3]), `qty 2 → 1.005.720 (${L[3]})`);
  t(/Rp 1\.582\.530 \|\s*Rp 6\.330\.120/.test(L[4]), `qty 4 → 6.330.120 (${L[4]})`);
  t(/Rp 344\.819 \|\s*Rp 344\.819/.test(L[2]), 'qty 1 tetap');
  // 344.819 + 1.005.720 + 6.330.120 = 7.680.659
  t(L[5].includes('Rp 7.680.659') && !out.includes('9.999.999') && !out.includes('Gagal'), `total = jumlah subtotal (${L[5]})`);
  return done();
};
