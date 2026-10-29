const { lengkapiHarga, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

const WEB = {
  1102302: [{ pn: '1102302', nama: 'ROD;PISTON', harga: 'Rp 40.600.640' }],
  ZD00003084: [],
  YA00001392: [{ pn: 'YA00001392', nama: 'KIT;SEAL', harga: 'Rp 4.315.605' }],
  ZD00003202: [],
  XP00000080PS: [{ pn: 'XP00000080PS', nama: 'KIT SEAL', harga: 'Rp 5.583.303' }],
  YD00000471: [],
  YD00008373: [{ pn: 'YD00008373', nama: 'HARNESS;WIRE', harga: 'Rp 18.701.491' }],
};

module.exports = async () => {
  const { t, done } = suite('harga konsisten: kalimat "tidak terdaftar" tidak boleh membantah harga di tabel');
  resetHargaWebCache();
  const { d } = mockDeps([[]], { webPrice: async pn => WEB[pn] ?? [] });
  const run = text => runWithDeps(d, () => lengkapiHarga(text));

  {
    const ja = 'バケットシリンダーのピストンロッドについて確認しました。\n\nパーツカタログ（CYL.;BUCKET）上の部品番号（Part Number）の候補は `ZD00003084` および `1102302` ですが、現在のプロモデータおよび価格リストに当該部品の価格は登録されていません。\n\n| Part Number | 品名 | 価格 |\n| --- | --- | --- |\n| `ZD00003084` | ROD;PISTON | Belum tersedia |\n| `1102302` | ROD;PISTON | Rp 40.600.640 |\n\n最新の販売価格については、機番（S/N）でどちらの部品番号が適合するか確認の上、パーツカウンターへお問い合わせください。';
    const o = await run(ja);
    t(!/登録されていません/.test(o), 'JA: "価格は登録されていません" dibuang');
    t(o.includes('候補は `ZD00003084` および `1102302` です。'), 'JA: separuh kalimat yang benar (kandidat PN) tetap ada');
    t(!/パーツカウンター/.test(o), 'JA: suruhan ke Parts Counter dibuang');
    t(o.includes('| `1102302` | ROD;PISTON | Rp 40.600.640 |') && o.includes('| `ZD00003084` | ROD;PISTON | Belum tersedia |'), 'JA: tabel tidak berubah');
  }
  {
    const ja2 = 'バケットシリンダーのシールキットについて確認しました。\n\nパーツカタログおよびOHパッケージに記載されているシールキットの部品番号候補は以下の通りですが、現在適用中のプロモデータおよび価格リストに当該部品の価格は登録されていません。\n\n| Part Number | 品名 | Qty | 価格 |\n| --- | --- | --- | --- |\n| `YA00001392` | KIT;SEAL | 1 | Rp 4.315.605 |\n| `ZD00003202` | KIT;SEAL | 1 | Belum tersedia |\n| `XP00000080PS` | Kit seal lengkap | 1 | Rp 5.583.303 |';
    const o = await run(ja2);
    t(!/登録されていません/.test(o) && o.includes('Rp 4.315.605') && o.includes('Rp 5.583.303'), 'JA seal kit: klaim dibuang, harga tetap');
  }
  {
    const id = 'Di katalog cylinder bucket ZX200-5G, part number untuk rod cylinder tercatat `1102302` dan `ZD00003084`.\n\nSebagai catatan pembanding, harga rod yang muncul pada data di atas (`0998902` seharga Rp 37.120.000) adalah milik **boom cylinder**, bukan bucket cylinder.\n\n| Part Number | Nama Part | Harga |\n| :--- | :--- | :--- |\n| `1102302` | ROD;PISTON (Bucket) | Rp 40.600.640 |\n| `ZD00003084` | ROD;PISTON (Bucket) | Belum tersedia |\n\nSumber harga: Hexindoparts.com';
    const o = await run(id);
    t(!/Gagal dicek/.test(o.split('\n').filter(l => !l.startsWith('|')).join('\n')), 'harga tak terverifikasi di kalimat → tidak jadi "seharga Gagal dicek"');
    t(!/0998902/.test(o), 'kalimat berisi harga tak terverifikasi dibuang utuh');
    t(o.includes('tercatat `1102302` dan `ZD00003084`.') && o.includes('Sumber harga: Hexindoparts.com'), 'kalimat lain & sumber tetap');
  }
  {
    const id2 = '| Part Number | Nama Part | Harga |\n| :--- | :--- | :--- |\n| `YD00000471` | Main Harness | Belum tersedia |\n| `YD00008373` | HARNESS;WIRE | Rp 18.701.491 |\n\nHarga untuk PN `YD00000471` tidak terdaftar di data promo — konfirmasi ke Parts Counter. Coba cek nomor seri unitnya di nameplate.';
    const o = await run(id2);
    t(!/tidak terdaftar|Parts Counter/.test(o), 'ID: "tidak terdaftar" + Parts Counter dibuang bila tabel berisi harga');
    t(o.includes('Coba cek nomor seri unitnya di nameplate.'), 'ID: saran S/N tetap ada');
  }
  {
    const ppn = '| Part Number | Nama Part | Harga Promo |\n| :--- | :--- | :--- |\n| `1102302` | ROD;PISTON | Rp 40.600.640 |\n\nHarga belum termasuk PPN (periode promo berlaku 8 Oktober 2026 – 31 Desember 2026).';
    t((await run(ppn)).includes('Harga belum termasuk PPN'), 'catatan PPN promo tidak ikut terbuang');
    const kosong = '| Part Number | Nama Part | Harga |\n| :--- | :--- | :--- |\n| `ZD00003084` | ROD;PISTON | Belum tersedia |\n\nHarga `ZD00003084` tidak terdaftar di hexindoparts.com.';
    t((await run(kosong)).includes('tidak terdaftar di hexindoparts.com'), 'tabel tanpa satu pun harga → kalimat status tidak disentuh');
  }
  {
    const { generateResponseStream, USAGE } = require('./helpers.cjs');
    const CPM = { metadata: { Model: 'ZX200-5G', Kategori: 'CPM' }, content: 'Section: CPM MAINTENANCE SCHEDULE\nModel: ZX200-5G\nKategori: CPM\n\n  No   Part Description                           Part Number              500hr  1000hr  2000hr\n  1    Engine Oil Filter                          4658521                      1       1       1\n' };
    const q = { select() { return q; }, contains() { return q; }, ilike() { return q; }, filter() { return q; }, limit() { return q; }, or() { return q; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } };
    const supabase = { from: () => q, rpc: (_n, a) => Promise.resolve({ data: a.filter.Kategori === 'CPM' ? [{ ...CPM, similarity: 0.9 }] : [], error: null }) };
    const jawab = (teks) => [[{ text: teks, usageMetadata: USAGE, live: true, finishReason: 'STOP' }]];
    const webPrice = async pn => (pn === '4658521' ? [{ pn: '4658521', nama: 'FILTER;ENG OIL', harga: 'Rp 645.593' }] : []);
    let sent = null;
    resetHargaWebCache();
    const { d } = mockDeps(jawab('| Part Number | Nama Part | Qty | Harga |\n| :--- | :--- | :---: | :--- |\n| `4658521` | Engine Oil Filter | 1 | Rp 645.593 |\n\nSumber harga: Hexindoparts.com'), { supabase, embed: async () => [0.1], webPrice });
    const stream = d.stream; d.stream = (b, m, cb, o) => { sent = b; return stream(b, m, cb, o); };
    await runWithDeps(d, () => generateResponseStream('ZX200-5G', 'Alvianur', [], 'Pket 2000', () => {}));
    const user = sent.contents[sent.contents.length - 1].parts.map(p => p.text).join('\n');
    t(user.includes('[HARGA HEXINDOPARTS.COM') && !user.includes('CONFIDENCE: MEDIUM'), 'data berisi harga web → tanpa catatan "CONFIDENCE: MEDIUM"');
    t(d.meta.route === 'rag_found' && d.meta.confidence === undefined, `jawaban tabel berharga → dicatat data persis (confidence=${d.meta.confidence})`);
    resetHargaWebCache();
    let sent2 = null;
    const { d: d2 } = mockDeps(jawab('Filter oli diganti tiap 500 jam.'), { supabase, embed: async () => [0.1], webPrice: async () => [] });
    const s2 = d2.stream; d2.stream = (b, m, cb, o) => { sent2 = b; return s2(b, m, cb, o); };
    await runWithDeps(d2, () => generateResponseStream('ZX200-5G', 'Alvianur', [], 'Pket 2000', () => {}));
    const user2 = sent2.contents[sent2.contents.length - 1].parts.map(p => p.text).join('\n');
    t(user2.includes('CONFIDENCE: MEDIUM'), 'situs tanpa harga satu pun → catatan "CONFIDENCE: MEDIUM" tetap dikirim');
  }
  return done();
};
