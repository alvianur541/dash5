import { deps } from '../deps';


const EMBED_CACHE_TTL = 30 * 60 * 1000;

const embeddingCache    = new Map<string, { values: number[]; expiresAt: number }>();

const embeddingInFlight = new Map<string, Promise<number[]>>();

function setCached(key: string, value: number[]) {
  if (embeddingCache.has(key)) embeddingCache.delete(key);
  if (embeddingCache.size >= 200) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest !== undefined) embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, { values: value, expiresAt: Date.now() + EMBED_CACHE_TTL });
}

function getCachedLru(key: string): number[] | null {
  const entry = embeddingCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) { embeddingCache.delete(key); return null; }
  embeddingCache.delete(key);
  embeddingCache.set(key, entry);
  return entry.values;
}

async function fetchEmbedding(query: string, cacheKey: string): Promise<number[]> {
  let safeQuery = query;
  const trimmedQ = query.trim();
  const intervalOnly = /^\s*(\d{3,5})\s*(?:jam|hm|hours?|hr)?\s*$/i.test(trimmedQ);
  if (intervalOnly) {
    const num = trimmedQ.match(/\d{3,5}/)?.[0] ?? trimmedQ;
    safeQuery = `${num} hour service maintenance schedule parts`;
    console.warn('[RAG] embed query too narrow, transformed:', { original: query, safeQuery });
  } else if (trimmedQ.split(/\s+/).filter(Boolean).length < 2) {
    console.warn('[RAG] embed query single word (low semantic signal):', query);
  }
  let values = await deps().embed(safeQuery);
  if (!Array.isArray(values) || values.length === 0) throw new Error('Embed returned no values');
  values = values.map(v => Math.round(v * 1e6) / 1e6);
  setCached(cacheKey, values);
  return values;
}

export async function getEmbedding(query: string): Promise<number[]> {
  const cacheKey = query.toLowerCase().replace(/\s+/g, ' ').trim();

  const cached = getCachedLru(cacheKey);
  if (cached) return cached;

  const inFlight = embeddingInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = fetchEmbedding(query, cacheKey).finally(() => {
    embeddingInFlight.delete(cacheKey);
  });
  embeddingInFlight.set(cacheKey, promise);
  return promise;
}
