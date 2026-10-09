const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { transpileModule } = require('typescript');
const { runInNewContext } = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, 'components/ChatWindow.tsx'), 'utf8');
const detector = source.slice(source.indexOf('function partNoColumn('), source.indexOf('const NOTE_RE'));
const { partNoColumn } = runInNewContext(transpileModule(detector + '\n({ partNoColumn });', {}).outputText);
const el = (tag, children, custom = false) => ({ type: custom ? () => null : tag, props: { node: { tagName: tag }, children } });
const table = (headers, custom = false) => [el('thead', el('tr', headers.map(header => el('th', header, custom)), custom), custom), el('tbody', el('tr', [el('td', 'PN'), el('td', 'ignore body headers')]), custom)];

test('PN stays sticky when react-markdown renders header components instead of host th elements', () => {
  for (const custom of [false, true]) {
    assert.equal(partNoColumn(table(['Part Number', 'Nama Part', 'Qty', 'Harga'], custom)), 1);
    assert.equal(partNoColumn(table(['No', 'PN', 'Nama Part', 'Qty'], custom)), 2);
    assert.equal(partNoColumn(table(['No', 'Nama', 'Nomor Part', 'Qty'], custom)), 3);
    assert.equal(partNoColumn(table(['No', 'Nama Part', 'Qty', 'Harga'], custom)), 0);
  }
});
