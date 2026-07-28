
import { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { LoginPage } from './components/LoginPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { FieldNoteModal } from './components/FieldNoteModal';
import { UnitModel, Message, SessionMeta, KnowledgeGap } from './types';
import { generateResponse, generateResponseStream, generateResponseAgentic, getQuestionUsage, type AgentEvent } from './services/ai';
import { logQuestionUsage } from './services/usage';
import { saveOrUpdateChatSession, deleteChatSession, deleteAllChatSessions, fetchUserSessionList, fetchSessionData } from './services/supabase';
import { loadSessionList, loadSessionData, saveSession, deleteSessionData, deleteAllSessionData, listKey, isSessionsCleared } from './services/storage';
import { AlertCircle, Loader2, Menu, SquarePen, Sun, Moon, WifiOff, Wifi, RotateCw } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth } from './components/AuthProvider';
import { useNetwork } from './hooks/useNetwork';

type AgenticPreference = 'adaptive' | 'always' | 'never';

function getAgenticPreference(): AgenticPreference {
  const param = new URLSearchParams(window.location.search).get('agentic')?.toLowerCase();
  if (param === 'true' || param === '1' || param === 'always') return 'always';
  if (param === 'false' || param === '0' || param === 'never') return 'never';

  const envMode = String(import.meta.env.VITE_AGENTIC_MODE ?? 'adaptive').toLowerCase();
  if (envMode === 'always' || envMode === 'true') return 'always';
  if (envMode === 'never' || envMode === 'false') return 'never';
  return 'adaptive';
}

// Default (adaptive) → SINGLE-PASS. Query multi-aspek ("2 pertanyaan dalam 1") sekarang
// ditangani DETERMINISTIK di dalam generateResponseStream (decompose + dual-search per aspek,
// lihat resolveMultiAspectQuery di ai.ts) — lebih cepat & andal daripada ReAct loop yang
// rentan 400 (functionCall/functionResponse). ReAct penuh tetap tersedia via ?agentic=true
// untuk demo/eksperimen.
function shouldUseAgenticForQuery(_input: string): boolean {
  return false;
}

export default function App() {
  const { user, loading: authLoading, isRecoveryMode } = useAuth();
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
  const [fieldNoteState, setFieldNoteState] = useState<{ messageId: string; gap?: KnowledgeGap; question: string; answer: string } | null>(null);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Default adaptive: simple lookup tetap single-pass, diagnosis kompleks otomatis ReAct.
  // URL override: ?agentic=true memaksa agent, ?agentic=false memaksa single-pass.
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


  useEffect(() => {
    mountedRef.current = true;
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
        // Supabase definitif kosong → sinkron ke browser/device ini
        // setFlag=false: jangan set clearedKey agar refresh berikutnya tetap fetch Supabase
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

  // Cost ledger: kirim total token 1 pertanyaan ke /v1/usage (fire-and-forget).
  // Dibaca dari accumulator ai.ts setelah jawaban selesai. tools = dari agent events.
  const logCost = useCallback((sid: string | null, tools: string[]) => {
    if (!user) return;
    const u = getQuestionUsage();
    logQuestionUsage({
      userName: user.displayName || 'Operator',
      userNik: user.email ?? null,
      sessionId: sid,
      model: u.model,
      inputTokens: u.input,
      outputTokens: u.output,
      llmCalls: u.calls,
      toolsUsed: tools,
    });
  }, [user]);

  // Refresh manual: paksa cek update service worker → tunggu SW baru aktif → reload.
  // Mengatasi masalah PWA serve kode lama (StaleWhileRevalidate) tanpa perlu unregister SW manual.
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

    const persist = (fullText: string, gap?: KnowledgeGap) => {
      const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: fullText, timestamp: Date.now(), knowledgeGap: gap };
      const newMessages = [...currentMessages, userMessage, assistantMessage];
      const messagesForStorage = newMessages.map(m => m.attachments?.length ? { ...m, attachments: [] } : m);
      saveSession(user.uid, sessionId, selectedModel, messagesForStorage, rawTitle);
      const newMeta: SessionMeta = { id: sessionId, title: sessionTitle, model: selectedModel, updatedAt: Date.now() };
      setSessionList(prev => [newMeta, ...prev.filter(s => s.id !== sessionId)]);
      saveOrUpdateChatSession(sessionId, user.uid, user.displayName || 'Operator', selectedModel, sessionTitle, newMessages);
    };

    const toolsUsed = new Set<string>();
    let capturedGap: KnowledgeGap | undefined;
    try {
      // Mesin streaming dipakai SEMUA jalur (teks & foto) — dulu jalur foto
      // non-stream tanpa progress: user lihat layar diam lalu jawaban muncul
      // sekaligus, padahal foto paling lambat (OCR → search → 2nd-pass).
      const assistantId = crypto.randomUUID();
      const assistantTs = Date.now();
      const sessionSnapshot = sessionId; // capture — guard ghost content jika session switch
      let displayed = '';
      let buffered = '';
      let timerId: ReturnType<typeof setTimeout> | null = null;
      const FLUSH_INTERVAL = 80;
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
        const batch = buffered.slice(0, FLUSH_BATCH);
        buffered = buffered.slice(FLUSH_BATCH);
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
      const onMetaCb = (meta: { knowledgeGap?: KnowledgeGap }) => {
        if (sessionIdRef.current !== sessionSnapshot) return;
        capturedGap = meta.knowledgeGap;
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
            : await generateResponseStream(selectedModel, userName, currentMessages, content, onChunkCb, onAgentEventCb, onMetaCb);
        } catch (agErr) {
          // Fallback: agentic gagal SEBELUM streaming jawaban → diam-diam pakai single-pass
          // supaya tidak tampil error ke user. Kalau sudah terlanjur streaming, lempar ulang.
          const aborted = (agErr as Error)?.name === 'AbortError' || (agErr as Error)?.message?.includes('abort');
          if (!useAgentic || streamedAny || aborted) throw agErr;
          console.warn('[agentic] gagal sebelum streaming, fallback ke single-pass:', (agErr as Error)?.message);
          setAgentEvents([]);
          fullText = await generateResponseStream(selectedModel, userName, currentMessages, content, onChunkCb, onAgentEventCb, onMetaCb);
        }
      }

      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      if (!mountedRef.current) return;
      if (sessionIdRef.current !== sessionSnapshot) return; // session sudah switch, skip persist
      setMessages(prev => {
        const exists = prev.some(m => m.id === assistantId);
        if (!exists) return [...prev, { id: assistantId, role: 'assistant', content: fullText, timestamp: assistantTs, knowledgeGap: capturedGap }];
        return prev.map(m => m.id === assistantId ? { ...m, content: fullText, knowledgeGap: capturedGap } : m);
      });
      persist(fullText, capturedGap);
      logCost(sessionSnapshot, [...toolsUsed]);
    } catch (err: any) {
      if ((err as Error)?.name === 'AbortError' || (err as Error)?.message?.includes('abort')) return;
      console.error('AI Error:', err.message);
      setError('Dash⁵ gagal merespon. Periksa API Key dan koneksi kamu.');
    } finally {
      setIsTyping(false);
      setIsStreaming(false);
    }
  }, [user, selectedModel, logCost]);

  const handleRetry = useCallback(async (assistantMessageId: string) => {
    if (!user) return;
    const currentMessages = messagesRef.current;
    const idx = currentMessages.findIndex(m => m.id === assistantMessageId);
    if (idx < 1) return;
    const userMsg = currentMessages[idx - 1];
    if (userMsg?.role !== 'user') return;

    const historyBefore = currentMessages.slice(0, idx - 1);
    setMessages([...historyBefore, userMsg]);
    setIsTyping(true);
    setIsStreaming(true);
    setError(null);
    setAgentEvents([]);

    const userName = (user.displayName || 'Operator').split(' ')[0];
    const assistantId = crypto.randomUUID();
    const assistantTs = Date.now();

    const sessionSnapshot = sessionIdRef.current; // capture untuk ghost guard
    const retryCtrl = new AbortController();
    abortStreamRef.current = retryCtrl;

    try {
      let displayed = '';
      let buffered = '';
      let timerId: ReturnType<typeof setTimeout> | null = null;
      const FLUSH_INTERVAL = 80;
      const FLUSH_BATCH = 200;
      const drip = () => {
        timerId = null;
        if (!mountedRef.current) return;
        if (sessionIdRef.current !== sessionSnapshot) return;
        if (retryCtrl.signal.aborted) return;
        if (!buffered.length) return;
        const batch = buffered.slice(0, FLUSH_BATCH);
        buffered = buffered.slice(FLUSH_BATCH);
        displayed += batch;
        const snap = displayed;
        setMessages(prev => {
          const exists = prev.some(m => m.id === assistantId);
          if (!exists) return [...prev, { id: assistantId, role: 'assistant', content: snap, timestamp: assistantTs }];
          return prev.map(m => m.id === assistantId ? { ...m, content: snap } : m);
        });
        if (buffered.length > 0) timerId = setTimeout(drip, FLUSH_INTERVAL);
      };
      const toolsUsed = new Set<string>();
      let streamedAny = false;
      const onChunkCb = (chunk: string) => {
        if (!mountedRef.current) return;
        if (sessionIdRef.current !== sessionSnapshot) return;
        if (retryCtrl.signal.aborted) return;
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
      let capturedGap: KnowledgeGap | undefined;
      const onMetaCb = (meta: { knowledgeGap?: KnowledgeGap }) => {
        if (sessionIdRef.current !== sessionSnapshot) return;
        capturedGap = meta.knowledgeGap;
      };
      const useAgentic = shouldUseAgentic(userMsg.content);
      let fullText: string;
      try {
        fullText = useAgentic
          ? await generateResponseAgentic(
              selectedModel, userName, historyBefore, userMsg.content,
              onChunkCb, onAgentEventCb,
            )
          : await generateResponseStream(
              selectedModel, userName, historyBefore, userMsg.content, onChunkCb, onAgentEventCb, onMetaCb,
            );
      } catch (agErr) {
        // Fallback: agentic gagal sebelum streaming → diam-diam single-pass (jangan error ke user).
        const aborted = (agErr as Error)?.name === 'AbortError' || (agErr as Error)?.message?.includes('abort');
        if (!useAgentic || streamedAny || aborted) throw agErr;
        console.warn('[agentic] retry gagal sebelum streaming, fallback ke single-pass:', (agErr as Error)?.message);
        setAgentEvents([]);
        fullText = await generateResponseStream(
          selectedModel, userName, historyBefore, userMsg.content, onChunkCb, onAgentEventCb, onMetaCb,
        );
      }
      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      if (!mountedRef.current) return;
      if (sessionIdRef.current !== sessionSnapshot) return;
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullText, knowledgeGap: capturedGap } : m));

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        const newUserMsg: Message = { ...userMsg, id: crypto.randomUUID(), timestamp: Date.now() };
        const assistantMsg: Message = { id: assistantId, role: 'assistant', content: fullText, timestamp: assistantTs, knowledgeGap: capturedGap };
        const newMessages = [...historyBefore, newUserMsg, assistantMsg];
        const messagesForStorage = newMessages.map(m => m.attachments?.length ? { ...m, attachments: [] } : m);
        const rawTitle = userMsg.content.trim() || '[Gambar]';
        const sessionTitle = rawTitle.length > 60 ? rawTitle.slice(0, 57) + '...' : rawTitle;
        saveSession(user.uid, sessionId, selectedModel, messagesForStorage, rawTitle);
        const newMeta: SessionMeta = { id: sessionId, title: sessionTitle, model: selectedModel, updatedAt: Date.now() };
        setSessionList(prev => [newMeta, ...prev.filter(s => s.id !== sessionId)]);
        saveOrUpdateChatSession(sessionId, user.uid, user.displayName || 'Operator', selectedModel, sessionTitle, newMessages);
        logCost(sessionId, [...toolsUsed]);
      }
    } catch (err: any) {
      if ((err as Error)?.name === 'AbortError' || (err as Error)?.message?.includes('abort')) return;
      console.error('Retry error:', err.message);
      setError('Gagal mengulang respons. Coba lagi.');
      setMessages([...historyBefore, userMsg]);
    } finally {
      setIsTyping(false);
      setIsStreaming(false);
    }
  }, [user, selectedModel, logCost]);

  if (authLoading) {
    return (
      <div className="h-dvh w-screen flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-10 h-10 text-[var(--accent-main)] animate-spin" />
      </div>
    );
  }

  if (isRecoveryMode) return <ResetPasswordPage theme={theme} onThemeToggle={handleThemeToggle} />;

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
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative">

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
          onSendMessage={handleSendMessage}
          onRetry={handleRetry}
          userName={(user?.displayName || 'Operator').split(' ')[0]}
          hasHistory={sessionList.length > 0}
          onOpenFieldNote={(id) => {
            const msgs = messagesRef.current;
            const idx = msgs.findIndex(m => m.id === id);
            if (idx < 0) return;
            const asst = msgs[idx];
            const q = idx > 0 && msgs[idx - 1].role === 'user' ? msgs[idx - 1].content : '';
            setFieldNoteState({ messageId: id, gap: asst.knowledgeGap, question: q, answer: asst.content });
          }}
          agentEvents={agentEvents}
        />

        {/* Input bar absolute floating di bottom — scroll konten ke baliknya */}
        <div className="input-bar-float">
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={isTyping}
            selectedModel={selectedModel}
            isOffline={!isOnline}
          />
        </div>

      </main>

      {/* ── Catatan Lapangan Modal ── */}
      <FieldNoteModal
        isOpen={fieldNoteState !== null}
        onClose={() => setFieldNoteState(null)}
        model={selectedModel}
        contributorName={user?.displayName || 'Operator'}
        gap={fieldNoteState?.gap}
        sourceMessageId={fieldNoteState?.messageId}
        sourceQuestion={fieldNoteState?.question}
        sourceAnswer={fieldNoteState?.answer}
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
