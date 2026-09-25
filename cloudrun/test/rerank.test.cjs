const { computeConfidence, rerankDocs, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('rerank: Google utama, ambang keyakinan per sumber');

  const s = x => [{ content: 'x', score: x }];
  t(computeConfidence(s(0.35), 'google').confidence === 'high', 'google 0.35 → high');
  t(computeConfidence(s(0.20), 'google').confidence === 'medium', 'google 0.20 → medium');
  t(computeConfidence(s(0.10), 'google').confidence === 'low', 'google 0.10 → low');
  t(computeConfidence(s(0.35), 'cohere').confidence === 'medium', 'cohere 0.35 → medium (ambang lama tidak berubah)');
  t(computeConfidence(s(0.35)).confidence === 'medium', 'tanpa sumber → ambang Cohere (kompatibel mundur)');

  {
    const docs = ['Section: A\nsatu', 'Section: B\ndua', 'Section: C\ntiga'];
    const { d } = mockDeps([], { rerank: async () => ({ results: [{ index: 2, score: 0.4 }, { index: 0, score: 0.1 }], source: 'google' }) });
    const out = await runWithDeps(d, () => rerankDocs('q', docs, 2));
    t(out.source === 'google' && out.docs[0].content === docs[2] && out.docs[1].content === docs[0], 'sumber & urutan dari reranker diteruskan');
    t(computeConfidence(out.docs, out.source).confidence === 'high', 'skor Google 0.40 dinilai dengan ambang Google → high');
  }

  {
    const { d } = mockDeps([], { rerank: async () => ({ results: [{ index: 0, score: 0.5 }] }) });
    const out = await runWithDeps(d, () => rerankDocs('q', ['a', 'b'], 1));
    t(out.source === 'cohere', 'hasil tanpa label sumber dianggap Cohere');
  }

  {
    const { d } = mockDeps([], { rerank: async () => ({ results: [], error: 'dua-duanya gagal' }) });
    const out = await runWithDeps(d, () => rerankDocs('q', ['a', 'b', 'c'], 2));
    t(!!out.error && out.docs.length === 2, 'semua reranker gagal → urutan asli dipakai + ditandai error');
  }

  {
    const { GoogleAuth } = require('google-auth-library');
    const asliClient = GoogleAuth.prototype.getClient;
    GoogleAuth.prototype.getClient = async () => ({ getAccessToken: async () => ({ token: 'tok' }) });
    const fetchAsli = global.fetch;
    let dikirim = null;
    global.fetch = async (url, opts) => {
      dikirim = { url, opts, body: JSON.parse(opts.body) };
      return { ok: true, status: 200, json: async () => ({ records: [{ id: '1', score: 0.62 }, { id: '0', score: 0.2 }] }) };
    };
    const { googleRerank } = require('../server/upstream');
    const res = await googleRerank('swing motor weight', ['Section: SWING DEVICE\nMotor weight: 48 kg', 'tanpa judul'], 2);
    t(res[0].index === 1 && res[0].score === 0.62 && res[1].index === 0, 'jawaban Google dipetakan ke index dokumen');
    t(dikirim.body.records[0].title === 'Section: SWING DEVICE' && !('title' in dikirim.body.records[1]), 'judul section dikirim kalau ada');
    t(dikirim.body.model === 'semantic-ranker-fast-004' && dikirim.opts.headers['x-goog-user-project'] === 'test-project', 'model fast-004 + header project');

    global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Permission denied' } }) });
    let err = null;
    try { await googleRerank('q', ['a'], 1); } catch (e) { err = e; }
    t(err && err.status === 403, 'Google menolak → melempar error (server lalu memakai Cohere)');

    global.fetch = fetchAsli;
    GoogleAuth.prototype.getClient = asliClient;
  }

  return done();
};
