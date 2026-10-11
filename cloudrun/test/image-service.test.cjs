const assert = require('node:assert/strict');
module.exports = async () => {
  const { generateIllustration } = require('../server/image-service');
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(20)]).toString('base64');
  let calls = 0;
  const fetchMock = async (url, opts) => {
    calls++;
    assert.match(url, /locations\/global\/publishers\/google\/models\/gemini-3\.1-flash-lite-image:generateContent$/);
    assert.equal(opts.headers.Authorization, 'Bearer adc');
    const body = JSON.parse(opts.body);
    assert.deepEqual(body.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
    assert.equal(body.generationConfig.candidateCount, 1);
    assert.match(body.systemInstruction.parts[0].text, /Never invent/);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } });
  };
  const context = { unit: 'GENERAL', question: 'Jelaskan belajar', answer: 'Baca → pahami → latihan' };
  const deps = { project: 'test-project', getToken: async () => 'adc', fetchImpl: fetchMock };
  const image = await generateIllustration(context, deps);
  assert.equal(image.data, png);
  assert.equal(image.imageCount, 1);
  assert.equal(image.usage.promptTokenCount, 10);
  assert.equal(calls, 1);
  await assert.rejects(generateIllustration({ ...context, question: 'Buat wiring pin kabel starter yang persis' }, deps), e => e.status === 422);
  assert.equal(calls, 1);
  await assert.rejects(generateIllustration({ ...context, answer: 'a'.repeat(8001) }, deps), e => e.status === 413);
  await assert.rejects(generateIllustration(context, { ...deps, fetchImpl: async () => new Response('', { status: 429 }) }), e => e.status === 429);
  for (const inlineData of [ { mimeType: 'image/svg+xml', data: png }, { mimeType: 'image/jpeg', data: png }, { mimeType: 'image/png', data: '<script>' } ]) {
    await assert.rejects(generateIllustration(context, { ...deps, fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData }] } }] }) }), /UNSAFE_IMAGE_RESPONSE/);
  }
  await assert.rejects(generateIllustration(context, { ...deps, fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'refused' }] } }] }) }), /EXPECTED_ONE_IMAGE/);
  await assert.rejects(generateIllustration(context, { ...deps, fetchImpl: async () => Response.json({ candidates: [{ finishReason: 'SAFETY' }] }) }), /IMAGE_BLOCKED_OR_INCOMPLETE/);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(generateIllustration(context, { ...deps, signal: cancelled.signal }), e => e.status === 504);
  console.log('image-service: global ADC single image and provider usage PASS');
  return true;
};
if (require.main === module) module.exports().catch(e => { console.error(e); process.exitCode = 1; });
