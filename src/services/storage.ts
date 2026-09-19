import { UnitModel, Message, SessionMeta, ChatSession } from '../types';

const MAX_SESSIONS = 25;

export const listKey    = (uid: string) => `dash-session-list-${uid}`;
const dataKey           = (uid: string, id: string) => `dash-session-${uid}-${id}`;
const clearedKey        = (uid: string) => `dash-cleared-${uid}`;

const MAX_EVICTION_ATTEMPTS = 5;

function safeSetItem(key: string, value: string): void {
  for (let attempt = 0; attempt <= MAX_EVICTION_ATTEMPTS; attempt++) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch (e) {
      const isQuotaError = e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

      if (!isQuotaError || attempt === MAX_EVICTION_ATTEMPTS) {
        console.warn('[storage] safeSetItem gagal setelah eviction, data tidak tersimpan:', key);
        return;
      }

      let evicted = false;
      for (const lk of Object.keys(localStorage).filter(k => k.startsWith('dash-session-list-'))) {
        try {
          const list: { id: string; updatedAt?: number }[] = JSON.parse(localStorage.getItem(lk) || '[]');
          if (!Array.isArray(list) || list.length === 0) continue;
          const oldest = list[list.length - 1];
          if (!oldest?.id) continue;
          const uid = lk.replace('dash-session-list-', '');
          localStorage.removeItem(`dash-session-${uid}-${oldest.id}`);
          evicted = true;
          break;
        } catch { continue; }
      }
      if (!evicted) {
        const fallback = Object.keys(localStorage)
          .find(k => k.startsWith('dash-session-') && !k.includes('-list-'));
        if (fallback) localStorage.removeItem(fallback);
      }
    }
  }
}

export function loadSessionList(uid: string): SessionMeta[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(listKey(uid)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadSessionData(uid: string, id: string): ChatSession | null {
  try {
    const raw = localStorage.getItem(dataKey(uid, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string' || typeof parsed.model !== 'string') return null;
    if (!Array.isArray(parsed.messages)) return null;
    return parsed as ChatSession;
  } catch {
    return null;
  }
}

export function saveSession(uid: string, id: string, model: UnitModel, messages: Message[], firstMessage: string): SessionMeta[] {
  const sessionData: ChatSession = { id, model, messages };
  safeSetItem(dataKey(uid, id), JSON.stringify(sessionData));

  const title = firstMessage.length > 60
    ? firstMessage.slice(0, 57) + '...'
    : firstMessage;

  const list = loadSessionList(uid);
  const filtered = list.filter(s => s.id !== id);
  const updated: SessionMeta[] = [
    { id, title, model, updatedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_SESSIONS);
  safeSetItem(listKey(uid), JSON.stringify(updated));
  return updated;
}

export function deleteSessionData(uid: string, id: string): SessionMeta[] {
  localStorage.removeItem(dataKey(uid, id));
  const list = loadSessionList(uid);
  const updated = list.filter(s => s.id !== id);
  safeSetItem(listKey(uid), JSON.stringify(updated));
  return updated;
}

export interface PocketItem {
  id: string;
  model: string;
  question: string;
  answer: string;
  savedAt: number;
  synced?: boolean;
}

const MAX_POCKET_ITEMS = 30;
const pocketKey = (uid: string) => `dash-pocket-${uid}`;

export function loadPocket(uid: string): PocketItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(pocketKey(uid)) || '[]');
    return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.id === 'string' && typeof p.answer === 'string') : [];
  } catch {
    return [];
  }
}

export function savePocketItem(uid: string, item: PocketItem): PocketItem[] {
  const list = loadPocket(uid).filter(p => p.id !== item.id);
  const updated = [item, ...list].slice(0, MAX_POCKET_ITEMS);
  safeSetItem(pocketKey(uid), JSON.stringify(updated));
  return updated;
}

export function removePocketItem(uid: string, id: string): PocketItem[] {
  const updated = loadPocket(uid).filter(p => p.id !== id);
  safeSetItem(pocketKey(uid), JSON.stringify(updated));
  return updated;
}

export function replacePocket(uid: string, items: PocketItem[]): void {
  safeSetItem(pocketKey(uid), JSON.stringify(items.slice(0, MAX_POCKET_ITEMS)));
}

export function markPocketSynced(uid: string, id: string): void {
  const list = loadPocket(uid);
  const item = list.find(p => p.id === id);
  if (!item || item.synced) return;
  item.synced = true;
  safeSetItem(pocketKey(uid), JSON.stringify(list));
}

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const pocketTombKey = (uid: string) => `dash-pocket-del-${uid}`;
const sessionTombKey = (uid: string) => `dash-session-del-${uid}`;

function loadTomb(key: string): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    const fresh: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number' && ts > cutoff) fresh[id] = ts;
    }
    return fresh;
  } catch {
    return {};
  }
}

function addTomb(key: string, ids: string[]): void {
  const t = loadTomb(key);
  const now = Date.now();
  ids.forEach(id => { t[id] = now; });
  safeSetItem(key, JSON.stringify(t));
}

export const loadPocketTombstones = (uid: string) => loadTomb(pocketTombKey(uid));
export const addPocketTombstone = (uid: string, id: string) => addTomb(pocketTombKey(uid), [id]);

export function clearPocketTombstone(uid: string, id: string): void {
  const t = loadTomb(pocketTombKey(uid));
  if (!(id in t)) return;
  delete t[id];
  safeSetItem(pocketTombKey(uid), JSON.stringify(t));
}

export const loadSessionTombstones = (uid: string) => loadTomb(sessionTombKey(uid));
export const addSessionTombstones = (uid: string, ids: string[]) => addTomb(sessionTombKey(uid), ids);

// Timestamp of a "delete all" the server has not confirmed yet; 0 when none is pending.
export function pendingClearAt(uid: string): number {
  const ts = parseInt(localStorage.getItem(clearedKey(uid)) || '', 10);
  return Number.isFinite(ts) ? ts : 0;
}

export const setPendingClear = (uid: string, at: number) => localStorage.setItem(clearedKey(uid), String(at));
export const clearPendingClear = (uid: string) => localStorage.removeItem(clearedKey(uid));

export function deleteAllSessionData(uid: string): void {
  const list = loadSessionList(uid);
  list.forEach(s => localStorage.removeItem(dataKey(uid, s.id)));
  localStorage.removeItem(listKey(uid));
}
