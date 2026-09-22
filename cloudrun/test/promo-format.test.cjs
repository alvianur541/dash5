const { isPromoPriceLine, docKategoriFor, resolvePartsQuery, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Format harga file promo Q2.3 (tanpa label "Promo:") vs format lama.
const BARU = '  HTCDH1P                | HTC ENG OIL DH1 PAIL                         |      Rp 2.337.200 |   15% |      Rp 1.986.620';
const LAMA = '  HTCDH1P                | HTC ENG OIL DH1 PAIL                        | Normal: Rp 2.337.200      | Disc: 15%  | Promo: Rp 1.986.620';

const LUB = { metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' }, content:
  `Section: PROMO Q2 FY2026 - LUBRICANT (Engine Oil, Hydraulic Oil, Gear Oil, Grease)\nPeriode Promo  : 15 Juli 2026 - 30 September 2026\n${BARU}` };
const FILTER = { metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' }, content:
  'Section: PROMO Q2 FY2026 - FILTER PARTS (Engine Oil, Fuel, Air Cleaner)\n  4658521                | Engine Oil Filter                            |        Rp 645.593 |   20% |        Rp 516.474' };
const CPM = { metadata: { Model: 'ZX200-5G', Kategori: 'CPM' }, content:
  'Section: CPM MAINTENANCE SCHEDULE\nModel: ZX200-5G\nKategori: CPM\n\n  No   Part Description                           Part Number              500hr  1000hr  2000hr\n  1    Engine Oil Filter                          4658521                      1       1       1\n  2    Engine Oil                                 HTCDH1P                      1       1       1\n' };

function fakeSupabase(rpcRows) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
  };
  return { from: () => q, rpc: (_n, args) => Promise.resolve({ data: rpcRows(args), error: null }) };
}

module.exports = async () => {
  const { t, done } = suite('promo: format harga baru + routing dokumen baru');

  t(isPromoPriceLine(BARU) && isPromoPriceLine(LAMA), 'baris harga dikenali di format BARU dan LAMA');
  t(!isPromoPriceLine('  Part Number            | Description                 |      Harga Normal |  Disc |       Harga Promo'),
    'baris header tabel bukan baris harga');
  t(!isPromoPriceLine('  1    Engine Oil Filter    4658521    1   1   1') && !isPromoPriceLine('Periode Promo  : 15 Juli 2026 - 30 September 2026'),
    'baris CPM & baris periode bukan baris harga');

  {
    const rpc = args => (args.filter.Kategori === 'CPM' ? [{ ...CPM, similarity: 0.9 }]
      : args.filter.Kategori === 'PROMO Q2 FY2026' && args.filter.Model === 'ZX200-5G'
        ? [{ ...LUB, similarity: 0.8 }, { ...FILTER, similarity: 0.7 }] : []);
    const { d } = mockDeps([[]], { supabase: fakeSupabase(rpc), embed: async () => [0.1] });
    const r = await runWithDeps(d, () => resolvePartsQuery('Pket 2000', [], 'ZX200-5G'));
    t(r.type === 'rag_found' && /HARGA PROMO/.test(r.content), 'jalur paket 2000 menyisipkan blok harga promo');
    t(r.content.includes('Rp 1.986.620') && r.content.includes('Rp 516.474'),
      'HARGA OLI & FILTER format BARU ikut (regresi 28 Agu / 14 Sep tidak kembali)');
    t(/Periode Promo/.test(r.content), 'baris periode ikut disertakan');
  }

  // Data baru 22 Sep: FUEL CONSUMPTION (4 unit) + TECHNICAL NEWS ZX200-5G
  const bbm = ['berapa konsumsi bahan bakar unit ini', 'pemakaian solar per jam berapa', 'fuel consumption ZX200', 'berapa liter per jam'];
  t(bbm.every(q => docKategoriFor(q, 'ZX200-5G')?.kategori === 'FUEL CONSUMPTION'), 'pertanyaan konsumsi BBM diarahkan ke FUEL CONSUMPTION');
  t(docKategoriFor('berapa konsumsi bahan bakar', 'ZX200-5G')?.available === true, 'ZX200-5G: dokumen konsumsi BBM terdaftar ADA');
  t(docKategoriFor('konsumsi solar', 'ZW140')?.available === false, 'ZW140: belum punya data konsumsi BBM — ditandai tidak ada, bukan dikarang');
  t(docKategoriFor('cek technical news', 'ZX200-5G')?.available === true, 'ZX200-5G sekarang punya TECHNICAL NEWS (10 chunk baru)');
  t(docKategoriFor('harga filter', 'ZX200-5G') === null, 'pertanyaan biasa tidak ikut terpetakan ke dokumen');

  return done();
};
