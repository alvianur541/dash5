const { classifyAspect, fallbackDecompose, suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('multi-aspect: classify + regex fallback');

  t(classifyAspect('travel device part number') === 'parts', 'PN → parts only');
  t(classifyAspect('travel device weight') === 'spec', 'weight → spec only');
  t(classifyAspect('swing motor seal kit price') === 'parts', 'price → parts only');
  t(classifyAspect('swing device removal installation procedure') === 'spec', 'procedure → spec only');
  t(classifyAspect('bucket pin') === 'both', 'no hint → both');

  const fb1 = fallbackDecompose('part number travel device dan beratnya');
  t(fb1.length === 2 && fb1.includes('travel device part number') && fb1.includes('travel device weight'), `PN+berat → ${JSON.stringify(fb1)}`);
  const fb2 = fallbackDecompose('berat swing motor sama diameternya');
  t(fb2.length === 2 && fb2[0] === 'swing motor weight' && fb2[1] === 'swing motor diameter', `berat+diameter → ${JSON.stringify(fb2)}`);
  t(fallbackDecompose('harga seal kit swing').length === 0, 'single attr → empty (no fallback)');
  t(fallbackDecompose('swing lambat dan pump bocor').length === 0, 'symptoms without attr → empty');
  return done();
};
