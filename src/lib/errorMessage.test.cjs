const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const vm = require('node:vm');
const context = { module: { exports: {} } };
vm.runInNewContext(transformSync(readFileSync(path.join(__dirname, 'errorMessage.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, context);
const { errorMessage } = context.module.exports;
for (const [status, expected] of [[401, /login/i], [413, /besar|panjang/i], [415, /format/i], [429, /permintaan|tunggu/i]]) {
  test(`HTTP ${status} explains the actual failure, not a network outage`, () => {
    const result = errorMessage(new Error(`Ask error ${status}: fixture private provider detail`));
    assert.match(result, expected);
    assert.doesNotMatch(result, /sinyal|fixture private/i);
  });
}
