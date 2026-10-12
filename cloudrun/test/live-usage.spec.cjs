const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveUsage } = require('../server/live-usage');
const snapshot = {
  promptTokenCount: 600, responseTokenCount: 300, totalTokenCount: 900,
  thoughtsTokenCount: 20,
  promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }, { modality: 'AUDIO', tokenCount: 200 }, { modality: 'VIDEO', tokenCount: 300 }],
  responseTokensDetails: [{ modality: 'TEXT', tokenCount: 50 }, { modality: 'AUDIO', tokenCount: 200 }, { modality: 'IMAGE', tokenCount: 50 }],
};
test('Live replaces updates within a turn, bills history again for distinct turns, and never doubles thoughts', () => {
  const usage = createLiveUsage();
  usage.observe({ usageMetadata: { ...snapshot, promptTokenCount: 100, responseTokenCount: 50, totalTokenCount: 150, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }], responseTokensDetails: [{ modality: 'TEXT', tokenCount: 50 }] } });
  usage.observe({ usageMetadata: snapshot });
  usage.observe({ usageMetadata: snapshot });
  usage.observe({ serverContent: { turnComplete: true } });
  const result = usage.summary();
  assert.equal(result.prompt_tokens, 600);
  assert.equal(result.response_tokens, 300);
  assert.equal(result.total_tokens, 900);
  assert.equal(result.thoughts_tokens, 20);
  assert.deepEqual(result.input_tokens, { TEXT: 100, AUDIO: 200, VIDEO: 300, IMAGE: 0 });
  assert.deepEqual(result.output_tokens, { TEXT: 50, AUDIO: 200, VIDEO: 0, IMAGE: 50 });
  assert.equal(result.usage_available, true);
  assert.equal(result.cost_complete, true);
  assert.equal(result.cost_usd, 0.00365);
  assert.equal(result.cost_idr, 65.61605);
  usage.observe({ usageMetadata: snapshot, serverContent: { turnComplete: true } });
  usage.observe({ usageMetadata: snapshot, serverContent: { turnComplete: true } });
  assert.equal(usage.summary().total_tokens, 900);
  usage.markActivity();
  usage.observe({ usageMetadata: snapshot, serverContent: { turnComplete: true } });
  assert.equal(usage.summary().total_tokens, 1800);
  assert.equal(usage.summary().billed_turns, 2);
  assert.equal(usage.summary().cost_usd, 0.0073);
});
test('no metadata is unavailable, never free usage', () => {
  const result = createLiveUsage().summary();
  assert.equal(result.usage_available, false);
  assert.equal(result.cost_complete, false);
  assert.equal(result.cost_usd, null);
  assert.equal(result.cost_idr, null);
  assert.equal(result.input_tokens, null);
  assert.equal(result.output_tokens, null);
});
test('missing or unknown modalities cannot silently price aggregate tokens as text or free', () => {
  for (const bad of [
    { promptTokenCount: 600, responseTokenCount: 300, totalTokenCount: 900 },
    { ...snapshot, promptTokensDetails: [{ modality: 'DOCUMENT', tokenCount: 600 }] },
    { ...snapshot, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 100 }] },
    { ...snapshot, promptTokensDetails: [{ modality: 'TEXT', tokenCount: -1 }] },
  ]) {
    const usage = createLiveUsage(); usage.observe({ usageMetadata: bad });
    const result = usage.summary();
    assert.equal(result.usage_available, true);
    assert.equal(result.cost_complete, false);
    assert.equal(result.cost_usd, null);
    assert.equal(result.cost_idr, null);
  }
});
test('snake case transport fields preserve modalities and resolve separately reported thinking only once', () => {
  const usage = createLiveUsage();
  usage.observe({ usage_metadata: {
    prompt_token_count: 600, response_token_count: 300, total_token_count: 920, thoughts_token_count: 20,
    prompt_tokens_details: snapshot.promptTokensDetails.map(x => ({ modality: x.modality, token_count: x.tokenCount })),
    response_tokens_details: snapshot.responseTokensDetails.map(x => ({ modality: x.modality, token_count: x.tokenCount })),
  }, server_content: { turn_complete: true } });
  const result = usage.summary();
  assert.equal(result.output_tokens.TEXT, 70);
  assert.equal(result.response_tokens, 300);
  assert.equal(result.cost_complete, true);
  assert.equal(result.cost_usd, 0.00374);
});
test('unpriced tool-context or cache breakdown is explicit, never an invented complete price', () => {
  for (const metadata of [
    { ...snapshot, totalTokenCount: 905, toolUsePromptTokenCount: 5 },
    { ...snapshot, cachedContentTokenCount: 5 },
  ]) {
    const usage = createLiveUsage(); usage.observe({ usageMetadata: metadata });
    assert.equal(usage.summary().cost_complete, false);
    assert.equal(usage.summary().cost_idr, null);
  }
});
test('work after last metadata leaves an observed cost but not a complete session cost', () => {
  const usage = createLiveUsage(); usage.observe({ usageMetadata: snapshot, serverContent: { turnComplete: true } });
  usage.markActivity();
  assert.equal(usage.summary().cost_complete, false);
  assert.equal(usage.summary().cost_usd, 0.00365);
  usage.observe({ usageMetadata: snapshot, serverContent: { turnComplete: true } });
  assert.equal(usage.summary().cost_complete, true);
});
test('inconsistent aggregate and modality counts cannot produce a trusted price', () => {
  const usage = createLiveUsage(); usage.observe({ usageMetadata: snapshot });
  usage.observe({ usageMetadata: { ...snapshot, totalTokenCount: 10, promptTokenCount: 10, responseTokenCount: 0 } });
  assert.equal(usage.summary().cost_complete, false);
  assert.equal(usage.summary().cost_usd, null);
});
test('a priced in-flight turn is not labeled a complete session cost', () => {
  const usage = createLiveUsage(); usage.observe({ usageMetadata: snapshot });
  assert.equal(usage.summary().cost_complete, false);
  assert.equal(usage.summary().cost_usd, 0.00365);
  usage.observe({ serverContent: { turnComplete: true } });
  assert.equal(usage.summary().cost_complete, true);
});
test('separate turns may have decreasing context/output counts and must both be billed', () => {
  const usage = createLiveUsage();
  usage.observe({ usageMetadata: snapshot, serverContent: { turnComplete: true } });
  usage.observe({ serverContent: { modelTurn: { parts: [] } } });
  usage.observe({ usageMetadata: { promptTokenCount: 10, responseTokenCount: 2, totalTokenCount: 12,
    promptTokensDetails: [{ modality: 'TEXT', tokenCount: 10 }], responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 2 }] }, serverContent: { turnComplete: true } });
  assert.equal(usage.summary().total_tokens, 912);
  assert.equal(usage.summary().output_tokens.AUDIO, 202);
  assert.equal(usage.summary().cost_complete, true);
});
module.exports = { snapshot };

test('Vertex Live candidatesTokenCount frame (captured 12 Oct 2026) is priced, not left unknown', () => {
  const { createLiveUsage } = require('../server/live-usage');
  const u = createLiveUsage();
  u.observe({ serverContent: { modelTurn: { parts: [] } } });
  u.observe({ usageMetadata: { promptTokenCount: 1267, candidatesTokenCount: 128, totalTokenCount: 1474, promptTokensDetails: [{ modality: 'TEXT', tokenCount: 1267 }], candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: 111 }, { modality: 'TEXT', tokenCount: 17 }], thoughtsTokenCount: 79 }, serverContent: { turnComplete: true } });
  const s = u.summary();
  assert.equal(s.response_tokens, 128);
  assert.deepEqual(s.output_tokens, { TEXT: 96, AUDIO: 111, VIDEO: 0, IMAGE: 0 });
  assert.ok(Math.abs(s.cost_usd - (1267 * 0.75 + 111 * 12 + 96 * 4.5) / 1e6) < 1e-12);
  assert.equal(s.cost_complete, true);
});
