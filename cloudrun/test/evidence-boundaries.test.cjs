const { rankAndSelect, runWithDeps, mockDeps, suite } = require('./helpers.cjs');
module.exports = async () => {
  const { t, done } = suite('Structured evidence (offline provider fixture)');
  const doc = 'Section: Diagnosing Procedure\nModel: ZX138MF-5G\nKategori: TECHNICAL MANUAL\nDocument: Manual\nsource a\n\n---\n\nload b';
  const { d } = mockDeps([], { rerank: async () => ({ results: [{ index: 0, score: .2 }], source: 'google' }) });
  const r = await runWithDeps(d, () => rankAndSelect('terminal a b', [doc], [], false, false, 4, 0));
  t(r.evidence?.length === 1 && r.evidence[0].content === doc, 'internal Markdown divider does not make another document');
  t(r.evidence?.[0]?.section === 'Diagnosing Procedure' && r.evidence[0].source === 'TECHNICAL MANUAL', 'provenance survives ranking');
  t(r.evidence?.[0]?.evidence_role === 'procedure', 'true procedure has an explicit protected evidence role');
  t(r.rerankSource === 'google', 'provider source survives result');
  return done();
};
