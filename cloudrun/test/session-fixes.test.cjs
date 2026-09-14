const { docKategoriFor, exactPartRows, findPerformanceStandard, resolvePartsQuery, generateResponse, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

function fakeSupabase(rows, calls = []) {
  const q = {
    select() { return q; },
    contains(col, v) { calls.push(['contains', col, v]); return q; },
    ilike(col, v) { calls.push(['ilike', col, v]); return q; },
    limit() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q };
}

const CAB2 = { content: 'Section: CAB (2)\nModel: ZX200-5G\n      07 | 4651654            | GLASS  | qty:1\n      08 | YA00001496         | GLASS  | qty:1', metadata: { Model: 'ZX200-5G', Kategori: 'PARTS CATALOG' } };
const LONGER = { content: 'Section: X\n      01 | 46516540           | BOLT   | qty:1', metadata: { Model: 'ZX200-5G', Kategori: 'PARTS CATALOG' } };
const PROMO = { content: 'Section: PROMO Q2 FY2026 - ELECTRICAL PARTS\n  YA00002098             | UNIT;CONTROL  | Normal: Rp 34.623.106 | Disc: 20% | Promo: Rp 27.698.485', metadata: { Model: 'ZX200-5G', Kategori: 'PROMO Q2 FY2026' } };
const WM = { content: 'Section: CAB REMOVAL\n replace glass 4651654 | see figure |', metadata: { Model: 'ZX200-5G', Kategori: 'WORKSHOP MANUAL' } };
const PERF = { content: 'Section: PERFORMANCE STANDARD - MAIN TABLE (Travel, Swing, Cylinder, Lever, Hydraulic)\nHydraulic Cylinder Cycle Time sec\nBoom Raise 3.4±0.3', metadata: { Model: 'ZX200-5G', Kategori: 'TROUBLESHOOTING' } };

module.exports = async function () {
  const { t, done } = suite('sesi 13-14 Sep: PN literal, dokumen diminta, tabel standar, cache, foto PN');

  const b = docKategoriFor('Cek di broaur manual', 'ZX200-5G');
  t(b && b.kategori === 'BROSUR MANUAL' && b.available, '"broaur manual" (typo) -> BROSUR MANUAL, tersedia di ZX200-5G');
  t(docKategoriFor('Hei bro gabut', 'ZX200-5G') === null, '"Hei bro" bukan permintaan brosur');
  t(docKategoriFor('cek di operator manual', 'ZX65USB-5A')?.available === false, 'Operator Manual ZX65USB-5A dikenali TIDAK tersedia');
  t(docKategoriFor('lihat circuit diagram', 'ZX48U-5A')?.kategori === 'HYDRAULIC CIRCUIT DIAGRAM', 'circuit diagram ZX48U-5A -> HYDRAULIC CIRCUIT DIAGRAM');
  t(docKategoriFor('lihat wiring diagram', 'ZX200-5G')?.kategori === 'Circuit Diagram', 'wiring diagram ZX200-5G -> Circuit Diagram');

  {
    const { d } = mockDeps([[]], { supabase: fakeSupabase([CAB2, LONGER, PROMO, WM]) });
    const rows = await runWithDeps(d, () => exactPartRows('4651654', 'ZX200-5G'));
    t(rows.length === 1 && rows[0].content === CAB2.content && rows[0].match_type === 'exact_part_no', 'PN 4651654 -> hanya CAB (2); 46516540 & Workshop Manual tidak ikut');
    const promo = await runWithDeps(d, () => exactPartRows('YA00002098', 'ZX200-5G'));
    t(promo.length === 1 && promo[0].content === PROMO.content, 'PN di awal baris promo ikut (harga bisa dijawab)');
  }

  {
    const calls = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([PERF], calls) });
    const perf = await runWithDeps(d, () => findPerformanceStandard('ZX200-5G', 'Brpa nilainy cylinder cycle time standard value', ''));
    t(perf === PERF.content && calls.some(c => c[1] === 'content' && c[2] === '%Cycle Time%'), 'follow-up cycle time -> tabel PERFORMANCE STANDARD ikut');
    const none = await runWithDeps(d, () => findPerformanceStandard('ZX200-5G', 'unit tidak bisa swing', ''));
    t(none === null, 'gejala biasa tidak menarik tabel standar');
    const dup = await runWithDeps(d, () => findPerformanceStandard('ZX200-5G', 'cycle time', PERF.content));
    t(dup === null, 'tabel yang sudah ada di konteks tidak digandakan');
  }

  {
    const { d } = mockDeps([[]]);
    const r = await runWithDeps(d, () => resolvePartsQuery('Bukanny 4651654', [], 'ZX200-5G'));
    t(r.type === 'rag_canned' && r.text.includes('**4651654**') && !r.text.includes('Bukanny'), 'balasan tidak-ketemu menyebut PN, bukan seluruh kalimat');
  }

  {
    const events = [];
    const gen = async (body) => {
      const sys = body?.systemInstruction?.parts?.[0]?.text ?? '';
      const text = sys.includes('OCR part number') ? 'P/N YA00002098' : 'NONE';
      return { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: USAGE };
    };
    const { d } = mockDeps([[{ text: 'Harga YA00002098 ...', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]], { generate: gen });
    await runWithDeps(d, () => generateResponse('ZX200-5G', 'Alvianur', [], 'Hrgany brpa ini', [{ mimeType: 'image/jpeg', data: '/9j/AAAA' }], () => {}, e => events.push(e)));
    t(events.some(e => e.type === 'thinking' && /YA00002098/.test(e.message || '')), 'PN dari label foto terbaca');
    t(events.some(e => e.type === 'tool_call' && e.tool === 'search_parts_catalog'), 'foto label -> pencarian katalog parts dengan PN');
  }

  return done();
};
