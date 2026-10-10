const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const read = name => readFileSync(path.join(__dirname, name), 'utf8');
const css = read('index.css');
const tokens = selector => Object.fromEntries([...css.match(new RegExp(`${selector} \\{([^}]+)\\}`))[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const dark = tokens(':root');
const light = tokens('\\.light-theme');
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

test('neutral dark surfaces preserve readable primary, secondary and muted copy', () => {
  for (const key of ['--bg-app', '--bg-sidebar', '--bg-card', '--bg-card-hover']) {
    for (const text of ['--text-primary', '--text-secondary', '--text-muted']) {
      const ratio = (luminance(dark[text]) + 0.05) / (luminance(dark[key]) + 0.05);
      assert.ok(ratio >= 4.5, `${text} on ${key}: ${ratio.toFixed(2)}`);
    }
  }
  assert.equal(dark['--bg-app'], '#0B0B0D');
  assert.equal(dark['--border-main'], '#28282C');
});

test('user bubbles have dedicated neutral surfaces and AA body text in both themes', () => {
  for (const [theme, fill, border] of [[dark, '#2A2A2E', '#3B3B40'], [light, '#E5E1D8', '#D3CEC3']]) {
    assert.equal(theme['--bg-user-bubble'], fill);
    assert.equal(theme['--border-user-bubble'], border);
    const values = [luminance(theme['--text-primary']), luminance(fill)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5);
    assert.notEqual(fill, theme['--bg-card-hover']);
  }
  const bubble = css.match(/\.user-bubble \{([^}]+)\}/)[1];
  assert.match(bubble, /background: var\(--bg-user-bubble\)/);
  assert.match(bubble, /box-shadow: inset 0 0 0 1px var\(--border-user-bubble\)/);
  assert.match(bubble, /padding: 9px 14px/);
  assert.match(bubble, /font-size: 15px; font-weight: 400; line-height: 1\.65/);
  assert.match(bubble, /color: var\(--text-primary\)/);
});

test('light palette and Hexindo accent remain unchanged', () => {
  assert.deepEqual(Object.fromEntries(['--bg-app', '--bg-sidebar', '--bg-card', '--bg-card-hover', '--text-primary', '--text-secondary', '--text-muted', '--border-main'].map(k => [k, light[k]])), {
    '--bg-app': '#FAF9F5', '--bg-sidebar': '#F5F4EF', '--bg-card': '#FFFFFF', '--bg-card-hover': '#F1EFE9', '--text-primary': '#1A1915', '--text-secondary': '#46443E', '--text-muted': '#6F6C63', '--border-main': 'rgba(0, 0, 0, 0.06)',
  });
  for (const theme of [dark, light]) {
    assert.equal(theme['--accent-main'], '#D97757');
    assert.equal(theme['--accent-active'], '#C2634A');
  }
});

test('landing font roles use versioned self-hosted woff2 files', () => {
  assert.match(css, /--font-sans:\s*"DM Sans"/);
  assert.match(css, /--font-heading:\s*"Space Grotesk"/);
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic|font-family: 'Inter'/);
  for (const font of ['dm-sans-400', 'dm-sans-500', 'dm-sans-600', 'space-grotesk']) {
    const file = `/fonts/${font}-v1.woff2`;
    assert.ok(css.includes(file));
    assert.equal(readFileSync(path.join(__dirname, '../public', file)).subarray(0, 4).toString(), 'wOF2');
  }
  assert.match(read('../index.html'), /preload[^>]+dm-sans-400-v1\.woff2/);
  assert.match(read('lib/tableImage.ts'), /const SANS = '"DM Sans"/);
});

test('15px conversation has a distinct heading hierarchy and dense PN tables', () => {
  assert.match(css, /\.markdown-body \{\s*font-family: var\(--font-sans\);\s*font-size: 15px/);
  assert.match(css, /\.markdown-body h2 \{ font-size: 17px; \}/);
  assert.match(css, /\.markdown-body code \{\s*font-family: var\(--font-mono\)/);
  assert.match(css, /\.markdown-body table \{ width: max-content; min-width: 100%; \}/);
  assert.match(css, /\.markdown-body table code\.code-copy \{ font-size: 12\.5px; \}/);
});

test('theme browser chrome agrees and switching remains instantaneous', () => {
  assert.match(read('hooks/useTheme.ts'), /dark: '#0B0B0D', light: '#FAF9F5'/);
  assert.match(read('../index.html'), /theme-color" content="#0B0B0D"/);
  assert.match(css, /\.theme-switching \*::after \{\s*transition: none !important;/);
  assert.doesNotMatch(read('hooks/useTheme.ts'), /startViewTransition/);
  assert.match(read('components/LoginPage.tsx'), /relative h-full/);
});
