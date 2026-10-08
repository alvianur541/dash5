const { suite } = require('./helpers.cjs');
const { demoLimit } = require('../server/auth');

module.exports = async () => {
  const { t, done } = suite('demo disabled until isolated retrieval is ready');
  for (const user of [{ email: 'h000@dash5.internal' }, { email: 'H000@dash5.internal' }, { email: 'renamed@example.test', app_metadata: { demo: true } }, { id: 'd2425fad-c49f-42dd-9249-9ad2738b7e0b', email: 'renamed@example.test' }]) {
    let passed = false, status;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    await demoLimit({ authUser: user }, res, () => { passed = true; });
    t(!passed && status === 503, `demo denied without quota RPC: ${user.email}`);
  }
  let passed = false;
  await demoLimit({ authUser: { email: 'h0001846@dash5.internal' } }, {}, () => { passed = true; });
  t(passed, 'staff not blocked');
  return done();
};
