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
    const body = { ...BODY, systemInstruction: { parts: [{ text: 'SYS' }] } };
    const { d } = mockDeps([[{ error: 'Resource exhausted', code: 429 }], stop(UTUH)]);
    const origStream = d.stream; d.stream = (b, m, cb) => { seen.push(b); models.push(m); return origStream(b, m, cb); };
    const r = await runWithDeps(d, () => callProxyStream(body, () => {}));
    t(r === UTUH && models[1] === MODEL_CHAIN[1], `429 on primary: answered by fallback (${models.join(' → ')})`);
    t(seen[1].systemInstruction.parts[0].text === 'SYS', 'fallback receives the same system prompt'); }

  { const { d, calls } = mockDeps([
      [{ text: POTONG, usageMetadata: USAGE, live: true, finishReason: 'SAFETY' }],
      [{ text: POTONG, live: true }],
      stop(UTUH),
    ]);
    const r = await run(d);
    t(calls() === 3 && r === UTUH, 'usage stamp from an earlier attempt does not let a truncated retry through'); }

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

  { const { STREAM_LONG_NOTE } = require('./helpers.cjs');
    const models = [];
    const { d, calls } = mockDeps([[{ text: '| 074(B | `8943675301` | BOLT', usageMetadata: USAGE, live: true, finishReason: 'MAX_TOKENS' }], stop(UTUH)]);
    const origStream = d.stream; d.stream = (b, m, cb) => { models.push(m); return origStream(b, m, cb); };
    let out = ''; const r = await runWithDeps(d, () => callProxyStream(BODY, c => { out += c; }));
    t(calls() === 1 && models[0] === MODEL_CHAIN[0], 'MAX_TOKENS: tidak diulang, tidak pindah ke model cadangan');
    t(r.endsWith(STREAM_LONG_NOTE) && out.includes(STREAM_LONG_NOTE) && !r.includes(STREAM_HALT_NOTE), 'MAX_TOKENS: catatan "terlalu panjang" ditambahkan, bukan HALT'); }

  { const { d } = mockDeps([[{ error: 'Resource exhausted', code: 429 }], stop(UTUH)]);
    await run(d);
    t(d.meta.fallbackSebab === '429', `sebab fallback 429 tercatat (${d.meta.fallbackSebab})`); }

  { const { d } = mockDeps([[{ live: true }], stop(UTUH)]);
    await run(d);
    t(d.meta.fallbackSebab === 'hang', `sebab fallback hang tercatat (${d.meta.fallbackSebab})`); }

  { const { d } = mockDeps([[{ text: POTONG, live: true }], stop(UTUH)]);
    await run(d);
    t(d.meta.fallbackSebab === 'sepotong', `sebab fallback sepotong tercatat (${d.meta.fallbackSebab})`); }

  { const { d } = mockDeps([[{ text: POTONG, usageMetadata: USAGE, live: true, finishReason: 'SAFETY' }], stop(UTUH)]);
    await run(d);
    t(d.meta.fallbackSebab === 'finish', `sebab fallback finish tercatat (${d.meta.fallbackSebab})`); }

  { const { d } = mockDeps([stop(UTUH)]);
    await run(d);
    t(d.meta.fallbackSebab === undefined, 'jawaban normal: tidak ada sebab fallback'); }

  { const { d } = mockDeps([[{ error: 'Resource exhausted', code: 429 }], [{ text: POTONG, live: true }], stop(UTUH)]);
    await run(d);
    t(d.meta.fallbackSebab === '429', `sebab PERTAMA yang dipegang, bukan yang terakhir (${d.meta.fallbackSebab})`); }

  return done();
};
