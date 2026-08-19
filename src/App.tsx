
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { LoginPage } from './components/LoginPage';
import { UnitModel, Message, SessionMeta } from './types';
import { generateResponse, generateResponseStream, generateResponseAgentic, warmupProxy, type AgentEvent } from './services/ai';
import { saveOrUpdateChatSession, deleteChatSession, deleteAllChatSessions, fetchUserSessionList, fetchSessionData, fetchBookmarksRemote, upsertBookmarkRemote, deleteBookmarkRemote } from './services/supabase';
import { loadSessionList, loadSessionData, saveSession, deleteSessionData, deleteAllSessionData, listKey, isSessionsCleared, loadPocket, savePocketItem, removePocketItem, replacePocket, loadPocketTombstones, addPocketTombstone, clearPocketTombstone, type PocketItem } from './services/storage';
import { PocketModal } from './components/PocketModal';
import { AlertCircle, Loader2, Menu, SquarePen, Sun, Moon, WifiOff, Wifi, RotateCw } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth } from './components/AuthProvider';
import { useNetwork } from './hooks/useNetwork';

type AgenticPreference = 'adaptive' | 'always' | 'never';

const AGENTIC_KEY = 'dash-agentic';

// Pilihan dari URL DISIMPAN. start_url manifest = "/" tanpa query, jadi membuka PWA dari ikon
// selalu membuang ?agentic — sakelar eksperimennya jadi tak terpakai justru di HP.
function getAgenticPreference(): AgenticPreference {
  const param = new URLSearchParams(window.location.search).get('agentic')?.toLowerCase();
  const dariUrl: AgenticPreference | null =
    param === 'true'  || param === '1' || param === 'always' ? 'always' :
    param === 'false' || param === '0' || param === 'never'  ? 'never'  : null;

  if (dariUrl) {
    try { localStorage.setItem(AGENTIC_KEY, dariUrl); } catch { /* storage mati — abaikan */ }
    console.info('[agentic] mode=%s (dari URL, disimpan)', dariUrl);
    return dariUrl;
  }

  try {
    const tersimpan = localStorage.getItem(AGENTIC_KEY);
    if (tersimpan === 'always' || tersimpan === 'never') {
      console.info('[agentic] mode=%s (tersimpan — matikan dengan ?agentic=false)', tersimpan);
      return tersimpan;
    }
  } catch { /* storage mati — abaikan */ }

  const envMode = String(import.meta.env.VITE_AGENTIC_MODE ?? 'adaptive').toLowerCase();
  if (envMode === 'always' || envMode === 'true') return 'always';
  if (envMode === 'never' || envMode === 'false') return 'never';
  return 'adaptive';
}

function shouldUseAgenticForQuery(_input: string): boolean {
  return false;
}

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
  // Saku — jawaban tersimpan offline (localStorage per-user)
  const [pocket, setPocket] = useState<PocketItem[]>([]);
  const [pocketView, setPocketView] = useState<PocketItem | null>(null);
  const pocketIds = useMemo(() => new Set(pocket.map(p => p.id)), [pocket]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const agenticPreference = useRef(getAgenticPreference()).current;
  const shouldUseAgentic = useCallback((content: string) => {
    if (agenticPreference === 'always') return true;
    if (agenticPreference === 'never') return false;
    return shouldUseAgenticForQuery(content);
  }, [agenticPreference]);

  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const mountedRef = useRef(true);
  // AbortController untuk in-flight stream — plain ref, tidak masuk deps chain
  const abortStreamRef = useRef<AbortController | null>(null);
  // Dipakai mengukur tinggi input bar → --input-bar-h (lihat effect ResizeObserver)
  const mainRef = useRef<HTMLElement | null>(null);
  const inputBarRef = useRef<HTMLDivElement | null>(null);


  useEffect(() => {
    mountedRef.current = true;
    warmupProxy(); // bangunkan proxy Cloud Run — pertanyaan pertama tidak kena cold start
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

    // Update theme-color meta — remove+re-add (attribute change alone tidak trigger Chrome re-evaluate)
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
        .filter(r => !tomb[r.message_id])          // dihapus lokal → JANGAN dihidupkan lagi
        .map(r => ({
          id: r.message_id, model: r.model, question: r.question ?? '',
          answer: r.answer, savedAt: new Date(r.saved_at).getTime() || Date.now(),
        }));

      remote.filter(r => tomb[r.message_id])
        .forEach(r => { deleteBookmarkRemote(uid, r.message_id).catch(() => {}); });

      // Sisa lokal yang belum ada di remote = benar-benar dibuat saat offline → push.
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
      addPocketTombstone(user.uid, messageId);   // catat SEBELUM async — merge tak bisa menghidupkan lagi
      setPocket(removePocketItem(user.uid, messageId));
      deleteBookmarkRemote(user.uid, messageId).catch(() => {});
      return;
    }
    clearPocketTombstone(user.uid, messageId);   // disimpan ulang → batalkan tombstone lama
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
    addPocketTombstone(user.uid, id);            // tombstone dulu, baru hapus (urutan penting)
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
    // Abort in-flight stream — abortStreamRef adalah ref, tidak masuk deps
    abortStreamRef.current?.abort();
    abortStreamRef.current = null;
    setMessages([]);
    setError(null);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
  }, []); // deps tetap [] — tidak ada perubahan pada Effect chain

  useEffect(() => {
    if (!user) {
      setSessionList([]);
      return;
    }
    const cached = loadSessionList(user.uid);
    setSessionList(cached);
    startNewSession();

    fetchUserSessionList(user.uid).then(list => {
      if (list === null) return; // error jaringan — jangan sentuh localStorage
      if (isSessionsCleared(user.uid)) return; // baru hapus di browser ini
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
    setSelectedModel(model);
    startNewSession();
  }, [startNewSession]);

  const handleSelectSession = useCallback(async (id: string) => {
    if (!user) return;
    abortStreamRef.current?.abort();
    abortStreamRef.current = null;
    let session = await fetchSessionData(id, user.uid);
    if (!mountedRef.current) return; // unmount guard setelah async
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
          await reg.update(); // cek SW versi baru dari server
          // Kalau ada SW baru installing/waiting, tunggu dia ambil alih sebelum reload
          if (reg.waiting || reg.installing) {
            await new Promise<void>((resolve) => {
              navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
              setTimeout(resolve, 3000); // fallback: jangan hang kalau tidak ada perubahan
            });
          }
        }
      }
    } catch { /* abaikan — tetap reload */ }
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
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    setIsStreaming(true);
    setError(null);
    setAgentEvents([]); // reset progress display untuk message baru

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
      const sessionSnapshot = sessionId; // capture — guard ghost content jika session switch
      let displayed = '';
      let buffered = '';
      let timerId: ReturnType<typeof setTimeout> | null = null;
      const FLUSH_INTERVAL = 40;
      const FLUSH_BATCH = 200;
      // AbortController per stream — ref tidak masuk deps, aman
      const streamCtrl = new AbortController();
      abortStreamRef.current = streamCtrl;
      const drip = () => {
        timerId = null;
        if (!mountedRef.current) return;
        if (sessionIdRef.current !== sessionSnapshot) return; // session sudah switch
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
      let streamedAny = false;
      const onChunkCb = (chunk: string) => {
        if (!mountedRef.current) return;
        if (sessionIdRef.current !== sessionSnapshot) return; // ghost content guard
        if (streamCtrl.signal.aborted) return;
        setIsTyping(false);
        streamedAny = true;
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
        // Jalur foto: sekarang streaming + progress event (OCR → cocokkan manual → diagnosis)
        fullText = await generateResponse(
          selectedModel, userName, currentMessages, content, attachments,
          onChunkCb, onAgentEventCb,
        );
      } else {
        const useAgentic = shouldUseAgentic(content);
        try {
          fullText = useAgentic
            ? await generateResponseAgentic(
                selectedModel, userName, currentMessages, content,
                onChunkCb, onAgentEventCb,
              )
            : await generateResponseStream(selectedModel, userName, currentMessages, content, onChunkCb, onAgentEventCb);
        } catch (agErr) {
          const aborted = (agErr as Error)?.name === 'AbortError' || (agErr as Error)?.message?.includes('abort');
          if (!useAgentic || streamedAny || aborted) throw agErr;
          console.warn('[agentic] gagal sebelum streaming, fallback ke single-pass:', (agErr as Error)?.message);
          setAgentEvents([]);
          fullText = await generateResponseStream(selectedModel, userName, currentMessages, content, onChunkCb, onAgentEventCb);
        }
      }

      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      if (!mountedRef.current) return;
      if (sessionIdRef.current !== sessionSnapshot) return; // session sudah switch, skip persist
      if (streamCtrl.signal.aborted) fullText = displayed + buffered;
      if (!fullText.trim()) return; // stop sebelum ada teks → tak ada yang perlu disimpan
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
            : 'Dash⁵ gagal merespon. Periksa API Key dan koneksi kamu.');
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

        {/* Top bar — shown when sidebar is collapsed */}
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

              <div className="topbar-center">
                <span className="topbar-model-name">{selectedModel}</span>
              </div>

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

        {/* ── Offline Banner (auto-dismiss 4s) ── */}
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

        {/* ── Back Online Toast (auto-dismiss 3.5s) ── */}
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

        {/* Error Banner */}
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

        {/* ChatWindow tanpa bottom constraint — content scroll di bawah input bar */}
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
        />

        {/* Input bar absolute floating di bottom — scroll konten ke baliknya */}
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

      {/* ── Saku viewer — baca jawaban tersimpan (offline-ready) ── */}
      <PocketModal
        item={pocketView}
        onClose={() => setPocketView(null)}
        onDelete={deletePocketItem}
      />

      {/* ── Delete All Confirmation Dialog ── */}
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
              <p className="text-[var(--text-muted)] text-[13px] mb-5">Seluruh percakapan akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.</p>
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

      {/* ── Delete Confirmation Dialog ── */}
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
              <p className="text-[var(--text-muted)] text-[13px] mb-5">Tindakan ini tidak bisa dibatalkan.</p>
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
