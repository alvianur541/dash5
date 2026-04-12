/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { MessageInput } from './components/MessageInput';
import { UnitModel, Message, SessionMeta, ChatSession } from './types';
import { generateResponse } from './services/ai';
import { saveOrUpdateChatSession, deleteChatSession, fetchUserSessionList, fetchSessionData } from './services/supabase';
import { AlertCircle, LogIn, Loader2, PanelLeft, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useAuth } from './components/AuthProvider';

// ─── Session Storage Helpers (per-user) ──────────────────────────────────────

const MAX_SESSIONS = 25;

const listKey  = (uid: string) => `dash-session-list-${uid}`;
const dataKey  = (uid: string, id: string) => `dash-session-${uid}-${id}`;

function loadSessionList(uid: string): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(listKey(uid)) || '[]');
  } catch {
    return [];
  }
}

function loadSessionData(uid: string, id: string): ChatSession | null {
  try {
    const raw = localStorage.getItem(dataKey(uid, id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(uid: string, id: string, model: UnitModel, messages: Message[], firstMessage: string) {
  const sessionData: ChatSession = { id, model, messages };
  localStorage.setItem(dataKey(uid, id), JSON.stringify(sessionData));

  const title = firstMessage.length > 60
    ? firstMessage.slice(0, 57) + '...'
    : firstMessage;

  const list = loadSessionList(uid);
  const filtered = list.filter(s => s.id !== id);
  const updated: SessionMeta[] = [
    { id, title, model, updatedAt: Date.now() },
    ...filtered,
  ].slice(0, MAX_SESSIONS);
  localStorage.setItem(listKey(uid), JSON.stringify(updated));
  return updated;
}

function deleteSessionData(uid: string, id: string) {
  localStorage.removeItem(dataKey(uid, id));
  const list = loadSessionList(uid);
  const updated = list.filter(s => s.id !== id);
  localStorage.setItem(listKey(uid), JSON.stringify(updated));
  return updated;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [selectedModel, setSelectedModel] = useState<UnitModel>('ZX200-5G');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Ref to avoid stale closure when accessing current session ID inside async callback
  const sessionIdRef = useRef<string | null>(null);

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
  }, [user?.uid]);

  // Keep ref in sync with state
  useEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const startNewSession = useCallback(() => {
    setMessages([]);
    setError(null);
    setCurrentSessionId(null);
    sessionIdRef.current = null;
  }, []);

  const handleSelectModel = useCallback((model: UnitModel) => {
    setSelectedModel(model);
    startNewSession();
  }, [startNewSession]);

  const handleSelectSession = useCallback(async (id: string) => {
    if (!user) return;
    // Try localStorage cache first
    let session = loadSessionData(user.uid, id);
    if (!session) {
      // Fallback to Supabase
      session = await fetchSessionData(id);
      if (session) {
        // Populate cache
        localStorage.setItem(dataKey(user.uid, id), JSON.stringify(session));
      }
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
    if (!user) return;
    const updatedList = deleteSessionData(user.uid, id);
    setSessionList(updatedList);
    deleteChatSession(id);
    // If the deleted session is the current one, start fresh
    if (sessionIdRef.current === id) {
      startNewSession();
    }
  }, [user, startNewSession]);

  const handleThemeToggle = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  const handleSendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (!user) return;

    // Get or create session ID
    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      sessionId = `session_${Date.now()}`;
      setCurrentSessionId(sessionId);
      sessionIdRef.current = sessionId;
    }

    // Convert attached files to data URLs for display
    const attachmentUrls: string[] = [];
    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        const url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        attachmentUrls.push(url);
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim() || (attachmentUrls.length > 0 ? '[Gambar dilampirkan]' : ''),
      timestamp: Date.now(),
      attachments: attachmentUrls,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    setError(null);

    try {
      const response = await generateResponse(
        selectedModel,
        user.displayName || 'Operator',
        messages,       // history before current message
        content,
        attachments
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      const newMessages = [...messages, userMessage, assistantMessage];
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

      // Persist to Supabase (primary — accessible from any device)
      saveOrUpdateChatSession(sessionId, user.uid, user.displayName || 'Operator', selectedModel, sessionTitle, messagesForStorage);

    } catch (err: any) {
      console.error('AI Error:', err.message);
      setError('Dash⁵ gagal merespon. Periksa API Key dan koneksi kamu.');
    } finally {
      setIsTyping(false);
    }
  }, [user, selectedModel, messages]);

  // ── Loading ──
  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--bg-app)]">
        <Loader2 className="w-10 h-10 text-[var(--accent-main)] animate-spin" />
      </div>
    );
  }

  // ── Login ──
  if (!user) return <LoginPage />;

  // ── Main App ──
  return (
    <div className={cn(
      "flex h-screen overflow-hidden transition-colors duration-400",
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

        {/* Top bar — always shown on mobile, shown on desktop when collapsed */}
        <AnimatePresence>
          {isSidebarCollapsed && (
            <motion.div
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
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
            </motion.div>
          )}
        </AnimatePresence>

        <ChatWindow
          messages={messages}
          isTyping={isTyping}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          onSendMessage={handleSendMessage}
          userName={user?.displayName || 'Operator'}
        />

        <MessageInput
          onSendMessage={handleSendMessage}
          disabled={isTyping}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
        />

      </main>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage() {
  const { login, authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await login(username, password);
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[#111111] px-4">

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-[360px] flex flex-col items-center gap-8"
      >
        {/* ── Brand ── */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-[var(--accent-main)] rounded-2xl flex items-center justify-center shadow-xl shadow-[var(--accent-main)]/20">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-[28px] font-bold text-white tracking-tight">Dash⁵</h1>
            <p className="text-[13px] text-[#737373]">Heavy Equipment Diagnostic Assistant</p>
          </div>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="w-full space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-[13px] font-medium text-[#a3a3a3]">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Masukkan username"
              required
              autoComplete="username"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-[#1c1c1c] border border-[#333] text-[14px] text-white placeholder-[#525252] outline-none focus:border-[#666] focus:ring-2 focus:ring-[var(--accent-main)]/20 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[13px] font-medium text-[#a3a3a3]">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl bg-[#1c1c1c] border border-[#333] text-[14px] text-white placeholder-[#525252] outline-none focus:border-[#666] focus:ring-2 focus:ring-[var(--accent-main)]/20 transition-all"
            />
          </div>

          <AnimatePresence>
            {authError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2.5 text-[#f87171] bg-red-500/8 border border-red-500/15 px-3 py-2.5 rounded-xl"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-[13px]">{authError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 mt-1 bg-[var(--accent-main)] hover:brightness-110 active:scale-[0.98] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[14px] shadow-lg shadow-[var(--accent-main)]/25"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><span>Masuk</span><LogIn className="w-4 h-4" /></>
            }
          </button>
        </form>
      </motion.div>

      {/* ── Footer ── */}
      <p className="absolute bottom-6 text-[11px] text-[#444]">
        Dash⁵ · Heavy Equipment AI · v2.0
      </p>
    </div>
  );
}
