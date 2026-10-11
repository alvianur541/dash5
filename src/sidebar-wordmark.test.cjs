const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const css = readFileSync(path.join(__dirname, 'index.css'), 'utf8');
const sidebar = readFileSync(path.join(__dirname, 'components/Sidebar.tsx'), 'utf8');

test('sidebar wordmarks have enough native pixels for a 3x phone without changing the box', () => {
  const height = Number(css.match(/\.sidebar-wordmark \{[^}]*height: (\d+)px/)[1]);
  assert.equal(height, 16);
  const files = [...sidebar.matchAll(/src="(\/hexindo-wordmark[^" ]*\.png)"/g)].map(match => match[1]);
  assert.ok(files.length > 0);
  for (const file of files) {
    const png = readFileSync(path.join(__dirname, '../public', file));
    const width = png.readUInt32BE(16);
    const nativeHeight = png.readUInt32BE(20);
    assert.ok(nativeHeight >= height * 3, `${file}: ${nativeHeight}px cannot supply ${height * 3}px at 3x`);
    assert.equal(width / nativeHeight, 229 / 44, 'preserve the original wordmark element aspect ratio');
    assert.match(file, /-v\d+\.png$/, 'new artwork needs a cache-safe filename');
  }
});
