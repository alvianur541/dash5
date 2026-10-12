const { test } = require('node:test');
const assert = require('node:assert/strict');
const { retryRank } = require('../server/upstream');

test('Google ranking retries once after a timeout (12 Oct: 2 of 94 asks lost ranking on one 4 s timeout)', async () => {
  let calls = 0;
  const out = await retryRank(async () => { if (++calls === 1) { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; } return ['ok']; });
  assert.deepEqual(out, ['ok']); assert.equal(calls, 2);
});

test('Google ranking retries a 5xx once but never retries 4xx or a second failure', async () => {
  let calls = 0;
  await assert.rejects(retryRank(async () => { calls++; const e = new Error('Google rank 400'); e.status = 400; throw e; }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retryRank(async () => { calls++; const e = new Error('Google rank 503'); e.status = 503; throw e; }));
  assert.equal(calls, 2);
});

test('degraded-ranking notice is plain language for technicians, no reranker jargon', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/templates.ts'), 'utf8');
  const note = src.slice(src.indexOf('RERANK_DEGRADED_NOTE'), src.indexOf(';', src.indexOf('RERANK_DEGRADED_NOTE')));
  assert.match(note, /WAJIB DISAMPAIKAN/);
  assert.match(note, /jangan sebut istilah/i);
  assert.doesNotMatch((note.split('BUKA jawabanmu')[1] || '').split('Jangan sebut')[0], /reranker|pemeringkat|tidak bisa dihubungi/i);
});
