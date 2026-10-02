const { findSymptomSections, isSymptomQuery, resetSymptomIndex, generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

// Real section titles (ZX200-5G Troubleshooting + Circuit Diagram, ZW140 Troubleshooting C).
const E10 = 'Section: TROUBLESHOOTING E-10 - When traveling or operating front attachment\nModel: ZX200-5G\nKategori: TROUBLESHOOTING\nSymptom: When traveling or operating front attachment with engine running at slow idle, engine hunts.';
const NGEDROP = 'Section: TROUBLESHOOTING HIDROLIK - Semua Gerakan Lemah / Tenaga Turun / Engine Ngedrop\nModel: ZX200-5G\nKategori: Circuit Diagram\nGejala: semua gerakan lemah, engine ngedrop saat dibebani.';
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
    then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
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

module.exports = async function () {
  const { t, done } = suite('simtom: keluhan dicocokkan ke judul simtom troubleshooting manual');

  t(isSymptomQuery('jika handle travel digerakkan mesin langsung ngedrop'), '"mesin langsung ngedrop" = keluhan');
  t(isSymptomQuery('muncul transmisi warning dan buzzer'), '"warning dan buzzer" = keluhan');
  t(isSymptomQuery('unit tidak bisa swing') && isSymptomQuery('Saat mundur lemah'), '"tidak bisa swing", "mundur lemah" = keluhan');
  t(isSymptomQuery('engine speed drops stalls when traveling'), 'kueri Inggris dari intent juga dikenali');
  t(!isSymptomQuery('berat swing motor') && !isSymptomQuery('harga oli hidrolik drum') && !isSymptomQuery('coba jelaskan fungsi dari regenerative valve'),
    'cek berat / harga / fungsi bukan keluhan');

  {
    resetSymptomIndex();
    const calls = [], seen = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([E10, NGEDROP, KORELASI].map(content => ({ content })), calls), rerank: rankerBy({ 'Engine Ngedrop': 0.62, 'E-10': 0.41 }, seen) });
    const r = await runWithDeps(d, () => findSymptomSections('ZX200-5G', 'engine speed drops when traveling — mesin ngedrop', 'mesin langsung ngedrop'));
    t(r[0] === NGEDROP, 'judul "Engine Ngedrop" (Circuit Diagram) jadi hasil pertama');
    t(!r.includes(E10), 'E-10 (0,41) tidak ikut: selisih > 0,1 dari yang terbaik');
    t(calls.some(c => c[0] === 'filter' && c[2] === 'imatch' && c[3].startsWith('^Section: (TROUBLESHOOT')), 'indeks diambil lewat regex judul Section');
    t(calls.some(c => c[0] === 'contains' && c[2].Model === 'ZX200-5G'), 'indeks difilter per unit');
    const again = await runWithDeps(d, () => findSymptomSections('ZX200-5G', 'engine drops', 'mesin ngedrop'));
    t(calls.filter(c => c[0] === 'filter').length === 1 && again[0] === NGEDROP, 'indeks di-cache, database tidak dibaca ulang');
  }

  {
    resetSymptomIndex();
    const seen = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([{ content: KORELASI }]), rerank: rankerBy({ 'CORRELATION': 0.9 }, seen) });
    const r = await runWithDeps(d, () => findSymptomSections('ZX200-5G', 'engine stalls', 'mesin mati'));
    t(r.length === 0 && seen.length === 0, 'tabel korelasi (tanda centang hilang) tidak masuk indeks');
  }

  {
    resetSymptomIndex();
    const { d } = mockDeps([[]], { supabase: fakeSupabase([{ content: HST_WARN }]), rerank: rankerBy({ 'HST WARNING': 0.18 }) });
    const r = await runWithDeps(d, () => findSymptomSections('ZW140', 'warning', 'warning nyala'));
    t(r.length === 0, 'skor di bawah ambang HIGH Google (0,30) → tidak disisipkan');
  }

  {
    resetSymptomIndex();
    const seen = [];
    const { d } = mockDeps([[]], { supabase: fakeSupabase([{ content: HST_WARN }]), rerank: rankerBy({}, seen) });
    const r = await runWithDeps(d, () => findSymptomSections('ZW140', 'reverse solenoid resistance', 'berapa resistansi solenoid'));
    t(r.length === 0 && seen.length === 0, 'pertanyaan nilai (bukan keluhan) tidak memanggil reranker');
  }

  {
    resetSymptomIndex();
    const { d } = mockDeps([[]], { supabase: fakeSupabase([{ content: HST_WARN }]), rerank: async () => ({ results: [], error: 'Rerank timeout (8s)' }) });
    const r = await runWithDeps(d, () => findSymptomSections('ZW140', 'warning', 'warning nyala'));
    t(Array.isArray(r) && r.length === 0, 'reranker gagal → tanpa sisipan, jawaban tetap jalan');
  }

  // Achmad's session, 2 Oct: the short follow-up must be searched together with the complaint before it.
  {
    resetSymptomIndex();
    const seen = [];
    let body = null;
    const INTENT = JSON.stringify({ shouldSearch: true, searchType: 'technical', optimizedQuery: 'HST warning indicator buzzer 2nd speed' });
    const { d } = mockDeps([[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]], {
      supabase: fakeSupabase([{ content: HST_WARN }]),
      rerank: rankerBy({ 'HST WARNING': 0.55 }, seen),
      generate: async () => ({ candidates: [{ content: { parts: [{ text: INTENT }] } }] }),
    });
    const stream = d.stream;
    d.stream = (b, m, cb, o) => { body = b; return stream(b, m, cb, o); };
    const history = [
      { role: 'user', content: 'Unit saat jalan di atas 13km/j akan muncul transmisi warning dan buzzer' },
      { role: 'assistant', content: 'Apakah warning tersebut muncul saat tuas di posisi Gigi 2?' },
    ];
    await runWithDeps(d, () => generateResponseStream('ZW140', 'Achmad', history, 'Iya di gigi2', () => {}));
    const sent = body.contents[body.contents.length - 1].parts[0].text;
    t(seen.some(q => q.includes('transmisi warning')), 'balasan pendek dicari bersama keluhan sebelumnya');
    t(sent.includes('MALFUNCTION OF HST WARNING INDICATOR') && sent.includes('[SIMTOM MANUAL PALING MIRIP'), 'section HST WARNING INDICATOR + label simtom sampai ke model');
    t(body.generationConfig.thinkingConfig.thinkingLevel === 'medium', 'lanjutan dari keluhan → thinking medium');
  }

  return done();
};
