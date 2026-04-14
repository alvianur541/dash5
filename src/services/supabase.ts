/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { Message, UnitModel } from '../types';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const proxyUrl        = import.meta.env.VITE_VERTEX_PROXY_URL as string;

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface SearchResult {
  content: string;
  metadata: any;
  similarity: number;
}

// ── Save or update a chat session to Supabase ──────────────────────────────
export async function saveOrUpdateChatSession(
  id: string,
  userId: string,
  userName: string,
  model: UnitModel,
  title: string,
  messages: Message[]
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('chat_sessions')
    .upsert({
      id,
      user_id: userId,
      user_name: userName,
      model,
      title,
      messages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('Failed to save chat session to Supabase:', error.message);
  }
}

// ── Fetch session list for a user ──────────────────────────────────────────
export async function fetchUserSessionList(userId: string, userName: string): Promise<import('../types').SessionMeta[]> {
  if (!supabase) return [];

  // Query by user_id (new sessions) OR user_name (legacy sessions before user_id was added)
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, model, updated_at, user_id')
    .or(`user_id.eq.${userId},and(user_id.is.null,user_name.eq.${userName})`)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to fetch session list:', error.message);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    title: row.title || '(tanpa judul)',
    model: row.model as UnitModel,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

// ── Fetch full session data by ID ──────────────────────────────────────────
export async function fetchSessionData(sessionId: string): Promise<import('../types').ChatSession | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, model, messages')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    console.error('Failed to fetch session data:', error?.message);
    return null;
  }

  return {
    id: data.id,
    model: data.model as UnitModel,
    messages: data.messages as Message[],
  };
}

// ── Delete a chat session from Supabase ────────────────────────────────────
export async function deleteChatSession(id: string): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete chat session from Supabase:', error.message);
  }
}

// ── Embedding cache (session-scoped, prevents duplicate API calls) ─────────
const embeddingCache = new Map<string, number[]>();

// ── Fault code detector ────────────────────────────────────────────────────
function isFaultCode(query: string): boolean {
  return /^[A-Z]{0,2}:?\d{2,6}(-\d{1,4})?$/i.test(query.trim());
}

// ── Cohere reranker via proxy (with 5s timeout) ───────────────────────────
async function rerankWithCohere(query: string, docs: string[], topN: number): Promise<string[]> {
  if (docs.length === 0) return docs.slice(0, topN);
  const proxyUrl = import.meta.env.VITE_VERTEX_PROXY_URL ?? '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${proxyUrl}/v1/rerank`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents: docs, topN }),
    });
    if (!res.ok) throw new Error(`Rerank proxy ${res.status}`);
    const data = await res.json();
    return (data.results as Array<{ index: number }>).map(r => docs[r.index]);
  } catch (err) {
    console.warn('Cohere rerank failed, using original order:', err);
    return docs.slice(0, topN);
  } finally {
    clearTimeout(timer);
  }
}

// ── Cached embedding fetch (via proxy) ────────────────────────────────────
async function getEmbedding(query: string): Promise<number[]> {
  if (embeddingCache.has(query)) return embeddingCache.get(query)!;
  const res = await fetch(`${proxyUrl}/v1/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  const values = data.values as number[];
  embeddingCache.set(query, values);
  return values;
}

// ── RAG: Search technical manual ───────────────────────────────────────────
export interface RAGResult {
  content: string;
  hasResults: boolean;
}

export async function searchTechnicalManual(query: string, model: string): Promise<RAGResult> {
  if (!supabase) {
    console.warn('Supabase not initialized.');
    return { content: '', hasResults: false };
  }

  try {
    const faultCode = isFaultCode(query.trim());
    const strictFilter = faultCode ? { Model: model, category: 'Technical Manual' } : { Model: model };
    const looseFilter  = { Model: model };

    // ── 1 & 2. Parallel: keyword search + embedding ───────────────────────
    const [{ data: kwStrict }, embedding] = await Promise.all([
      supabase.from('documents').select('content, metadata')
        .ilike('content', `%${query}%`).contains('metadata', strictFilter).limit(5),
      getEmbedding(query),
    ]);

    // Keyword fallback if strict returns nothing
    let kwData = kwStrict;
    if (faultCode && (!kwData || kwData.length === 0)) {
      const { data: kwFallback } = await supabase.from('documents').select('content, metadata')
        .ilike('content', `%${query}%`).contains('metadata', looseFilter).limit(5);
      kwData = kwFallback;
    }

    // ── 3. Vector search (embedding ready from parallel step) ─────────────
    let { data: vecData, error: vecError } = await supabase.rpc('match_documents', {
      query_embedding: embedding, match_count: 20, filter: strictFilter,
    });

    if (faultCode && (!vecData || (vecData as any[]).length === 0)) {
      const { data: vecFallback, error: vecFallbackError } = await supabase.rpc('match_documents', {
        query_embedding: embedding, match_count: 20, filter: looseFilter,
      });
      vecData = vecFallback;
      vecError = vecFallbackError;
    }

    if (vecError) console.error('Vector search error:', vecError);

    // ── 4. Merge & deduplicate ─────────────────────────────────────────────
    const seen = new Set<string>();
    const allDocs: string[] = [];
    for (const d of [...(kwData || []), ...((vecData as SearchResult[]) || [])]) {
      if (!seen.has(d.content)) { seen.add(d.content); allDocs.push(d.content); }
    }

    if (allDocs.length === 0) return { content: '', hasResults: false };

    // ── 5. Cohere rerank → top 3 ──────────────────────────────────────────
    const top3 = await rerankWithCohere(query, allDocs, 3);
    const content = top3.map((c, i) => `[Rank ${i + 1}] ${c}`).join('\n\n---\n\n');
    return { content, hasResults: true };

  } catch (err) {
    console.error('Supabase service error:', err);
    return { content: '', hasResults: false };
  }
}
