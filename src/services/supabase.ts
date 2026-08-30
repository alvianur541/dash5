import { createClient } from '@supabase/supabase-js';
import { Message, UnitModel } from '../types';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Off: an old recovery link would become a passwordless login.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { detectSessionInUrl: false } })
  : null;

export async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

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

export async function fetchUserSessionList(userId: string): Promise<import('../types').SessionMeta[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, model, updated_at, user_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Failed to fetch session list:', error.message);
    return null;
  }

  return (data || []).map(row => ({
    id: row.id,
    title: row.title || '(tanpa judul)',
    model: row.model as UnitModel,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export async function fetchSessionData(sessionId: string, userId: string): Promise<import('../types').ChatSession | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, model, messages')
    .eq('id', sessionId)
    .eq('user_id', userId)
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

export async function deleteChatSession(id: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').delete().eq('id', id).eq('user_id', userId);
  if (error) console.error('Failed to delete chat session from Supabase:', error.message);
}

export async function deleteAllChatSessions(userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('chat_sessions').delete().eq('user_id', userId);
  if (error) console.error('Failed to delete all chat sessions from Supabase:', error.message);
}

interface RemoteBookmark { message_id: string; model: string; question: string; answer: string; saved_at: string }

export async function fetchBookmarksRemote(userId: string): Promise<RemoteBookmark[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('bookmarks')
    .select('message_id, model, question, answer, saved_at')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })
    .limit(30);
  if (error) { console.warn('[bookmark] fetch remote gagal (offline?):', error.message); return null; }
  return data ?? [];
}

export async function upsertBookmarkRemote(
  userId: string,
  b: { id: string; model: string; question: string; answer: string; savedAt: number },
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('bookmarks').upsert({
    user_id: userId, message_id: b.id, model: b.model, question: b.question,
    answer: b.answer, saved_at: new Date(b.savedAt).toISOString(),
  }, { onConflict: 'user_id,message_id' });
  if (error) console.warn('[bookmark] simpan remote gagal (offline?):', error.message);
}

export async function deleteBookmarkRemote(userId: string, messageId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('bookmarks').delete()
    .eq('user_id', userId).eq('message_id', messageId);
  if (error) console.warn('[bookmark] hapus remote gagal (offline?):', error.message);
}

export async function saveFeedback(payload: {
  userId: string;
  messageId: string;
  rating: 'up' | 'down';
  question: string;
  answer: string;
  model: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('message_feedback').upsert({
      user_id: payload.userId,
      message_id: payload.messageId,
      rating: payload.rating,
      question: payload.question.slice(0, 2000),
      answer: payload.answer.slice(0, 8000),
      model: payload.model,
      created_at: new Date().toISOString(),
    }, { onConflict: 'message_id' });
    if (error) console.warn('[feedback] tidak tersimpan (tabel message_feedback ada?):', error.message);
  } catch (e) {
    console.warn('[feedback] gagal simpan:', (e as Error)?.message);
  }
}

export interface CatalogEntry { model: string; kategori: string; count: number }

let _catalogCache: { data: CatalogEntry[]; expiresAt: number } | null = null;
const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchDocumentCatalog(): Promise<CatalogEntry[]> {
  if (!supabase) return [];
  if (_catalogCache && Date.now() < _catalogCache.expiresAt && _catalogCache.data.length > 0) {
    return _catalogCache.data;
  }

  const PAGE_SIZE = 1000;
  const INITIAL_BATCH = 4;
  const MAX_SAFETY = 20;

  type Row = { metadata: { Model?: string; Kategori?: string } };

  const fetchPage = async (pageIdx: number): Promise<Row[]> => {
    const result = await supabase!
      .from('documents')
      .select('metadata')
      .order('id', { ascending: true })
      .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1);
    return Array.isArray(result.data) ? (result.data as Row[]) : [];
  };

  const initialSettled = await Promise.allSettled(
    Array.from({ length: INITIAL_BATCH }, (_, i) => fetchPage(i))
  );
  const allRows: Row[] = [];
  let lastPageFull = true;
  for (const r of initialSettled) {
    if (r.status === 'fulfilled') {
      allRows.push(...r.value);
      if (r.value.length < PAGE_SIZE) lastPageFull = false;
    } else {
      console.error('Catalog page fetch error:', r.reason);
      lastPageFull = false;
    }
  }

  let nextPage = INITIAL_BATCH;
  while (lastPageFull && nextPage < MAX_SAFETY) {
    try {
      const rows = await fetchPage(nextPage);
      if (rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      nextPage++;
    } catch (err) {
      console.error('Catalog pagination error at page', nextPage, err);
      break;
    }
  }

  if (nextPage >= MAX_SAFETY) {
    console.warn('[fetchDocumentCatalog] hit safety cap', MAX_SAFETY, 'pages — DB may need pagination upgrade');
  }

  if (allRows.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of allRows) {
    const model = row.metadata?.Model;
    const kategori = row.metadata?.Kategori;
    if (!model || !kategori) continue;
    const key = `${model}||${kategori}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result = Array.from(counts.entries()).map(([key, count]) => {
    const [model, kategori] = key.split('||');
    return { model, kategori, count };
  });
  _catalogCache = { data: result, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
  return result;
}
