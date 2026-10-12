const { unitFeatureIntent, suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('kelebihan/keunggulan unit selalu dicari di brosur, tidak dijawab "kirim ulang"');
  const general = { searchType: 'general', shouldSearch: false, optimizedQuery: '' };
  for (const q of ['Coba jelaskan kelebihan unitny', 'apa keunggulan unit ini', 'fitur unggulan ZX200-5G apa saja', 'what are the advantages of this unit']) {
    const r = unitFeatureIntent(q, general);
    t(r.shouldSearch === true && r.searchType === 'technical' && /features/.test(r.optimizedQuery), `dicari: "${q}"`);
  }
  for (const q of ['halo', 'kamu bisa apa aja', 'oke makasih']) t(unitFeatureIntent(q, general) === general, `obrolan tetap obrolan: "${q}"`);
  const tech = { searchType: 'technical', shouldSearch: true, optimizedQuery: 'swing motor weight' };
  t(unitFeatureIntent('kelebihan swing motor', tech) === tech, 'intent teknis yang sudah mencari tidak diubah');
  return done();
};
