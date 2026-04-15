import { UnitModel, Message, SessionMeta, ChatSession } from '../types';

export const MAX_SESSIONS = 25;

export const listKey = (uid: string) => `dash-session-list-${uid}`;
export const dataKey = (uid: string, id: string) => `dash-session-${uid}-${id}`;

export function loadSessionList(uid: string): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(listKey(uid)) || '[]');
  } catch {
    return [];
  }
}

export function loadSessionData(uid: string, id: string): ChatSession | null {
  try {
    const raw = localStorage.getItem(dataKey(uid, id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(uid: string, id: string, model: UnitModel, messages: Message[], firstMessage: string): SessionMeta[] {
  const sessionData: ChatSession = { id, model, messages };
  localStorage.setItem(dataKey(uid, id), JSON.stringify(sessionData));

  const title = firstMessage.length > 60
    ? firstMessage.slice(0, 57) + '...'
    : firstMessage;

  const list = loadSessionList(uid);
  const filtered = list.filter(s => s.id !== id);
  const updated: SessionMeta[] = [
    { id, title, model, updatedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_SESSIONS);
  localStorage.setItem(listKey(uid), JSON.stringify(updated));
  return updated;
}

export function deleteSessionData(uid: string, id: string): SessionMeta[] {
  localStorage.removeItem(dataKey(uid, id));
  const list = loadSessionList(uid);
  const updated = list.filter(s => s.id !== id);
  localStorage.setItem(listKey(uid), JSON.stringify(updated));
  return updated;
}
