# Knowledge Graph pilot

This slice adds an optional Knowledge Graph retrieval lane to the existing technical-manual RAG pipeline.

- **Feature flag:** set `KNOWLEDGE_GRAPH_ENABLED=true` to allow graph retrieval. It is off by default. `KNOWLEDGE_GRAPH_TIMEOUT_MS` controls the fail-open timeout (default 250 ms, bounded to 25–1000 ms).
- **Parked migration:** `supabase/migrations/20261018_knowledge_graph_pilot.sql` is committed for review only. It has not been applied to production. Before any production approval, execute the exact migration twice in an isolated Supabase branch and pass the anonymous/authenticated/service-role plus direct-helper/schema RLS/privilege matrix; this remains a mandatory pre-apply gate.
- **Provenance rule:** graph records never answer users directly. Only verified, model-scoped graph paths with verified links to existing `documents.id` chunks can add retrieval candidates. The original document remains the evidence used by reranking and answer generation.
- **Current data:** no graph data is seeded by this change. The extractor, review workflow, and admin UI are intentionally out of scope.
- **Failure and rollback:** graph RPC errors, malformed rows, and timeouts return no graph candidates and leave keyword/vector retrieval intact. Roll back immediately by setting `KNOWLEDGE_GRAPH_ENABLED=false`; the parked schema can remain untouched for review.
- **Live Voice:** no separate integration is required. Live Voice already reuses the authenticated `/v1/ask` pipeline, so it automatically follows the same flag and retrieval behavior.
