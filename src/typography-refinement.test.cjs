const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const read = file => readFileSync(path.join(__dirname, file), 'utf8');
const css = read('index.css').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = selector => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].trim() === selector).map(m => m[2]).join(';');
const property = (selector, name) => rule(selector).match(new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+)`))?.[1].trim();

test('conversation prose and user messages are exactly 15px with uniform 24.75px leading', () => {
  for (const selector of ['.markdown-body', '.user-bubble', '.pocket-question']) {
    assert.equal(property(selector, 'font-size'), '15px');
    assert.equal(property(selector, 'line-height'), '1.65');
  }
  assert.doesNotMatch(css, /@media[^{}]*\{\s*\.markdown-body\s*\{/);
  assert.equal(property('body', 'font-size'), '14px');
});

test('heading size, weight and spacing establish a relative hierarchy', () => {
  const sizes = ['h1', 'h2', 'h3'].map(tag => parseFloat(property(`.markdown-body ${tag}`, 'font-size')));
  assert.deepEqual(sizes, [18, 17, 16]);
  assert.ok(sizes.every(size => size > 15));
  assert.match(css, /font-weight: 650;[\s\S]*margin-top: 1\.55em;\s*margin-bottom: 0\.4em/);
});

test('composer keeps the 16px iOS floor and 24px leading', () => {
  const input = read('components/MessageInput.tsx');
  assert.match(input, /text-\[16px\][^\n]+leading-\[24px\]/);
});

test('surrounding navigation and modal roles stay subordinate to conversation prose', () => {
  const sidebar = read('components/Sidebar.tsx');
  assert.match(sidebar, /font-heading text-\[14px\] truncate/);
  assert.doesNotMatch(sidebar, /text-\[11\.5px\]/);
  assert.match(sidebar, /text-\[12px\] font-semibold uppercase/);
  assert.match(read('components/ConfirmDialog.tsx'), /font-heading font-semibold text-\[17px\]/);
  assert.match(read('components/ModelSheet.tsx'), /text-\[17px\] font-heading/);
  assert.match(read('components/ChangePasswordDialog.tsx'), /font-heading font-semibold text-\[17px\]/);
  assert.match(read('components/SupportModal.tsx'), /text-\[17px\] font-heading/);
  assert.equal(property('.topbar-model-name', 'font-size'), '15px');
});

test('table rows remain dense, nowrap and deliberately horizontally scrollable', () => {
  assert.equal(property('.markdown-body table', 'font-size'), '14px');
  assert.match(rule('.markdown-body table'), /width: max-content; min-width: 100%/);
  assert.equal(property('.markdown-table-wrap', 'overflow-x'), 'auto');
  assert.match(css, /\.markdown-body tbody td, \.markdown-body td\.md-text \{ white-space: nowrap; \}/);
  assert.match(css, /\.markdown-body td\.md-long \{ white-space: normal; min-width: 16em; max-width: 22em; \}/);
  assert.equal(property('.markdown-body table code.code-copy', 'font-size'), '12.5px');
  assert.equal(property('.markdown-body code', 'font-family'), 'var(--font-mono)');
  assert.match(read('components/ChatWindow.tsx'), /overflow-x-hidden/);
});
