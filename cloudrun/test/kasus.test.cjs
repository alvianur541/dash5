const { catatKasus, blokKasus, adalahLaporan, generateResponseStream, runWithDeps, mockDeps, suite, USAGE } = require('./helpers.cjs');

const H = (...pairs) => pairs.map((c, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', content: c, timestamp: i }));

module.exports = async function () {
  const { t, done } = suite('catatan kasus: agen memegang hasil ukur dan cek teknisi sepanjang sesi');

  const swing = H(
    'Bunyi kasar ketika unit swing kondisi oli sudah panas', 'Cek level oli dan drain motor swing.',
    'Level oli normal. Dominan aliran hidrolik', 'Lanjut cek drain.',
    'Oli drain normal . motor suwing sudah di ganti dengan yang normal', 'Cek pump control.',
    'Pump 2 control terbaca 2mpa setekah shut off lever dibuka handle belum digerakan', 'Cek swing pilot.',
  );
  const k = catatKasus(swing, 'Swing pilot pressure terbaca 0.2mpa saat netral');
  t(/Bunyi kasar ketika unit swing/.test(k.keluhan), `keluhan awal dipegang (${k.keluhan})`);
  t(k.fakta.some(f => /Level oli normal/.test(f)) && k.fakta.some(f => /Oli drain normal/.test(f)) && k.fakta.some(f => /sudah di ganti/.test(f)), 'hasil cek & penggantian part tercatat');
  t(k.fakta.some(f => /2mpa/.test(f)), 'hasil ukur dengan satuan tercatat');
  t(!k.fakta.some(f => /0\.2mpa/.test(f)), 'pesan yang sedang dijawab tidak digandakan ke catatan');

  const blok = blokKasus(swing, 'Swing pilot pressure terbaca 0.2mpa saat netral');
  t(/^\n\n\[CATATAN KASUS[^\]]*BUKAN data manual\]/.test(blok) && /Keluhan awal:/.test(blok) && /1\. /.test(blok), 'blok berlabel klaim teknisi, bernomor');

  t(blokKasus(H('berapa berat travel device', 'Beratnya 310 kg.'), 'kalau harga travel device') === '', 'obrolan tanya spec/harga tanpa laporan → tanpa catatan');
  t(blokKasus([], 'unit ngga bisa swing') === '', 'pertanyaan pertama → tanpa catatan');
  t(adalahLaporan('Fuse 17 ketika kontak di off kan ada 003.7V') && adalahLaporan('Relief normal') && adalahLaporan('Sensor sudah ditukar dan tetap pompa 2 eror'), 'laporan hasil ukur/cek dikenali');
  t(!adalahLaporan('berapa tekanan relief standar?') && !adalahLaporan('fungsi solenoid sg'), 'pertanyaan bukan laporan');

  const banyak = H(...Array.from({ length: 30 }, (_, i) => (i % 2 ? 'Oke.' : `Hasil ukur titik ${i} terbaca ${i + 1} volt`)));
  t(catatKasus(banyak, 'lanjut').fakta.length === 8, 'paling banyak 8 fakta terbaru');

  let kirim = '';
  const { d } = mockDeps([[{ text: 'Oke.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]], {
    supabase: (() => {
      const q = { select: () => q, contains: () => q, ilike: () => q, filter: () => q, limit: () => q, or: () => q, in: () => q,
        then: r => Promise.resolve({ data: [{ id: 1, metadata: { Model: 'ZX200-5G', Kategori: 'TROUBLESHOOTING' }, content: 'Section: Swing noise\nCheck pilot pressure.' }], error: null }).then(r) };
      return { from: () => q, rpc: () => Promise.resolve({ data: [{ id: 1, metadata: { Model: 'ZX200-5G', Kategori: 'TROUBLESHOOTING' }, content: 'Section: Swing noise\nCheck pilot pressure.', similarity: 0.9 }], error: null }) };
    })(),
    embed: async () => [0.1],
    rerank: async (_q, docs) => ({ results: docs.map((_, i) => ({ index: i, score: 0.9 })), source: 'google' }),
    generate: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ shouldSearch: true, searchType: 'technical', optimizedQuery: 'swing pilot pressure neutral' }) }] } }] }),
  });
  const stream = d.stream;
  d.stream = (body, model, cb, opts) => { kirim = body.contents.at(-1).parts[0].text; return stream(body, model, cb, opts); };
  await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', swing, 'Swing pilot pressure terbaca 0.2mpa saat netral', () => {}));
  t(kirim.includes('[CATATAN KASUS') && kirim.includes('Oli drain normal') && kirim.indexOf('[CATATAN KASUS') < kirim.indexOf('[DATA MANUAL TERSEDIA]'), 'catatan kasus ikut ke model, sebelum data manual');
  return done();
};
