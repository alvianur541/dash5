const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function renderApp(hostname, user = null, dismissed = false, loading = false) {
  const cache = new Map();
  const hooks = {
    useNetwork: () => ({ isOnline: true }),
    useTheme: () => ({ theme: 'light', toggle() {} }),
    useChat: () => ({ messages: [], mountedRef: {}, messagesRef: {}, lastSentRef: {} }),
    useModelSwitch: () => ({}), usePocket: () => ({}),
    useSwipeSidebar: () => ({}), useAppRefresh: () => ({}),
    useInputBarHeight() {},
    useLiveVoice: () => ({ phase: 'idle', active: false, allowed: false, start() {}, stop() {}, interrupt() {} }),
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const localRequire = id => {
      if (id.endsWith('/AuthProvider')) return { useAuth: () => ({ user, loading, login() {}, authError: null }) };
      if (id.includes('/hooks/')) return hooks;
      if (id === 'motion/react') return { m: { div: 'div', form: 'form' }, AnimatePresence: React.Fragment };
      if (id.startsWith('.')) {
        const name = path.basename(id);
        if (id.includes('components/') && name !== 'LoginPage') {
          return { [name]: () => null };
        }
        return load(path.resolve(path.dirname(file), id + (id.endsWith('/types') ? '.ts' : name === 'utils' ? '.ts' : '.tsx')));
      }
      return require(id);
    };
    vm.runInNewContext(transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic' }).code,
      { module, exports: module.exports, require: localRequire, window: { location: { hostname } }, sessionStorage: { getItem() { throw Error('must not read legacy storage'); }, setItem() { throw Error('must not persist'); } } });
    cache.set(file, module.exports);
    return module.exports;
  }
  return renderToStaticMarkup(React.createElement(load(path.join(__dirname, 'App.tsx')).default));
}

test('login has no demo request banner on any hostname', () => {
  for (const host of ['app.dash5.id', 'dash5.my.id', 'localhost', 'dash5.id']) {
    const html = renderApp(host);
    assert.match(html, /type="submit"/);
    assert.doesNotMatch(html, /Request demo access|demo-banner|mailto:alvianur@dash5.id|h000|dash5.internal|Demo Account/i);
  }
});

test('banner component and styles are gone', () => {
  assert.equal(require('node:fs').existsSync(path.join(__dirname, 'components/DemoBanner.tsx')), false);
  assert.doesNotMatch(readFileSync(path.join(__dirname, 'index.css'), 'utf8'), /demo-banner/);
});
