import { AsyncLocalStorage } from 'node:async_hooks';
import type { ThinkingLevel } from './vertex';

export type RerankSource = 'google' | 'cohere';

export interface RerankOut { results: { index: number; score: number }[]; error?: string; source?: RerankSource }

export interface Deps {
  supabase: any;
  embed(text: string): Promise<number[]>;
  rerank(query: string, docs: string[], topN: number): Promise<RerankOut>;
  generate(body: any, model: string, enableGoogleSearch?: boolean): Promise<any>;
  stream(body: any, model: string, onChunk: (c: StreamChunk) => void, opts?: StreamOpts): Promise<void>;
  thinkOverride?: Exclude<ThinkingLevel, 'minimal'> | null;
  usage: Usage;
  meta: {
    modelUsed?: string; cacheable?: boolean; route?: string; confidence?: string; degraded?: boolean;
    msRag?: number; msRerank?: number; fallbackTo?: string; fallbackSebab?: string;
  };
  deadlineAt?: number;
}

export interface StreamChunk {
  text?: string; usageMetadata?: any; error?: string; code?: number; live?: boolean; finishReason?: string;
}
export interface StreamOpts { enableGoogleSearch?: boolean; signal?: AbortSignal }

export interface Usage { input: number; output: number; calls: number; thinking: number; cached: number }
export function newUsage(): Usage { return { input: 0, output: 0, calls: 0, thinking: 0, cached: 0 }; }

const store = new AsyncLocalStorage<Deps>();

export function runWithDeps<T>(d: Deps, fn: () => Promise<T>): Promise<T> {
  return store.run(d, fn);
}

export function deps(): Deps {
  const d = store.getStore();
  if (!d) throw new Error('Deps tidak tersedia — orkestrasi harus jalan di dalam runWithDeps().');
  return d;
}
