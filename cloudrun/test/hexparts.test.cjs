const { fetchHexParts, hargaWeb, blokHargaWeb, resetHargaWebCache, pilihPnHarga, MINTA_HARGA_RE, resolvePartsQuery, searchPhotoCodes, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Harga dari hexindoparts.com kalau daftar harga DB tidak punya (Alvian, 3 Okt). Bentuk JSON = respons asli situs.
const produk = (name, desc, amount) => ({ name, short_description: desc, price: { amount: `${amount}.0000` }, special_price: null });
const SITUS = {
  '1144003771': [produk('1144003771', 'TURBOCHARGER', 49587999), produk('1144003771PU', 'TURBOCHARGER', 53920759)],
  '4658521': [produk('4658521', 'FILTER;OIL', 658152), produk('4658521RCP', 'FILTER;OIL', 759296), produk('46585219', 'LAIN', 1)],
  'HTCDH1C': [produk('HTCDH1C', 'HAP ENG OIL DH 1 CAN', 591600)],
  '4932790920': [produk('4932790920', 'KIT;SEAL', 1198487)],
  '263E252031': [produk('263E252031', 'COUPLING ASSY', 18308172)],
  '729630-51520': [produk('729630-51520', 'INJECTION PUMP', 52677007)],
  '26418-82071': [produk('26418-82071', 'LEVER', 9372279)],
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
    // Abdul 4 Okt (ZW140): situs campur — 263E2-52031 hanya ada tanpa strip, 26418-82071 dengan strip.
    const zw1 = await fetchHexParts('263E2-52031');
    t(zw1.length === 1 && zw1[0].pn === '263E2-52031' && zw1[0].harga === 'Rp 18.308.172', `PN ZW berstrip tak ketemu → coba tanpa strip (${zw1.map(p => p.pn + ' ' + p.harga).join(', ') || 'kosong'})`);
    const zw2 = await fetchHexParts('26418-82071');
    t(zw2.length === 1 && zw2[0].harga === 'Rp 9.372.279', 'PN ZW yang terdaftar dengan strip tetap ketemu');
    // Alvian 6 Okt: katalog Yanmar menulis YNM729630-51520, situs mendaftarkan 729630-51520.
    const ynm = await fetchHexParts('YNM729630-51520');
    t(ynm.length === 1 && ynm[0].harga === 'Rp 52.677.007' && ynm[0].pn === 'YNM729630-51520', `PN YNM dicari juga tanpa prefix, tampil ejaan katalog (${ynm.map(p => p.pn + ' ' + p.harga).join(', ') || 'kosong'})`);
    // Reyhan 4 Okt: katalog KCM menulis 49327-90920, situs mendaftarkan 4932790920.
    const kcm = await fetchHexParts('49327-90920');
    t(kcm.length === 1 && kcm[0].harga === 'Rp 1.198.487' && kcm[0].pn === '49327-90920', `PN KCM berstrip dicari tanpa strip, tampil ejaan katalog (${kcm.map(p => p.pn + ' ' + p.harga).join(', ') || 'kosong'})`);
    let lempar = false;
    try { await fetchHexParts('BLOCKED'); } catch { lempar = true; }
    t(lempar, 'halaman blokir/HTML (Cloudflare) → dianggap GAGAL, bukan "tidak ada"');
  } finally { global.fetch = asli; }

  {
    resetHargaWebCache();
    const c = [];
    const { d } = mockDeps([[]], { webPrice: web(c) });
    const a = await runWithDeps(d, () => hargaWeb(['1144003771', '1144003771', 'zz9999']));
    const b = await runWithDeps(d, () => hargaWeb(['1144003771']));
    t(a.get('1144003771').length === 2 && a.get('ZZ9999').length === 0 && b.has('1144003771'), 'hasil per PN; PN dicek tapi tak ada = daftar kosong');
    t(c.length === 2, `PN kembar digabung & hasil di-cache (panggilan situs: ${c.length})`);
    const { d: tanpa } = mockDeps([[]]);
    t((await runWithDeps(tanpa, () => hargaWeb(['1144003771']))).size === 0, 'tanpa webPrice (uji/offline) → tidak ada panggilan web');
    t(/^\[HARGA HEXINDOPARTS\.COM/.test(blokHargaWeb(a)) && blokHargaWeb(new Map()) === '', 'blok berlabel sumber; kosong kalau tak ada yang dicek');
    t(/Dicek, TIDAK ADA di hexindoparts\.com: ZZ9999/.test(blokHargaWeb(a)), 'PN yang dicek tapi tak ada disebut terpisah (beda dengan belum dicek)');
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

  {
    const TURBO = 'Section: 036 - TURBOCHARGER SYSTEM\nParts List:\n    001(C) | 1144003771     | TURBOCHARGER ASM                       | qty:1\n       002 | 1141451401     | GASKET; TURBOCHARGER TO EXH MANIF      | qty:1\n       146 | 8973202040     | PLUG                                   | qty:1';
    const pick = pilihPnHarga(TURBO, ['cek harga turbocharger']);
    t(pick.join() === '1144003771', `NL "harga turbocharger": cukup TURBOCHARGER ASM, isi ditawarkan (${pick.join(',')})`);
    const AC = 'Section: AIR CONDITIONER (1)\n  72 | YD00007143 | COMPRESSOR | qty:1 | svc:S\n  72 | 4615804 | COMPRESSOR | qty:1 | svc:S\n  73 | 4444444 | HOSE | qty:1 | svc:S';
    t(pilihPnHarga(AC, ['harga komressor ac']).join(',') === 'YD00007143,4615804', 'salah ketik "komressor" tetap cocok ke COMPRESSOR');
    t(pilihPnHarga('tanpa tabel', ['hargany berpa'], 'Oli `HTCDH1C` dan filter `4665128` untuk `ZX48U-5A`, isi `7.4 L`').join(',') === 'HTCDH1C,4665128',
      'follow-up "hargany berpa" → PN dari jawaban sebelumnya');
    t(MINTA_HARGA_RE.test('klo cek di hexindoparts.com') && MINTA_HARGA_RE.test('hargany berpa') && !MINTA_HARGA_RE.test('part number turbo'), 'deteksi minta harga');
  }

  {
    resetHargaWebCache();
    const ROW = { metadata: { Model: 'ZX200-5G', Kategori: 'ENGINE PARTS CATALOG' }, content: 'Section: 036 - TURBOCHARGER SYSTEM\nParts List:\n    001(C) | 1144003771     | TURBOCHARGER ASM                       | qty:1' };
    const c = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([ROW], () => [{ ...ROW, similarity: 0.9 }]), embed: async () => [0.1],
      rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
      generate: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'parts', optimizedQuery: 'turbocharger price' }) }] } }] }),
      webPrice: web(c) });
    const r = await runWithDeps(d, () => resolvePartsQuery('cek harga turbocharger', [], 'ZX200-5G'));
    t(r.type === 'rag_found' && r.content.includes('Rp 49.587.999') && c.includes('1144003771'), 'NL "cek harga turbocharger" → harga hexindoparts.com ikut (kasus sesi 4 Okt)');
    const { d: d2 } = mockDeps([[]], { supabase: fakeSupabase([ROW], () => [{ ...ROW, similarity: 0.9 }]), embed: async () => [0.1],
      rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }), webPrice: web(c) });
    const before = c.length;
    await runWithDeps(d2, () => resolvePartsQuery('part number turbocharger', [], 'ZX200-5G'));
    t(c.length === before, 'tanya PN tanpa minta harga → tidak memanggil web');
  }

  {
    // Sesi 4 Okt: "klo cek harga cylinder arm" — seal kit di section CYL.;ARM tidak dicek ke web.
    const ARM = 'Section: CYL.;ARM\nParts List:\n       1 | 4711561            | CYL.;ARM                            | qty:1\n      10 | 4422222            | BOLT                                | qty:8\n     100 | YA00001400         | KIT;SEAL                            | qty:1\n'
      + '\nSection: SWING MOTOR\n      5 | 4333333            | KIT;SEAL                            | qty:1';
    const pick = pilihPnHarga(ARM, ['klo cek harga cylinder arm', 'arm cylinder price']);
    t(pick[0] === '4711561' && pick[1] === 'YA00001400' && !pick.includes('4333333'),
      `seal kit di section CYL.;ARM ikut dicek, kit section lain tidak (${pick.join(',')})`);
  }

  {
    // Sesi Hikmal 4 Okt: situs balas HTTP 500 sekali untuk YB00003778 → dulu tampil "Belum tersedia".
    resetHargaWebCache();
    let n = 0, jalan = 0, puncak = 0;
    const kadangError = async pn => {
      jalan++; puncak = Math.max(puncak, jalan);
      await new Promise(r => setTimeout(r, 5));
      jalan--;
      if (pn === 'YB00003778' && n++ === 0) throw new Error('HTTP 500');
      if (pn === 'MATI01') throw new Error('HTTP 503');
      return pn === 'YB00003778' ? [{ pn, nama: 'KIT;SEAL', harga: 'Rp 3.572.034' }] : [];
    };
    const { d } = mockDeps([[]], { webPrice: kadangError });
    const pns = ['YB00003778', 'MATI01', 'A0000001', 'A0000002', 'A0000003', 'A0000004', 'A0000005', 'A0000006'];
    const h = await runWithDeps(d, () => hargaWeb(pns));
    t(h.get('YB00003778')?.[0]?.harga === 'Rp 3.572.034', 'error 500 sekali → dicoba ulang, harga seal kit center joint ketemu');
    t(h.get('MATI01') === null && /GAGAL dicek[^\n]*MATI01/.test(blokHargaWeb(h)) && !/TIDAK ADA[^\n]*MATI01/.test(blokHargaWeb(h)),
      'situs error terus → ditandai GAGAL dicek, bukan "tidak ada"');
    t(puncak <= 6, `paling banyak 6 permintaan bersamaan ke situs (puncak ${puncak})`);
    const h2 = await runWithDeps(d, () => hargaWeb(['MATI01']));
    t(h2.get('MATI01') === null, 'kegagalan tidak di-cache sebagai "tidak ada"');
  }

  {
    resetHargaWebCache();
    const ROW = { metadata: { Model: 'ZW140', Kategori: 'PARTS CATALOG' }, content: 'Section: MOTOR (HST)\nParts List:\n       2 | 263E2-57381        | SOLENOID; CONTROL                   | qty:1' };
    const c = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([ROW], () => [{ ...ROW, similarity: 0.9 }]), embed: async () => [0.1],
      rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
      webPrice: async pn => { c.push(pn); return []; } });
    const hist = [{ role: 'user', content: 'harga solenoid motor' }, { role: 'assistant', content: 'Solenoid motor belum ketemu.' }];
    await runWithDeps(d, () => resolvePartsQuery('solenoid di hst motor', hist, 'ZW140'));
    t(c.includes('263E2-57381'), 'lanjutan singkat sesudah tanya harga ("solenoid di hst motor") tetap dicek harganya');
  }

  return done();
};
