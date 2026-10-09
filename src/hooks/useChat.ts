import { useCallback, useEffect, useRef, useState } from 'react';
import { UnitModel, Message, SessionMeta, AgentEvent } from '../types';
import { generateResponse, generateResponseStream, warmupProxy } from '../services/ai';
import { saveOrUpdateChatSession, deleteChatSession, deleteAllChatSessions, fetchUserSessionList, fetchSessionData } from '../services/supabase';
import {
  loadSessionList, loadSessionData, saveSession, deleteSessionData, deleteAllSessionData, listKey,
  loadSessionTombstones, addSessionTombstones, pendingClearAt, setPendingClear, clearPendingClear,
} from '../services/storage';
import { onForeground } from '../lib/onForeground';
import { makeThumbnails } from '../lib/thumbnail';
import { errorMessage } from '../lib/errorMessage';
import { createPacer } from '../lib/streamPacer';


type User = { uid: string; displayName?: string | null } | null;

export function useChat(user: User, isOnline: boolean) {
  const [selectedModel, setSelectedModel] = useState<UnitModel>('ZX200-5G');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);


  const lastSentRef = useRef<{ content: string; attachments?: File[] } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const sessionListRef = useRef<SessionMeta[]>([]);
  const mountedRef = useRef(true);
  const abortStreamRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const selectionVersionRef = useRef(0);
  const userIdRef = useRef(user?.uid);
  userIdRef.current = user?.uid;

  useEffect(() => {
    mountedRef.current = true;
    warmupProxy();
    return () => { mountedRef.current = false; abortStreamRef.current?.abort(); };
  }, []);

  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { sessionListRef.current = sessionList; }, [sessionList]);

  const stopStreaming = useCallback(() => {
    abortStreamRef.current?.abort();
    setIsTyping(false);
    setIsStreaming(false);
    setAgentEvents([]);
  }, []);

  const startNewSession = useCallback(() => {
    selectionVersionRef.current++;
    abortStreamRef.current?.abort();
    abortStreamRef.current = null;
    setMessages([]);
    messagesRef.current = [];
    lastSentRef.current = null;
    setIsTyping(false);
    setIsStreaming(false);
    setAgentEvents([]);
    setLoadingSession(false);
    setError(null);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
  }, []);

  const syncSessions = useCallback(async (uid: string) => {
    const startedAt = Date.now();
    const clearAt = pendingClearAt(uid);
    if (clearAt) {
      deleteAllChatSessions(uid, clearAt).then(ok => { if (ok && pendingClearAt(uid) === clearAt) clearPendingClear(uid); });
    }
    const list = await fetchUserSessionList(uid).catch(() => null);
    if (list === null || !mountedRef.current || userIdRef.current !== uid) return;
    // A delete-all made while this request was in flight makes its answer stale.
    if (pendingClearAt(uid) > startedAt) return;
    const tomb = loadSessionTombstones(uid);
    const gone = (s: SessionMeta) => !!tomb[s.id] || (!!clearAt && s.updatedAt <= clearAt);
    list.filter(s => tomb[s.id]).forEach(s => { deleteChatSession(s.id, uid); });
    const live = list.filter(s => !gone(s));
    if (live.length) localStorage.setItem(listKey(uid), JSON.stringify(live));
    else deleteAllSessionData(uid);
    const liveIds = new Set(live.map(s => s.id));
    setSessionList(prev => [
      ...prev.filter(s => s.updatedAt >= startedAt && !liveIds.has(s.id) && !tomb[s.id]),
      ...live,
    ]);
  }, []);

  // Keyed on uid, not the user object: a token refresh must not reset the open chat.
  const uid = user?.uid;
  useEffect(() => {
    startNewSession();
    if (!uid) { setSessionList([]); return; }
    const tomb = loadSessionTombstones(uid);
    setSessionList(loadSessionList(uid).filter(s => !tomb[s.id]));
    syncSessions(uid);
    return onForeground(() => syncSessions(uid));
  }, [uid, startNewSession, syncSessions]);

  const handleSelectSession = useCallback(async (id: string) => {
    if (!user) return;
    const selectionVersion = ++selectionVersionRef.current;
    abortStreamRef.current?.abort();
    abortStreamRef.current = null;
    setIsTyping(false);
    setIsStreaming(false);
    setAgentEvents([]);
    const local = loadSessionData(user.uid, id);
    setCurrentSessionId(id);
    sessionIdRef.current = id;
    if (local) {
      setMessages(local.messages);
      setSelectedModel(local.model);
      setError(null);
    } else {
      setMessages([]);
      setLoadingSession(true);
    }
    const remote = await fetchSessionData(id, user.uid);
    if (!mountedRef.current || selectionVersionRef.current !== selectionVersion || sessionIdRef.current !== id || userIdRef.current !== user.uid) return;
    setLoadingSession(false);
    if (remote) {
      setMessages(remote.messages);
      setSelectedModel(remote.model);
      setError(null);
    } else if (!local) {
      setError('Gagal memuat percakapan ini. Coba lagi.');
    }
  }, [user]);

  const confirmDelete = useCallback(() => {
    const id = deleteConfirmId;
    if (!id || !user) return;
    setDeleteConfirmId(null);
    addSessionTombstones(user.uid, [id]);
    deleteSessionData(user.uid, id);
    setSessionList(prev => prev.filter(s => s.id !== id));
    deleteChatSession(id, user.uid);
    if (sessionIdRef.current === id) startNewSession();
  }, [deleteConfirmId, user, startNewSession]);

  const confirmDeleteAll = useCallback(async () => {
    if (!user) return;
    setDeleteAllConfirm(false);
    const uid = user.uid;
    const at = Date.now();
    addSessionTombstones(uid, sessionListRef.current.map(s => s.id));
    setPendingClear(uid, at);
    deleteAllSessionData(uid);
    setSessionList([]);
    startNewSession();
    if (await deleteAllChatSessions(uid, at) && pendingClearAt(uid) === at) clearPendingClear(uid);
  }, [user, startNewSession]);

  const sendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (!user) return;
    lastSentRef.current = { content, attachments };

    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
      sessionIdRef.current = sessionId;
    }

    const attachmentUrls = attachments?.length ? await makeThumbnails(attachments) : [];
    if (!mountedRef.current || userIdRef.current !== user.uid || sessionIdRef.current !== sessionId) return;
    const userMessage: Message = {
      id: crypto.randomUUID(), role: 'user', content: content.trim(), timestamp: Date.now(), attachments: attachmentUrls,
    };

    const currentMessages = messagesRef.current;
    const historyForAi = currentMessages.map(({ id, role, content, timestamp }) => ({ id, role, content, timestamp }));
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    setIsStreaming(true);
    setError(null);
    setAgentEvents([]);

    const userName = (user.displayName || 'Operator').split(' ')[0];
    const rawTitle = content.trim() || (attachmentUrls.length > 0 ? '[Gambar]' : 'New chat');
    const sessionTitle = rawTitle.length > 60 ? rawTitle.slice(0, 57) + '...' : rawTitle;

    const persist = (fullText: string) => {
      if (loadSessionTombstones(user.uid)[sessionId]) return;
      const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: fullText, timestamp: Date.now() };
      const messagesForStorage = [...currentMessages, userMessage, assistantMessage];
      saveSession(user.uid, sessionId, selectedModel, messagesForStorage, rawTitle);
      const newMeta: SessionMeta = { id: sessionId, title: sessionTitle, model: selectedModel, updatedAt: Date.now() };
      setSessionList(prev => [newMeta, ...prev.filter(s => s.id !== sessionId)]);
      saveOrUpdateChatSession(sessionId, user.uid, user.displayName || 'Operator', selectedModel, sessionTitle, messagesForStorage);
    };

    const assistantId = crypto.randomUUID();
    const assistantTs = Date.now();
    const sessionSnapshot = sessionId;
    const streamCtrl = new AbortController();
    abortStreamRef.current = streamCtrl;
    const ownsSession = () => mountedRef.current && userIdRef.current === user.uid && sessionIdRef.current === sessionSnapshot;
    const stillActive = () => ownsSession() && !streamCtrl.signal.aborted;
    const upsertAssistant = (text: string) => setMessages(prev => {
      const exists = prev.some(m => m.id === assistantId);
      if (!exists) return [...prev, { id: assistantId, role: 'assistant', content: text, timestamp: assistantTs }];
      return prev.map(m => m.id === assistantId ? { ...m, content: text } : m);
    });
    const pacer = createPacer(upsertAssistant, stillActive);
    const onChunk = (chunk: string) => {
      if (!stillActive()) return;
      setIsTyping(false);
      pacer.push(chunk);
    };
    const onAgentEvent = (event: AgentEvent) => {
      if (!stillActive()) return;
      setAgentEvents(prev => [...prev, event]);
    };

    const opts = { sessionId: sessionSnapshot, signal: streamCtrl.signal };
    let fullText: string;
    try {
      fullText = attachments?.length
        ? await generateResponse(selectedModel, userName, historyForAi, content, attachments, onChunk, onAgentEvent, opts)
        : await generateResponseStream(selectedModel, userName, historyForAi, content, onChunk, onAgentEvent, opts);
    } catch (err) {
      pacer.cancel();
      if (!ownsSession()) return;
      setIsTyping(false);
      setIsStreaming(false);
      setAgentEvents([]);
      if (!streamCtrl.signal.aborted) {
        console.error('AI Error:', (err as Error)?.message);
        setMessages(prev => prev.filter(m => m.id !== assistantId));
        messagesRef.current = messagesRef.current.filter(m => m.id !== assistantId);
        setError(`Jawaban belum selesai dan tidak disimpan. ${errorMessage(err)}`);
        return;
      }
      fullText = pacer.text().trim() ? `${pacer.text()}\n\n_Jawaban dihentikan oleh pengguna; belum selesai._` : '';
    }

    setIsTyping(false);
    const release = () => { if (!abortStreamRef.current || abortStreamRef.current === streamCtrl) setIsStreaming(false); };
    if (!ownsSession() || !fullText.trim()) {
      pacer.cancel();
      release();
      return;
    }
    persist(fullText);
    if (streamCtrl.signal.aborted) {
      upsertAssistant(fullText);
    } else {
      await pacer.finish(fullText);
      try { navigator.vibrate?.([12, 40, 12]); } catch { }
    }
    release();
  }, [user, selectedModel]);

  const handleSendMessage = useCallback((content: string, attachments?: File[]): boolean => {
    if (!user || !mountedRef.current || userIdRef.current !== user.uid || sendingRef.current || (!content.trim() && !attachments?.length)) return false;
    if (!isOnline || !navigator.onLine) {
      setError('Sedang offline. Pesan tidak dikirim otomatis; kirim lagi setelah sinyal kembali.');
      return false;
    }
    sendingRef.current = true;
    void sendMessage(content, attachments).catch(err => {
      if (userIdRef.current === user.uid) setError(errorMessage(err));
    }).finally(() => { sendingRef.current = false; });
    return true;
  }, [user, isOnline, sendMessage]);

  const retryLast = useCallback(() => {
    const last = lastSentRef.current;
    if (last) handleSendMessage(last.content, last.attachments);
  }, [handleSendMessage]);

  return {
    selectedModel, setSelectedModel,
    messages, isTyping, isStreaming, error, setError, agentEvents,
    sessionList, currentSessionId, loadingSession,
    deleteConfirmId, setDeleteConfirmId, deleteAllConfirm, setDeleteAllConfirm,
    mountedRef, messagesRef, lastSentRef,
    stopStreaming, startNewSession, handleSelectSession,
    confirmDelete, confirmDeleteAll, handleSendMessage, retryLast,
  };
}
