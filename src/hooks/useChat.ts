import { useCallback, useEffect, useRef, useState } from 'react';
import { UnitModel, Message, SessionMeta } from '../types';
import { generateResponse, generateResponseStream, warmupProxy, type AgentEvent } from '../services/ai';
import { saveOrUpdateChatSession, deleteChatSession, deleteAllChatSessions, fetchUserSessionList, fetchSessionData } from '../services/supabase';
import { loadSessionList, loadSessionData, saveSession, deleteSessionData, deleteAllSessionData, listKey, isSessionsCleared } from '../services/storage';
import { makeThumbnails } from '../lib/thumbnail';
import { errorMessage } from '../lib/errorMessage';

const FLUSH_INTERVAL = 40;
const FLUSH_BATCH = 200;

type Queued = { content: string; attachments?: File[] };
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
  const [queued, setQueued] = useState<Queued | null>(null);

  const lastSentRef = useRef<{ content: string; attachments?: File[] } | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const mountedRef = useRef(true);
  const abortStreamRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    warmupProxy();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const stopStreaming = useCallback(() => {
    abortStreamRef.current?.abort();
    setIsTyping(false);
    setIsStreaming(false);
    setAgentEvents([]);
  }, []);

  const startNewSession = useCallback(() => {
    abortStreamRef.current?.abort();
    abortStreamRef.current = null;
    setMessages([]);
    setError(null);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!user) { setSessionList([]); return; }
    setSessionList(loadSessionList(user.uid));
    startNewSession();
    fetchUserSessionList(user.uid).then(list => {
      if (list === null || isSessionsCleared(user.uid)) return;
      if (list.length > 0) {
        setSessionList(list);
        localStorage.setItem(listKey(user.uid), JSON.stringify(list));
      } else {
        deleteAllSessionData(user.uid, false);
        setSessionList([]);
      }
    }).catch(() => {});
  }, [user?.uid, startNewSession]);

  const handleSelectSession = useCallback(async (id: string) => {
    if (!user) return;
    abortStreamRef.current?.abort();
    abortStreamRef.current = null;
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
    if (!mountedRef.current || sessionIdRef.current !== id) return;
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
    setSessionList(deleteSessionData(user.uid, id));
    deleteChatSession(id, user.uid);
    if (sessionIdRef.current === id) startNewSession();
  }, [deleteConfirmId, user, startNewSession]);

  const confirmDeleteAll = useCallback(async () => {
    if (!user) return;
    setDeleteAllConfirm(false);
    deleteAllSessionData(user.uid);
    setSessionList([]);
    startNewSession();
    await deleteAllChatSessions(user.uid);
  }, [user, startNewSession]);

  const handleSendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (!user) return;
    if (!navigator.onLine) { setQueued({ content, attachments }); return; }
    lastSentRef.current = { content, attachments };

    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
      sessionIdRef.current = sessionId;
    }

    const attachmentUrls = attachments?.length ? await makeThumbnails(attachments) : [];
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
    let displayed = '';
    let buffered = '';
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const stillActive = () => mountedRef.current && sessionIdRef.current === sessionSnapshot && !streamCtrl.signal.aborted;
    const upsertAssistant = (text: string) => setMessages(prev => {
      const exists = prev.some(m => m.id === assistantId);
      if (!exists) return [...prev, { id: assistantId, role: 'assistant', content: text, timestamp: assistantTs }];
      return prev.map(m => m.id === assistantId ? { ...m, content: text } : m);
    });
    const drip = () => {
      timerId = null;
      if (!stillActive() || !buffered.length) return;
      const size = Math.max(FLUSH_BATCH, Math.ceil(buffered.length / 4));
      displayed += buffered.slice(0, size);
      buffered = buffered.slice(size);
      upsertAssistant(displayed);
      if (buffered.length > 0) timerId = setTimeout(drip, FLUSH_INTERVAL);
    };
    const onChunk = (chunk: string) => {
      if (!stillActive()) return;
      setIsTyping(false);
      buffered += chunk;
      if (timerId === null) timerId = setTimeout(drip, FLUSH_INTERVAL);
    };
    const onAgentEvent = (event: AgentEvent) => {
      if (!stillActive()) return;
      setAgentEvents(prev => [...prev, event]);
    };

    try {
      let fullText = attachments?.length
        ? await generateResponse(selectedModel, userName, historyForAi, content, attachments, onChunk, onAgentEvent, sessionSnapshot)
        : await generateResponseStream(selectedModel, userName, historyForAi, content, onChunk, onAgentEvent, sessionSnapshot);

      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      if (!mountedRef.current || sessionIdRef.current !== sessionSnapshot) return;
      if (streamCtrl.signal.aborted) fullText = displayed + buffered;
      if (!fullText.trim()) return;
      upsertAssistant(fullText);
      try { navigator.vibrate?.([12, 40, 12]); } catch { }
      persist(fullText);
    } catch (err) {
      const e = err as Error;
      if (e?.name === 'AbortError' || e?.message?.includes('abort')) return;
      console.error('AI Error:', e?.message);
      setError(errorMessage(err));
    } finally {
      setIsTyping(false);
      setIsStreaming(false);
    }
  }, [user, selectedModel]);

  useEffect(() => {
    if (!isOnline || !queued) return;
    const q = queued;
    setQueued(null);
    handleSendMessage(q.content, q.attachments);
  }, [isOnline, queued, handleSendMessage]);

  const retryLast = useCallback(() => {
    const last = lastSentRef.current;
    if (last) handleSendMessage(last.content, last.attachments);
  }, [handleSendMessage]);

  return {
    selectedModel, setSelectedModel,
    messages, isTyping, isStreaming, error, setError, agentEvents,
    sessionList, currentSessionId, loadingSession,
    deleteConfirmId, setDeleteConfirmId, deleteAllConfirm, setDeleteAllConfirm,
    queued, setQueued, mountedRef, messagesRef, lastSentRef,
    stopStreaming, startNewSession, handleSelectSession,
    confirmDelete, confirmDeleteAll, handleSendMessage, retryLast,
  };
}
