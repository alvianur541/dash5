const { generateResponse, runWithDeps, mockDeps, suite, USAGE, langDirective } = require('./helpers.cjs');

const IMG = [{ mimeType: 'image/jpeg', data: '/9j/AAAA' }];
const ANSWER = [[{ text: 'The four codes point to a CAN bus fault.', usageMetadata: USAGE, live: true, finishReason: 'STOP' }]];
const HIST_EN = [
  { role: 'user', content: 'Can you explain about anti drift valve' },
  { role: 'assistant', content: 'The anti-drift valve holds the cylinder.' },
];
const hasID = t => /\b(tidak|yang|saya|Pastikan|Kode)\b/.test(t);

async function photo(caption, history, ocr) {
  let body = null;
  const { d } = mockDeps(ANSWER, { generate: ocr });
  const orig = d.stream;
  d.stream = (b, m, cb, o) => { body = body ?? b; return orig(b, m, cb, o); };
  const out = await runWithDeps(d, () => generateResponse('ZX200-5G', 'Alvianur', history, caption, IMG, () => {}));
  const texts = (body?.contents?.at(-1)?.parts ?? []).filter(p => 'text' in p).map(p => p.text);
  return { out, texts };
}
const reads = codes => async () => ({ candidates: [{ content: { parts: [{ text: codes }] } }] });
const ocrFails = async () => { throw new Error('ocr down'); };

module.exports = async function () {
  const { t, done } = suite('photo: answer follows the caption language');
  const EN = langDirective('en'), JA = langDirective('ja');

  { const { texts } = await photo('Explain please', [], reads('NONE'));
    t(texts.at(-1) === EN, 'EN caption, no codes: English directive is the last part'); }

  { const { texts } = await photo('', HIST_EN, reads('NONE'));
    t(texts.at(-1) === EN, 'no caption in an English session: English directive'); }

  { const { texts } = await photo('cek tolong', HIST_EN, reads('NONE'));
    t(!texts.some(x => x.startsWith('[LANGUAGE')), 'ID caption switches back: no English directive'); }

  { const { texts } = await photo('この写真は？', [], reads('NONE'));
    t(texts.at(-1) === JA, 'JA caption: Japanese directive'); }

  { const { texts } = await photo('Explain please', [], ocrFails);
    t(texts.at(-1) === EN, 'OCR failure branch: English directive still added'); }

  { const { out } = await photo('Can u check posiible cause of this error', [], reads('13004-02, 13005-02'));
    t(/is not in the \*\*ZX200-5G\*\* manual/.test(out) && !hasID(out), 'codes not in manual (real caption, session a7d048eb): full English reply');
    t(out.includes('`13004-02`') && out.includes('`13005-02`'), 'codes kept verbatim in the English reply'); }

  { const { out } = await photo('tolong cek kode ini', [], reads('13004-02'));
    t(/tidak ada di database manual/.test(out), 'ID caption: Indonesian not-found reply unchanged'); }

  t(langDirective('id') === '', 'ID adds nothing (prompt already Indonesian)');
  return done();
};
