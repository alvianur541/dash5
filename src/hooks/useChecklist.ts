import { useState, useEffect, useCallback } from 'react';
import { ChecklistItem } from '../lib/checklist';

const storageKey = (messageId: string) => `dash-checklist-${messageId}`;

function loadFromStorage(messageId: string, fallback: ChecklistItem[]): ChecklistItem[] {
  if (!messageId) return fallback;
  try {
    const raw = localStorage.getItem(storageKey(messageId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const valid = parsed.every(p =>
      p && typeof p.id === 'string'
        && typeof p.text === 'string'
        && typeof p.done === 'boolean',
    );
    return valid ? (parsed as ChecklistItem[]) : fallback;
  } catch {
    return fallback;
  }
}

function persist(messageId: string, items: ChecklistItem[]): void {
  if (!messageId) return;
  try {
    localStorage.setItem(storageKey(messageId), JSON.stringify(items));
  } catch { /* quota exceeded — silent, state masih ada di memory */ }
}

export function clearAllChecklists(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('dash-checklist-')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* localStorage unavailable — abaikan */ }
}

export function useChecklist(messageId: string, initialItems: ChecklistItem[]) {
  const [items, setItems] = useState<ChecklistItem[]>(() => loadFromStorage(messageId, initialItems));

  // Re-load saat user buka modal untuk message berbeda
  useEffect(() => {
    setItems(loadFromStorage(messageId, initialItems));
    // initialItems sengaja tidak di deps — hanya messageId yg trigger reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  const toggleItem = useCallback((id: string) => {
    setItems(prev => {
      const next = prev.map(it => it.id === id ? { ...it, done: !it.done } : it);
      persist(messageId, next);
      return next;
    });
  }, [messageId]);

  const resetAll = useCallback(() => {
    setItems(prev => {
      const next = prev.map(it => ({ ...it, done: false }));
      persist(messageId, next);
      return next;
    });
  }, [messageId]);

  const completedCount = items.filter(i => i.done).length;
  const totalCount = items.length;

  return { items, toggleItem, resetAll, completedCount, totalCount };
}
