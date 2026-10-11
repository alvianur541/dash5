const assert = require('node:assert/strict');
const { barisPemakaian } = require('../server/observability');
module.exports = async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const d = { userName: 'fixture', sessionId: 'fixture', unit: 'fixture', usage: {input: 0, output: 0, calls: 0}, meta: {}, biaya: 0, user_id: 'spoof', is_internal: true };
  const before = process.env.INTERNAL_USERS;
  try {
    process.env.INTERNAL_USERS = id;
    const req = { authUser: {id, email: 'fixture@example.test'}, body: { user_id: 'spoof', is_internal: false } };
    assert.equal(barisPemakaian(req, d, true).user_id, id);
    assert.equal(barisPemakaian(req, d, true).is_internal, true);
    process.env.INTERNAL_USERS = 'OTHER@example.test';
    assert.equal(barisPemakaian(req, d, true).is_internal, false);
    process.env.INTERNAL_USERS = ' FIXTURE@EXAMPLE.TEST ';
    assert.equal(barisPemakaian(req, d, true).is_internal, true);
    process.env.INTERNAL_USERS = 'fixture, *@example.test';
    assert.equal(barisPemakaian(req, d, true).is_internal, false);
    process.env.INTERNAL_USERS = '';
    assert.equal(barisPemakaian(req, d, true).is_internal, false);
    assert.equal(barisPemakaian({body: req.body}, d, true).user_id, null);
    assert.equal(barisPemakaian({authUser: {id: 'invalid', email: 'fixture@example.test'}}, d, true).user_id, null);
    assert.equal('user_id' in barisPemakaian(req, d, true, false), false);
    assert.equal('is_internal' in barisPemakaian(req, d, true, false), false);
    assert.equal('ttft_ms' in barisPemakaian(req, d, true, false), true);
    console.log('usage identity: validated auth only; UUID/email config; schema compatibility passed');
    return true;
  } catch (e) { console.error(e); return false; }
  finally { if (before === undefined) delete process.env.INTERNAL_USERS; else process.env.INTERNAL_USERS = before; }
};
