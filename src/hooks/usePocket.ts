import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { Message, UnitModel } from '../types';
import { fetchBookmarksRemote, upsertBookmarkRemote, deleteBookmarkRemote } from '../services/supabase';
import {
  loadPocket, savePocketItem, removePocketItem, replacePocket, markPocketSynced,
  loadPocketTombstones, addPocketTombstone, clearPocketTombstone, type PocketItem,
} from '../services/storage';
import { onForeground } from '../lib/onForeground';

const MAX_ITEMS = 30;

export function usePocket(uid: string | null, mountedRef: MutableRefObject<boolean>) {
  const [pocket, setPocket] = useState<PocketItem[]>([]);
  const [pocketView, setPocketView] = useState<PocketItem | null>(null);
  const pocketIds = useMemo(() => new Set(pocket.map(p => p.id)), [pocket]);

  const push = useCallback((item: PocketItem) => {
    if (!uid) return;
    upsertBookmarkRemote(uid, item)
      .then(ok => { if (ok && !loadPocketTombstones(uid)[item.id]) markPocketSynced(uid, item.id); })
      .catch(() => {});
  }, [uid]);

  const sync = useCallback(async () => {
    if (!uid) return;
    const startedAt = Date.now();
    const remote = await fetchBookmarksRemote(uid).catch(() => null);
    if (!remote || !mountedRef.current) return;
    const tomb = loadPocketTombstones(uid);
    remote.filter(r => tomb[r.message_id])
      .forEach(r => { deleteBookmarkRemote(uid, r.message_id).catch(() => {}); });
    const remoteItems: PocketItem[] = remote
      .filter(r => !tomb[r.message_id])
      .map(r => ({
        id: r.message_id, model: r.model, question: r.question ?? '',
        answer: r.answer, savedAt: new Date(r.saved_at).getTime() || Date.now(), synced: true,
      }));
    const remoteIds = new Set(remoteItems.map(i => i.id));
    // A synced item missing from the server was deleted on another device; only unsynced ones are uploaded.
    const keep = loadPocket(uid).filter(i => !tomb[i.id] && !remoteIds.has(i.id)
      && (i.synced === false || i.savedAt >= startedAt));
    keep.filter(i => !i.synced).forEach(push);
    const merged = [...keep, ...remoteItems]
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_ITEMS);
    setPocket(merged);
    replacePocket(uid, merged);
  }, [uid, mountedRef, push]);

  useEffect(() => {
    if (!uid) { setPocket([]); setPocketView(null); return; }
    const tomb = loadPocketTombstones(uid);
    setPocket(loadPocket(uid).filter(i => !tomb[i.id]));
    sync();
    return onForeground(sync);
  }, [uid, sync]);

  const remove = useCallback((id: string) => {
    if (!uid) return;
    addPocketTombstone(uid, id);
    setPocket(removePocketItem(uid, id));
    setPocketView(v => (v?.id === id ? null : v));
    deleteBookmarkRemote(uid, id).catch(() => {});
  }, [uid]);

  const toggle = useCallback((messageId: string, msgs: Message[], model: UnitModel) => {
    if (!uid) return;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    const asst = msgs[idx];
    if (asst.role !== 'assistant' || !asst.content?.trim()) return;
    if (loadPocket(uid).some(p => p.id === messageId)) { remove(messageId); return; }
    clearPocketTombstone(uid, messageId);
    let question = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { question = msgs[i].content; break; }
    }
    const item: PocketItem = {
      id: messageId, model, question: question.slice(0, 300),
      answer: asst.content.slice(0, 20000), savedAt: Date.now(), synced: false,
    };
    setPocket(savePocketItem(uid, item));
    push(item);
  }, [uid, remove, push]);

  return { pocket, pocketIds, pocketView, setPocketView, toggle, remove };
}
