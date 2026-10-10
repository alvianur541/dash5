const { bersihkanPromoLama, PROMO_KATEGORI, PROMO_KATEGORI_LAMA, suite } = require('./helpers.cjs');

// Promo Q2 (expired 30 Sep) stays searchable for PN discovery; its prices must never reach an answer.
const Q2 = [
  'Section: PROMO Q2 FY2026 - HITACHI SPECIAL PARTS (Bucket, Pin, G.E.T.)',
  'Model: ZX200-5G',
  'Kategori: PROMO Q2 FY2026',
  'Document: PROMO_Q2.3_FY2026 (Hitachi Astrea Parts Promo Q2 FY2026 + Add Item)',
  '',
  'Periode Promo  : 15 Juli 2026 - 30 September 2026',
  'Syarat         : Harga belum termasuk PPN. Pemesanan harus diinvoice dalam periode promo.',
  '',
  '  Part Number            | Description                                  |      Harga Normal |  Disc |       Harga Promo',
  '  3088577PS              | BUCKET,PIN                                   |        Rp 4.272.900 |   20% |        Rp 3.418.320',
  '  XP00000001PS           | KIT;O-RING                                   |        Rp 4.004.851 |   20% |        Rp 3.203.881  [New Item]',
].join('\n');

module.exports = async () => {
  const { t, done } = suite('promo periode lalu: PN dicari, harga tidak ikut');
  t(PROMO_KATEGORI_LAMA.includes('PROMO Q2 FY2026') && !PROMO_KATEGORI_LAMA.includes(PROMO_KATEGORI), 'Q2 terdaftar sebagai periode lama, Q3 tetap aktif');

  const [lama] = bersihkanPromoLama([{ content: Q2, metadata: { Kategori: 'PROMO Q2 FY2026' } }]);
  t(!/Rp\s?\d|%|Periode Promo|Syarat|Document:|Astrea/i.test(lama.content), `harga, diskon & syarat Q2 hilang (${(lama.content.match(/.*(Rp|%|Periode|Syarat|Document).*/g) || []).join(' / ')})`);
  t(/3088577PS\s+\| BUCKET,PIN/.test(lama.content) && /XP00000001PS\s+\| KIT;O-RING/.test(lama.content), 'PN + nama part tetap ada untuk pencarian');
  t(!/PROMO Q\d/.test(lama.content) && /DAFTAR PARTS/.test(lama.content), 'label tidak lagi mengaku promo');

  const aktif = { content: Q2.replace(/Q2/g, 'Q3'), metadata: { Kategori: PROMO_KATEGORI } };
  const [sama] = bersihkanPromoLama([aktif]);
  t(sama.content === aktif.content && /Rp 3\.418\.320/.test(sama.content), 'chunk promo aktif tidak disentuh (harga promo tetap)');
  return done();
};
