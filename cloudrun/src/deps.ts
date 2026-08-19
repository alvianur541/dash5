// Seam to server.js: reuse its upstream path, never duplicate it.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { ThinkingLevel } from './orchestrator';

/** Index, not text — chunks can be identical. */
export interface RerankOut { results: { index: number; score: number }[]; error?: string }

export interface Deps {
  /** JWT-scoped, RLS still applies. */
  supabase: any;
  embed(text: string): Promise<number[]>;
  rerank(query: string, docs: string[], topN: number): Promise<RerankOut>;
  generate(body: any, model: string, enableGoogleSearch?: boolean): Promise<any>;
  /** SSE parsed by server.js. */
  stream(body: any, model: string, onChunk: (c: StreamChunk) => void, opts?: StreamOpts): Promise<void>;
  /** ?think= override. */
  thinkOverride?: Exclude<ThinkingLevel, 'minimal'> | null;
  /** Per-request token ledger. */
  usage: Usage;
  /** Written by orchestrator, read by server.js. */
  meta: { cacheable?: boolean };
}

/** live: any chunk, thinking included. */
export interface StreamChunk { text?: string; usageMetadata?: any; error?: string; code?: number; live?: boolean }
export interface StreamOpts { enableGoogleSearch?: boolean; signal?: AbortSignal }

export interface Usage { input: number; output: number; calls: number; thinking: number; cached: number }
export function newUsage(): Usage { return { input: 0, output: 0, calls: 0, thinking: 0, cached: 0 }; }

// Per-request, NOT singleton — one instance serves many technicians.
const store = new AsyncLocalStorage<Deps>();

export function runWithDeps<T>(d: Deps, fn: () => Promise<T>): Promise<T> {
  return store.run(d, fn);
}

export function deps(): Deps {
  const d = store.getStore();
  if (!d) throw new Error('Deps tidak tersedia — orkestrasi harus jalan di dalam runWithDeps().');
  return d;
}
