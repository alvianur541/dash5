const { callProxyStream, runWithDeps, STREAM_HALT_NOTE, STREAM_CUT_NOTE, USAGE, mockDeps, suite, BODY } = require('./helpers.cjs');

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
