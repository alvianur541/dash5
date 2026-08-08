import { UnitModel, Message, SessionMeta, ChatSession } from '../types';

const MAX_SESSIONS = 25;

export const listKey    = (uid: string) => `dash-session-list-${uid}`;
const dataKey           = (uid: string, id: string) => `dash-session-${uid}-${id}`;
const clearedKey        = (uid: string) => `dash-cleared-${uid}`;

// Flag "baru hapus semua" — TTL PENDEK, bukan permanen.
// Tujuannya HANYA guard race: fetch Supabase yang sedang in-flight saat user klik
// "Hapus Semua" jangan re-populate sesi yang baru dihapus.
// JANGAN permanen — kalau permanen, browser yang pernah "Hapus Semua" berhenti sync
// dari Supabase SELAMANYA → sesi dari browser/device lain tidak pernah muncul (bug sync).
const CLEARED_TTL_MS = 15_000;

export const isSessionsCleared = (uid: string): boolean => {
  const v = localStorage.getItem(clearedKey(uid));
  if (!v) return false;
  const ts = parseInt(v, 10);
  if (!Number.isFinite(ts)) return false; // format lama ('1') → anggap stale, biarkan sync jalan
  return Date.now() - ts < CLEARED_TTL_MS;
};

const MAX_EVICTION_ATTEMPTS = 5; // maksimal hapus 5 sesi lama sebelum give up

function safeSetItem(key: string, value: string): void {
  for (let attempt = 0; attempt <= MAX_EVICTION_ATTEMPTS; attempt++) {
    try {
      localStorage.setItem(key, value);
      return; // sukses — keluar
    } catch (e) {
      const isQuotaError = e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');

      if (!isQuotaError || attempt === MAX_EVICTION_ATTEMPTS) {
        console.warn('[storage] safeSetItem gagal setelah eviction, data tidak tersimpan:', key);
        return;
      }

      // Hapus sesi paling lama (by updatedAt dari list metadata) untuk buat ruang
      // UUID key tidak bisa di-sort secara temporal, pakai list sebagai sumber kebenaran.
      let evicted = false;
      for (const lk of Object.keys(localStorage).filter(k => k.startsWith('dash-session-list-'))) {
        try {
          const list: { id: string; updatedAt?: number }[] = JSON.parse(localStorage.getItem(lk) || '[]');
          if (!Array.isArray(list) || list.length === 0) continue;
          // List tersimpan newest-first → item terakhir adalah yang paling lama
          const oldest = list[list.length - 1];
          if (!oldest?.id) continue;
          const uid = lk.replace('dash-session-list-', '');
          localStorage.removeItem(`dash-session-${uid}-${oldest.id}`);
          evicted = true;
          break;
        } catch { continue; }
      }
      if (!evicted) {
        // Fallback: hapus key data session pertama yang ditemukan
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
    // Defensive: localStorage bisa di-tamper user/extension. JSON.parse
    // bisa return non-array (mis. object/string) → caller .filter/.map crash.
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
    // Validate shape — corrupted localStorage bisa bikin React render crash
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string' || typeof parsed.model !== 'string') return null;
    if (!Array.isArray(parsed.messages)) return null;
    return parsed as ChatSession;
  } catch {
    return null;
  }
}

export function saveSession(uid: string, id: string, model: UnitModel, messages: Message[], firstMessage: string): SessionMeta[] {
  localStorage.removeItem(clearedKey(uid)); // batal flag cleared saat ada sesi baru
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

// ── Saku: jawaban tersimpan untuk dibaca OFFLINE ─────────────────────────────
// localStorage per-user → tetap terbaca tanpa sinyal (shell PWA sudah di-cache SW).
// Cap 30 item, dedup by messageId, newest-first. safeSetItem = eviction-aware.

export interface PocketItem {
  id: string;          // messageId jawaban sumber — dipakai dedup & toggle
  model: string;
  question: string;
  answer: string;
  savedAt: number;
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

/** Timpa seluruh cache lokal dengan hasil merge sinkron (remote ∪ lokal). */
export function replacePocket(uid: string, items: PocketItem[]): void {
  safeSetItem(pocketKey(uid), JSON.stringify(items.slice(0, MAX_POCKET_ITEMS)));
}

export function deleteAllSessionData(uid: string, setFlag = true): void {
  const list = loadSessionList(uid);
  list.forEach(s => localStorage.removeItem(dataKey(uid, s.id)));
  localStorage.removeItem(listKey(uid));
  if (setFlag) localStorage.setItem(clearedKey(uid), String(Date.now())); // timestamp — flag auto-stale setelah CLEARED_TTL_MS
}
