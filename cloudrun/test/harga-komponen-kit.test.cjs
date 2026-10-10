const { resolvePartsQuery, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Alvian 5 Okt (ZX48U-5A): "hrga kit seal arm" → 8 seal kit semua silinder, "arm aj" tetap 8. Sebab: PN pertama
// terbaca dari daftar parts ("ZX MINI PARTS …", tanpa komponen), jadi pemilih tak tahu mana yang milik ARM.
const PROMO = { metadata: { Model: 'ZX48U-5A', Kategori: 'PROMO' }, content:
  'Section: PROMO Q3 FY2026 - ZX MINI PARTS (Filter, Seal Kit, Engine, Pump, AC Kit)\n      YD00005194             | KIT;SEAL      |      Rp 7.416.169\n      YD00005193             | KIT;SEAL      |      Rp 8.331.183' };
const ARM = { metadata: { Model: 'ZX48U-5A', Kategori: 'PARTS CATALOG' }, content: 'Section: CYL.;ARM\nParts List:\n         100 | YD00005193         | KIT;SEAL                            | qty:1' };
const BUCKET = { metadata: { Model: 'ZX48U-5A', Kategori: 'PARTS CATALOG' }, content: 'Section: CYL.;BUCKET\nParts List:\n         100 | YD00005194         | KIT;SEAL                            | qty:1' };
const WEB = { YD00005193: [{ pn: 'YD00005193', nama: 'KIT;SEAL', harga: 'Rp 8.493.254' }], YD00005194: [{ pn: 'YD00005194', nama: 'KIT;SEAL', harga: 'Rp 7.560.440' }] };
function fakeSupabase(rows) {
  const q = {
    select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: rows.map(r => ({ ...r, similarity: 0.9 })), error: null }) };
}

module.exports = async () => {
  const { t, done } = suite('harga cepat: komponen tiap PN dari halaman katalog, bukan daftar parts umum');
  resetHargaWebCache();
  let prompt = '';
  const { d } = mockDeps([[]], {
    supabase: fakeSupabase([PROMO, ARM, BUCKET]), embed: async () => [0.1],
    rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
    generate: async body => {
      const text = body.contents[0].parts[0].text;
      if (text.includes('Kandidat part')) { prompt = text; return { candidates: [{ content: { parts: [{ text: '{"pilih":[1],"pembuka":"Ini dia:"}' }] } }] }; }
      return { candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'parts', optimizedQuery: 'arm cylinder seal kit' }) }] } }] };
    },
    webPrice: async pn => WEB[pn] ?? [],
  });
  await runWithDeps(d, () => resolvePartsQuery('Hrga kit seal arm brpa', [], 'ZX48U-5A'));
  const baris = prompt.split('\n').filter(l => /YD0000519[34]/.test(l));
  t(baris.some(l => l.includes('YD00005193') && l.includes('CYL.;ARM')), `YD00005193 diberi section CYL.;ARM (${baris.find(l => l.includes('YD00005193')) || 'tak ada'})`);
  t(baris.some(l => l.includes('YD00005194') && l.includes('CYL.;BUCKET')), 'YD00005194 diberi section CYL.;BUCKET');
  {
    const { pilihPnHarga } = require('./helpers.cjs');
    const arm = require('fs').readFileSync(require('path').join(__dirname, 'fixtures-arm-zx48.txt'), 'utf8');
    const r = pilihPnHarga(arm, ['Sealkit arm cylinder hrga brpa']);
    t(r[0] === 'YD00005193', `"Sealkit" (satu kata) → KIT;SEAL YD00005193 dipilih pertama (${r.slice(0, 3).join(',')})`);
  }
  {
    const { pilihPnHarga } = require('./helpers.cjs');
    const st = 'Section: 082 - STARTER\nParts List:\n       010 | 8983763930     | STARTER ASM                            | qty:1\n       020 | 1811297750     | KIT;SEAL                               | qty:1\n       030 | 8981550400     | YOKE                                   | qty:1\n       040 | 1811210620     | ARMATURE                               | qty:1\n       050 | 8981971750     | BRUSH;STARTER                          | qty:2';
    const r = pilihPnHarga(st, ['Klo harga starter berapa']);
    t(r.join() === '8983763930', `"harga starter" → cukup STARTER ASM (${r.join(',')})`);
    const r2 = pilihPnHarga(st, ['harga brush starter']);
    t(r2.includes('8981971750'), `"harga brush starter" → brush tetap dicari (${r2.join(',')})`);
    const r3 = pilihPnHarga(st, ['harga komponen internal starter']);
    const r4 = pilihPnHarga(st, ['Oke', 'starter motor harga'], 'Tabel... Mau sekalian saya listkan harga komponen internalnya (seal kit, brush, armature)?');
    t(r4.length > 1, `"Oke" setelah tawaran komponen internal → isi dicek (${r4.length} PN)`);
    t(r3.length > 1, `"komponen internal starter" → isi dicek (${r3.length} PN)`);
  }
  return done();
};
