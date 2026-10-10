const b = require('./helpers.cjs');
module.exports = async () => {
  const { t, done } = b.suite('Immutable resolved question');
  t(typeof b.resolveQuestion === 'function', 'one request contract exists');
  if (!b.resolveQuestion) return done();
  const h = [{ role:'user', content:'Fuse No.4 terminal b short' }, { role:'assistant', content:'Standar 999 Ω, semua a satu busbar.' }];
  const r = b.resolveQuestion('kabel power d diputus, tidak short, hasil ukur 49 Ω',h,'ZX138MF-5G');
  t(r.text.includes('Fuse No.4') && r.text.includes('tidak short') && r.measurements.includes('49 Ω'), 'topic, new condition, literal measurement preserved');
  t(!r.text.includes('999') && !r.text.includes('busbar'), 'previous AI facts are never evidence');
  t(Object.isFrozen(r) && Object.isFrozen(r.userContext) && r.raw === 'kabel power d diputus, tidak short, hasil ukur 49 Ω', 'deep-frozen user literals');
  const fresh = b.resolveQuestion('berapa berat travel device',h,'ZX200-5G');
  t(fresh.userContext.length === 0 && !fresh.text.includes('Fuse'), 'new explicit component does not inherit old question');
  const newTopic = b.resolveQuestion('berapa berat travel device yang itu', h, 'ZX200-5G');
  t(!newTopic.text.includes('Fuse'), 'explicit new component does not inherit old fault even with colloquial pointer');
  return done();
};
