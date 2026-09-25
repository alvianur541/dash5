import { useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { LoginPage } from './components/LoginPage';
import { PocketModal } from './components/PocketModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ModelSheet } from './components/ModelSheet';
import { StatusBanner } from './components/StatusBanner';
import { UnitModel } from './types';
import { AlertCircle, Loader2, Menu, SquarePen, Sun, Moon, WifiOff, Wifi, RotateCw, ChevronDown } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth } from './components/AuthProvider';
import { useNetwork } from './hooks/useNetwork';
import { useTheme } from './hooks/useTheme';
import { usePocket } from './hooks/usePocket';
import { useInputBarHeight } from './hooks/useInputBarHeight';
import { useSwipeSidebar } from './hooks/useSwipeSidebar';
import { useAppRefresh } from './hooks/useAppRefresh';
import { useChat } from './hooks/useChat';
import { useModelSwitch } from './hooks/useModelSwitch';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline, showOffline, showBackOnline } = useNetwork();
  const { theme, toggle: toggleTheme } = useTheme();
  const {
    selectedModel, setSelectedModel,
    messages, isTyping, isStreaming, error, setError, agentEvents,
    sessionList, currentSessionId, loadingSession,
    deleteConfirmId, setDeleteConfirmId, deleteAllConfirm, setDeleteAllConfirm,
    mountedRef, messagesRef, lastSentRef, queued, setQueued,
    stopStreaming, startNewSession, handleSelectSession,
    confirmDelete, confirmDeleteAll, handleSendMessage, retryLast,
  } = useChat(user, isOnline);

  const onSwitchUnit = useCallback((model: UnitModel) => {
    setSelectedModel(model);
    startNewSession();
  }, [setSelectedModel, startNewSession]);

  const { modelSheet, setModelSheet, switchConfirm, setSwitchConfirm, handleSelectModel, confirmSwitch } =
    useModelSwitch({ selected: selectedModel, hasMessages: messages.length > 0, onSwitch: onSwitchUnit });

  const { isCollapsed: isSidebarCollapsed, setIsCollapsed: setIsSidebarCollapsed, onTouchStart, onTouchEnd } = useSwipeSidebar();
  const { isRefreshing, refresh: handleRefresh } = useAppRefresh();

  const mainRef = useRef<HTMLElement | null>(null);
  const inputBarRef = useRef<HTMLDivElement | null>(null);

  const uid = user?.uid ?? null;
  const pocket = usePocket(uid, mountedRef);

  useInputBarHeight(inputBarRef, mainRef, user);

  if (authLoading) {
    return (
      <div className="vv-fill flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-10 h-10 text-[var(--accent-main)] animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage theme={theme} onThemeToggle={toggleTheme} />;

  const userName = (user.displayName || 'Operator').split(' ')[0];

  return (
    <div className={cn('flex h-full overflow-hidden transition-colors duration-400', 'bg-[var(--bg-app)] text-[var(--text-primary)]')}>
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
          <strong className="font-semibold">Sinyal kembali</strong> — Koneksi aktif, siap bertanya lagi.
        </StatusBanner>
        <StatusBanner id="queued" show={!!queued && !isOnline} tone="warn" icon={<Loader2 size={13} className="text-amber-400 animate-spin" />}
          action={<button onClick={() => setQueued(null)} className="text-[11px] underline text-amber-300/80">Batal</button>}>
          <strong className="font-semibold">Menunggu sinyal</strong> — pertanyaan akan terkirim otomatis saat online.
        </StatusBanner>
        <StatusBanner id="error" show={!!error} tone="error" icon={<AlertCircle size={15} className="text-red-400" />}
          action={<div className="flex items-center gap-3">
            {lastSentRef.current && !isTyping && !isStreaming && (
              <button onClick={() => { setError(null); retryLast(); }} className="text-xs font-semibold underline text-red-400">Kirim ulang</button>
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
