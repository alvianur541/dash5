const { callProxyStream, runWithDeps, STREAM_HALT_NOTE, STREAM_CUT_NOTE, USAGE, mockDeps, suite, BODY, MODEL_CHAIN } = require('./helpers.cjs');

const POTONG = 'Gejala engine sering ngedrop saat dibebani pada ZX200-5G menunjukkan ketidaksesuaian antara output tenaga engine dan beban hidrolik (pompa), atau pasokan bahan bakar dan';
const UTUH   = 'Gejala engine ngedrop biasanya dari tiga sumber: bahan bakar, udara, atau beban hidrolik. Cek filter solar dulu.';
const stop   = text => [{ text, usageMetadata: USAGE, live: true, finishReason: 'STOP' }];
const run    = (d) => runWithDeps(d, () => callProxyStream(BODY, () => {}));

module.exports = async function () {
  const { t, done } = suite('stream: retry & halt guards');

  { const { d, calls } = mockDeps([[{ text: POTONG, usageMetadata: USAGE, live: true, finishReason: 'SAFETY' }]]);
    let out = ''; const r = await runWithDeps(d, () => callProxyStream(BODY, c => { out += c; }));
    t(calls() === 3, `SAFETY x3: 3 attempts (${calls()})`);
    t(r.endsWith(STREAM_HALT_NOTE) && out.includes(STREAM_HALT_NOTE), 'SAFETY x3: HALT note appended and streamed');
    t(!r.includes(STREAM_CUT_NOTE), 'SAFETY x3: no CUT note'); }

  { const { d, calls } = mockDeps([[{ text: POTONG, usageMetadata: USAGE, live: true, finishReason: 'SAFETY' }], stop(UTUH)]);
    const r = await run(d);
    t(calls() === 2 && r === UTUH, 'SAFETY then STOP: retried once, clean result'); }

  { const { d, calls } = mockDeps([[{ text: POTONG, live: true }, { text: '', usageMetadata: USAGE, live: true, finishReason: 'RECITATION' }], stop(UTUH)]);
    const r = await run(d);
    t(calls() === 2 && r === UTUH, 'RECITATION in trailing chunk: retried'); }

  { const { d, calls } = mockDeps([stop(UTUH)]);
    const r = await run(d);
    t(calls() === 1 && r === UTUH, 'STOP: single attempt'); }

  { const models = [];
    const { d, calls } = mockDeps([[{ error: 'Resource exhausted', code: 429 }], stop(UTUH)]);
    const origStream = d.stream; d.stream = (b, m, cb) => { models.push(m); return origStream(b, m, cb); };
    const r = await run(d);
    t(calls() === 2 && r === UTUH, '429 on primary: fell back, clean result');
    t(models[0] === MODEL_CHAIN[0] && models[1] === MODEL_CHAIN[1] && models[1] !== models[0], `429: model switched ${models[0]} → ${models[1]}`); }

  { const models = [];
    const { d, calls } = mockDeps([[{ live: true }], stop(UTUH)]);
    const origStream = d.stream; d.stream = (b, m, cb) => { models.push(m); return origStream(b, m, cb); };
    const r = await run(d);
    t(calls() === 2 && r === UTUH && models[1] !== models[0], 'empty stream on primary: switched model'); }

  { const seen = []; const models = [];
    const { d, calls } = mockDeps([[{ error: 'Upstream 400 INVALID_ARGUMENT', code: 400, cacheExpired: true }], stop(UTUH)], {
      systemFor: async (m, noCache) => ({ systemInstruction: { parts: [{ text: `SYS-${m}-${noCache ? 'nocache' : 'cache'}` }] } }),
    });
    const origStream = d.stream; d.stream = (b, m, cb) => { seen.push(b); models.push(m); return origStream(b, m, cb); };
    const r = await runWithDeps(d, () => callProxyStream({ ...BODY, cachedContent: 'projects/x/cachedContents/9' }, () => {}));
    t(calls() === 2 && r === UTUH, 'cache expired: retried once, clean result');
    t(models[0] === models[1] && models[0] === MODEL_CHAIN[0], `cache expired: SAME model retried (${models.join(' → ')})`);
    t(!seen[1].cachedContent && seen[1].systemInstruction.parts[0].text.endsWith('-nocache'), 'cache expired: retry sends full system prompt, no cachedContent'); }

  { const seen = [];
    const { d } = mockDeps([[{ error: 'Resource exhausted', code: 429 }], stop(UTUH)], {
      systemFor: async (m) => ({ systemInstruction: { parts: [{ text: `SYS-for-${m}` }] } }),
    });
    const origStream = d.stream; d.stream = (b, m, cb) => { seen.push(b); return origStream(b, m, cb); };
    await runWithDeps(d, () => callProxyStream({ ...BODY, cachedContent: 'projects/x/cachedContents/1' }, () => {}));
    t(seen[0].cachedContent === 'projects/x/cachedContents/1', 'primary keeps cachedContent');
    t(!seen[1].cachedContent && seen[1].systemInstruction.parts[0].text === `SYS-for-${MODEL_CHAIN[1]}`, 'fallback swaps cache for its own system prompt'); }

  { const { d, calls } = mockDeps([[{ text: POTONG, live: true }], stop(UTUH)]);
    const r = await run(d);
    t(calls() === 2 && r === UTUH, 'no usage stamp + incomplete text: retried'); }

  { const { d, calls } = mockDeps([[{ text: 'Gejala', live: true }], stop(UTUH)]);
    const r = await run(d);
    t(calls() === 2 && r === UTUH, 'no usage stamp + 6 chars: retried'); }

  { const PANJANG = 'x'.repeat(320) + '.'; const { d, calls } = mockDeps([[{ text: PANJANG, live: true }]]);
    const r = await run(d);
    t(calls() === 1 && r === PANJANG, 'no usage stamp + >=300 chars: not retried'); }

  { const { d, calls } = mockDeps([[{ text: 'Siap, Bang.', live: true }]]);
    const r = await run(d);
    t(calls() === 1 && r === 'Siap, Bang.', 'no usage stamp + ends with period: not retried'); }

  { const { d, calls } = mockDeps([[{ text: POTONG, live: true }]]);
    const r = await run(d);
    t(calls() === 3 && r.startsWith(POTONG), 'incomplete x3: stops at 3 attempts'); }

  { const { d, calls } = mockDeps([[{ text: POTONG, live: true }], stop(UTUH)], { deadlineAt: Date.now() + 60_000 });
    const r = await run(d);
    t(calls() === 2 && r === UTUH, 'deadline far: retried'); }
  { const { d, calls } = mockDeps([[{ text: POTONG, live: true }], stop(UTUH)], { deadlineAt: Date.now() + 2_000 });
    const r = await run(d);
    t(calls() === 1 && r === POTONG, 'deadline <5s: not retried'); }
  { const { d, calls } = mockDeps([[{ text: POTONG, usageMetadata: USAGE, live: true, finishReason: 'SAFETY' }]], { deadlineAt: Date.now() - 1 });
    const r = await run(d);
    t(calls() === 1 && r.includes(STREAM_HALT_NOTE), 'deadline passed + halt: 1 attempt + note'); }

  return done();
};
