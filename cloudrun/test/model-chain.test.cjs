const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('text model defaults and fallback');
  const env = { ...process.env };
  delete env.VERTEX_MODEL;
  delete env.FALLBACK_MODELS;
  delete env.ALLOWED_MODELS;
  const probe = `
    const assert = require('node:assert/strict');
    const { MODEL_CHAIN, callProxyStream, runWithDeps, mockDeps, BODY, USAGE } = require('./test/helpers.cjs');
    const { ALLOWED_MODELS } = require('./server/config.js');
    assert.deepEqual(MODEL_CHAIN, ['gemini-3.8-flash', 'gemini-3.7-flash']);
    assert(ALLOWED_MODELS.has('gemini-3.8-flash'));
    assert(ALLOWED_MODELS.has('gemini-3.7-flash'));
    const { d } = mockDeps([
      [{ error: 'Resource exhausted', code: 429 }],
      [{ text: 'Fallback response.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }],
    ]);
    const models = [];
    const stream = d.stream;
    d.stream = (body, model, cb) => { models.push(model); return stream(body, model, cb); };
    runWithDeps(d, async () => {
      assert.equal(await callProxyStream(BODY, () => {}), 'Fallback response.');
      assert.deepEqual(models, ['gemini-3.8-flash', 'gemini-3.7-flash']);
      assert.equal(d.meta.fallbackTo, 'gemini-3.7-flash');
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `;
  try {
    execFileSync(process.execPath, ['-e', probe], { cwd: path.join(__dirname, '..'), env, stdio: 'pipe' });
    t(true, 'default chain is 3.8 → 3.7; both allowed; primary 429 selects 3.7');
  } catch (error) {
    t(false, 'default chain is 3.8 → 3.7; both allowed; primary 429 selects 3.7');
    console.error(error.stderr?.toString() || error.message);
  }
  return done();
};
