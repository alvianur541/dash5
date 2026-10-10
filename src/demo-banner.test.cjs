const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function renderApp(hostname, user = null) {
  const cache = new Map();
  const hooks = {
    useNetwork: () => ({ isOnline: true }),
    useTheme: () => ({ theme: 'light', toggle() {} }),
    useChat: () => ({ messages: [], mountedRef: {}, messagesRef: {}, lastSentRef: {} }),
    useModelSwitch: () => ({}), usePocket: () => ({}),
    useSwipeSidebar: () => ({}), useAppRefresh: () => ({}),
    useInputBarHeight() {},
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const localRequire = id => {
      if (id.endsWith('/AuthProvider')) return { useAuth: () => ({ user, loading: false, login() {}, authError: null }) };
      if (id.includes('/hooks/')) return hooks;
      if (id === 'motion/react') return { m: { div: 'div', form: 'form' }, AnimatePresence: React.Fragment };
      if (id.startsWith('.')) {
        const name = path.basename(id);
        if (id.includes('components/') && !['LoginPage', 'DemoBanner', 'MoveBanner'].includes(name)) {
          return { [name]: () => null };
        }
        return load(path.resolve(path.dirname(file), id + (id.endsWith('/types') ? '.ts' : name === 'utils' ? '.ts' : '.tsx')));
      }
      return require(id);
    };
    vm.runInNewContext(transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic' }).code,
      { module, exports: module.exports, require: localRequire, window: { location: { hostname } }, sessionStorage: { getItem: () => null } });
    cache.set(file, module.exports);
    return module.exports;
  }
  return renderToStaticMarkup(React.createElement(load(path.join(__dirname, 'App.tsx')).default));
}

test('app hostname login offers portfolio demo access without credentials', () => {
  const html = renderApp('app.dash5.id');
  assert.match(html, /Demo access/);
  assert.match(html, /For portfolio review/);
  assert.match(html, /Contact us for sign-in details\./);
  assert.match(html, /href="mailto:alvianur@dash5.id"/);
  assert.doesNotMatch(html, /h000|dash5\.internal|Demo Account/i);
  assert.match(html, /autoComplete="username"/);
  assert.match(html, /value=""/);
});

test('old and unrelated hostnames have neither portfolio nor migration banners', () => {
  for (const host of ['dash5.my.id', 'localhost', 'dash5.id', 'app.dash5.id.example.com']) {
    const html = renderApp(host);
    assert.doesNotMatch(html, /Demo access|Aplikasi pindah|move-banner|mailto:alvianur@dash5.id/);
  }
});

test('authenticated app never interrupts chat with demo access', () => {
  for (const host of ['app.dash5.id', 'dash5.my.id']) {
    const html = renderApp(host, { uid: 'fixture', displayName: 'Reviewer' });
    assert.doesNotMatch(html, /Demo access|Aplikasi pindah|move-banner/);
  }
});
