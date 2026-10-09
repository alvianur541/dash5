const { findSymptomSections, isSymptomQuery, resetSymptomIndex, wantsNumeric, generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

// Real section titles (ZX200-5G Troubleshooting + Circuit Diagram, ZW140 Troubleshooting C).
const E10 = 'Section: TROUBLESHOOTING E-10 - When traveling or operating front attachment\nModel: ZX200-5G\nKategori: TROUBLESHOOTING\nSymptom: When traveling or operating front attachment with engine running at slow idle, engine hunts.';
const NGEDROP = 'Section: TROUBLESHOOTING HIDROLIK - Semua Gerakan Lemah / Tenaga Turun / Engine Ngedrop\nModel: ZX200-5G\nKategori: Circuit Diagram\nGejala: seluruh gerakan terasa lemah, engine ngedrop saat beban.';
const KORELASI = 'Section: TROUBLESHOOTING B - CORRELATION TABLE Engine & Actuator (E-10 to A-7)\nModel: ZX200-5G\nKategori: TROUBLESHOOTING\nTrouble Symptom E-13 E-14';
const HST_WARN = 'Section: TROUBLESHOOTING C - MALFUNCTION OF HST WARNING INDICATOR\nModel: ZW140\nKategori: TROUBLESHOOTING\nAlthough HST is not abnormal, indicator lights. Check if voltage at terminal #1 of HST warning relay (CR10) is 24V.';

function fakeSupabase(rows, calls = []) {
  const q = {
    select() { return q; },
    contains(col, v) { calls.push(['contains', col, v]); return q; },
    filter(col, op, v) { calls.push(['filter', col, op, v]); return q; },
    ilike() { return q; },
    or() { return q; },
    limit() { return q; },
    then(resolve) { return Promise.resolve({ data: rows.map(content => ({ content })), error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: [], error: null }) };
}

// Scores by which title the snippet carries, the way the Google ranker would.
function rankerBy(scores, seen = []) {
  return async (query, docs, topN) => {
    seen.push(query);
    const results = docs.map((d, index) => ({ index, score: Object.entries(scores).find(([k]) => d.includes(k))?.[1] ?? 0.01 }))
      .sort((a, b) => b.score - a.score).slice(0, topN);
    return { results, source: 'google' };
  };
}

const INTENT = JSON.stringify({ shouldSearch: true, searchType: 'technical', optimizedQuery: 'HST warning indicator buzzer 2nd speed' });
// The verifier and the intent classifier share deps().generate; tell them apart by system prompt.
function judge(answer, log = []) {
  return async body => {
    const sys = body.systemInstruction?.parts?.[0]?.text ?? '';
    if (!sys.includes('troubleshooting sections')) return { candidates: [{ content: { parts: [{ text: INTENT }] } }] };
    log.push(body.contents[0].parts[0].text);
    if (answer instanceof Error) throw answer;
    return { candidates: [{ content: { parts: [{ text: answer }] } }] };
  };
}

const run = (d, ...args) => runWithDeps(d, () => findSymptomSections(...args));

module.exports = async function () {
  const { t, done } = suite('simtom: keluhan → kandidat reranker (2 bahasa) → diverifikasi model kecil');

  t(isSymptomQuery('jika handle travel digerakkan mesin langsung ngedrop'), '"mesin langsung ngedrop" = keluhan');
  t(isSymptomQuery('muncul transmisi warning dan buzzer'), '"warning dan buzzer" = keluhan');
  t(isSymptomQuery('unit tidak bisa swing') && isSymptomQuery('Saat mundur lemah'), '"tidak bisa swing", "mundur lemah" = keluhan');
  t(isSymptomQuery('engine speed drops stalls when traveling'), 'kueri Inggris "speed drops" juga dikenali');
  t(!isSymptomQuery('berat swing motor') && !isSymptomQuery('harga oli hidrolik drum') && !isSymptomQuery('coba jelaskan fungsi dari regenerative valve'),
    'cek berat / harga / fungsi bukan keluhan');

  t(!wantsNumeric('engine speed drops when traveling'), '"engine speed drops" tidak memesan slot tabel angka');
  t(wantsNumeric('swing motor weight') && wantsNumeric('engine speed standard'), 'pertanyaan berat / standar tetap memesan slot angka');

  // 2 Oct, 12:25: the right section ranked below the score bar; the judge must still find it.
  {
    resetSymptomIndex();
    const calls = [], seen = [], asked = [];
    const { d } = mockDeps([[]], {
      supabase: fakeSupabase([E10, NGEDROP, KORELASI], calls),
      rerank: rankerBy({ 'E-10': 0.41, 'Engine Ngedrop': 0.18 }, seen),
      generate: judge('[2]', asked),
    });
    const r = await run(d, 'ZX200-5G', ['engine speed drops when traveling', 'Rpm engine drop saat handle travel digerakkn'], 'Rpm engine drop saat handle travel digerakkn', 'Rpm engine drop');
    t(r.length === 1 && r[0] === NGEDROP, 'skor rendah (0,18) tapi dipilih verifikator → "Engine Ngedrop" disisipkan');
    t(seen.length === 2 && seen.includes('Rpm engine drop saat handle travel digerakkn'), 'kandidat dicari dengan kalimat Inggris DAN kalimat asli teknisi');
    t(asked[0]?.includes('Engine Ngedrop') && !asked[0]?.includes('CORRELATION'), 'verifikator melihat judul kandidat; tabel korelasi tidak ikut');
    t(calls.some(c => c[0] === 'filter' && c[2] === 'imatch' && c[3].startsWith('^Section: (TROUBLESHOOT')), 'indeks diambil lewat regex judul Section');
    t(calls.some(c => c[0] === 'contains' && c[2].Model === 'ZX200-5G'), 'indeks difilter per unit');
    await run(d, 'ZX200-5G', ['engine drops'], 'mesin ngedrop', 'mesin ngedrop');
    t(calls.filter(c => c[0] === 'filter').length === 1, 'indeks di-cache, database tidak dibaca ulang');
  }

  {
    resetSymptomIndex();
    const { d } = mockDeps([[]], { supabase: fakeSupabase([HST_WARN]), rerank: rankerBy({ 'HST WARNING': 0.9 }), generate: judge('[]') });
    const r = await run(d, 'ZW140', ['tire flat'], 'ban bocor', 'ban bocor');
    t(r.length === 0, 'verifikator bilang tidak ada yang cocok → tidak disisipkan walau skor 0,90');
  }

  {
    resetSymptomIndex();
    const { d } = mockDeps([[]], { supabase: fakeSupabase([E10, NGEDROP]), rerank: rankerBy({ 'Engine Ngedrop': 0.62, 'E-10': 0.18 }), generate: judge(new Error('429')) });
    const r = await run(d, 'ZX200-5G', ['engine drops'], 'mesin ngedrop', 'mesin ngedrop');
    t(r.length === 1 && r[0] === NGEDROP, 'verifikator gagal → hanya skor di atas ambang HIGH (0,62 masuk, 0,18 tidak)');
  }

  {
    resetSymptomIndex();
    const seen = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([HST_WARN]), rerank: rankerBy({}, seen) });
    const r = await run(d, 'ZW140', ['reverse solenoid resistance'], 'berapa resistansi solenoid', 'berapa resistansi solenoid');
    t(r.length === 0 && seen.length === 0, 'pertanyaan nilai (bukan keluhan) tidak memanggil reranker');
  }

  {
    resetSymptomIndex();
    const { d } = mockDeps([[]], { supabase: fakeSupabase([HST_WARN]), rerank: async () => ({ results: [], error: 'Rerank timeout (8s)' }) });
    const r = await run(d, 'ZW140', ['warning'], 'warning nyala', 'warning nyala');
    t(Array.isArray(r) && r.length === 0, 'reranker gagal → tanpa sisipan, jawaban tetap jalan');
  }

  // Achmad's session, 2 Oct: the short follow-up must be searched together with the complaint before it.
  {
    resetSymptomIndex();
    const seen = [], asked = [];
    let body = null;
    const { d } = mockDeps([[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]], {
      supabase: fakeSupabase([HST_WARN]),
      rerank: rankerBy({ 'HST WARNING': 0.22 }, seen),
      generate: judge('[1]', asked),
    });
    const stream = d.stream;
    d.stream = (b, m, cb, o) => { body = b; return stream(b, m, cb, o); };
    const history = [
      { role: 'user', content: 'Unit saat jalan di atas 13km/j akan muncul transmisi warning dan buzzer' },
      { role: 'assistant', content: 'Apakah warning tersebut muncul saat tuas di posisi Gigi 2?' },
    ];
    await runWithDeps(d, () => generateResponseStream('ZW140', 'Achmad', history, 'Iya di gigi2', () => {}));
    const sent = body.contents[body.contents.length - 1].parts[0].text;
    t(seen.some(q => q.includes('transmisi warning')) && asked[0]?.includes('transmisi warning'), 'balasan pendek dicari & dinilai bersama keluhan sebelumnya');
    t(sent.includes('MALFUNCTION OF HST WARNING INDICATOR') && sent.includes('[SIMTOM MANUAL PALING MIRIP'), 'section HST WARNING INDICATOR + label simtom sampai ke model');
    t(body.generationConfig.thinkingConfig.thinkingLevel === 'medium', 'lanjutan dari keluhan → thinking medium');
  }

  {
    resetSymptomIndex();
    const { d: staff } = mockDeps([[]], { supabase: fakeSupabase([NGEDROP]), rerank: rankerBy({ 'Engine Ngedrop': 0.9 }), generate: judge('[1]') });
    const { d: restricted } = mockDeps([[]], { supabase: fakeSupabase([]), rerank: rankerBy({ 'Engine Ngedrop': 0.9 }), generate: judge('[1]') });
    await run(staff, 'ZX200-5G', ['engine drops'], 'mesin ngedrop', 'mesin ngedrop');
    const r = await run(restricted, 'ZX200-5G', ['engine drops'], 'mesin ngedrop', 'mesin ngedrop');
    t(r.length === 0, 'a different JWT client cannot reuse documents cached by staff');
  }

  return done();
};
