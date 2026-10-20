const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');

async function loadValidator() {
  const result = await build({
    entryPoints: [path.join(__dirname, 'presentation.ts')], bundle: true, write: false, platform: 'node', format: 'cjs',
  });
  const context = { module: { exports: {} }, console };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return context.module.exports;
}

const markdown = 'Battery voltage adalah 12 V.\n\nSumber: Electrical Manual.';
const source = { documentId: '42', title: 'Electrical Manual', category: 'MANUAL', section: 'Battery' };
const valid = {
  version: 1,
  blocks: [
    { type: 'spec_value', label: 'Battery voltage', value: '12', unit: 'V', unitModel: 'ZX200-5G', sources: [source] },
    { type: 'markdown', content: markdown },
  ],
};

test('accepts a source-bound V1 presentation whose markdown exactly matches the final answer', async () => {
  const { validateAnswerPresentation } = await loadValidator();
  assert.deepEqual(validateAnswerPresentation(valid, markdown), valid);
});

test('accepts tightening torque units emitted from the real ZW140 manual table', async () => {
  const { validateAnswerPresentation } = await loadValidator();
  const torqueMarkdown = 'HST Motor mounting bolts: 232 N⋅m (24 kgf⋅m, 170 lbf⋅ft).';
  const torque = {
    version: 1,
    blocks: [
      { type: 'spec_value', label: 'HST Motor mounting bolts', value: '232', unit: 'N⋅m',
        alternateValues: [{ value: '24', unit: 'kgf⋅m' }, { value: '170', unit: 'lbf⋅ft' }],
        unitModel: 'ZW140', sources: [source] },
      { type: 'markdown', content: torqueMarkdown },
    ],
  };
  assert.deepEqual(validateAnswerPresentation(torque, torqueMarkdown), torque);
});

test('fails closed for unsupported, malformed, or markdown-mismatched presentations', async () => {
  const { validateAnswerPresentation } = await loadValidator();
  for (const payload of [
    { ...valid, version: 2 },
    { ...valid, blocks: [{ ...valid.blocks[0], unitModel: 'ZX999' }, valid.blocks[1]] },
    { ...valid, blocks: [{ ...valid.blocks[0], sources: [{ ...source, documentId: '0' }] }, valid.blocks[1]] },
    { ...valid, blocks: [{ ...valid.blocks[0], value: '<b>12</b>' }, valid.blocks[1]] },
    { ...valid, blocks: [valid.blocks[0], { type: 'markdown', content: 'different answer' }] },
    { ...valid, blocks: [valid.blocks[1]] },
  ]) assert.equal(validateAnswerPresentation(payload, markdown), undefined);
});
