const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

async function loadComponent() {
  const result = await build({
    entryPoints: [path.join(__dirname, 'AnswerPresentation.tsx')], bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'lucide-react'],
  });
  const context = { module: { exports: {} }, exports: {}, require, console };
  context.exports = context.module.exports;
  vm.runInNewContext(result.outputFiles[0].text, context);
  return context.module.exports.AnswerPresentation;
}

const source = { documentId: '42', title: 'Electrical Manual', category: 'MANUAL', section: 'Battery' };

test('renders exact specification with semantic data and adjacent provenance', async () => {
  const AnswerPresentation = await loadComponent();
  const presentation = { version: 1, blocks: [
    { type: 'spec_value', label: 'Battery voltage', value: '12', unit: 'V', unitModel: 'ZX200-5G', facts: [{ label: 'Condition', value: 'Key ON' }], sources: [source] },
    { type: 'markdown', content: 'Battery voltage adalah 12 V.' },
  ] };
  const html = renderToStaticMarkup(React.createElement(AnswerPresentation, { presentation }));
  assert.match(html, /aria-label="Spesifikasi teknis terverifikasi"/);
  assert.match(html, /<dl/);
  assert.match(html, />12<\/span><span[^>]*>V<\/span>/);
  assert.match(html, /ZX200-5G/);
  assert.match(html, /Electrical Manual/);
  assert.doesNotMatch(html, /Battery voltage adalah 12 V\./);
});

test('renders Technical News with bulletin identity, affected model, and source', async () => {
  const AnswerPresentation = await loadComponent();
  const presentation = { version: 1, blocks: [
    { type: 'technical_news', bulletinId: '06/TSD-CE/TN/9/2023', date: '2023-09-06', title: 'Main & Floor Harness', affectedModels: ['ZX48U-5A'], sources: [{ ...source, category: 'TECHNICAL NEWS' }] },
    { type: 'markdown', content: 'Technical News 06/TSD-CE/TN/9/2023.' },
  ] };
  const html = renderToStaticMarkup(React.createElement(AnswerPresentation, { presentation }));
  assert.match(html, /aria-label="Technical News terverifikasi"/);
  assert.match(html, /06\/TSD-CE\/TN\/9\/2023/);
  assert.match(html, /ZX48U-5A/);
  assert.match(html, /Electrical Manual/);
});
