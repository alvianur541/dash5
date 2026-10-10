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
        if (id.includes('components/') && !['LoginPage', 'DemoBanner', 'MoveBanner'].includes(name)) {
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

test('app login has one compact request strip before the login page', () => {
  const html = renderApp('app.dash5.id');
  assert.equal((html.match(/Request demo access/g) || []).length, 1);
  assert.match(html, /class="demo-banner" role="status"/);
  assert.match(html, /type="button" aria-label="Tutup"/);
  assert.ok(html.indexOf('demo-banner') < html.indexOf('login-theme-btn'));
  assert.doesNotMatch(html, /Demo access|For portfolio review|Contact us/);
  assert.match(html, /href="mailto:alvianur@dash5.id"/);
  assert.doesNotMatch(html, /h000|dash5\.internal|Demo Account/i);
  assert.match(html, /autoComplete="username"/);
  assert.match(html, /value=""/);
});

test('legacy session dismissal is ignored after reload', () => {
  for (const user of [null, { uid: 'fixture', displayName: 'Reviewer' }]) {
    assert.equal((renderApp('app.dash5.id', user, true).match(/Request demo access/g) || []).length, user ? 0 : 1);
  }
});

test('old and unrelated hostnames have neither portfolio nor migration banners', () => {
  for (const host of ['dash5.my.id', 'localhost', 'dash5.id', 'app.dash5.id.example.com']) {
    const html = renderApp(host);
    assert.doesNotMatch(html, /Request demo access|demo-banner|Demo access|Aplikasi pindah|move-banner|mailto:alvianur@dash5.id/);
  }
});

test('authenticated app never has a request strip or extra banner wrapper', () => {
  const user = { uid: 'fixture', displayName: 'Reviewer' };
  const html = renderApp('app.dash5.id', user);
  assert.doesNotMatch(html, /Request demo access|demo-banner|min-h-0 flex-1/);
  for (const host of ['dash5.my.id', 'localhost', 'dash5.id', 'app.dash5.id.example.com']) {
    assert.doesNotMatch(renderApp(host, user), /Request demo access|demo-banner|move-banner/);
  }
});

test('close lasts only for the mounted banner and remount restores it', () => {
  let closed;
  const module = { exports: {} };
  const stateReact = { ...React, useState: initial => {
    if (closed === undefined) closed = initial;
    return [closed, value => { closed = value; }];
  } };
  vm.runInNewContext(transformSync(readFileSync(path.join(__dirname, 'components/DemoBanner.tsx'), 'utf8'),
    { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module, exports: module.exports,
    require: id => id === 'react' ? stateReact : require(id),
    window: { location: { hostname: 'app.dash5.id' } },
    sessionStorage: { getItem() { throw Error('must not read persistence'); }, setItem() { throw Error('must not persist dismissal'); } },
  });
  const render = module.exports.DemoBanner;
  assert.ok(render());
  render().props.children[1].props.onClick();
  assert.equal(render(), null);
  closed = undefined;
  assert.ok(render());
});

test('auth loading has no request strip', () => {
  assert.doesNotMatch(renderApp('app.dash5.id', null, true, true), /Request demo access|demo-banner/);
});
