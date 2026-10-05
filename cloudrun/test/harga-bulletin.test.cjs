const { resolvePartsQuery, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Reyhan 5 Okt (ZX48U-5A S/N 035002): Technical News 06/2023 (harness per S/N) tak pernah ikut di jalur parts,
// jalur cepat memilih harness generasi lama. Bulletin harus masuk data, dan jalur cepat dilewati.
const TN = { metadata: { Model: 'ZX48U-5A', Kategori: 'TECHNICAL NEWS' }, content:
  'Section: Harness ZX48U-5A — Daftar Part Number Main & Floor Harness per Nomor Seri\nModel: ZX48U-5A\nKategori: TECHNICAL NEWS\n  Floor Harness   Wire Harness   YD00000472   YD00008339   YD00010892\n  Main Harness    Wire Harness   YD00000471   YD00008373   YD00011077' };
const CAT = { metadata: { Model: 'ZX48U-5A', Kategori: 'PARTS CATALOG' }, content: 'Section: ELECTRIC PARTS\nParts List:\n   1 | YD00000472 | HARNESS;WIRE | qty:1' };
function fakeSupabase() {
  const q = (rows) => { const o = { select() { return o; }, contains() { return o; }, ilike() { return o; }, filter() { return o; }, limit() { return o; }, or() { return o; }, eq() { return o; }, then(r) { return Promise.resolve({ data: rows, error: null }).then(r); } }; return o; };
  return { from: () => q([CAT]), rpc: (_n, a) => Promise.resolve({ data: (a?.filter?.Kategori === 'TECHNICAL NEWS' ? [TN] : [CAT]).map(r => ({ ...r, similarity: 0.9 })), error: null }) };
}

module.exports = async () => {
  const { t, done } = suite('technical news ikut di jalur parts + jalur cepat dilewati bila S/N');
  resetHargaWebCache();
  let pemilih = 0;
  const { d } = mockDeps([[]], {
    supabase: fakeSupabase(), embed: async () => [0.1],
    rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
    generate: async body => {
      const text = body.contents[0].parts[0].text;
      if (text.includes('Kandidat part')) { pemilih++; return { candidates: [{ content: { parts: [{ text: '{"pilih":[1],"pembuka":"Ini:"}' }] } }] }; }
      return { candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'parts', optimizedQuery: 'wire harness floor main' }) }] } }] };
    },
    webPrice: async pn => (pn === 'YD00000472' ? [{ pn, nama: 'HARNESS;WIRE', harga: 'Rp 22.066.412' }] : pn === 'YD00008339' ? [{ pn, nama: 'HARNESS;WIRE', harga: 'Rp 20.000.000' }] : []),
  });
  const r = await runWithDeps(d, () => resolvePartsQuery('harga harness floor sama main', [{ role: 'user', content: 'sn ny 35002 carikan harness' }, { role: 'assistant', content: '...' }], 'ZX48U-5A'));
  t(r.type === 'rag_found' && /TECHNICAL NEWS/.test(r.content) && r.content.includes('YD00008339'), 'bulletin harness per S/N masuk data jawaban');
  t(pemilih === 0, 'jalur harga cepat dilewati (butuh S/N / ada bulletin)');
  return done();
};
