// Seam antara orkestrasi (TS) dan server.js. Kode yang dipindah dari browser memanggil
// Vertex/Cohere/Supabase lewat sini, jadi jalur upstream server.js yang sudah teruji
// (retry 429, rotasi key Cohere, verifyToken) dipakai ulang — bukan diduplikasi.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { ThinkingLevel } from './orchestrator';

/** Index menunjuk ke array `documents` yang dikirim — hindari cocokkan teks (chunk bisa kembar). */
export interface RerankOut { results: { index: number; score: number }[]; error?: string }

export interface Deps {
  /** Klien Supabase ber-scope JWT teknisi — RLS tetap berlaku seperti saat di browser. */
  supabase: any;
  embed(text: string): Promise<number[]>;
  rerank(query: string, docs: string[], topN: number): Promise<RerankOut>;
  generate(body: any, model: string, enableGoogleSearch?: boolean): Promise<any>;
  /** SSE Vertex sudah di-parse server.js; watchdog/retry/deteksi loop tetap di orchestrator. */
  stream(body: any, model: string, onChunk: (c: StreamChunk) => void, opts?: StreamOpts): Promise<void>;
  /** Eksperimen ?think=low|medium|high — diteruskan frontend per request. */
  thinkOverride?: Exclude<ThinkingLevel, 'minimal'> | null;
  /** Ledger token satu pertanyaan. Per-request, kalau tidak angka teknisi lain ikut terhitung. */
  usage: Usage;
  /** Diisi orchestrator, dibaca server.js sesudah selesai — mis. boleh-tidaknya jawaban di-cache klien. */
  meta: { cacheable?: boolean };
}

export interface StreamChunk { text?: string; usageMetadata?: any; error?: string; code?: number }
export interface StreamOpts { enableGoogleSearch?: boolean; signal?: AbortSignal }

export interface Usage { input: number; output: number; calls: number; thinking: number; cached: number }
export function newUsage(): Usage { return { input: 0, output: 0, calls: 0, thinking: 0, cached: 0 }; }

// Per-request, BUKAN singleton: satu instance Cloud Run melayani banyak teknisi sekaligus dan
// setiap request bawa klien Supabase-nya sendiri. Global variable akan menukar identitas mereka.
const store = new AsyncLocalStorage<Deps>();

export function runWithDeps<T>(d: Deps, fn: () => Promise<T>): Promise<T> {
  return store.run(d, fn);
}

export function deps(): Deps {
  const d = store.getStore();
  if (!d) throw new Error('Deps tidak tersedia — orkestrasi harus jalan di dalam runWithDeps().');
  return d;
}
