import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { Message, UnitModel } from '../types';
import { fetchBookmarksRemote, upsertBookmarkRemote, deleteBookmarkRemote } from '../services/supabase';
import {
  loadPocket, savePocketItem, removePocketItem, replacePocket,
  loadPocketTombstones, addPocketTombstone, clearPocketTombstone, type PocketItem,
} from '../services/storage';

const MAX_ITEMS = 30;

export function usePocket(uid: string | null, mountedRef: MutableRefObject<boolean>) {
  const [pocket, setPocket] = useState<PocketItem[]>([]);
  const [pocketView, setPocketView] = useState<PocketItem | null>(null);
  const pocketIds = useMemo(() => new Set(pocket.map(p => p.id)), [pocket]);

  useEffect(() => {
    if (!uid) { setPocket([]); setPocketView(null); return; }
    const tombAtStart = loadPocketTombstones(uid);
    setPocket(loadPocket(uid).filter(i => !tombAtStart[i.id]));

    fetchBookmarksRemote(uid).then(remote => {
      if (!remote || !mountedRef.current) return;
      const tomb = loadPocketTombstones(uid);
      const freshLocal = loadPocket(uid).filter(i => !tomb[i.id]);
      const remoteItems: PocketItem[] = remote
        .filter(r => !tomb[r.message_id])
        .map(r => ({
          id: r.message_id, model: r.model, question: r.question ?? '',
          answer: r.answer, savedAt: new Date(r.saved_at).getTime() || Date.now(),
        }));
      remote.filter(r => tomb[r.message_id])
        .forEach(r => { deleteBookmarkRemote(uid, r.message_id).catch(() => {}); });
      const remoteIds = new Set(remoteItems.map(i => i.id));
      const localOnly = freshLocal.filter(i => !remoteIds.has(i.id));
      localOnly.forEach(i => { upsertBookmarkRemote(uid, i).catch(() => {}); });
      const merged = [...localOnly, ...remoteItems]
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, MAX_ITEMS);
      setPocket(merged);
      replacePocket(uid, merged);
    }).catch(() => {});
  }, [uid, mountedRef]);

  const toggle = useCallback((messageId: string, msgs: Message[], model: UnitModel) => {
    if (!uid) return;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    const asst = msgs[idx];
    if (asst.role !== 'assistant' || !asst.content?.trim()) return;
    if (loadPocket(uid).some(p => p.id === messageId)) {
      addPocketTombstone(uid, messageId);
      setPocket(removePocketItem(uid, messageId));
      deleteBookmarkRemote(uid, messageId).catch(() => {});
      return;
    }
    clearPocketTombstone(uid, messageId);
    let question = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { question = msgs[i].content; break; }
    }
    const item: PocketItem = {
      id: messageId, model, question: question.slice(0, 300),
      answer: asst.content.slice(0, 20000), savedAt: Date.now(),
    };
    setPocket(savePocketItem(uid, item));
    upsertBookmarkRemote(uid, item).catch(() => {});
  }, [uid]);

  const remove = useCallback((id: string) => {
    if (!uid) return;
    addPocketTombstone(uid, id);
    setPocket(removePocketItem(uid, id));
    deleteBookmarkRemote(uid, id).catch(() => {});
  }, [uid]);

  return { pocket, pocketIds, pocketView, setPocketView, toggle, remove };
}
