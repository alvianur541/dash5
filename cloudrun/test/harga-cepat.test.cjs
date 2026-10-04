const { resolvePartsQuery, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Jalur harga cepat (4 Okt): flash-lite memilih baris, kode menyusun tabel → angka persis dari hexindoparts.com.
const ROW = { metadata: { Model: 'ZX200-5G', Kategori: 'PARTS CATALOG' }, content:
  'Section: CYL.;ARM\nParts List:\n       1 | 4711561            | CYL.;ARM                            | qty:1\n     100 | YA00001400         | KIT;SEAL                            | qty:1' };
const WEB = {
  YA00001400: [{ pn: 'YA00001400', nama: 'KIT;SEAL', harga: 'Rp 6.238.417' }, { pn: 'YA00001400PS', nama: 'KIT;SEAL', harga: 'Rp 6.738.062' }],
  4711561: [],
};
function fakeSupabase(rows) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: rows.map(r => ({ ...r, similarity: 0.9 })), error: null }) };
}
const jalan = async (q, pemilih, history = []) => {
  resetHargaWebCache();
  let prompt = '';
  const { d } = mockDeps([[]], {
    supabase: fakeSupabase([ROW]), embed: async () => [0.1],
    rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
    generate: async body => {
      const text = body.contents[0].parts[0].text;
      if (text.includes('Kandidat part')) { prompt = text; return { candidates: [{ content: { parts: [{ text: pemilih }] } }] }; }
      return { candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'parts', optimizedQuery: 'arm cylinder seal kit price' }) }] } }] };
    },
    webPrice: async pn => WEB[pn] ?? [],
  });
  const r = await runWithDeps(d, () => resolvePartsQuery(q, history, 'ZX200-5G'));
  return { r, d, prompt };
};

module.exports = async () => {
  const { t, done } = suite('jalur harga cepat: tabel disusun kode');

  {
    const { r, d, prompt } = await jalan('harga seal kit arm cylinder', '{"pilih":[1,2],"pembuka":"Seal kit arm cylinder ZX200-5G:"}');
    t(r.type === 'rag_canned' && d.meta.route === 'harga_cepat', 'pertanyaan harga murni → dijawab tanpa model utama');
    t(/\| `YA00001400` \| KIT;SEAL \| Rp 6\.238\.417 \|/.test(r.text) && /\| `YA00001400PS` \| KIT;SEAL \| Rp 6\.738\.062 \|/.test(r.text), 'harga & varian disalin persis dari web');
    t(!r.text.includes('4711561'), 'baris yang tidak dipilih (cylinder-nya sendiri) tidak ikut');
    t(r.text.trim().endsWith('*Sumber harga: Hexindoparts.com*') && !/PPN|Parts Counter/.test(r.text), 'penutup cukup "Sumber harga: Hexindoparts.com"');
    t(r.text.startsWith('Seal kit arm cylinder ZX200-5G:'), 'kalimat pembuka dari pemilih');
    t(/1 \| YA00001400 \| KIT;SEAL \| CYL\.;ARM/.test(prompt) && /3 \| 4711561 \| CYL\.;ARM \| CYL\.;ARM/.test(prompt), 'pemilih melihat PN + nama + section katalog, seal kit diurut duluan');
  }
  {
    const { r } = await jalan('harga seal kit arm cylinder', '{"pilih":[],"pembuka":""}');
    t(r.type === 'rag_found', 'pemilih tak menemukan baris cocok → kembali ke model utama');
    const { r: r2 } = await jalan('harga seal kit arm cylinder', 'bukan json');
    t(r2.type === 'rag_found', 'pemilih error → kembali ke model utama');
  }
  {
    const { r } = await jalan('harga dan cara pasang seal kit arm cylinder', '{"pilih":[2],"pembuka":"x"}');
    t(r.type === 'rag_found', 'harga + prosedur → tetap model utama (butuh penjelasan)');
  }
  {
    const { r } = await jalan('what is the price of the arm cylinder seal kit', '{"pilih":[1,3],"pembuka":"Arm cylinder seal kit:"}');
    t(r.type === 'rag_canned' && r.text.includes('| Part Number | Part Name | Price |') && r.text.includes('Not listed') && r.text.includes('Price source: Hexindoparts.com'),
      'sesi English → label tabel English, PN tanpa harga = "Not listed"');
  }
  {
    const { r } = await jalan('harga seal kit arm cylinder', '{"pilih":[1,3,9,"x"],"pembuka":"Harga Rp 1.000 untuk:"}');
    t(r.type === 'rag_canned' && !r.text.includes('Rp 1.000') && r.text.includes('Belum tersedia'), 'nomor ngawur dibuang, angka di pembuka dihapus, PN tanpa harga = "Belum tersedia"');
  }

  return done();
};
