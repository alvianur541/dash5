const { docKategoriFor, exactPartRows, findPerformanceStandard, resolvePartsQuery, generateResponse, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

function fakeSupabase(rows, calls = []) {
  const q = {
    select() { return q; },
    contains(col, v) { calls.push(['contains', col, v]); return q; },
    ilike(col, v) { calls.push(['ilike', col, v]); return q; },
    filter(col, op, v) { calls.push(['filter', col, op, v]); return q; },
    limit() { return q; },
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: [], error: null }) };
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

  const photo = async (caption, scanText) => {
    const events = [];
    const gen = async (body) => {
      const sys = body?.systemInstruction?.parts?.[0]?.text ?? '';
      const text = sys.includes('COMPONENT:') ? scanText : 'NONE';
      return { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: USAGE };
    };
    const { d } = mockDeps([[{ text: 'Jawaban ...', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]], { generate: gen });
    await runWithDeps(d, () => generateResponse('ZX200-5G', 'Alvianur', [], caption, [{ mimeType: 'image/jpeg', data: '/9j/AAAA' }], () => {}, e => events.push(e)));
    const thinking = events.filter(e => e.type === 'thinking').map(e => e.message || '');
    const partsCalls = events.filter(e => e.type === 'tool_call' && e.tool === 'search_parts_catalog').length;
    return { thinking, partsCalls };
  };

  {
    const r = await photo('Hrgany brpa ini', 'PN: P/N YA00002098\nCOMPONENT: engine controller');
    t(r.thinking.some(m => /YA00002098/.test(m)), 'PN dari label foto terbaca');
    t(r.partsCalls >= 1, 'foto label -> pencarian katalog parts dengan PN');
  }
  {
    const r = await photo('Crikan part number ini', 'PN: NONE\nCOMPONENT: hydraulic main pump regulator');
    t(r.thinking.some(m => /hydraulic main pump regulator/.test(m)) && r.partsCalls === 1, 'tanpa PN: katalog dicari pakai nama komponen di foto (sesi afacc06c)');
  }
  {
    const r = await photo('Crikan part number ini', 'PN: 9318792\nCOMPONENT: hydraulic main pump regulator');
    t(r.partsCalls === 2 && r.thinking.some(m => /hydraulic main pump/.test(m)), 'PN foto tidak ada di katalog -> lanjut cari pakai nama komponen');
  }
  {
    const r = await photo('Cek', 'PN: NONE\nCOMPONENT: NONE');
    t(r.partsCalls === 0, 'foto bukan komponen + keterangan pendek -> tidak mencari');
  }

  {
    const { isPartsQuery, engineSectionRows, STREAM_LONG_NOTE } = require('./helpers.cjs');
    t(isPartsQuery('Listkn partnumberny') && isPartsQuery('Listkn part number ny ini'), '"partnumberny" (tanpa spasi) dikenali sebagai pertanyaan part');
    t(typeof STREAM_LONG_NOTE === 'string' && STREAM_LONG_NOTE.includes('lanjutkan'), 'catatan daftar-terpotong tersedia');

    const eng = (sec, row) => ({ content: `Section: ${sec}\nModel: ZX200-5G\nCatalog: ENGINE PARTS CATALOG\n    ${row}`, metadata: { Model: 'ZX200-5G', Kategori: 'ENGINE PARTS CATALOG' } });
    const CRANK = eng('015 - CRANKSHAFT,PISTON AND FLYWHEEL', '010 | 1122101010 | PISTON; ENG | qty:6');
    const INJ   = eng('080 - INJECTION PUMP', '001 | 1156034530 | PUMP ASM; INJ | qty:1');
    const GOV   = eng('081 - GOVERNOR; INJECTION PUMP', '001 | 1156600000 | GOVERNOR ASM | qty:1');
    const BLOCK = eng('012 - CYLINDER BLOCK', '056 | 1133421322 | JET; OIL,PISTON COOLING | qty:6');
    const ALL = [BLOCK, GOV, INJ, CRANK];
    const EMB = { embed: async () => new Array(3072).fill(0.01) };

    const calls = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase(ALL, calls), ...EMB });
    const rows = await runWithDeps(d, () => engineSectionRows('piston, connecting rod, main bearing, injection pump part number', 'ZX200-5G'));
    const titles = rows.map(r => r.content.split('\n')[0]);
    t(titles.length === 2 && titles.includes(CRANK.content.split('\n')[0]) && titles.includes(INJ.content.split('\n')[0]),
      `piston/conrod/bearing/injection pump -> section 015 + 080 saja (${titles.join(' ; ')})`);
    t(calls.some(c => c[0] === 'filter' && c[2] === 'imatch' && c[3].startsWith('^Section:')), 'dicari lewat judul section (imatch berlabuh di baris Section:)');
    t((await runWithDeps(d, () => engineSectionRows('piston', 'ZX65USB-5A'))).length === 0, 'model tanpa Engine Parts Catalog -> tidak mencari');
    t((await runWithDeps(d, () => engineSectionRows('harga filter oli', 'ZX200-5G'))).length === 0, 'pertanyaan tanpa komponen engine -> tidak ada section dipasang');

    const history = [
      { role: 'user', content: '' },
      { role: 'assistant', content: 'Dari foto overhaul engine:\n1. **Piston & Connecting Rod Assembly** (6 set)\n2. **Main Bearing & Conrod Bearing Set**\n4. **Supply Pump / Fuel Injection Pump Assembly**\n| 008 | `1090004692` | BOLT; BRG CAP | 14 |' },
    ];
    const { d: d2 } = mockDeps([[]], { supabase: fakeSupabase(ALL), ...EMB });
    const r = await runWithDeps(d2, () => resolvePartsQuery('Cek lagi listkn sesuai yg d meja', history, 'ZX200-5G', () => {}, 'engine overhaul parts list'));
    t(r.type === 'rag_found' && r.content.includes('015 - CRANKSHAFT') && r.content.includes('080 - INJECTION PUMP') && !r.content.includes('012 - CYLINDER BLOCK'),
      'susulan "Cek lagi listkn sesuai yg d meja" -> section piston & injection pump dari jawaban sebelumnya (sesi bf36d44f)');
    const neg = await runWithDeps(d2, () => resolvePartsQuery('harga filter oli brp', history, 'ZX200-5G', () => {}, 'engine oil filter price'));
    t(neg.type !== 'rag_found' || !neg.content.includes('015 - CRANKSHAFT'), 'pertanyaan baru yang tidak merujuk ke belakang -> komponen jawaban lama tidak ikut');
  }

  {
    const { isMultiAspectQuery, isShortFollowUp, scrubLeaks, faultCodeNotFoundTemplate, imageCodesNotFoundTemplate } = require('./helpers.cjs');
    t(isMultiAspectQuery('Cek berat travel device sm part nymberny'), '"sm" (= sama) dikenali sebagai penghubung dua pertanyaan (sesi 9370a5a4)');
    t(!isMultiAspectQuery('part number seal yg sm dengan swing motor tadi'), '"yg sm dengan" = pembanding, bukan dua pertanyaan');
    t(scrubLeaks('Coolant $\\ge$ `50 °C`, Titik A $\\rightarrow$ `33 L/min`') === 'Coolant ≥ `50 °C`, Titik A → `33 L/min`', 'simbol LaTeX ($\\ge$, $\\rightarrow$) jadi Unicode');
    const noDb = [faultCodeNotFoundTemplate('20115-2', 'ZX200-5G', 'id'), faultCodeNotFoundTemplate('20115-2', 'ZX200-5G', 'en'), faultCodeNotFoundTemplate('20115-2', 'ZX200-5G', 'ja'),
      imageCodesNotFoundTemplate(['20115-2'], 'ZX200-5G', 'id'), imageCodesNotFoundTemplate(['20115-2'], 'ZX200-5G', 'en'), imageCodesNotFoundTemplate(['20115-2'], 'ZX200-5G', 'ja')];
    t(noDb.every(s => !/database|データベース/i.test(s)), 'template kode-tidak-ditemukan tanpa kata "database" (3 bahasa)');
    const h2 = [{ role: 'user', content: 'Cek data cycle time cylinder' }, { role: 'assistant', content: 'Prosedur cycle time ...' }];
    t(isShortFollowUp('Brpa nilainy', h2) && isShortFollowUp('Knpa td bilang ngga ad', h2), 'susulan pendek -> diberi catatan "jawab langsung"');
    t(!isShortFollowUp('Coba listkn', h2) && !isShortFollowUp('Cek lg', h2) && !isShortFollowUp('Coba cari lagi', h2), 'minta daftar / cek ulang -> TIDAK dipersingkat');
    t(!isShortFollowUp('20115-2', h2) && !isShortFollowUp('Brpa nilainy', []), 'fault code atau pesan pertama -> bukan susulan');
    const hSalam = [{ role: 'user', content: 'hei bro' }, { role: 'assistant', content: 'Malam, Alvianur! Lagi nanganin trouble apa?' }];
    t(!isShortFollowUp('unitku ngga bisa start', hSalam) && !isShortFollowUp('Brpa nilainy', hSalam), 'sesudah salam saja -> pertanyaan pertama, bukan susulan (sesi e4e24d3f)');
    t(!isShortFollowUp('unitku ngga bisa start', h2) && !isShortFollowUp('swing lambat', h2) && !isShortFollowUp('engine mati mendadak', h2), 'keluhan baru -> diagnosa penuh, tidak dipersingkat');
  }

  {
    const { manualTerms, isShortFollowUp, FALLBACK_RESPONSE } = require('./helpers.cjs');
    t(manualTerms('main pump weight') === 'pump device weight' && manualTerms('main pump removal installation') === 'pump device removal installation',
      '"main pump" berat/lepas-pasang -> istilah manual "pump device" (sesi 11db623e: 170 kg / 160 kg)');
    t(manualTerms('main pump delivery pressure') === 'main pump delivery pressure', 'main pump tekanan tetap (manual memakai "MAIN PUMP" di situ)');
    const h2 = [{ role: 'user', content: 'Cek kan berat main pump' }, { role: 'assistant', content: 'Berat total main pump ...' }];
    t(!isShortFollowUp('Cari lebih dalam lagi', h2) && !isShortFollowUp('Cek lagi berapa total beratny', h2), '"cari lebih dalam" / "cek lagi" = cari ulang, tidak dipersingkat');
  }

  {
    const { isShortFollowUp, resolveAffirmative, FALLBACK_RESPONSE, clampThinking } = require('./helpers.cjs');
    const h = [{ role: 'user', content: 'berat swing motor' }, { role: 'assistant', content: 'Berat swing motor 48 kg.' }];
    t(!isShortFollowUp('klo anti drif fungsi dan cara kerjanya', h)
      && !isShortFollowUp('kenapa bisa gitu', h)
      && !isShortFollowUp('prosedur nya gimana', h)
      && !isShortFollowUp('jelaskan singkat', h),
      'susulan pendek yang MINTA PENJELASAN (cara kerja/kenapa/prosedur/jelaskan) -> TIDAK dipangkas 8 kalimat');
    t(isShortFollowUp('klo yang 200 brpa', h) && isShortFollowUp('Brpa nilainy', h),
      'susulan pendek minta satu angka -> tetap dipersingkat (ringkas memang benar di situ)');
    const hTawar = [{ role: 'user', content: 'berat swing motor' },
                    { role: 'assistant', content: ['Beratnya 48 kg.', '', 'Mau sekalian dicek urutan pelepasan atau torque mounting bautnya?'].join(String.fromCharCode(10)) }];
    t(resolveAffirmative('oke', hTawar) !== null,
      '"oke" dikenali menerima tawaran -> orchestrator memakai !offer, jadi batas 8 kalimat DILEWATI');
    t(resolveAffirmative('brpa nilainy', hTawar) === null, 'pertanyaan biasa bukan penerimaan tawaran');
    const lvl = (m) => { const { d } = mockDeps([[]]); return runWithDeps(d, () => clampThinking({ contents: [], generationConfig: { thinkingConfig: { thinkingLevel: 'minimal' } } }, m)).generationConfig.thinkingConfig.thinkingLevel; };
    t(lvl('gemini-3.7-flash') === 'low' && lvl('gemini-3.8-flash') === 'low' && lvl('gemini-3.8-flash-preview') === 'low' && lvl('gemini-4.0-flash') === 'low',
      'thinking "minimal" dinaikkan ke "low" untuk 3.7, 3.8, dan versi sesudahnya');
    t(lvl('gemini-3.6-flash') === 'minimal' && lvl('gemini-3.1-flash-lite') === 'minimal', 'model lama tetap boleh "minimal"');
    t(typeof FALLBACK_RESPONSE === 'string' && /kirim ulang/i.test(FALLBACK_RESPONSE) && !/tidak bisa memproses/.test(FALLBACK_RESPONSE),'pesan gagal menyarankan kirim ulang, bukan "tidak bisa memproses"');
  }

  return done();
};
