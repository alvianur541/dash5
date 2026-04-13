/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";
import { Message, UnitModel } from '../types';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const geminiKey       = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const genAI = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

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

// ── RAG: Search technical manual ───────────────────────────────────────────
export async function searchTechnicalManual(query: string, model: string): Promise<string> {
  if (!supabase || !genAI) {
    console.warn('Supabase or Gemini client not initialized. Check your environment variables.');
    return '';
  }

  try {
    const embeddingResult = await (genAI as any).models.embedContent({
      model: "gemini-embedding-001",
      contents: query
    });
    const embedding = embeddingResult.embeddings[0].values;

    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_count: 10,
      filter: { Model: model }
    });

    if (error) {
      console.error('Supabase RPC error:', error);
      const { data: textData, error: textError } = await supabase
        .from('documents')
        .select('content, metadata')
        .textSearch('content', query)
        .contains('metadata', { Model: model })
        .limit(3);

      if (textError) {
        console.error('Supabase text search fallback error:', textError);
        return '';
      }

      return textData?.map((d, i) => `[Rank ${i+1}] ${d.content}`).join('\n\n---\n\n') || '';
    }

    if (!data || data.length === 0) return 'No relevant technical data found for this model.';

    const rerankedData = (data as SearchResult[])
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    return rerankedData.map((d: any, index: number) =>
      `[Rank ${index+1} - Skoring: ${Math.round(d.similarity * 100)}%] ${d.content}`
    ).join('\n\n---\n\n');
  } catch (err) {
    console.error('Supabase service error:', err);
    return 'Error accessing technical database.';
  }
}
