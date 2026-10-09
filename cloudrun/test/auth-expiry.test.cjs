const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { suite } = require('./helpers.cjs');
module.exports = async () => {
  const { t, done } = suite('JWT cache expiry (offline auth provider fixture)');
  let now = 100000, fetches = 0;
  const module = { exports: {} };
  const config = { ...require('../server/config'), SUPABASE_URL: 'https://fixture.test', SUPABASE_ANON_KEY: 'fixture', AUTH_CACHE_TTL_MS: 60000 };
  const token = `fixture.${Buffer.from(JSON.stringify({ exp: 101 })).toString('base64url')}.fixture`;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../server/auth.js'), 'utf8'), {
    module, require: () => config, console, AbortSignal, Buffer, Date: { now: () => now },
    fetch: async () => { fetches++; return { ok: now < 101000, json: async () => ({ id: 'fixture-user' }) }; },
  });
  const verify = async () => {
    let passed = false, status;
    const res = { status(n) { status = n; return this; }, json() {} };
    await module.exports.verifyToken({ headers: { authorization: `Bearer ${token}` } }, res, () => { passed = true; });
    return { passed, status };
  };
  t((await verify()).passed, 'provider-verified unexpired token is accepted');
  now = 100500;
  t((await verify()).passed && fetches === 1, 'unexpired JWT may use bounded auth cache');
  now = 102000;
  const expired = await verify();
  t(!expired.passed && expired.status === 401, 'cached token must not remain authorized after JWT expiration');
  return done();
};
