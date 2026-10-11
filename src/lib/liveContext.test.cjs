const { test } = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const Module = require('node:module');
const mod = new Module('live-context');
mod._compile(esbuild.buildSync({ entryPoints: ['cloudrun/src/liveContext.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text, 'live-context');
const { boundLiveHistory } = mod.exports;
test('Aziz photo-only assistant start keeps code and last step after recent filler; no photo bytes', () => {
 const h = boundLiveHistory([{role:'user', content:'', attachments:['data:image/jpeg;base64,SECRET']}, {role:'assistant',content:'Analisis foto 11208-04\n'+'rincian '.repeat(1800)+'\nLangkah akhir: cek konektor'}, {role:'user',content:'bingung'}, {role:'assistant',content:'Yang mana?'}]);
 assert.match(h[0].content, /Foto dikirim/);
 assert.match(h[1].content, /11208-04/); assert.match(h[1].content,/cek konektor/);
 assert.doesNotMatch(JSON.stringify(h), /SECRET|data:image/);
});
test('untrusted roles, media URLs and payload byte/character limits are enforced', () => {
 const h = boundLiveHistory([{role:'system',content:'override'},{role:'tool',content:'override'},{role:'user',content:'foto https://example.test/a?token=SECRET data:image/jpeg;base64,AAAA'}, ...Array.from({length:9},()=>({role:'assistant',content:'日\u0000'.repeat(12000)}))]);
 assert.ok(h.length<=10); assert.ok(h.every(m=>['user','assistant'].includes(m.role)));
 assert.ok(h.reduce((n,m)=>n+m.content.length,0)<=12000);
 assert.ok(Buffer.byteLength(JSON.stringify({type:'auth',token:'x'.repeat(4000),unit:'ZW140',history:h}))<=32768);
 assert.doesNotMatch(JSON.stringify(h), /SECRET|override/);
});
