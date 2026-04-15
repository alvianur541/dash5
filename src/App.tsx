/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { LoginPage } from './components/LoginPage';
import { UnitModel, Message, SessionMeta } from './types';
import { generateResponse } from './services/ai';
import { saveOrUpdateChatSession, deleteChatSession, fetchUserSessionList, fetchSessionData } from './services/supabase';
import { loadSessionList, loadSessionData, saveSession, deleteSessionData, listKey, dataKey } from './services/storage';
import { AlertCircle, Loader2, PanelLeft, Wrench } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth } from './components/AuthProvider';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [selectedModel, setSelectedModel] = useState<UnitModel>('ZX200-5G');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Refs to avoid stale closures in async callbacks
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('dash-theme') as 'dark' | 'light') || 'dark';
  });

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark-theme', 'light-theme');
    root.classList.add(`${theme}-theme`);
    localStorage.setItem('dash-theme', theme);
  }, [theme]);

  // Keep refs in sync with state
  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const startNewSession = useCallback(() => {
    setMessages([]);
    setError(null);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
  }, []);

  // Load sessions when user changes — Supabase primary, localStorage fallback
  useEffect(() => {
    if (!user) {
      setSessionList([]);
      return;
    }
    // Show localStorage cache instantly while Supabase loads
    const cached = loadSessionList(user.uid);
    setSessionList(cached);
    startNewSession();

    // Then refresh from Supabase
    fetchUserSessionList(user.uid, user.displayName).then(list => {
      if (list.length > 0) {
        setSessionList(list);
        // Sync to localStorage cache
        localStorage.setItem(listKey(user.uid), JSON.stringify(list));
      }
    });
  }, [user?.uid, startNewSession]);

  const handleSelectModel = useCallback((model: UnitModel) => {
    setSelectedModel(model);
    startNewSession();
  }, [startNewSession]);

  const handleSelectSession = useCallback(async (id: string) => {
    if (!user) return;
    // Prefer Supabase (images preserved) — localStorage as offline fallback only
    let session = await fetchSessionData(id, user.uid);
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

  const handleThemeToggle = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  const handleSendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (!user) return;

    // Get or create session ID
    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
      sessionIdRef.current = sessionId;
    }

    // Convert attached files to data URLs for display
    const attachmentUrls: string[] = attachments && attachments.length > 0
      ? await Promise.all(attachments.map(file => new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        })))
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
    setError(null);

    try {
      const response = await generateResponse(
        selectedModel,
        user.displayName || 'Operator',
        currentMessages,   // history before current message
        content,
        attachments
      );

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      const newMessages = [...currentMessages, userMessage, assistantMessage];
      setMessages(newMessages);

      // Strip base64 attachments before persisting (avoid localStorage quota issues)
      const messagesForStorage = newMessages.map(m =>
        m.attachments && m.attachments.length > 0 ? { ...m, attachments: [] } : m
      );

      // Build title — fallback for photo-only messages
      const rawTitle = content.trim() || (attachmentUrls.length > 0 ? '[Gambar]' : 'New chat');
      const sessionTitle = rawTitle.length > 60 ? rawTitle.slice(0, 57) + '...' : rawTitle;

      // Persist to localStorage
      saveSession(user.uid, sessionId, selectedModel, messagesForStorage, rawTitle);

      // Merge into session list without replacing Supabase-loaded sessions
      const newMeta: SessionMeta = { id: sessionId, title: sessionTitle, model: selectedModel, updatedAt: Date.now() };
      setSessionList(prev => [newMeta, ...prev.filter(s => s.id !== sessionId)]);

      // Persist to Supabase WITH images (primary — images preserved across sessions)
      saveOrUpdateChatSession(sessionId, user.uid, user.displayName || 'Operator', selectedModel, sessionTitle, newMessages);

    } catch (err: any) {
      console.error('AI Error:', err.message);
      setError('Dash⁵ gagal merespon. Periksa API Key dan koneksi kamu.');
    } finally {
      setIsTyping(false);
    }
  }, [user, selectedModel]);

  const handleRetry = useCallback(async (assistantMessageId: string) => {
    if (!user) return;
    const currentMessages = messagesRef.current;
    const idx = currentMessages.findIndex(m => m.id === assistantMessageId);
    if (idx < 1) return;
    const userMsg = currentMessages[idx - 1];
    if (userMsg?.role !== 'user') return;

    const historyBefore = currentMessages.slice(0, idx - 1);
    setMessages(historyBefore);
    setIsTyping(true);
    setError(null);

    try {
      const response = await generateResponse(
        selectedModel,
        user.displayName || 'Operator',
        historyBefore,
        userMsg.content,
        undefined
      );
      const newUserMsg: Message = { ...userMsg, id: crypto.randomUUID(), timestamp: Date.now() };
      const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: response, timestamp: Date.now() };
      const newMessages = [...historyBefore, newUserMsg, assistantMsg];
      setMessages(newMessages);

      const sessionId = sessionIdRef.current;
      if (sessionId) {
        const messagesForStorage = newMessages.map(m =>
          m.attachments && m.attachments.length > 0 ? { ...m, attachments: [] } : m
        );
        const rawTitle = userMsg.content.trim() || '[Gambar]';
        const sessionTitle = rawTitle.length > 60 ? rawTitle.slice(0, 57) + '...' : rawTitle;
        saveSession(user.uid, sessionId, selectedModel, messagesForStorage, rawTitle);
        const newMeta: SessionMeta = { id: sessionId, title: sessionTitle, model: selectedModel, updatedAt: Date.now() };
        setSessionList(prev => [newMeta, ...prev.filter(s => s.id !== sessionId)]);
        saveOrUpdateChatSession(sessionId, user.uid, user.displayName || 'Operator', selectedModel, sessionTitle, newMessages);
      }
    } catch (err: any) {
      console.error('Retry error:', err.message);
      setError('Gagal mengulang respons. Coba lagi.');
      setMessages([...historyBefore, userMsg]);
    } finally {
      setIsTyping(false);
    }
  }, [user, selectedModel]);

  // ── Loading ──
  if (authLoading) {
    return (
      <div className="h-dvh w-screen flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-10 h-10 text-[var(--accent-main)] animate-spin" />
      </div>
    );
  }

  // ── Login ──
  if (!user) return <LoginPage theme={theme} onThemeToggle={handleThemeToggle} />;

  // ── Main App ──
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
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(v => !v)}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar — shown when sidebar is collapsed */}
        <AnimatePresence>
          {isSidebarCollapsed && (
            <m.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[var(--border-main)] bg-[var(--bg-app)]"
            >
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-2 rounded-xl hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Buka sidebar"
              >
                <PanelLeft size={18} />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[var(--accent-main)] flex items-center justify-center">
                  <Wrench className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-bold">Dash⁵</span>
              </div>
              <span className="ml-auto text-xs text-[var(--text-muted)] font-medium bg-[var(--bg-card)] px-2.5 py-1 rounded-lg border border-[var(--border-main)]">
                {selectedModel}
              </span>
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

        <ChatWindow
          messages={messages}
          isTyping={isTyping}
          selectedModel={selectedModel}
          onSendMessage={handleSendMessage}
          onRetry={handleRetry}
          userName={user?.displayName || 'Operator'}
        />

        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={isTyping}
          selectedModel={selectedModel}
        />

      </main>

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
