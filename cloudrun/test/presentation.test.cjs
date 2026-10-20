const path = require('path');
const fs = require('fs');
const fixture = require(path.join(__dirname, 'fixtures/rich-answer-evidence.json'));
const { attachAnswerPresentation, buildAnswerPresentation, mockDeps, runWithDeps, suite } = require('./helpers.cjs');

const doc = (id, model, source, section, content) => ({ document_id: id, model, source, section, document: `${source} ${id}`, content, evidence_role: 'retrieved' });

module.exports = async function () {
  const { t, done } = suite('rich answer presentation: verified spec & Technical News cards');
  const f = fixture.technicalNews;
  const news = buildAnswerPresentation({ question: f.question, answer: f.answer, model: f.model, evidence: f.evidence });
  t(news?.version === 1 && news.blocks[0].type === 'technical_news', 'creates a Technical News card');
  t(news?.blocks[0].title === f.evidence[0].section && news.blocks[0].bulletinId === '06/TSD-CE/TN/9/2023', 'title and bulletin come from the source');
  t(news?.blocks[0].sources[0].documentId === String(f.evidence[0].document_id), 'keeps the authorized document id');
  t(news?.blocks[1].type === 'markdown' && news.blocks[1].content === f.answer, 'keeps the full Markdown answer as the second block');

  const spec = fixture.specification;
  const volt = buildAnswerPresentation({ question: spec.question, answer: spec.answer, model: spec.model, evidence: spec.evidence });
  t(volt?.blocks[0].type === 'spec_value' && volt.blocks[0].value === '12' && volt.blocks[0].unit === 'V', 'single verified value → spec_value card');
  t(volt?.blocks[0].label === 'Voltage battery ZX48U-5A', 'label is the answer text before "adalah"');
  t(volt?.blocks[0].unitModel === spec.model && volt.blocks[0].sources[0].documentId === String(spec.evidence[0].document_id), 'binds model and document id');

  const flyDoc = doc(8377, 'ZX200-5G', 'ENGINE MANUAL', 'GENERAL INFORMATION - TIGHTENING TORQUE STANDARDS (Bolts & Nuts)',
    'Crankshaft, Piston, and Flywheel\nN·m (kgf·m/lb.ft)\n539–637\n197–240\n(55–65/378–470)\n(20.1–24.5/145–177)\nApply engine oil');
  const flyAnswer = 'Torsi pengencangan baut flywheel engine Isuzu 6BG1T pada ZX200-5G adalah `197–240 N·m` (`20.1–24.5 kgf·m` / `145–177 lb·ft`) *(Engine Manual — Major Component Reassembly Steps II)*.';
  const fly = buildAnswerPresentation({ question: 'torsi baut flywheel berapa', answer: flyAnswer, model: 'ZX200-5G', evidence: [flyDoc] });
  t(fly?.blocks[0].type === 'spec_value' && fly.blocks[0].value === '197–240' && fly.blocks[0].unit === 'N·m', 'range from a table with header units → card');
  t(fly?.blocks[0].label === 'Torsi baut flywheel' && fly.blocks[0].alternateValues?.length === 2, 'question title + both converted ranges');
  t(buildAnswerPresentation({ question: 'torsi baut flywheel berapa', answer: flyAnswer.replace('197–240', '200–240'), model: 'ZX200-5G', evidence: [flyDoc] }) === undefined,
    'a range end not in the manual → no card');
  t(buildAnswerPresentation({ question: 'torsi baut flywheel berapa', answer: 'Torsi baut flywheel `240 N·m`.', model: 'ZX200-5G', evidence: [flyDoc] }) === undefined,
    'one end of a range quoted as a single value → no card');

  const travelDoc = doc(7605, 'ZX200-5G', 'WORKSHOP MANUAL', 'TRAVEL DEVICE - REMOVAL & INSTALLATION',
    'CAUTION: Travel Device (5) weight: 310 kg (685\nlb)\nRing gear (2) weight: 39 kg (86 lb)\nSprocket and drum weight: 96 kg (215 lb)');
  const travelAnswer = 'Berat travel device lumayan besar.\n- **Travel Device (assembly):** `310 kg` (`685 lb`) *(Workshop Manual — Travel Device Removal & Installation)*\n- **Ring gear:** `39 kg` (`86 lb`)\n- **Sprocket + drum:** `96 kg` (`215 lb`)';
  const travel = buildAnswerPresentation({ question: 'berapa berat travel device', answer: travelAnswer, model: 'ZX200-5G', evidence: [travelDoc] });
  t(travel?.blocks[0].type === 'spec_table' && travel.blocks[0].title === 'Berat travel device', 'several verified values → spec_table card');
  t(travel?.blocks[0].rows.map(r => `${r.label}=${r.value} ${r.unit}/${r.alternateValues?.[0].value}`).join('|')
    === 'Travel Device (assembly)=310 kg/685|Ring gear=39 kg/86|Sprocket + drum=96 kg/215', 'rows keep label, value and lb conversion; citation is not an alternate');
  t(buildAnswerPresentation({ question: 'berapa berat travel device', answer: travelAnswer.replace('`39 kg`', '`41 kg`'), model: 'ZX200-5G', evidence: [travelDoc] }) === undefined,
    'one invented value anywhere → no card at all');
  t(buildAnswerPresentation({ question: 'berapa berat travel device', answer: travelAnswer, model: 'ZX48U-5A', evidence: [travelDoc] }) === undefined,
    'evidence from another unit never backs a card');
  t(buildAnswerPresentation({ question: 'berapa berat travel device', answer: travelAnswer, model: 'ZX200-5G', evidence: [{ ...travelDoc, document_id: null }] }) === undefined,
    'no card without a real document id');
  t(buildAnswerPresentation({ question: 'berapa berat travel device', answer: travelAnswer, model: 'ZX200-5G', evidence: [{ ...travelDoc, source: 'PARTS CATALOG' }] }) === undefined,
    'parts catalog numbers never back a spec card');
  t(buildAnswerPresentation({ question: 'kenapa travel device berat jalannya', answer: travelAnswer, model: 'ZX200-5G', evidence: [travelDoc] }) === undefined,
    'diagnosis questions get no spec card');
  t(buildAnswerPresentation({ question: 'harga travel device berapa', answer: travelAnswer, model: 'ZX200-5G', evidence: [travelDoc] }) === undefined,
    'price questions get no spec card');

  const relief = doc(7022, 'ZX200-5G', 'TROUBLESHOOTING', 'PERFORMANCE STANDARD', 'Boom Lower, Arm Relief operation 34.3+2.0 MPa\nBrochure: Implement circuit 34.3 MPa');
  t(buildAnswerPresentation({ question: 'berapa main relief pressure', model: 'ZX200-5G', evidence: [relief],
    answer: 'Standar evaluasi normal pada Pump 1 & Pump 2 Delivery Pressure saat relief: `34.3` – `36.3 MPa`\n- Implement circuit: `34.3 MPa`\n- Swing circuit: `34.3 MPa`' }) === undefined,
    'an unverified long-label value is never silently dropped from a card');
  t(buildAnswerPresentation({ question: 'berapa suhu oli saat tes', model: 'ZX200-5G', evidence: [relief], answer: 'Suhu oli `50 ± 5 °C`.' }) === undefined,
    'a tolerance (±) is not read as a value');

  const torqueSource = fs.readFileSync(path.join(__dirname, 'fixtures/zw140-tightening-torque.txt'), 'utf8');
  const torqueAnswer = 'Komponen: HST Motor mounting bolts (Item No. 8)\nUkuran Baut (Bolt Diameter): 16 mm (Quantity: 8)\nUkuran Kunci (Wrench Size): 24 mm\nNilai Torsi Pengencangan: 232 N⋅m (24 kgf⋅m, 170 lbf⋅ft)';
  const torque = buildAnswerPresentation({ question: 'Berapa torsi pengencangan bolt mounting HST motor ZW140?', answer: torqueAnswer, model: 'ZW140',
    evidence: [doc(9436, 'ZW140', 'WORKSHOP MANUAL', 'GENERAL - TIGHTENING (Tightening Torque Specifications)', torqueSource)] });
  t(torque?.blocks[0].type === 'spec_value' && torque.blocks[0].value === '232' && torque.blocks[0].alternateValues?.length === 2
    && torque.blocks[0].facts?.length === 3, 'ZW140 tightening table keeps its torque card with bolt facts');

  const secondChunk = {
    ...f.evidence[0], document_id: 10582,
    section: 'Harness ZX48U-5A — Generasi S/N 035220-up, Susunan Pin Main Connector Berbeda',
    content: f.evidence[0].content.replace('Section: Harness ZX48U-5A — Daftar Part Number Main & Floor Harness per Nomor Seri',
      'Section: Harness ZX48U-5A — Generasi S/N 035220-up, Susunan Pin Main Connector Berbeda'),
  };
  const split = buildAnswerPresentation({ question: f.question, answer: f.answer, model: f.model, evidence: [...f.evidence, secondChunk] });
  t(split?.blocks[0].type === 'technical_news' && split.blocks[0].sources.length === 2, 'one bulletin over several chunks keeps all sources');
  const other = { ...secondChunk, document_id: 10583, document: 'Technical News No.07/TSD-CE/TN/10/2023 — Different bulletin',
    content: secondChunk.content.replaceAll('06/TSD-CE/TN/9/2023', '07/TSD-CE/TN/10/2023') };
  t(buildAnswerPresentation({ question: f.question, answer: f.answer, model: f.model, evidence: [...f.evidence, other] })?.blocks[0].bulletinId === '06/TSD-CE/TN/9/2023',
    'unrelated retrieved bulletins are ignored');
  t(buildAnswerPresentation({ question: f.question, answer: `${f.answer} Technical News 07/TSD-CE/TN/10/2023 — Different bulletin.`, model: f.model, evidence: [...f.evidence, other] }) === undefined,
    'two bulletins named in one answer → no card');

  const { d } = mockDeps([[]], { richAnswersEnabled: true });
  const input = { question: f.question, answer: f.answer, model: f.model, evidence: f.evidence };
  await runWithDeps(d, async () => attachAnswerPresentation({ ...input, complete: true }));
  t(d.meta.presentation?.blocks[0].type === 'technical_news', 'stores the card in request-scoped metadata');
  await runWithDeps(d, async () => attachAnswerPresentation({ ...input, complete: false }));
  t(d.meta.presentation === undefined, 'partial or cut answers clear the card');
  const off = mockDeps([[]], { richAnswersEnabled: false }).d;
  await runWithDeps(off, async () => attachAnswerPresentation({ ...input, complete: true }));
  t(off.meta.presentation === undefined, 'disabled flag never stores a card');

  return done();
};
