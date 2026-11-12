const { rapikanFormat, generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

const H = (...pairs) => pairs.map((c, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', content: c, timestamp: i }));

module.exports = async function () {
  const { t, done } = suite('format jawaban dirapikan oleh kode, laporan hasil cek dijawab ringkas');

  const mentah = [
    'Pagi, Putut. Fokus kita di kontrol flow pump 2 *(Operational Principle — Pump Device)*.',
    '',
    '---',
    '',
    '### 1. Standar & Prosedur',
    '- Nilai normal `3.4` – `4.0 MPa` _(Troubleshooting Manual — T-2)_.',
    '## 2) Urutan cek',
    '| Part Number | Nama |',
    '| :--- | :--- |',
    '| `4658521` | Filter |',
    '***',
    '```',
    '---',
    '### 1. tetap',
    '```',
    'Kata *spool* tetap miring karena bukan sitasi.',
  ].join('\n');
  const rapi = rapikanFormat(mentah);
  t(rapi.includes('pump 2 (Operational Principle — Pump Device).') && rapi.includes('MPa` (Troubleshooting Manual — T-2).'), 'sitasi miring jadi teks biasa');
  t(!/^\s*(?:---|\*\*\*)\s*$/m.test(rapi.replace(/```[\s\S]*?```/g, '')), 'garis pemisah dibuang');
  t(rapi.includes('### Standar & Prosedur') && rapi.includes('## Urutan cek'), 'nomor di judul dibuang');
  t(rapi.includes('| :--- | :--- |') && rapi.includes('| `4658521` | Filter |'), 'tabel tidak disentuh');
  t(rapi.includes('```\n---\n### 1. tetap\n```'), 'isi blok kode tidak disentuh');
  t(rapi.includes('*spool*') && !/\n{3,}/.test(rapi), 'miring biasa tetap, tanpa baris kosong bertumpuk');
  t(rapikanFormat('Beratnya `48 kg` (Workshop Manual — Swing Motor).') === 'Beratnya `48 kg` (Workshop Manual — Swing Motor).', 'jawaban yang sudah rapi tidak berubah');

  const jalan = async (history, tanya, jawab) => {
    let kirim = '', hasil = '';
    const baris = { id: 1, metadata: { Model: 'ZX200-5G', Kategori: 'TROUBLESHOOTING' }, content: 'Section: Swing noise\nCheck pilot pressure.' };
    const { d } = mockDeps([[{ text: jawab, usageMetadata: USAGE, live: true, finishReason: 'STOP' }]], {
      supabase: (() => {
        const q = { select: () => q, contains: () => q, ilike: () => q, filter: () => q, limit: () => q, or: () => q, in: () => q,
          then: r => Promise.resolve({ data: [baris], error: null }).then(r) };
        return { from: () => q, rpc: () => Promise.resolve({ data: [{ ...baris, similarity: 0.9 }], error: null }) };
      })(),
      embed: async () => [0.1],
      rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
      generate: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'technical', optimizedQuery: 'swing noise pilot pressure' }) }] } }] }),
    });
    const stream = d.stream;
    d.stream = (body, model, cb, opts) => { kirim = body.contents.at(-1).parts[0].text; return stream(body, model, cb, opts); };
    hasil = await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', history, tanya, () => {}));
    return { kirim, hasil };
  };

  const lanjut = await jalan(H('Bunyi kasar ketika swing, oli sudah panas', 'Cek drain motor swing.'), 'Oli drain normal, relief valve sudah ditukar masih sama',
    'Area valve gugur *(Operational Principle — Swing Device)*.\n\n---\n\n### 1. Lanjut\nCek pilot.');
  t(/\[Ini laporan hasil cek\/ukur[^\]]*8 kalimat[^\]]*SATU pemeriksaan/.test(lanjut.kirim), 'laporan hasil cek di tengah kasus → catatan jawab ringkas ikut ke model');
  t(lanjut.hasil.includes('gugur (Operational Principle — Swing Device).') && !lanjut.hasil.includes('---') && lanjut.hasil.includes('### Lanjut'), 'jawaban akhir sudah dirapikan sebelum dikirim ke layar');

  const awal = await jalan([], 'Bunyi kasar ketika swing, oli drain normal', 'Oke.');
  t(!awal.kirim.includes('[Ini laporan hasil cek/ukur'), 'pesan pertama (belum ada jawaban AI) tidak dibatasi');
  return done();
};
