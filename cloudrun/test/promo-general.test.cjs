const { isPromoPriceLine, exactPartRows, searchPartsCatalog, resolvePartsQuery, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Format BARU (tanpa label "Promo:") — persis seperti file promo Q2.3 FY2026.
const BARU = '  HTCDH1P                | HTC ENG OIL DH1 PAIL                         |      Rp 2.337.200 |   15% |      Rp 1.986.620';
const LAMA = '  HTCDH1P                | HTC ENG OIL DH1 PAIL                        | Normal: Rp 2.337.200      | Disc: 15%  | Promo: Rp 1.986.620';

const ZX200_LUB = { metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' }, content:
  `Section: PROMO Q2 FY2026 - LUBRICANT (Engine Oil, Hydraulic Oil, Gear Oil, Grease)\nPeriode Promo  : 15 Juli 2026 - 30 September 2026\n${BARU}` };
const ZX200_FILTER = { metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' }, content:
  'Section: PROMO Q2 FY2026 - FILTER PARTS (Engine Oil, Fuel, Air Cleaner)\n  4658521                | Engine Oil Filter                            |        Rp 645.593 |   20% |        Rp 516.474' };
const GEN_LUB = { metadata: { Model: 'GENERAL', Kategori: 'PROMO Q2 FY2026' }, content:
  `Section: PROMO Q2 FY2026 - LUBRICANT (Engine Oil, Hydraulic Oil, Gear Oil, Grease) — Berlaku Semua Model\n${BARU}` };
const GEN_TIRE = { metadata: { Model: 'GENERAL', Kategori: 'PROMO Q2 FY2026' }, content:
  'Section: PROMO Q2 FY2026 - TIRE PARTS (Truck & Wheel Loader)\n  12.0R24-20-T101KZC     | TIRE;12.00R24-20PR                           |      Rp 6.714.000 | Rp 5.036.000  [FOTON Auman 8x4]' };
const GEN_UC = { metadata: { Model: 'GENERAL', Kategori: 'PROMO Q2 FY2026' }, content:
  'Section: PROMO Q2 FY2026 - UNDERCARRIAGE PARTS — Excavator 25-35 Ton (ZX250 - ZX350)\n  9248209HPA             | TRACK-LINK-ASSY                              |     Rp 55.733.800 |   25% |     Rp 41.800.350  [Unit: ZX330-5G, ZX350H-5G]' };
const GEN_WM = { metadata: { Model: 'GENERAL', Kategori: 'WORKSHOP MANUAL' }, content:
  'Section: apa pun\n  9248209HPA             | bukan promo                                  |      Rp 1.000 |   1% |      Rp 900' };

// Fake PostgREST: balas baris sesuai filter Model yang diminta.
function fakeSupabase(perModel, rpcRows = () => []) {
  const buat = () => {
    let model = null;
    const q = {
      select() { return q; },
      contains(_col, f) { model = f.Model; return q; },
      ilike() { return q; }, filter() { return q; }, limit() { return q; },
      then(resolve) { return Promise.resolve({ data: perModel[model] ?? [], error: null }).then(resolve); },
    };
    return q;
  };
  return {
    from: () => buat(),
    rpc: (_name, args) => Promise.resolve({ data: rpcRows(args), error: null }),
  };
}

const CPM = { metadata: { Model: 'ZX200-5G', Kategori: 'CPM' }, content:
  `Section: CPM MAINTENANCE SCHEDULE\nModel: ZX200-5G\nKategori: CPM\n\n  No   Part Description                           Part Number              500hr  1000hr  2000hr\n  1    Engine Oil Filter                          4658521                      1       1       1\n  2    Engine Oil                                 HTCDH1P                      1       1       1\n` };

module.exports = async () => {
  const { t, done } = suite('promo: format harga baru + data lintas-unit (GENERAL)');

  t(isPromoPriceLine(BARU) && isPromoPriceLine(LAMA), 'baris harga dikenali di format BARU dan LAMA');
  t(!isPromoPriceLine('  Part Number            | Description                 |      Harga Normal |  Disc |       Harga Promo'),
    'baris header tabel bukan baris harga');
  t(!isPromoPriceLine('  1    Engine Oil Filter    4658521    1   1   1') && !isPromoPriceLine('Periode Promo  : 15 Juli 2026 - 30 September 2026'),
    'baris CPM & baris periode bukan baris harga');

  {
    const { d } = mockDeps([[]], { supabase: fakeSupabase({ 'ZX200-5G': [ZX200_LUB], GENERAL: [GEN_UC, GEN_WM] }) });
    const rows = await runWithDeps(d, () => exactPartRows('9248209HPA', 'ZX200-5G'));
    t(rows.length === 1 && rows[0].content.includes('9248209HPA'), 'PN yang hanya ada di daftar lintas-unit tetap ketemu');
    t(rows[0].content.startsWith('[PROMO LINTAS-UNIT'), 'baris lintas-unit diberi penanda');
    t(!rows[0].content.includes('bukan promo'), 'kategori non-promo di GENERAL tidak ikut');
  }
  {
    const { d } = mockDeps([[]], { supabase: fakeSupabase({ 'ZX200-5G': [ZX200_LUB], GENERAL: [GEN_LUB] }) });
    const rows = await runWithDeps(d, () => exactPartRows('HTCDH1P', 'ZX200-5G'));
    t(rows.length === 2 && !rows[0].content.startsWith('[PROMO LINTAS-UNIT'), 'baris unit sendiri tetap di depan & tanpa penanda');
  }
  {
    const rpc = args => (args.filter.Kategori === 'PROMO Q2 FY2026'
      ? (args.filter.Model === 'GENERAL'
        ? [{ ...GEN_TIRE, similarity: 0.5 }, { ...GEN_LUB, similarity: 0.9 }]
        : [{ ...ZX200_FILTER, similarity: 0.8 }, { ...ZX200_LUB, similarity: 0.7 }])
      : []);
    const { d } = mockDeps([[]], { supabase: fakeSupabase({}, rpc), embed: async () => [0.1] });
    const r = await runWithDeps(d, () => searchPartsCatalog('harga oli mesin', 'ZX200-5G'));
    const iFilter = r.content.indexOf('FILTER PARTS');
    const iTire   = r.content.indexOf('TIRE PARTS');
    t(r.hasResults && iFilter >= 0 && iTire > iFilter, 'data lintas-unit ikut tapi selalu di BELAKANG data unit sendiri');
    t(r.content.split('[PROMO LINTAS-UNIT').length === 2, 'hanya blok lintas-unit yang diberi penanda, sekali');
    t(r.content.split('Berlaku Semua Model').length === 1, 'LUBRICANT versi GENERAL dibuang karena unit sendiri sudah punya');
  }
  {
    const rpc = args => (args.filter.Kategori === 'CPM' ? [{ ...CPM, similarity: 0.9 }]
      : args.filter.Kategori === 'PROMO Q2 FY2026' && args.filter.Model === 'ZX200-5G'
        ? [{ ...ZX200_LUB, similarity: 0.8 }, { ...ZX200_FILTER, similarity: 0.7 }] : []);
    const { d } = mockDeps([[]], { supabase: fakeSupabase({}, rpc), embed: async () => [0.1] });
    const r = await runWithDeps(d, () => resolvePartsQuery('Pket 2000', [], 'ZX200-5G'));
    t(r.type === 'rag_found' && /HARGA PROMO/.test(r.content), 'jalur paket 2000 tetap menyisipkan blok harga promo');
    t(r.content.includes('Rp 1.986.620') && r.content.includes('Rp 516.474'),
      'HARGA OLI & FILTER format BARU ikut (regresi 28 Agu / 14 Sep tidak kembali)');
    t(/Periode Promo/.test(r.content), 'baris periode ikut disertakan');
  }

  return done();
};
