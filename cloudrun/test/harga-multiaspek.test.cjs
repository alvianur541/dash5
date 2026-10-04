const { pilihPnHarga, resolveMultiAspectQuery, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Reyhan 4 Okt: "Carikan saya harga sensor coolant temperature dan standar nilainya" → jalur multi-aspek,
// hexindoparts.com tidak pernah dicek, jawaban "Ketik PN untuk cek" padahal 4436537 ada di web.
const ROW = { metadata: { Model: 'ZX200-5G', Kategori: 'PARTS CATALOG' }, content:
  'Section: ELECTRICAL PARTS\nParts List:\n       1 | 4436537            | SENSOR;THERMO                       | qty:1' };
function fakeSupabase(rows) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; },
    eq() { return q; }, in() { return q; }, not() { return q; }, order() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: rows.map(r => ({ ...r, similarity: 0.9 })), error: null }) };
}

module.exports = async () => {
  const { t, done } = suite('harga di pertanyaan multi-aspek (sesi Reyhan sensor coolant)');
  const jalan = async q => {
    resetHargaWebCache();
    const dicek = [];
    const { d } = mockDeps([[]], {
      supabase: fakeSupabase([ROW]), embed: async () => [0.1],
      rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
      generate: async () => ({ candidates: [{ content: { parts: [{ text: '["coolant temperature sensor part number", "coolant temperature sensor resistance standard value"]' }] } }] }),
      webPrice: async pn => { dicek.push(pn); return pn === '4436537' ? [{ pn, nama: 'SENSOR;THERMO', harga: 'Rp 986.067' }] : []; },
    });
    const r = await runWithDeps(d, () => resolveMultiAspectQuery(q, [], 'ZX200-5G'));
    return { r, dicek };
  };
  {
    const { r, dicek } = await jalan('Carikan saya harga sensor coolant temperature dan standar nilainya');
    t(dicek.includes('4436537'), `PN sensor dicek ke hexindoparts.com (${dicek.join(',') || 'tak dicek'})`);
    t(r.type === 'rag_found' && r.content.includes('Rp 986.067'), 'harga web masuk ke data jawaban');
  }
  {
    const { dicek } = await jalan('Cari part number sensor coolant temperature dan standar nilainya');
    t(dicek.length === 0, 'tanpa kata harga → web tidak dicek');
  }
  {
    // Alvian 4 Okt: foto silinder KCM + "Cek hrga kit sealny" → kata "kit seal" harus ikut ke pemilihan PN harga.
    const c = 'Section: LIFT CYLINDER\nParts List:\n 1 | 37A-1KM-1000 | CYLINDER ASSY,LIFT | qty:2\n 2 | 49327-90920 | SEAL KIT | qty:1';
    t(!pilihPnHarga(c, ['harga hydraulic cylinder']).includes('49327-90920'), 'tanpa kata caption, seal kit tak terpilih (penyebab bug)');
    t(pilihPnHarga(c, ['harga Cek kit sealny hydraulic cylinder'])[0] === '49327-90920', 'caption ikut → seal kit dicek lebih dulu');
  }
  return done();
};
