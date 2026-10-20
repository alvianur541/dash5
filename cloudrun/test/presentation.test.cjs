const path = require('path');
const fixture = require(path.join(__dirname, 'fixtures/rich-answer-evidence.json'));
const { attachAnswerPresentation, buildAnswerPresentation, mockDeps, runWithDeps, suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('rich answer presentation: source-bound technical news');
  const f = fixture.technicalNews;
  const presentation = buildAnswerPresentation({
    answer: f.answer,
    model: f.model,
    evidence: f.evidence,
  });

  t(presentation?.version === 1, 'uses versioned AnswerPresentationV1 contract');
  t(presentation?.blocks?.[0]?.type === 'technical_news', 'creates Technical News block from eligible evidence');
  t(presentation?.blocks?.[0]?.title === f.evidence[0].section, 'uses the source title without inventing metadata');
  t(presentation?.blocks?.[0]?.bulletinId === '06/TSD-CE/TN/9/2023', 'uses bulletin identifier present in the source');
  t(presentation?.blocks?.[0]?.sources?.[0]?.documentId === String(f.evidence[0].document_id), 'keeps the authorized document id');
  t(presentation?.blocks?.at(-1)?.type === 'markdown' && presentation.blocks.at(-1).content === f.answer,
    'keeps the complete Markdown answer as the authoritative fallback block');

  const spec = fixture.specification;
  const specPresentation = buildAnswerPresentation({
    answer: spec.answer,
    model: spec.model,
    evidence: spec.evidence,
  });
  t(specPresentation?.blocks?.[0]?.type === 'spec_value', 'creates an exact specification block');
  t(specPresentation?.blocks?.[0]?.label === 'Voltage', 'takes the label from the exact source line');
  t(specPresentation?.blocks?.[0]?.value === '12' && specPresentation?.blocks?.[0]?.unit === 'V',
    'takes one exact value and unit present in both evidence and final answer');
  t(specPresentation?.blocks?.[0]?.unitModel === spec.model, 'binds the immutable selected unit model');
  t(specPresentation?.blocks?.[0]?.sources?.[0]?.documentId === String(spec.evidence[0].document_id),
    'binds the specification to the authorized document id');
  t(buildAnswerPresentation({ answer: 'Engine speed adalah 2000 min-1.', model: spec.model, evidence: [{
    ...spec.evidence[0], content: spec.evidence[0].content.replace('Voltage 12 V', 'Engine speed 2000 min-1'),
  }] })?.blocks?.[0]?.type === 'spec_value', 'does not confuse the inverse-minute unit with a minimum qualifier');

  const torqueAnswer = 'Torsi pengencangan: 232 N·m (24 kgf·m, 170 lbf·ft). Ukuran bolt diameter 16 mm dan wrench size 24 mm.';
  const torquePresentation = buildAnswerPresentation({ answer: torqueAnswer, model: 'ZW140', evidence: [{
    ...spec.evidence[0],
    document_id: 8801,
    model: 'ZW140',
    source: 'WORKSHOP MANUAL',
    section: 'GENERAL - TIGHTENING',
    document: 'ZW140 Workshop Manual',
    content: 'Section: GENERAL - TIGHTENING\nModel: ZW140\nKategori: WORKSHOP MANUAL\nTightening torque 232 N·m (24 kgf·m, 170 lbf·ft)\nBolt diameter 16 mm\nWrench size 24 mm',
  }] });
  t(torquePresentation?.blocks?.[0]?.type === 'spec_value'
    && torquePresentation.blocks[0].value === '232'
    && torquePresentation.blocks[0].unit === 'N·m',
  'creates the primary torque card when the source also contains converted units and fastener dimensions');
  t(torquePresentation?.blocks?.[0]?.type === 'spec_value'
    && torquePresentation.blocks[0].alternateValues?.length === 2,
  'keeps converted torque units as alternate values instead of treating them as conflicting specifications');

  const conflictEvidence = [{
    ...spec.evidence[0],
    content: `${spec.evidence[0].content}\nAlternate specification Voltage 24 V`,
  }];
  t(buildAnswerPresentation({ answer: spec.answer, model: spec.model, evidence: conflictEvidence }) === undefined,
    'does not create a card when eligible evidence contains conflicting exact values');
  t(buildAnswerPresentation({ answer: 'Voltage battery adalah 10–14 V.', model: spec.model, evidence: [{
    ...spec.evidence[0], content: spec.evidence[0].content.replace('Voltage 12 V', 'Voltage 10–14 V'),
  }] }) === undefined, 'does not create a specification card from a range');
  t(buildAnswerPresentation({ answer: 'High pressure adalah 34 MPa.', model: spec.model, evidence: [{
    ...spec.evidence[0], content: spec.evidence[0].content.replace('Voltage 12 V', 'High 34 MPa\nLow 4 MPa'),
  }] }) === undefined, 'rejects separate high and low specification lines');
  t(buildAnswerPresentation({ answer: 'Pressure adalah 34 MPa.', model: spec.model, evidence: [{
    ...spec.evidence[0], content: spec.evidence[0].content.replace('Voltage 12 V', 'Pressure 34 MPa\nTolerance 2 MPa'),
  }] }) === undefined, 'rejects a specification document containing a separate tolerance');
  t(buildAnswerPresentation({ answer: 'Voltage range is 10 to 12 V.', model: spec.model, evidence: spec.evidence }) === undefined,
    'rejects a range claim even when its endpoint exactly matches the source value');
  t(buildAnswerPresentation({ answer: 'Minimum operating pressure adalah 34 MPa.', model: spec.model, evidence: [{
    ...spec.evidence[0], content: spec.evidence[0].content.replace('Voltage 12 V', 'Minimum operating pressure 34 MPa'),
  }] }) === undefined, 'rejects a minimum specification under narrow V1');
  t(buildAnswerPresentation({ answer: spec.answer, model: 'ZX200-5G', evidence: spec.evidence }) === undefined,
    'does not create a card from evidence for the wrong selected unit');
  t(buildAnswerPresentation({ answer: spec.answer, model: spec.model, evidence: [{ ...spec.evidence[0], document_id: null }] }) === undefined,
    'does not create a card without a real document id');
  t(buildAnswerPresentation({ answer: 'Jawaban tanpa nilai.', model: spec.model, evidence: spec.evidence }) === undefined,
    'does not create a specification card unless the exact value is visible in the final answer');
  const secondChunk = {
    ...f.evidence[0],
    document_id: 10582,
    section: 'Harness ZX48U-5A — Generasi S/N 035220-up, Susunan Pin Main Connector Berbeda',
    content: f.evidence[0].content.replace(
      'Section: Harness ZX48U-5A — Daftar Part Number Main & Floor Harness per Nomor Seri',
      'Section: Harness ZX48U-5A — Generasi S/N 035220-up, Susunan Pin Main Connector Berbeda',
    ),
  };
  const splitBulletin = buildAnswerPresentation({ answer: f.answer, model: f.model, evidence: [
    ...f.evidence, secondChunk,
  ] });
  t(splitBulletin?.blocks?.[0]?.type === 'technical_news'
    && splitBulletin.blocks[0].sources.length === 2,
  'allows multiple authorized chunks when they belong to the same bulletin');
  const differentBulletin = {
    ...secondChunk,
    document_id: 10583,
    document: 'Technical News No.07/TSD-CE/TN/10/2023 — Different bulletin',
    content: secondChunk.content.replaceAll('06/TSD-CE/TN/9/2023', '07/TSD-CE/TN/10/2023'),
  };
  t(buildAnswerPresentation({ answer: f.answer, model: f.model, evidence: [
    ...f.evidence, differentBulletin,
  ] }) === undefined, 'does not create a Technical News card from multiple distinct bulletins');

  const { d } = mockDeps([[]], { richAnswersEnabled: true });
  await runWithDeps(d, async () => attachAnswerPresentation({
    answer: f.answer, model: f.model, evidence: f.evidence, complete: true, groundingUnknown: 0,
  }));
  t(d.meta.presentation?.blocks?.[0]?.type === 'technical_news', 'stores the validated result only in request-scoped metadata');
  await runWithDeps(d, async () => attachAnswerPresentation({
    answer: f.answer, model: f.model, evidence: f.evidence, complete: false, groundingUnknown: 0,
  }));
  t(d.meta.presentation === undefined, 'partial or cut answers clear presentation');
  await runWithDeps(d, async () => attachAnswerPresentation({
    answer: f.answer, model: f.model, evidence: f.evidence, complete: true, groundingUnknown: 1,
  }));
  t(d.meta.presentation === undefined, 'failed grounding never stores presentation');

  return done();
};
