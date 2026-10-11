const assert = require('node:assert/strict');
const express = require('express');
const { registerImageGeneration } = require('../server/image-generation');
module.exports = async () => {
  let generated = 0, finish;
  const app = express(); app.use(express.json());
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const verifyToken = (req, res, next) => { req.authUser = { id: req.headers['x-user'] || 'owner' }; next(); };
  const loadSession = async (req, id) => {
    assert.equal(id, sessionId);
    return { user_id: 'owner', messages: [{ id: 'a', role: 'assistant', content: 'Konsep belajar.' }] };
  };
  registerImageGeneration(app, { enabled: true, verifyToken, loadSession,
    generate: () => { generated++; return new Promise(resolve => { finish = () => resolve({ mimeType: 'image/jpeg', data: '/9j/AA==', imageCount: 1, usage: {} }); }); }, log() {} });
  const disabled = express(); disabled.use(express.json());
  registerImageGeneration(disabled, { enabled: false, verifyToken, loadSession, generate: () => { throw Error('must not call'); } });
  app.use('/disabled', disabled);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = { sessionId, messageId: 'a' };
  const post = (user = 'owner', prefix = '') => fetch(`${base}${prefix}/v1/images`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': user }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('owner', '/disabled')).status, 503);
    assert.equal((await post('other')).status, 404);
    assert.equal(generated, 0);
    const first = post();
    for (let i = 0; i < 100 && !finish; i++) await new Promise(r => setTimeout(r, 5));
    assert.ok(finish, 'generation started');
    assert.equal((await post()).status, 429);
    assert.equal(generated, 1);
    finish(); assert.equal((await first).status, 200);
    console.log('image-security: disabled, ownership and concurrent duplicate protections PASS');
    return true;
  } finally { if (finish) finish(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
};
if (require.main === module) module.exports().catch(e => { console.error(e); process.exitCode = 1; });
