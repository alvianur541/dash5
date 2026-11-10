const { detectLang, sessionLang, offTopicTemplate, faultCodeNotFoundTemplate, partsNotFoundTemplate, foreignModelTemplate, ragErrorTemplate, suite } = require('./helpers.cjs');

const hasID = t => /\b(tidak|kamu|aku|yang|bisa|dari|kalau|dulu|ketemu|saya)\b/i.test(t);

module.exports = async function () {
  const { t, done } = suite('bahasa: deteksi, kunci sesi, template multi-bahasa');

  t(detectLang('Can you explain about anti drift') === 'en', 'EN dikenali');
  t(detectLang('wie geht es dir') === null && sessionLang('wie geht es dir', []) === 'id', 'bahasa selain Indonesia/Inggris → Indonesia');
  t(detectLang('apa penyebab hst pump tidak keluar') === 'id', 'ID dikenali');
  t(detectLang('ok') === null, 'kata ambigu -> null (bukan default ID)');
  t(detectLang('I am using MPDr.') === 'en', '"I am using MPDr." → EN');
  t(detectLang("I've checked the sensor connector. It's clean.") === 'en', '"I\'ve checked … It\'s clean." → EN');
  t(detectLang('English, bro. English.') === 'en', '"English, bro" → EN');
  t(detectLang('fuse solenoid putus saat kontak on') === 'id', '"kontak on" tetap ID');
  t(detectLang('Oke, siap mantap. Thank you, arigatou.') !== 'en' && detectLang('Enggak usah, itu saja. Thank you, thank you.') === 'id', '"thank you" di obrolan Indonesia bukan tanda EN');
  t(detectLang('resistan CAN 0 ohm') !== 'en' && detectLang('Can you check the price?') === 'en', '"CAN" (CAN bus) bukan kata "can"');
  t(detectLang('Cek harga swing motor') === 'id' && detectLang('relay sudah saya ganti tapi masih sama') === 'id', 'kalimat teknisi Indonesia tetap ID');
  t(['can harness dan suplai daya normal semua', 'berapa hasil pengukuran jalur can pada masing masing controler', 'Standart pengukuran can h dan can l', 'can nya monitor 120. gmn cara vonis dia rusak?']
    .every(s => detectLang(s) === 'id'), '"jalur can"/"can harness" (huruf kecil, 20 Okt) bukan tanda EN');
  t(detectLang('can you check the relief pressure') === 'en', 'kalimat EN berawalan "can" tetap EN');
  t(sessionLang('Kabel can terkadang short to ground short to power', [{ role: 'user', content: 'Kenapa kabel can di twist' }]) === 'id', 'istilah teknik Inggris di kalimat Indonesia ("short to ground") tidak membalik bahasa (6 Nov)');
  t(detectLang('This unit have problem wiper motor') === 'en' && detectLang('Can you check price for swing bearing, please?') === 'en', 'kalimat Inggris teknisi tetap EN');
  t(sessionLang('kalau salah satu controller di cabut, berapa nilainya?', [{ role: 'user', content: 'I have checked it' }]) === 'id', 'pesan ID baru menang atas riwayat EN');
  t(sessionLang('Cara cek status Wiper 1 Input di MPDr', [], 'en') === 'en', 'petunjuk bahasa (ucapan asli teknisi) menang atas pertanyaan susunan ulang');

  const histEN = [
    { role: 'user', content: 'Can you explain about anti drift valve' },
    { role: 'assistant', content: 'The anti-drift valve holds the cylinder.' },
  ];
  t(sessionLang('ok', histEN) === 'en', 'balasan "ok" di sesi EN tetap EN');
  t(sessionLang('thanks', histEN) === 'en', 'balasan "thanks" di sesi EN tetap EN');

  t(sessionLang('apa itu relief valve', histEN) === 'id', 'ganti bahasa di tengah sesi diikuti');
  t(sessionLang('halo', []) === 'id', 'tanpa riwayat -> default ID');

  const offEN = offTopicTemplate('Who is the president of France?');
  t(/Sorry/.test(offEN) && !hasID(offEN), 'off-topic EN full English');
  const offOK = offTopicTemplate('ok', [{ role: 'user', content: 'Who is the president of France?' }]);
  t(/Sorry/.test(offOK), 'off-topic mengikuti bahasa sesi');

  const fcEN = faultCodeNotFoundTemplate('11006-2', 'ZX200-5G', 'en');
  t(/was not found/.test(fcEN) && !hasID(fcEN), 'fault-code EN full English');
  t(/11006-2/.test(fcEN) && /ZX200-5G/.test(fcEN), 'kode & model tetap utuh di semua bahasa');

  const pEN = partsNotFoundTemplate('seal kit', 'ZW140', 'en');
  t(/couldn't find parts/.test(pEN) && !hasID(pEN), 'parts EN full English');

  const fmEN = foreignModelTemplate('ZX350', 'ZX200-5G', 'en');
  t(/manual/.test(fmEN) && !/Waduh|belum ada di sistemku/.test(fmEN), 'foreign-model EN full English');

  t(/temporarily unavailable/.test(ragErrorTemplate('db down', 'en')), 'rag-error EN full English');
  t(ragErrorTemplate('rerank failed', 'en') === '', 'rerank error tetap kosong (tidak ganggu)');

  const noEmoji = s => !/[\u{1F300}-\u{1FAFF}]/u.test(s);
  t(noEmoji(offEN) && noEmoji(fmEN), 'template tanpa emoji');

  return done();
};
