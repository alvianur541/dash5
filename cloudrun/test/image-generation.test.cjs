const assert = require('node:assert/strict');
const express = require('express');

module.exports = async () => {
  const mod = require('../server/image-generation');
  const app = express();
  app.use(express.json());
  let generated = 0;
  const logs = [];
  mod.registerImageGeneration(app, {
    enabled: true,
    verifyToken: (req, res, next) => {
      if (req.headers.authorization !== 'Bearer test') return res.sendStatus(401);
      req.authUser = { id: 'owner' }; req.authToken = 'test'; next();
    },
    loadSession: async (req, id) => id === '11111111-1111-4111-8111-111111111111'
      ? { user_id: req.authUser.id, model: 'ZX200-5G', messages: [{ id: 'u', role: 'user', content: 'Jelaskan proses belajar' }, { id: 'a', role: 'assistant', content: 'Baca, pahami, lalu latihan.' }] } : null,
    generate: async (context) => { generated++; assert.match(context.answer, /Baca/); return { mimeType: 'image/jpeg', data: '/9j/AA==', usage: { promptTokenCount: 4 }, imageCount: 1 }; },
    log: (entry) => logs.push(entry),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/v1/images`;
  const body = { sessionId: '11111111-1111-4111-8111-111111111111', messageId: 'a' };
  const post = (b, authorized = true) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer test' } : {}) }, body: JSON.stringify(b) });
  try {
    assert.equal((await post(body, false)).status, 401);
    assert.equal(generated, 0);
    assert.equal((await post({ ...body, sessionId: '22222222-2222-4222-8222-222222222222' })).status, 404);
    assert.equal((await post({ ...body, answer: 'forged context' })).status, 400);
    assert.equal((await post({ ...body, messageId: 'wiring' })).status, 409);
    const response = await post(body);
    assert.equal(response.status, 200);
    const image = await response.json();
    assert.equal(image.mimeType, 'image/jpeg');
    assert.match(image.disclaimer, /bukan wiring diagram resmi/);
    assert.equal(generated, 1);
    assert.equal(logs[0].route, 'image_generation');
    assert.equal((await post(body)).status, 200);
    const limited = await post(body);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '600');
    assert.equal(generated, 2);
    console.log('image-generation: authenticated owned answer → illustration PASS');
    return true;
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
};
if (require.main === module) module.exports().catch(e => { console.error(e); process.exitCode = 1; });
