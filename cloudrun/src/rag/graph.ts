import { deps } from '../deps';
import { registerEvidence } from '../evidence';

interface GraphRow {
  id?: number | string;
  content?: unknown;
  metadata?: unknown;
  graph_score?: unknown;
}

export interface GraphRetrievalScope {
  Model: string;
  Kategori?: string;
}

const GRAPH_MATCH_COUNT = 8;
const DEFAULT_TIMEOUT_MS = 250;
const MIN_TIMEOUT_MS = 25;
const MAX_TIMEOUT_MS = 1000;

function timeoutMs(): number {
  const configured = Number(process.env.KNOWLEDGE_GRAPH_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(configured)));
}

function warning(reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason ?? 'unknown error');
  console.warn('[knowledge-graph] retrieval skipped:', message.replace(/\s+/g, ' ').slice(0, 160));
}

export async function retrieveKnowledgeGraph(query: string, scope: GraphRetrievalScope, faultCode: boolean): Promise<string[]> {
  if (process.env.KNOWLEDGE_GRAPH_ENABLED !== 'true' || faultCode || scope.Kategori) return [];

  const started = Date.now();
  const d = deps();
  const model = scope.Model;
  const resolvedQuery = d.resolvedQuestion?.text?.trim() || query.trim();
  if (!resolvedQuery) return [];

  d.meta.graphEnabled = true;
  d.meta.graphAttempted = true;

  let timer: NodeJS.Timeout | undefined;
  const controller = new AbortController();
  try {
    const timeoutLimit = timeoutMs();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`timeout after ${timeoutLimit}ms`));
      }, timeoutLimit);
    });
    const builder = d.supabase.rpc('search_knowledge_graph', {
      p_query: resolvedQuery,
      p_model: model,
      p_match_count: GRAPH_MATCH_COUNT,
    });
    const requestLike = typeof builder?.abortSignal === 'function'
      ? builder.abortSignal(controller.signal)
      : builder;
    const request = Promise.resolve(requestLike);
    const { data, error } = await Promise.race([request, timeout]) as { data?: unknown; error?: { message?: string } | null };
    if (error) throw new Error(error.message || 'graph RPC failed');
    if (!Array.isArray(data)) throw new Error('malformed graph response');

    const rows: Array<{ id: number | string; content: string; metadata?: any }> = [];
    const seen = new Set<string>();
    for (const item of data as GraphRow[]) {
      const idValid = (typeof item?.id === 'number' && Number.isFinite(item.id))
        || (typeof item?.id === 'string' && item.id.trim().length > 0);
      const content = typeof item?.content === 'string' ? item.content.trim() : '';
      const metadata = item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? item.metadata as Record<string, unknown>
        : undefined;
      const rowModel = metadata?.Model;
      if (!idValid || !content || rowModel !== model || seen.has(content)) continue;
      seen.add(content);
      rows.push({ id: item.id as number | string, content, metadata });
    }
    registerEvidence(rows);
    d.meta.graphDocumentCount = rows.length;
    return rows.map(row => row.content);
  } catch (error) {
    d.meta.graphFallbackReason = error instanceof Error && /timeout/i.test(error.message) ? 'timeout' : 'error';
    warning(error);
    return [];
  } finally {
    if (timer) clearTimeout(timer);
    d.meta.graphMs = Date.now() - started;
  }
}
