const fs = require('fs');
const path = require('path');
const { suite } = require('./helpers.cjs');

const NODE = 'node:24.22.1-alpine';
const read = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
const froms = text => [...text.matchAll(/^FROM\s+(\S+)/gim)].map(m => m[1]);

module.exports = async function () {
  const { t, done } = suite('runtime pins: patched Node 24 LTS everywhere, nginx untouched');
  const backend = froms(read('cloudrun/Dockerfile'));
  const frontend = froms(read('deploy/Dockerfile.frontend'));
  t(backend.length === 2 && backend.every(f => f === NODE), `backend build + runtime = ${NODE} (${backend.join(', ')})`);
  t(frontend[0] === NODE, `frontend build stage = ${NODE} (${frontend[0]})`);
  t(frontend[1] === 'nginx:alpine', `frontend runtime stays nginx:alpine (${frontend[1]})`);
  t(![...backend, ...frontend].some(f => /node:(?:1\d|20|21|22|23)\b/.test(f)), 'no end-of-life or older Node image left');
  const ci = read('.github/workflows/ci.yml');
  t(!/node-version:\s*20\b/.test(ci) && /node-version:\s*24/.test(ci), 'CI runs Node 24');
  return done();
};
