
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { LoginPage } from './components/LoginPage';
import { UnitModel, Message, SessionMeta } from './types';
import { generateResponse, generateResponseStream, warmupProxy, type AgentEvent } from './services/ai';
import { saveOrUpdateChatSession, deleteChatSession, deleteAllChatSessions, fetchUserSessionList, fetchSessionData, fetchBookmarksRemote, upsertBookmarkRemote, deleteBookmarkRemote } from './services/supabase';
import { loadSessionList, loadSessionData, saveSession, deleteSessionData, deleteAllSessionData, listKey, isSessionsCleared, loadPocket, savePocketItem, removePocketItem, replacePocket, loadPocketTombstones, addPocketTombstone, clearPocketTombstone, type PocketItem } from './services/storage';
import { PocketModal } from './components/PocketModal';
import { AlertCircle, Loader2, Menu, SquarePen, Sun, Moon, WifiOff, Wifi, RotateCw, ChevronDown, X } from 'lucide-react';
import { MODEL_GROUPS } from './components/Sidebar';
import { m, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth } from './components/AuthProvider';
import { useNetwork } from './hooks/useNetwork';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline, showOffline, showBackOnline } = useNetwork();
  const [selectedModel, setSelectedModel] = useState<UnitModel>('ZX200-5G');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [pocket, setPocket] = useState<PocketItem[]>([]);
  const [pocketView, setPocketView] = useState<PocketItem | null>(null);
  const pocketIds = useMemo(() => new Set(pocket.map(p => p.id)), [pocket]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [switchConfirm, setSwitchConfirm] = useState<UnitModel | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const mountedRef = useRef(true);
  const abortStreamRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const inputBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    warmupProxy();
    return () => { mountedRef.current = false; };
  }, []);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('dash-theme');
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark-theme', 'light-theme');
    root.classList.add(`${theme}-theme`);
    localStorage.setItem('dash-theme', theme);

    const color = theme === 'dark' ? '#1A1915' : '#FAF9F5';
    document.querySelectorAll('meta[name="theme-color"]').forEach(el => el.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.appendChild(meta);
  }, [theme]);

  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid) { setPocket([]); setPocketView(null); return; }
    const tombAtStart = loadPocketTombstones(uid);
    const local = loadPocket(uid).filter(i => !tombAtStart[i.id]);
    setPocket(local);

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
        .slice(0, 30);
      setPocket(merged);
      replacePocket(uid, merged);
    }).catch(() => {});
  }, [uid]);

  const togglePocket = useCallback((messageId: string) => {
    if (!user) return;
    const msgs = messagesRef.current;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    const asst = msgs[idx];
    if (asst.role !== 'assistant' || !asst.content?.trim()) return;
    if (loadPocket(user.uid).some(p => p.id === messageId)) {
      addPocketTombstone(user.uid, messageId);
      setPocket(removePocketItem(user.uid, messageId));
      deleteBookmarkRemote(user.uid, messageId).catch(() => {});
      return;
    }
    clearPocketTombstone(user.uid, messageId);
    let question = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { question = msgs[i].content; break; }
    }
    const item: PocketItem = {
      id: messageId,
      model: selectedModel,
      question: question.slice(0, 300),
      answer: asst.content.slice(0, 20000),
      savedAt: Date.now(),
    };
    setPocket(savePocketItem(user.uid, item));
    upsertBookmarkRemote(user.uid, item).catch(() => {});
  }, [user, selectedModel]);

  const deletePocketItem = useCallback((id: string) => {
    if (!user) return;
    addPocketTombstone(user.uid, id);
    setPocket(removePocketItem(user.uid, id));
    deleteBookmarkRemote(user.uid, id).catch(() => {});
  }, [user]);

  useEffect(() => {
    const bar = inputBarRef.current;
    const host = mainRef.current;
    if (!bar || !host) return;
    const apply = () => host.style.setProperty('--input-bar-h', `${Math.ceil(bar.offsetHeight)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [user]);

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
    if (!user) {
      setSessionList([]);
      return;
    }
    const cached = loadSessionList(user.uid);
    setSessionList(cached);
    startNewSession();

    fetchUserSessionList(user.uid).then(list => {
      if (list === null) return;
      if (isSessionsCleared(user.uid)) return;
      if (list.length > 0) {
        setSessionList(list);
        localStorage.setItem(listKey(user.uid), JSON.stringify(list));
      } else {
        deleteAllSessionData(user.uid, false);
        setSessionList([]);
      }
    }).catch(() => {});
  }, [user?.uid, startNewSession]);

  const handleSelectModel = useCallback((model: UnitModel) => {
    setModelSheet(false);
    if (model === selectedModel) return;
    if (messagesRef.current.length > 0) { setSwitchConfirm(model); return; }
    setSelectedModel(model);
    startNewSession();
  }, [startNewSession, selectedModel]);

  const confirmSwitch = useCallback(() => {
    const model = switchConfirm;
    setSwitchConfirm(null);
    if (!model) return;
    setSelectedModel(model);
    startNewSession();
  }, [switchConfirm, startNewSession]);

  const handleSelectSession = useCallback(async (id: string) => {
    if (!user) return;
    abortStreamRef.current?.abort();
    abortStreamRef.current = null;
    let session = await fetchSessionData(id, user.uid);
    if (!mountedRef.current) return;
    if (!session) {
      session = loadSessionData(user.uid, id);
    }
    if (!session) {
      setError('Gagal memuat percakapan ini. Coba lagi.');
      return;
    }
    setMessages(session.messages);
    setSelectedModel(session.model);
    setCurrentSessionId(id);
    sessionIdRef.current = id;
    setError(null);
  }, [user]);

  const handleDeleteSession = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const confirmDelete = useCallback(() => {
    const id = deleteConfirmId;
    if (!id || !user) return;
    setDeleteConfirmId(null);
    const updatedList = deleteSessionData(user.uid, id);
    setSessionList(updatedList);
    deleteChatSession(id, user.uid);
    if (sessionIdRef.current === id) {
      startNewSession();
    }
  }, [deleteConfirmId, user, startNewSession]);

  const confirmDeleteAll = useCallback(async () => {
    if (!user) return;
    setDeleteAllConfirm(false);
    deleteAllSessionData(user.uid);
    setSessionList([]);
    startNewSession();
    await deleteAllChatSessions(user.uid);
  }, [user, startNewSession]);

  const handleThemeToggle = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting || reg.installing) {
            await new Promise<void>((resolve) => {
              navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
              setTimeout(resolve, 3000);
            });
          }
        }
      }
    } catch { }
    window.location.reload();
  }, [isRefreshing]);

  const handleSendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (!user) return;

    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
      sessionIdRef.current = sessionId;
    }

    const attachmentUrls: string[] = attachments && attachments.length > 0
      ? (await Promise.allSettled(attachments.map(file => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Gagal membaca: ${file.name}`));
          reader.readAsDataURL(file);
        }))))
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map(r => r.value)
      : [];

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
      attachments: attachmentUrls,
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
      const newMessages = [...currentMessages, userMessage, assistantMessage];
      const messagesForStorage = newMessages.map(m => m.attachments?.length ? { ...m, attachments: [] } : m);
      saveSession(user.uid, sessionId, selectedModel, messagesForStorage, rawTitle);
      const newMeta: SessionMeta = { id: sessionId, title: sessionTitle, model: selectedModel, updatedAt: Date.now() };
      setSessionList(prev => [newMeta, ...prev.filter(s => s.id !== sessionId)]);
      saveOrUpdateChatSession(sessionId, user.uid, user.displayName || 'Operator', selectedModel, sessionTitle, messagesForStorage);
    };

    const toolsUsed = new Set<string>();
    try {
      const assistantId = crypto.randomUUID();
      const assistantTs = Date.now();
      const sessionSnapshot = sessionId;
      let displayed = '';
      let buffered = '';
      let timerId: ReturnType<typeof setTimeout> | null = null;
      const FLUSH_INTERVAL = 40;
      const FLUSH_BATCH = 200;
      const streamCtrl = new AbortController();
      abortStreamRef.current = streamCtrl;
      const drip = () => {
        timerId = null;
        if (!mountedRef.current) return;
        if (sessionIdRef.current !== sessionSnapshot) return;
        if (streamCtrl.signal.aborted) return;
        if (!buffered.length) return;
        const size = Math.max(FLUSH_BATCH, Math.ceil(buffered.length / 4));
        const batch = buffered.slice(0, size);
        buffered = buffered.slice(size);
        displayed += batch;
        const snap = displayed;
        setMessages(prev => {
          const exists = prev.some(m => m.id === assistantId);
          if (!exists) return [...prev, { id: assistantId, role: 'assistant', content: snap, timestamp: assistantTs }];
          return prev.map(m => m.id === assistantId ? { ...m, content: snap } : m);
        });
        if (buffered.length > 0) timerId = setTimeout(drip, FLUSH_INTERVAL);
      };
      const onChunkCb = (chunk: string) => {
        if (!mountedRef.current) return;
        if (sessionIdRef.current !== sessionSnapshot) return;
        if (streamCtrl.signal.aborted) return;
        setIsTyping(false);
        buffered += chunk;
        if (timerId === null) timerId = setTimeout(drip, FLUSH_INTERVAL);
      };
      const onAgentEventCb = (event: AgentEvent) => {
        if (!mountedRef.current) return;
        if (sessionIdRef.current !== sessionSnapshot) return;
        if (event.type === 'tool_call' && event.tool) toolsUsed.add(event.tool);
        setAgentEvents(prev => [...prev, event]);
      };

      let fullText: string;
      if (attachments && attachments.length > 0) {
        fullText = await generateResponse(
          selectedModel, userName, historyForAi, content, attachments,
          onChunkCb, onAgentEventCb,
        );
      } else {
        fullText = await generateResponseStream(selectedModel, userName, historyForAi, content, onChunkCb, onAgentEventCb);
      }

      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      if (!mountedRef.current) return;
      if (sessionIdRef.current !== sessionSnapshot) return;
      if (streamCtrl.signal.aborted) fullText = displayed + buffered;
      if (!fullText.trim()) return;
      setMessages(prev => {
        const exists = prev.some(m => m.id === assistantId);
        if (!exists) return [...prev, { id: assistantId, role: 'assistant', content: fullText, timestamp: assistantTs }];
        return prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m);
      });
      persist(fullText);
    } catch (err: any) {
      if ((err as Error)?.name === 'AbortError' || (err as Error)?.message?.includes('abort')) return;
      console.error('AI Error:', err.message);
      setError(
        err.message?.includes('KUOTA_PENUH')
          ? 'Kuota AI sedang penuh (terlalu banyak permintaan berbarengan). Tunggu sekitar satu menit, lalu kirim ulang.'
          : err.message?.includes('Stream terputus')
            ? 'Koneksi ke AI terputus di tengah jalan. Coba kirim ulang pertanyaanmu.'
            : 'Dash⁵ tidak bisa dihubungi. Cek sinyal kamu, lalu coba lagi.');
    } finally {
      setIsTyping(false);
      setIsStreaming(false);
    }
  }, [user, selectedModel]);

  if (authLoading) {
    return (
      <div className="h-dvh w-screen flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-10 h-10 text-[var(--accent-main)] animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage theme={theme} onThemeToggle={handleThemeToggle} />;

  return (
    <div className={cn(
      "flex h-dvh overflow-hidden transition-colors duration-400",
      "bg-[var(--bg-app)] text-[var(--text-primary)]"
    )}>
      <Sidebar
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        onNewChat={startNewSession}
        sessions={sessionList}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onDeleteAllSessions={() => setDeleteAllConfirm(true)}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(v => !v)}
        theme={theme}
        onThemeToggle={handleThemeToggle}
        pocketItems={pocket}
        onOpenPocketItem={setPocketView}
        onDeletePocketItem={deletePocketItem}
      />

      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden min-w-0 relative">

        <AnimatePresence>
          {isSidebarCollapsed && (
            <m.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 topbar-native"
            >
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="topbar-hamburger"
                  aria-label="Buka sidebar"
                >
                  <Menu size={18} />
                </button>
                <button
                  onClick={handleRefresh}
                  className="topbar-hamburger"
                  aria-label="Refresh aplikasi (ambil versi terbaru)"
                  disabled={isRefreshing}
                >
                  <RotateCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>

              <button className="topbar-center" onClick={() => setModelSheet(true)} aria-label="Ganti unit">
                <span className="topbar-model-name">{selectedModel}</span>
                <ChevronDown size={14} className="text-[var(--text-muted)]" />
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleThemeToggle}
                  className="topbar-hamburger"
                  aria-label="Toggle tema"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button
                  onClick={startNewSession}
                  className="topbar-newchat"
                  aria-label="New chat"
                >
                  <SquarePen size={16} />
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
        {isSidebarCollapsed && <div className="topbar-spacer" aria-hidden="true" />}

        <AnimatePresence>
          {showOffline && (
            <m.div
              key="offline-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="shrink-0 overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-2.5 border-b"
                style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.15)' }}>
                <WifiOff size={13} className="shrink-0 text-amber-400" />
                <span className="text-[12.5px] flex-1 text-amber-300">
                  <strong className="font-semibold">Sinyal hilang</strong>
                  {' '}— Riwayat tersedia. Chat aktif kembali saat sinyal pulih.
                </span>
                <span className="status-pulse w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showBackOnline && (
            <m.div
              key="online-toast"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="shrink-0 overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-2.5 border-b"
                style={{ background: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.15)' }}>
                <Wifi size={13} className="shrink-0 text-emerald-400" />
                <span className="text-[12.5px] text-emerald-300">
                  <strong className="font-semibold">Sinyal kembali</strong>
                  {' '}— Koneksi aktif, Dash⁵ siap digunakan.
                </span>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="shrink-0 flex items-center gap-3 px-4 py-3 bg-red-500/5 border-b border-red-500/10 text-red-400 text-sm"
            >
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-xs underline opacity-70 hover:opacity-100">
                Tutup
              </button>
            </m.div>
          )}
        </AnimatePresence>

        <ChatWindow
          messages={messages}
          isTyping={isTyping}
          isStreaming={isStreaming}
          selectedModel={selectedModel}
          userName={(user?.displayName || 'Operator').split(' ')[0]}
          hasHistory={sessionList.length > 0}
          pocketIds={pocketIds}
          onTogglePocket={togglePocket}
          agentEvents={agentEvents}
          onPickExample={q => handleSendMessage(q)}
        />

        <div ref={inputBarRef} className="input-bar-float">
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={isTyping}
            selectedModel={selectedModel}
            isOffline={!isOnline}
            isStreaming={isTyping || isStreaming}
            onStop={stopStreaming}
          />
        </div>

      </main>

      <PocketModal
        item={pocketView}
        onClose={() => setPocketView(null)}
        onDelete={deletePocketItem}
      />

      <AnimatePresence>
        {modelSheet && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setModelSheet(false)}
          >
            <m.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="model-sheet"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-[var(--border-main)]" /></div>
              <div className="flex items-center justify-between px-5 pb-2">
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">Pilih unit</p>
                <button onClick={() => setModelSheet(false)} className="topbar-hamburger" aria-label="Tutup"><X size={16} /></button>
              </div>
              {MODEL_GROUPS.map(({ type, models }) => (
                <div key={type} className="px-3 pb-2">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{type}</p>
                  {models.map(model => (
                    <button
                      key={model}
                      onClick={() => handleSelectModel(model)}
                      className={cn('model-sheet-item', model === selectedModel && 'model-sheet-item-active')}
                    >
                      <span className={cn('w-2 h-2 rounded-full shrink-0', model === selectedModel ? 'bg-[var(--accent-active)]' : 'bg-[var(--text-muted)]/40')} />
                      <span>{model}</span>
                    </button>
                  ))}
                </div>
              ))}
              <div className="safe-area-spacer" />
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {switchConfirm && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setSwitchConfirm(null)}
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-1">Ganti ke {switchConfirm}?</p>
              <p className="text-[var(--text-muted)] text-[13px] mb-5">Chat ini tetap tersimpan di riwayat. Percakapan baru dimulai untuk unit {switchConfirm}.</p>
              <div className="flex gap-2.5">
                <button onClick={() => setSwitchConfirm(null)} className="flex-1 h-10 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors">Batal</button>
                <button onClick={confirmSwitch} className="flex-1 h-10 rounded-xl bg-[var(--accent-main)] text-white text-[13px] font-semibold transition-colors">Ganti unit</button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteAllConfirm && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setDeleteAllConfirm(false)}
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-1">Hapus semua riwayat?</p>
              <p className="text-[var(--text-muted)] text-[13px] mb-5">Seluruh riwayat hilang dari akunmu dan tidak bisa dikembalikan. Data percakapan tetap disimpan Hexindo untuk peningkatan layanan.</p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setDeleteAllConfirm(false)}
                  className="flex-1 h-9 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDeleteAll}
                  className="flex-1 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-semibold transition-colors"
                >
                  Hapus Semua
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirmId && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setDeleteConfirmId(null)}
          >
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-1">Hapus percakapan?</p>
              <p className="text-[var(--text-muted)] text-[13px] mb-5">Percakapan hilang dari riwayatmu dan tidak bisa dikembalikan. Datanya tetap disimpan Hexindo untuk peningkatan layanan.</p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 h-9 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-semibold transition-colors"
                >
                  Hapus
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
