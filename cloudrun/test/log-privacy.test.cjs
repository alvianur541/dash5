const { ringkasTanya } = require('../server/observability');
const { suite } = require('./helpers.cjs');
module.exports = async () => {
  const { t, done } = suite('request log privacy');
  const personal = 'fixture private identity and private question';
  const summary = ringkasTanya(personal, 1);
  t(!summary.includes('private') && summary.includes(String(personal.length)), 'question summary records length, never question contents');
  t(summary.includes('[+foto]'), 'photo marker remains available for diagnostics');
  return done();
};
