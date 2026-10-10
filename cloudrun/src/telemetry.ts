import { performance } from 'node:perf_hooks';
import { deps, type Deps } from './deps';
export type StageName = 'intent' | 'resolve' | 'embed' | 'db_search' | 'rerank' | 'selection' | 'compression' | 'web_price' | 'ocr' | 'generate' | 'stream' | 'first_text' | 'request';
export interface StageFields { lane?: 'image_facts' | 'fault_codes'; provider?: 'google' | 'cohere'; recovery?: boolean; model?: string; thinking?: string; calls?: number; input_bytes?: number; output_bytes?: number; document_count?: number; process_first_request?: boolean }
export interface StageEvent extends StageFields { rid: string; stage: StageName; start_ms: number; wall_ms: number; outcome: 'ok' | 'error' | 'cancel' }
const origins = new WeakMap<object, number>();
export async function stage<T>(name: StageName, fn: () => Promise<T>, fields: StageFields = {}): Promise<T> {
  let d: Deps;
  try { d = deps(); } catch { return fn(); }
  let origin = origins.get(d);
  if (origin === undefined) { origin = performance.now(); origins.set(d, origin); }
  const start = performance.now();
  let outcome: StageEvent['outcome'] = 'ok';
  try { return await fn(); } catch (e) {
    outcome = (e as Error)?.name === 'AbortError' ? 'cancel' : 'error'; throw e;
  } finally {
    const event: StageEvent = { ...fields, rid: d.requestId ?? 'offline', stage: name,
      start_ms: Math.round((start - origin) * 1000) / 1000, wall_ms: Math.round((performance.now() - start) * 1000) / 1000, outcome };
    (d.meta.stages ??= []).push(event);
    if (d.requestId && d.requestId !== 'fixture-rid') console.info('[stage] %s', JSON.stringify(event));
  }
}
export function instrumentDeps(d: Deps): Deps {
  const { embed, rerank, generate, stream, webPrice } = d;
  d.embed = text => stage('embed', () => embed(text));
  d.rerank = (query, docs, topN) => stage('rerank', () => rerank(query, docs, topN), { document_count: docs.length, input_bytes: Buffer.byteLength(docs.join('')) });
  d.generate = (body, model, search) => stage('generate', () => generate(body, model, search), { model, thinking: body?.generationConfig?.thinkingConfig?.thinkingLevel });
  d.stream = (body, model, onChunk, opts) => stage('stream', () => stream(body, model, onChunk, opts), { model, thinking: body?.generationConfig?.thinkingConfig?.thinkingLevel });
  if (webPrice) d.webPrice = pn => stage('web_price', () => webPrice(pn));
  return d;
}
