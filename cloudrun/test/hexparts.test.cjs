const { fetchHexParts, hargaWeb, blokHargaWeb, resetHargaWebCache, resolvePartsQuery, searchPhotoCodes, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Harga dari hexindoparts.com kalau daftar harga DB tidak punya (Alvian, 3 Okt). Bentuk JSON = respons asli situs.
const produk = (name, desc, amount) => ({ name, short_description: desc, price: { amount: `${amount}.0000` }, special_price: null });
const SITUS = {
  '1144003771': [produk('1144003771', 'TURBOCHARGER', 49587999), produk('1144003771PU', 'TURBOCHARGER', 53920759)],
  '4658521': [produk('4658521', 'FILTER;OIL', 658152), produk('4658521RCP', 'FILTER;OIL', 759296), produk('46585219', 'LAIN', 1)],
  'HTCDH1C': [produk('HTCDH1C', 'HAP ENG OIL DH 1 CAN', 591600)],
};

function fakeFetch(calls) {
  return async url => {
    const q = decodeURIComponent(url.split('query=')[1]);
    calls.push(q);
    if (q === 'BLOCKED') return { ok: true, headers: { get: () => 'text/html' }, json: async () => ({}) };
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ products: { data: SITUS[q] ?? [] } }) };
  };
}

function fakeSupabase(rows, rpcRows = () => []) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: (_n, args) => Promise.resolve({ data: rpcRows(args), error: null }) };
}

const web = calls => async pn => { calls.push(pn); return SITUS[pn] ? SITUS[pn].map(p => ({ pn: p.name, nama: p.short_description, harga: `Rp ${Number(p.price.amount.split('.')[0]).toLocaleString('id-ID')}` })).filter(p => p.pn === pn || /^[A-Z]{1,4}$/.test(p.pn.slice(pn.length))) : []; };

module.exports = async () => {
  const { t, done } = suite('harga hexindoparts.com: cadangan & sumber harga terkini');

  const asli = global.fetch;
  const calls = [];
  global.fetch = fakeFetch(calls);
  try {
    const turbo = await fetchHexParts('1144003771');
    t(turbo.length === 2 && turbo[0].harga === 'Rp 49.587.999' && turbo[1].pn === '1144003771PU', `PN persis + varian bersufiks, format Rupiah (${turbo.map(p => p.harga).join(', ')})`);
    const filter = await fetchHexParts('4658521');
    t(filter.map(p => p.pn).join(',') === '4658521,4658521RCP', 'PN lain yang kebetulan berawalan sama (46585219) ditolak');
    t((await fetchHexParts('ZZ999999')).length === 0, 'PN tak terdaftar → kosong, bukan tebakan');
    t((await fetchHexParts('BLOCKED')).length === 0, 'halaman blokir/HTML (Cloudflare) → kosong tanpa error');
  } finally { global.fetch = asli; }

  {
    resetHargaWebCache();
    const c = [];
    const { d } = mockDeps([[]], { webPrice: web(c) });
    const a = await runWithDeps(d, () => hargaWeb(['1144003771', '1144003771', 'zz9999']));
    const b = await runWithDeps(d, () => hargaWeb(['1144003771']));
    t(a.has('1144003771') && !a.has('ZZ9999') && b.has('1144003771'), 'hasil per PN; PN tak ketemu tidak ikut');
    t(c.length === 2, `PN kembar digabung & hasil di-cache (panggilan situs: ${c.length})`);
    const { d: tanpa } = mockDeps([[]]);
    t((await runWithDeps(tanpa, () => hargaWeb(['1144003771']))).size === 0, 'tanpa webPrice (uji/offline) → tidak ada panggilan web');
    t(/^\[HARGA HEXINDOPARTS\.COM/.test(blokHargaWeb(a)) && blokHargaWeb(new Map()) === '', 'blok berlabel sumber; kosong kalau tak ada hasil');
  }

  {
    resetHargaWebCache();
    const c = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([]), embed: async () => [0.1], webPrice: web(c) });
    const r = await runWithDeps(d, () => resolvePartsQuery('1144003771', [], 'ZX200-5G'));
    t(r.type === 'rag_found' && r.content.includes('Rp 49.587.999') && r.content.includes('belum terverifikasi'),
      'PN tak ada di katalog tapi ada di web → harga web + catatan belum terverifikasi untuk unit (bukan "PN tidak ada")');
    const { d: d2 } = mockDeps([[]], { supabase: fakeSupabase([]), embed: async () => [0.1], webPrice: async () => [] });
    const r2 = await runWithDeps(d2, () => resolvePartsQuery('9999999', [], 'ZX200-5G'));
    t(r2.type === 'rag_canned', 'tidak ada di katalog maupun web → template "PN tidak ada" tetap');
  }

  {
    resetHargaWebCache();
    const ROW = { metadata: { Model: 'ZX200-5G', Kategori: 'PARTS CATALOG' }, content: 'Section: ENGINE OIL FILTER\n  01 | 4658521 | FILTER;OIL | qty:1 | svc:S' };
    const { d } = mockDeps([[]], { supabase: fakeSupabase([ROW], () => [{ ...ROW, similarity: 0.9, match_type: 'exact_part_no' }]),
      embed: async () => [0.1], rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }), webPrice: web([]) });
    const r = await runWithDeps(d, () => resolvePartsQuery('harga 4658521', [], 'ZX200-5G'));
    t(r.type === 'rag_found' && r.content.startsWith('[HARGA HEXINDOPARTS.COM') && r.content.includes('svc:S'), 'PN ada di katalog → blok harga web di depan, data katalog tetap');
  }

  {
    resetHargaWebCache();
    const CPM = { metadata: { Model: 'ZX200-5G', Kategori: 'CPM' }, content:
      'Section: CPM MAINTENANCE SCHEDULE\nModel: ZX200-5G\nKategori: CPM\n\n  No   Part Description                           Part Number              500hr  1000hr  2000hr\n  1    Engine Oil Filter                          4658521                      1       1       1\n' };
    const { d } = mockDeps([[]], { supabase: fakeSupabase([], a => (a.filter.Kategori === 'CPM' ? [{ ...CPM, similarity: 0.9 }] : [])), embed: async () => [0.1], webPrice: web([]) });
    const r = await runWithDeps(d, () => resolvePartsQuery('Pket 2000', [], 'ZX200-5G'));
    t(r.type === 'rag_found' && r.content.includes('[HARGA HEXINDOPARTS.COM') && r.content.includes('Rp 658.152'), 'paket service: PN Periodic Maintenance dicarikan harganya di web');
  }

  {
    resetHargaWebCache();
    const { d } = mockDeps([[]], { supabase: fakeSupabase([]), webPrice: web([]) });
    const r = await runWithDeps(d, () => searchPhotoCodes(['HTCDH1C', 'ZZ12345'], 'ZX200-5G', () => {}));
    t(r && r.content.includes('Rp 591.600') && /ZZ12345 — sebut "belum ketemu/.test(r.content) && !/HTCDH1C(, | —)/.test(r.content.split('[KODE BELUM KETEMU')[1] ?? ''),
      'foto: kode yang ada di web tidak lagi disebut "belum ketemu"');
  }

  return done();
};
