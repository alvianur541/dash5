const { lengkapiHarga, hargaPromo, tanpaHargaDb, promoAktif, PROMO_KATEGORI, PROMO_BERAKHIR, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

// Promo Q3 FY2026 (id 10669-10721, 8 Okt - 31 Des 2026): format baru dengan kolom [Keterangan unit].
const CHUNK = [
  'Section: PROMO Q3 FY2026 - FILTER PARTS (Engine Oil, Fuel, Air Cleaner, Hydraulic, AC, Breather)',
  'Model: ZX200-5G',
  'Kategori: PROMO Q3 FY2026',
  "Document: PROMO Q3 FY'26 (Hitachi Parts Promo Q3 FY2026)",
  '',
  'Periode Promo  : 8 Oktober 2026 - 31 Desember 2026',
  'Ketentuan      : Harga dalam Rupiah (IDR), belum termasuk PPN. Diskon dihitung dari harga normal.',
  '                 Pemesanan harus diinvoice dalam periode promo.',
  '',
  '  Part Number            | Description                              |     Harga Normal | Disc |      Harga Promo  [Keterangan unit]',
  '  --------------------------------------------------------------------------------------------------------------',
  '  4658521                | Engine Oil Filter                        |       Rp 645.593 |  20% |       Rp 516.474',
  '  4719920                | Filter;Fuel                              |     Rp 1.283.781 |  20% |     Rp 1.027.025  [Unit: ZX250-5G]',
  '',
  'Total: 2 part number dalam bagian ini.',
].join('\n');

module.exports = async () => {
  const { t, done } = suite('promo Q3 FY2026: routing, periode, harga promo tidak ditimpa safety net');
  t(PROMO_KATEGORI === 'PROMO Q3 FY2026' && PROMO_BERAKHIR === '2026-12-31', 'kategori & tanggal akhir Q3');
  const jkt = iso => new Date(`${iso}+07:00`);
  t(promoAktif(jkt('2026-10-10T09:00:00')) && promoAktif(jkt('2026-12-31T23:59:00')) && !promoAktif(jkt('2027-01-01T00:01:00')), 'aktif 10 Okt s/d 31 Des WIB');

  const map = hargaPromo(`[WEB]\n  4658521 | X | Rp 1\n\n${CHUNK}`);
  t(map.get('4658521')?.has('516474') && map.get('4658521')?.has('645593') && !map.get('4658521')?.has('1'), 'harga promo terbaca per PN, blok lain diabaikan');
  t(map.get('4719920')?.has('1027025'), 'baris bertanda [Unit: …] tetap terbaca');

  resetHargaWebCache();
  let webCalls = [];
  const { d } = mockDeps([[]], { webPrice: async pn => { webCalls.push(pn); return [{ pn, nama: 'X', harga: 'Rp 700.000' }]; } });
  const jawab = [
    '| Part Number | Nama Part | Harga Normal | Disc | Harga Promo |',
    '|---|---|---|---|---|',
    '| `4658521` | Engine Oil Filter | Rp 645.593 | 20% | Rp 516.474 |',
    '| `YA00020592` | Valve | Rp 9.999.999 |  |  |',
    '',
    'Harga promo filter oli Rp 516.474, belum termasuk PPN. Total kira-kira Rp 123.456.',
  ].join('\n');
  const out = await runWithDeps(d, () => lengkapiHarga(jawab, map));
  t(out.includes('| Rp 645.593 | 20% | Rp 516.474 |'), 'baris promo yang cocok data tidak disentuh');
  t(!webCalls.includes('4658521'), 'PN promo tidak dicek ulang ke web');
  t(out.includes('Rp 700.000') && !out.includes('9.999.999'), 'PN non-promo tetap diverifikasi web');
  t(out.includes('filter oli Rp 516.474') && !out.includes('123.456'), 'angka prosa: promo dipertahankan, karangan dibuang');

  resetHargaWebCache();
  webCalls = [];
  const salah = await runWithDeps(d, () => lengkapiHarga('| Part Number | Nama | Harga Promo |\n|---|---|---|\n| 4658521 | Filter | Rp 400.000 |', map));
  t(salah.includes('Rp 516.474') && !salah.includes('400.000') && !salah.includes('Rp 700.000'), `kolom promo yang tidak sesuai data → harga promo dari data, bukan harga web (${salah.split('\\n')[2]})`);
  const tanpaMap = await runWithDeps(d, () => lengkapiHarga('Harga Rp 516.474.'));
  t(!tanpaMap.includes('516.474'), 'tanpa data promo (promo berakhir) perilaku lama tetap');

  const off = tanpaHargaDb(CHUNK);
  t(!/Rp\s?\d/.test(off) && !/promo|Ketentuan|Pemesanan|Keterangan unit/i.test(off), `setelah berakhir format Q3 bersih (${(off.match(/.*(promo|Ketentuan|Pemesanan|Keterangan).*/gi) || []).join(' / ')})`);
  t(/4719920\s+\| Filter;Fuel\s+\[Unit: ZX250-5G\]/.test(off), 'tanda unit sekelas tetap ada tanpa harga');

  // Regresi 10 Okt (sesi 61d14c6c): paket service 1000 — blok "--- HARGA PROMO" tanpa Section, dua kolom harga.
  {
    const blok = ['--- HARGA PROMO (khusus PN di atas) ---', 'Periode Promo  : 8 Oktober 2026 - 31 Desember 2026',
      '4616545                | Fuel Filter                              |       Rp 342.747 |  20% |       Rp 274.198',
      'HTCDH1P                | HTC ENG OIL DH1 PAIL                     |     Rp 2.337.200 |  15% |     Rp 1.986.620'].join('\n');
    const m = hargaPromo(blok);
    t(m.get('4616545')?.has('274198') && m.get('HTCDH1P')?.has('1986620'), 'baris promo di blok paket terbaca');
    resetHargaWebCache();
    const webP = { '4616545': 'Rp 342.747', 'HTCDH1P': 'Rp 2.337.200', 'YA00058283': 'Rp 759.296' };
    const { d: d2 } = mockDeps([[]], { webPrice: async pn => [{ pn, nama: 'X', harga: webP[pn] }] });
    const paket = [
      '| Part Number | Nama Part | Qty | Harga Normal | Harga Promo |',
      '| :--- | :--- | :---: | :--- | :--- |',
      '| `YA00058283` | Engine Oil Filter | 1 | Rp 759.296 | Rp 607.437 |',
      '| `4616545` | Primary Fuel Filter | 1 | Rp 342.747 | Rp 274.198 |',
      '| `HTCDH1P` | HTC ENG OIL DH1 PAIL | 2 | Rp 2.337.200 | Rp 1.986.620 |',
      '| **Total** | | | **Rp 5.776.443** | **Rp 4.247.438** |',
      '',
      'Total promo Rp 4.247.438, hemat Rp 999.',
    ].join('\n');
    const o = await runWithDeps(d2, () => lengkapiHarga(paket, m));
    t(!/Gagal dicek/.test(o.split('\n').slice(2, 5).join('\n')), `kolom promo tidak jadi "Gagal dicek" (${o.split('\n')[3]})`);
    t(o.includes('| Rp 342.747 | Rp 274.198 |') && o.includes('| Rp 2.337.200 | Rp 1.986.620 |'), 'harga normal web + promo data dipertahankan');
    t(/`YA00058283` \| Engine Oil Filter \| 1 \| Rp 759.296 \| - \|/.test(o), `PN tanpa promo: kolom promo "-", bukan angka karangan (${o.split('\n')[2]})`);
    t(o.includes('**Rp 5.776.443**') && o.includes('**Rp 4.247.438**') && o.includes('Total promo Rp 4.247.438'), 'total yang cocok jumlah kolom (x qty) dipertahankan');
    t(!o.includes('Rp 999'), 'angka prosa karangan tetap dibuang');
  }

  // End-to-end: promo aktif → jawaban model dengan harga promo dari data tidak dirusak safety net.
  const { generateResponseStream } = require('./helpers.cjs');
  process.env.PROMO_UJI = 'on';
  try {
    resetHargaWebCache();
    const q = { select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res); } };
    const rpc = args => (args.filter.Kategori === PROMO_KATEGORI ? [{ id: 10671, metadata: { Model: 'ZX200-5G', Kategori: PROMO_KATEGORI }, content: CHUNK, similarity: 0.8 }] : []);
    const jawabModel = '| Part Number | Nama Part | Harga Normal | Disc | Harga Promo |\n|---|---|---|---|---|\n| `4658521` | Engine Oil Filter | Rp 645.593 | 20% | Rp 516.474 |';
    const { d } = mockDeps([[{ text: jawabModel, usageMetadata: require('./helpers.cjs').USAGE, live: true, finishReason: 'STOP' }]],
      { supabase: { from: () => q, rpc: (_n, a) => Promise.resolve({ data: rpc(a), error: null }) }, embed: async () => [0.1],
        webPrice: async pn => [{ pn, nama: 'X', harga: 'Rp 700.000' }] });
    let sent = null;
    const stream = d.stream;
    d.stream = (body, model, cb, opts) => { sent = body; return stream(body, model, cb, opts); };
    const hasil = await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Tes', [], 'harga filter oli engine', () => {}));
    const teks = typeof hasil === 'string' ? hasil : (hasil?.text ?? '');
    const user = sent.contents[sent.contents.length - 1].parts.map(p => p.text).join('\n');
    const sys = sent.systemInstruction.parts[0].text;
    t(user.includes('Rp 516.474') && user.includes('Periode Promo  : 8 Oktober 2026'), 'promo aktif → harga & periode Q3 sampai ke model');
    t(sys.includes('CONTROL VALVE KIT') && sys.includes('[Unit: …]') && !sys.includes('REMAN COMPONENT'), 'system prompt: section Q3 ZX200 + aturan unit sekelas');
    t(teks.includes('| Rp 645.593 | 20% | Rp 516.474 |'), `jawaban promo utuh setelah safety net (${teks.slice(-120)})`);
  } finally { process.env.PROMO_UJI = 'off'; }
  return done();
};
