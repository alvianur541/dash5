const {
  capRerankPayload,
  gatherCandidates,
  retrieveKnowledgeGraph,
  runWithDeps,
  searchTechnicalManualMulti,
  mockDeps,
  suite,
} = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

function migrationSql() {
  const file = path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261018_knowledge_graph_pilot.sql');
  return fs.readFileSync(file, 'utf8')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function fakeSupabase({
  graphRows = [],
  graphError = null,
  graphNever = false,
  graphRequest = null,
  keywordRows = [{ id: 1, content: 'keyword document', metadata: { Model: 'ZX200-5G' } }],
  vectorRows = [{ id: 2, content: 'vector document', metadata: { Model: 'ZX200-5G' }, similarity: 0.8 }],
} = {}) {
  const calls = [];
  const q = {
    select() { return q; }, or() { return q; }, contains() { return q; }, ilike() { return q; }, limit() { return q; },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
  };
  return {
    calls,
    from: () => q,
    rpc(name, args) {
      calls.push({ name, args });
      if (name === 'match_documents_keyword_ranked') {
        return Promise.resolve({ data: keywordRows, error: null });
      }
      if (name === 'match_documents') {
        return Promise.resolve({ data: vectorRows, error: null });
      }
      if (name === 'search_knowledge_graph') {
        if (graphRequest) return graphRequest;
        if (graphNever) return new Promise(() => {});
        return Promise.resolve({ data: graphRows, error: graphError });
      }
      throw new Error(`unexpected RPC ${name}`);
    },
  };
}

async function withEnv(values, fn) {
  const before = {};
  for (const [key, value] of Object.entries(values)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await fn(); }
  finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

module.exports = async function () {
  const { t, done } = suite('knowledge graph: feature-flagged fail-open retrieval');

  await withEnv({ KNOWLEDGE_GRAPH_ENABLED: undefined }, async () => {
    const supabase = fakeSupabase({ graphRows: [{ id: 3, content: 'graph document', metadata: { Model: 'ZX200-5G' } }] });
    const { d } = mockDeps([], { supabase, embed: async () => [0.1] });
    const out = await runWithDeps(d, () => gatherCandidates(['swing motor inspection'], 'ZX200-5G', false, { Model: 'ZX200-5G' }));
    t(!supabase.calls.some(c => c.name === 'search_knowledge_graph'), 'flag off does not call graph RPC');
    t(out.allDocs.join('|') === 'keyword document|vector document', 'flag off preserves existing keyword/vector candidates and order');
  });

  await withEnv({ KNOWLEDGE_GRAPH_ENABLED: 'true' }, async () => {
    const category = 'BROSUR MANUAL';
    const supabase = fakeSupabase({
      keywordRows: [{ id: 21, content: 'scoped keyword document', metadata: { Model: 'ZX200-5G', Kategori: category } }],
      vectorRows: [{ id: 22, content: 'scoped vector document', metadata: { Model: 'ZX200-5G', Kategori: category }, similarity: 0.8 }],
      graphRows: [{ id: 23, content: 'unscoped graph document', metadata: { Model: 'ZX200-5G', Kategori: 'WORKSHOP MANUAL' } }],
    });
    const { d } = mockDeps([], { supabase, embed: async () => [0.1] });
    const out = await runWithDeps(d, () => gatherCandidates(
      ['swing motor inspection'],
      'ZX200-5G',
      false,
      { Model: 'ZX200-5G', Kategori: category },
    ));
    t(!supabase.calls.some(c => c.name === 'search_knowledge_graph'), 'category-scoped search does not call model-only graph RPC');
    t(out.allDocs.join('|') === 'scoped keyword document|scoped vector document', 'category-scoped search keeps only scoped keyword/vector candidates');
  });

  await withEnv({ KNOWLEDGE_GRAPH_ENABLED: 'true' }, async () => {
    const supabase = fakeSupabase({ graphRows: [
      { id: 3, content: 'graph-backed inspection', metadata: { Model: 'ZX200-5G', Kategori: 'WORKSHOP MANUAL' }, graph_score: 2 },
      { id: 4, content: 'keyword document', metadata: { Model: 'ZX200-5G' }, graph_score: 1 },
    ] });
    let rerankInput = [];
    const { d } = mockDeps([], {
      supabase,
      embed: async () => [0.1],
      rerank: async (_query, docs) => {
        rerankInput = docs;
        return { results: [{ index: docs.indexOf('graph-backed inspection'), score: 0.7 }], source: 'google' };
      },
    });
    const result = await runWithDeps(d, () => searchTechnicalManualMulti(['swing motor inspection'], 'ZX200-5G', 1));
    const graphCall = supabase.calls.find(c => c.name === 'search_knowledge_graph');
    t(graphCall?.args?.p_query === 'swing motor inspection' && graphCall.args.p_model === 'ZX200-5G' && graphCall.args.p_match_count === 8, 'flag on calls bounded graph RPC with technical query and model');
    t(rerankInput.join('|') === 'keyword document|vector document|graph-backed inspection', 'unique graph document enters reranking after existing candidate order');
    t(result.evidence?.[0]?.document_id === 3, 'selected graph document keeps its evidence document id');
  });

  await withEnv({ KNOWLEDGE_GRAPH_ENABLED: 'true' }, async () => {
    const supabase = fakeSupabase({ graphRows: [
      { id: 10, content: 'wrong model', metadata: { Model: 'ZW140' } },
      { id: 14, content: 'missing metadata' },
      { id: 15, content: 'missing model', metadata: { Kategori: 'WORKSHOP MANUAL' } },
      { id: 16, content: 'malformed metadata', metadata: ['ZX200-5G'] },
      { id: null, content: 'missing id', metadata: { Model: 'ZX200-5G' } },
      { id: 11, content: '', metadata: { Model: 'ZX200-5G' } },
      { id: 12, content: 'valid graph row', metadata: { Model: 'ZX200-5G' } },
      { id: 13, content: 'valid graph row', metadata: { Model: 'ZX200-5G' } },
    ] });
    const { d } = mockDeps([], { supabase });
    const docs = await runWithDeps(d, () => retrieveKnowledgeGraph('swing motor', { Model: 'ZX200-5G' }, false));
    t(docs.length === 1 && docs[0] === 'valid graph row', 'malformed, model-mismatched, and duplicate rows are discarded');
  });

  {
    const sql = migrationSql();
    const helperSignature = 'dash5_private.search_knowledge_graph_document_ids(text, text, integer)';
    t(!/grant usage on schema dash5_private to [^;]*authenticated/.test(sql), 'authenticated cannot resolve objects in the private graph schema');
    t(!new RegExp(`grant execute on function ${helperSignature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} to [^;]*authenticated`).test(sql), 'authenticated cannot execute the private definer helper');
    t(sql.includes(`revoke all on function ${helperSignature} from public, anon, authenticated`), 'private graph helper explicitly revokes authenticated execute');
    t(sql.includes('create role dash5_kg_rpc nologin inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls')
      && sql.includes('grant authenticated to dash5_kg_rpc')
      && sql.includes('alter function public.search_knowledge_graph(text, text, integer) owner to dash5_kg_rpc'),
    'public definer RPC uses a no-login, non-bypass role that inherits authenticated document RLS');
    t(sql.includes('grant execute on function public.search_knowledge_graph(text, text, integer) to authenticated, service_role'), 'bounded public graph RPC remains callable by authenticated and service_role');
  }

  await withEnv({ KNOWLEDGE_GRAPH_ENABLED: 'true' }, async () => {
    const failed = fakeSupabase({ graphError: { message: 'database unavailable' } });
    const { d: failedDeps } = mockDeps([], {
      supabase: failed,
      embed: async () => [0.1],
      rerank: async (_query, docs) => ({ results: [{ index: 0, score: 0.5 }], source: 'google' }),
    });
    const failedResult = await runWithDeps(failedDeps, () => searchTechnicalManualMulti(['pump pressure'], 'ZX200-5G', 1));
    t(failedResult.hasResults && !failedResult.ragError && failedResult.content === 'keyword document', 'RPC failure preserves existing results without setting ragError');

    const timed = fakeSupabase({ graphNever: true });
    const { d: timedDeps } = mockDeps([], { supabase: timed });
    const started = Date.now();
    const timedDocs = await withEnv({ KNOWLEDGE_GRAPH_TIMEOUT_MS: '25' }, () =>
      runWithDeps(timedDeps, () => retrieveKnowledgeGraph('pump pressure', { Model: 'ZX200-5G' }, false)));
    t(timedDocs.length === 0 && Date.now() - started < 250, 'RPC timeout is bounded and fail-open');

    let attachedSignal;
    const unhandled = [];
    const onUnhandled = reason => unhandled.push(reason);
    const graphRequest = {
      abortSignal(signal) {
        attachedSignal = signal;
        return this;
      },
      then(resolve, reject) {
        return new Promise((_, rejectRequest) => {
          attachedSignal?.addEventListener('abort', () => rejectRequest(new Error('request aborted')), { once: true });
        }).then(resolve, reject);
      },
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const aborting = fakeSupabase({ graphRequest });
      const { d: abortingDeps } = mockDeps([], { supabase: aborting });
      const docs = await withEnv({ KNOWLEDGE_GRAPH_TIMEOUT_MS: '25' }, () =>
        runWithDeps(abortingDeps, () => retrieveKnowledgeGraph('pump pressure', { Model: 'ZX200-5G' }, false)));
      await new Promise(resolve => setImmediate(resolve));
      t(docs.length === 0, 'aborted graph RPC still fails open');
      t(attachedSignal?.aborted === true, 'RPC timeout aborts a builder that supports abortSignal');
      t(unhandled.length === 0, 'aborted request does not create an unhandled rejection');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  await withEnv({ KNOWLEDGE_GRAPH_ENABLED: 'true' }, async () => {
    const supabase = fakeSupabase({ graphRows: [{ id: 3, content: 'graph document', metadata: { Model: 'ZX200-5G' } }] });
    const { d } = mockDeps([], { supabase });
    const docs = await runWithDeps(d, () => retrieveKnowledgeGraph('13006-2', { Model: 'ZX200-5G' }, true));
    t(docs.length === 0 && !supabase.calls.some(c => c.name === 'search_knowledge_graph'), 'fault-code route skips graph retrieval');
  });

  t(capRerankPayload(Array.from({ length: 40 }, (_, i) => `doc-${i}`)).length === 30, 'existing reranker candidate cap remains 30');

  return done();
};
