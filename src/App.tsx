import { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { LoginPage } from './components/LoginPage';
import { PocketModal } from './components/PocketModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ModelSheet } from './components/ModelSheet';
import { StatusBanner } from './components/StatusBanner';
import { UnitModel, Message, SessionMeta } from './types';
import { generateResponse, generateResponseStream, warmupProxy, type AgentEvent } from './services/ai';
import { saveOrUpdateChatSession, deleteChatSession, deleteAllChatSessions, fetchUserSessionList, fetchSessionData } from './services/supabase';
import { loadSessionList, loadSessionData, saveSession, deleteSessionData, deleteAllSessionData, listKey, isSessionsCleared } from './services/storage';
import { AlertCircle, Loader2, Menu, SquarePen, Sun, Moon, WifiOff, Wifi, RotateCw, ChevronDown } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth } from './components/AuthProvider';
import { useNetwork } from './hooks/useNetwork';
import { useTheme } from './hooks/useTheme';
import { usePocket } from './hooks/usePocket';

const FLUSH_INTERVAL = 40;
const FLUSH_BATCH = 200;
const SWIPE_MIN_DX = 70;
const SWIPE_MAX_DY = 60;
const SWIPE_MAX_MS = 600;
const SWIPE_EDGE = 40;

type Queued = { content: string; attachments?: File[] };

function readAsDataUrls(files: File[]): Promise<string[]> {
  return Promise.allSettled(files.map(file => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Gagal membaca: ${file.name}`));
    reader.readAsDataURL(file);
  }))).then(rs => rs.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled').map(r => r.value));
}

function errorMessage(err: unknown): string {
  const msg = (err as Error)?.message ?? '';
  if (msg.includes('KUOTA_PENUH')) return 'Kuota AI sedang penuh (terlalu banyak permintaan berbarengan). Tunggu sekitar satu menit, lalu kirim ulang.';
  if (msg.includes('Stream terputus')) return 'Koneksi ke AI terputus di tengah jalan. Coba kirim ulang pertanyaanmu.';
  if (msg.includes('SERVER_DIAM')) return 'Server lama merespons (lebih dari 25 detik). Kirim ulang pertanyaanmu.';
  return 'Dash⁵ tidak bisa dihubungi. Cek sinyal kamu, lalu coba lagi.';
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline, showOffline, showBackOnline } = useNetwork();
  const { theme, toggle: toggleTheme } = useTheme();
  const [selectedModel, setSelectedModel] = useState<UnitModel>('ZX200-5G');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef<{ content: string; attachments?: File[] } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [switchConfirm, setSwitchConfirm] = useState<UnitModel | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [queued, setQueued] = useState<Queued | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const mountedRef = useRef(true);
  const abortStreamRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const inputBarRef = useRef<HTMLDivElement | null>(null);

  const uid = user?.uid ?? null;
  const pocket = usePocket(uid, mountedRef);

  useEffect(() => {
    mountedRef.current = true;
    warmupProxy();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

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

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting || reg.installing) {
          await new Promise<void>(resolve => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
            setTimeout(resolve, 3000);
          });
        }
      }
    } catch { }
    window.location.reload();
  }, [isRefreshing]);

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

    const attachmentUrls = attachments?.length ? await readAsDataUrls(attachments) : [];
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
      const messagesForStorage = [...currentMessages, userMessage, assistantMessage]
        .map(m => m.attachments?.length ? { ...m, attachments: [] } : m);
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
        ? await generateResponse(selectedModel, userName, historyForAi, content, attachments, onChunk, onAgentEvent)
        : await generateResponseStream(selectedModel, userName, historyForAi, content, onChunk, onAgentEvent);

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

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || window.innerWidth >= 768) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Date.now() - s.t > SWIPE_MAX_MS || Math.abs(dy) > SWIPE_MAX_DY || Math.abs(dx) < SWIPE_MIN_DX) return;
    if (dx > 0 && s.x < SWIPE_EDGE && isSidebarCollapsed) setIsSidebarCollapsed(false);
    if (dx < 0 && !isSidebarCollapsed) setIsSidebarCollapsed(true);
  };

  if (authLoading) {
    return (
      <div className="h-dvh w-screen flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-10 h-10 text-[var(--accent-main)] animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage theme={theme} onThemeToggle={toggleTheme} />;

  const userName = (user.displayName || 'Operator').split(' ')[0];

  return (
    <div className={cn('flex h-dvh overflow-hidden transition-colors duration-400', 'bg-[var(--bg-app)] text-[var(--text-primary)]')}>
      <Sidebar
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        onNewChat={startNewSession}
        sessions={sessionList}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={setDeleteConfirmId}
        onDeleteAllSessions={() => setDeleteAllConfirm(true)}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(v => !v)}
        theme={theme}
        onThemeToggle={toggleTheme}
        pocketItems={pocket.pocket}
        onOpenPocketItem={pocket.setPocketView}
        onDeletePocketItem={pocket.remove}
        isOffline={!isOnline}
      />

      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden min-w-0 relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {(isTyping || isStreaming) && <div className="stream-progress" aria-hidden="true" />}

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
                <button onClick={() => setIsSidebarCollapsed(false)} className="topbar-hamburger" aria-label="Buka sidebar">
                  <Menu size={18} />
                </button>
                <button onClick={handleRefresh} className="topbar-hamburger" aria-label="Refresh aplikasi (ambil versi terbaru)" disabled={isRefreshing}>
                  <RotateCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>
              <button className="topbar-center" onClick={() => setModelSheet(true)} aria-label="Ganti unit">
                <span className="topbar-model-name">{selectedModel}</span>
                <ChevronDown size={14} className="text-[var(--text-muted)]" />
              </button>
              <div className="flex items-center gap-2">
                <button onClick={toggleTheme} className="topbar-hamburger" aria-label="Toggle tema">
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button onClick={startNewSession} className="topbar-newchat" aria-label="New chat">
                  <SquarePen size={16} />
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
        {isSidebarCollapsed && <div className="topbar-spacer" aria-hidden="true" />}

        <StatusBanner id="offline" show={showOffline} tone="warn" icon={<WifiOff size={13} className="text-amber-400" />}
          action={<span className="status-pulse w-2 h-2 rounded-full bg-amber-400 shrink-0" />}>
          <strong className="font-semibold">Sinyal hilang</strong> — Riwayat tersedia. Chat aktif kembali saat sinyal pulih.
        </StatusBanner>
        <StatusBanner id="online" show={showBackOnline} tone="ok" icon={<Wifi size={13} className="text-emerald-400" />}>
          <strong className="font-semibold">Sinyal kembali</strong> — Koneksi aktif, Dash⁵ siap digunakan.
        </StatusBanner>
        <StatusBanner id="queued" show={!!queued && !isOnline} tone="warn" icon={<Loader2 size={13} className="text-amber-400 animate-spin" />}
          action={<button onClick={() => setQueued(null)} className="text-[11px] underline text-amber-300/80">Batal</button>}>
          <strong className="font-semibold">Menunggu sinyal</strong> — pertanyaan akan terkirim otomatis saat online.
        </StatusBanner>
        <StatusBanner id="error" show={!!error} tone="error" icon={<AlertCircle size={15} className="text-red-400" />}
          action={<div className="flex items-center gap-3">
            {lastSentRef.current && !isTyping && !isStreaming && (
              <button onClick={() => { const q = lastSentRef.current; if (!q) return; setError(null); handleSendMessage(q.content, q.attachments); }} className="text-xs font-semibold underline text-red-400">Kirim ulang</button>
            )}
            <button onClick={() => setError(null)} className="text-xs underline opacity-70 hover:opacity-100 text-red-400">Tutup</button>
          </div>}>
          {error}
        </StatusBanner>

        <ChatWindow
          messages={messages}
          isTyping={isTyping}
          isStreaming={isStreaming}
          selectedModel={selectedModel}
          userName={userName}
          hasHistory={sessionList.length > 0}
          pocketIds={pocket.pocketIds}
          onTogglePocket={id => pocket.toggle(id, messagesRef.current, selectedModel)}
          agentEvents={agentEvents}
          onResend={text => handleSendMessage(text)}
          loadingSession={loadingSession}
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

      <PocketModal item={pocket.pocketView} onClose={() => pocket.setPocketView(null)} onDelete={pocket.remove} />

      <ModelSheet open={modelSheet} selected={selectedModel} onSelect={handleSelectModel} onClose={() => setModelSheet(false)} />

      <ConfirmDialog
        open={!!switchConfirm}
        title={`Ganti ke ${switchConfirm}?`}
        body={`Chat ini tetap tersimpan di riwayat. Percakapan baru dimulai untuk unit ${switchConfirm}.`}
        confirmLabel="Ganti unit"
        onConfirm={confirmSwitch}
        onCancel={() => setSwitchConfirm(null)}
      />
      <ConfirmDialog
        open={deleteAllConfirm}
        title="Hapus semua riwayat?"
        body="Seluruh riwayat hilang dari akunmu dan tidak bisa dikembalikan. Data percakapan tetap disimpan Hexindo untuk peningkatan layanan."
        confirmLabel="Hapus Semua"
        danger
        onConfirm={confirmDeleteAll}
        onCancel={() => setDeleteAllConfirm(false)}
      />
      <ConfirmDialog
        open={!!deleteConfirmId}
        title="Hapus percakapan?"
        body="Percakapan hilang dari riwayatmu dan tidak bisa dikembalikan. Datanya tetap disimpan Hexindo untuk peningkatan layanan."
        confirmLabel="Hapus"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}
