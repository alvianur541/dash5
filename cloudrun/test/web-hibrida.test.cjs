const { generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('web pelengkap: data manual + penelusuran Google digabung, manual tetap menang');

  const jalan = async (skor, chunks, tanya = 'bagaimana cara kerja pump regulator', history = []) => {
    let kirim = '', web = null, sistem = '';
    const layar = [];
    const baris = { id: 1, metadata: { Model: 'ZX200-5G', Kategori: 'OPERATIONAL PRINCIPLE' }, content: 'Section: Pump Device - Regulator\nThe regulator controls pump delivery flow.' };
    const { d } = mockDeps([chunks], {
      supabase: (() => {
        const q = { select: () => q, contains: () => q, ilike: () => q, filter: () => q, limit: () => q, or: () => q, in: () => q,
          then: r => Promise.resolve({ data: [baris], error: null }).then(r) };
        return { from: () => q, rpc: () => Promise.resolve({ data: [{ ...baris, similarity: 0.9 }], error: null }) };
      })(),
      embed: async () => [0.1],
      rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: skor })), source: 'google' }),
      generate: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'technical', optimizedQuery: 'pump regulator operation principle' }) }] } }] }),
    });
    const stream = d.stream;
    d.stream = (body, model, cb, opts) => {
      kirim = body.contents.at(-1).parts[0].text; sistem = body.systemInstruction.parts[0].text; web = opts?.enableGoogleSearch === true;
      return stream(body, model, cb, opts);
    };
    const hasil = await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', history, tanya, c => layar.push(c)));
    return { kirim, web, sistem, hasil, meta: d.meta, layar: layar.join('') };
  };
  const SUMBER = [{ title: 'hitachicm.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc' }, { title: 'www.Isuzu.co.jp', uri: 'https://x' },
    { title: 'hitachicm.com', uri: 'https://y' }, { title: 'Judul halaman bebas', uri: 'https://vertexaisearch.cloud.google.com/z' }, { title: 'google.com', uri: 'https://q' }];
  const jawab = (sources) => [{ text: 'Regulator mengatur flow pump (Operational Principle — Pump Device).', usageMetadata: USAGE, live: true, finishReason: 'STOP', sources }];

  process.env.WEB_PELENGKAP = 'medium';
  const sedang = await jalan(0.15, jawab(SUMBER));
  t(sedang.web === true && sedang.kirim.includes('[DATA MANUAL TERSEDIA]') && sedang.kirim.includes('The regulator controls pump delivery flow')
    && sedang.kirim.includes('[SUMBER EKSTERNAL — PELENGKAP]'), 'keyakinan sedang → data manual + izin web dikirim bersama');
  t(sedang.kirim.indexOf('[DATA MANUAL TERSEDIA]') < sedang.kirim.indexOf('[SUMBER EKSTERNAL — PELENGKAP]')
    && /sudah menjawab pertanyaannya, JANGAN menelusuri web/.test(sedang.kirim) && sedang.kirim.includes('[CONFIDENCE: MEDIUM'), 'sedang → web hanya bila manual belum menjawab');
  t(/Angka, standar ukur, PN, torque, tekanan, fault code, dan urutan prosedur HANYA dari data manual/.test(sedang.kirim), 'angka & prosedur tetap hanya dari manual');
  t(sedang.sistem.includes('# SUMBER EKSTERNAL') && sedang.sistem.includes('[SUMBER EKSTERNAL — PELENGKAP]'), 'seksi aturan web ikut di prompt');
  t(sedang.hasil.endsWith('Rujukan web: hitachicm.com · isuzu.co.jp') && sedang.layar.includes('Rujukan web: hitachicm.com'), 'situs rujukan ditulis di akhir jawaban, tanpa kembar & tanpa tautan sementara');
  t(sedang.meta.route === 'rag_web' && sedang.meta.cacheable !== true, 'tercatat sebagai rag_web dan tidak di-cache');
  t(!sedang.hasil.includes('SUMBER EKSTERNAL'), 'label sistem tidak bocor');

  const tanpaCari = await jalan(0.15, jawab(undefined));
  t(!tanpaCari.hasil.includes('Rujukan web') && tanpaCari.meta.cacheable === true, 'model tidak mencari → jawaban murni manual, tanpa baris rujukan');

  const lemah = await jalan(0.05, jawab(SUMBER));
  t(lemah.web === true && lemah.kirim.includes('The regulator controls pump delivery flow') && /PALING DEKAT dan relevansinya rendah/.test(lemah.kirim)
    && !lemah.kirim.includes('[CONFIDENCE: MEDIUM'), 'keyakinan rendah → data manual terdekat tetap ikut (dulu dibuang), web aktif');

  const kuat = await jalan(0.9, jawab(SUMBER));
  t(kuat.web === false && !kuat.kirim.includes('PELENGKAP') && !kuat.hasil.includes('Rujukan web') && kuat.meta.route === 'rag_found', 'keyakinan tinggi → tanpa web sama sekali');

  const H = [{ id: '0', role: 'user', content: 'Travel kiri lambat', timestamp: 0 }, { id: '1', role: 'assistant', content: 'Cek drain travel motor.', timestamp: 1 }];
  const laporan = await jalan(0.15, jawab(SUMBER), 'Drain motor normal, control valve sudah ditukar masih sama', H);
  t(laporan.web === false && !laporan.kirim.includes('PELENGKAP'), 'laporan hasil cek di tengah kasus → tanpa web (jaga kecepatan)');

  delete process.env.WEB_PELENGKAP;
  const hemat = await jalan(0.15, jawab(SUMBER));
  const bawaanLemah = await jalan(0.05, jawab(SUMBER));
  process.env.WEB_PELENGKAP = 'off';
  const mati = await jalan(0.05, jawab(SUMBER));
  delete process.env.WEB_PELENGKAP;
  t(hemat.web === false && hemat.meta.route === 'rag_found' && bawaanLemah.web === true && bawaanLemah.meta.route === 'rag_web', 'bawaan (low) → sedang tanpa web, rendah tetap manual + web');
  t(mati.web === true && mati.meta.route === 'google_technical' && !mati.kirim.includes('[DATA MANUAL TERSEDIA]') && /Cara mencari: kata kunci English/.test(mati.kirim),
    'WEB_PELENGKAP=off → perilaku lama (web saja) dengan panduan mencari');
  return done();
};
