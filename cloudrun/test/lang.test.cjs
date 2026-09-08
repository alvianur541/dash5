const { detectLang, sessionLang, offTopicTemplate, faultCodeNotFoundTemplate, partsNotFoundTemplate, foreignModelTemplate, ragErrorTemplate, suite } = require('./helpers.cjs');

const JP = /[\u3040-\u30ff\u4e00-\u9fff]/;
const hasID = t => /\b(tidak|kamu|aku|yang|bisa|dari|kalau|dulu|ketemu|saya)\b/i.test(t);

module.exports = async function () {
  const { t, done } = suite('bahasa: deteksi, kunci sesi, template multi-bahasa');

  t(detectLang('Can you explain about anti drift') === 'en', 'EN dikenali');
  t(detectLang('腕の動きが遅いのはどうやってチェックするの？') === 'ja', 'JA dikenali');
  t(detectLang('apa penyebab hst pump tidak keluar') === 'id', 'ID dikenali');
  t(detectLang('ok') === null, 'kata ambigu -> null (bukan default ID)');

  const histEN = [
    { role: 'user', content: 'Can you explain about anti drift valve' },
    { role: 'assistant', content: 'The anti-drift valve holds the cylinder.' },
  ];
  t(sessionLang('ok', histEN) === 'en', 'balasan "ok" di sesi EN tetap EN');
  t(sessionLang('thanks', histEN) === 'en', 'balasan "thanks" di sesi EN tetap EN');

  const histJA = [{ role: 'user', content: 'やあ、アームが遅いです' }];
  t(sessionLang('oke', histJA) === 'ja', 'balasan singkat di sesi JA tetap JA');

  t(sessionLang('apa itu relief valve', histEN) === 'id', 'ganti bahasa di tengah sesi diikuti');
  t(sessionLang('halo', []) === 'id', 'tanpa riwayat -> default ID');

  const offEN = offTopicTemplate('Who is the president of France?');
  t(/Sorry/.test(offEN) && !hasID(offEN), 'off-topic EN full English');
  const offJA = offTopicTemplate('フランスの大統領は誰ですか？');
  t(JP.test(offJA) && /対応範囲外/.test(offJA), 'off-topic JA full Jepang');
  const offOK = offTopicTemplate('ok', [{ role: 'user', content: 'Who is the president of France?' }]);
  t(/Sorry/.test(offOK), 'off-topic mengikuti bahasa sesi');

  const fcEN = faultCodeNotFoundTemplate('11006-2', 'ZX200-5G', 'en');
  t(/was not found/.test(fcEN) && !hasID(fcEN), 'fault-code EN full English');
  const fcJA = faultCodeNotFoundTemplate('11006-2', 'ZX200-5G', 'ja');
  t(JP.test(fcJA) && /見つかりません/.test(fcJA), 'fault-code JA full Jepang');
  t(/11006-2/.test(fcEN) && /ZX200-5G/.test(fcJA), 'kode & model tetap utuh di semua bahasa');

  const pEN = partsNotFoundTemplate('seal kit', 'ZW140', 'en');
  t(/couldn't find parts/.test(pEN) && !hasID(pEN), 'parts EN full English');
  t(JP.test(partsNotFoundTemplate('seal kit', 'ZW140', 'ja')), 'parts JA full Jepang');

  const fmEN = foreignModelTemplate('ZX350', 'ZX200-5G', 'en');
  t(/manual/.test(fmEN) && !/Waduh|belum ada di sistemku/.test(fmEN), 'foreign-model EN full English');
  t(JP.test(foreignModelTemplate('ZX350', 'ZX200-5G', 'ja')), 'foreign-model JA full Jepang');

  t(/temporarily unavailable/.test(ragErrorTemplate('db down', 'en')), 'rag-error EN full English');
  t(JP.test(ragErrorTemplate('db down', 'ja')), 'rag-error JA full Jepang');
  t(ragErrorTemplate('rerank failed', 'en') === '', 'rerank error tetap kosong (tidak ganggu)');

  const noEmoji = s => !/[\u{1F300}-\u{1FAFF}]/u.test(s);
  t(noEmoji(offEN) && noEmoji(offJA) && noEmoji(fmEN), 'template tanpa emoji');

  return done();
};
