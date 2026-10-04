const { resolvePartsQuery, isPartsQuery, KATA_HARGA_RE, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Sesi Reyhan 4 Okt: harga baru muncul kalau PN diketik sendiri. Penyebab: "hrga/hrgany" tak dikenali, kode katalog
// 4S00509HPA tak dianggap PN, lanjutan sesudah PN polos tidak mewarisi niat harga.
const ROW = { metadata: { Model: 'ZX138MF-5G', Kategori: 'PARTS CATALOG' }, content:
  'Section: UNDERCARRIAGE PARTS (Track Link, Sprocket, Idler, Roller, Shoe)\nParts List:\n       1 | 4S00509HPA         | ROLLER;LOWER                        | qty:1\n       2 | YD00000074         | KIT;SEAL                            | qty:1' };
const WEB = { '4S00509HPA': [{ pn: '4S00509HPA', nama: 'ROLLER;LOWER', harga: 'Rp 9.876.543' }], YD00000074: [{ pn: 'YD00000074', nama: 'KIT;SEAL', harga: 'Rp 6.045.421' }] };
function fakeSupabase(rows) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: rows.map(r => ({ ...r, similarity: 0.9 })), error: null }) };
}
const jalan = async (q, history = []) => {
  resetHargaWebCache();
  const dicek = [];
  const { d } = mockDeps([[]], {
    supabase: fakeSupabase([ROW]), embed: async () => [0.1],
    rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
    generate: async body => {
      const text = body.contents[0].parts[0].text;
      if (text.includes('Kandidat part')) return { candidates: [{ content: { parts: [{ text: '{"pilih":[1],"pembuka":"Ini harganya:"}' }] } }] };
      return { candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'parts', optimizedQuery: q }) }] } }] };
    },
    webPrice: async pn => { dicek.push(pn); return WEB[pn] ?? []; },
  });
  const r = await runWithDeps(d, () => resolvePartsQuery(q, history, 'ZX138MF-5G'));
  return { r, dicek };
};
const H = (...pairs) => pairs.map((c, i) => ({ role: i % 2 ? 'assistant' : 'user', content: c }));

module.exports = async () => {
  const { t, done } = suite('harga tanpa harus menyebut hexindoparts (sesi Reyhan)');

  t(['Cek hrga roller lower', 'Cek hrga 4S00509HPA', 'Ad koq cek yg betul hrgany', '4S00509HPA', 'Cek hrgany'].every(isPartsQuery), 'typo harga & kode katalog polos → jalur parts');
  t(!isPartsQuery('Cek berat travel device') && !isPartsQuery('berapa tekanan pompa'), '"berapa" saja (tekanan/berat) tidak dipaksa ke parts');
  // Photo captions and multi-aspect questions use the same strict test: a gauge photo asking a pressure is not a price ask.
  t(['cek hrgany', 'harga ini', 'brp harganya', 'Cek hrga roller lower'].every(s => KATA_HARGA_RE.test(s)), 'caption foto "cek hrgany" / "brp harganya" → minta harga');
  t(!['berapa tekanan standarnya', 'brp nilai ini', 'berapa tekanan dan berat swing motor'].some(s => KATA_HARGA_RE.test(s)), 'caption "berapa tekanan standarnya" bukan minta harga');
  {
    const { r, dicek } = await jalan('Cek hrga 4S00509HPA');
    t(dicek.includes('4S00509HPA') && r.text?.includes('Rp 9.876.543'), `"Cek hrga 4S00509HPA" → dicek ke web & harga tampil (${dicek.join(',')})`);
  }
  {
    const { r, dicek } = await jalan('Cek hrga roller lower');
    t(dicek.includes('4S00509HPA') && r.text?.includes('Rp 9.876.543'), '"Cek hrga roller lower" → PN dari katalog dicek ke web');
  }
  {
    const { dicek } = await jalan('Ad koq cek yg betul hrgany', H('Cek hrga roller lower', 'Part number `4S00509HPA` ROLLER;LOWER harga belum tersedia'));
    t(dicek.includes('4S00509HPA'), 'protes "cek yg betul hrgany" → PN jawaban sebelumnya dicek ulang');
  }
  {
    const { dicek } = await jalan('Klo seal kit swing cylinder', H('YD00005194', '| `YD00005194` | KIT;SEAL | Rp 7.560.440 |'));
    t(dicek.length > 0, `lanjutan sesudah PN polos mewarisi niat harga (${dicek.join(',') || 'tak dicek'})`);
  }

  {
    // Abdul 4 Okt (KCM 60ZV): "harga harness body", katalog menyebutnya CABLE ASSY → nama tak cocok, tetap harus dicek.
    const { dicek } = await jalan('harga harness body');
    t(dicek.length > 0, `nama beda istilah (harness vs CABLE/ROLLER) → PN chunk teratas tetap dicek (${dicek.join(',') || 'tak dicek'})`);
  }
  return done();
};
