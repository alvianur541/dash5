
import { createContext, useContext, useEffect, useRef, useState, useCallback, Suspense, lazy, memo } from 'react';
import type { Components } from 'react-markdown';
import { Message, UnitModel } from '../types';
import { m, AnimatePresence } from 'motion/react';
import { ThumbsUp, ThumbsDown, Check, Search, Sparkles, Loader2, ChevronDown, X, ImageDown, Bookmark, BookmarkCheck, RotateCcw, Camera, MessageCircleMore } from 'lucide-react';
import { useToast } from './Toast';
import type { ReactNode } from 'react';
import { getGreeting } from '../lib/greeting';
import { saveFeedback } from '../services/supabase';
import { useAuth } from './AuthProvider';
import type { AgentEvent } from '../types';
import { tidyStreamingTail } from '../lib/streamPacer';

const Markdown = lazy(() => import('./Markdown'));

export function stripLatex(text: string): string {
  const clean = (s: string) =>
    s.replace(/_\{([^}]+)\}/g, '_$1')
     .replace(/\^\{([^}]+)\}/g, '^$1')
     .replace(/\\[a-zA-Z]+\s?/g, '')
     .trim();
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => clean(inner))
    .replace(/\$([^$\n]+?)\$/g,     (_, inner) => '`' + clean(inner) + '`')
    .replace(/\{?(mm|cm|m)\}?\^([23])\b/g, (_, u: string, d: string) => u + (d === '2' ? '²' : '³'));
}

const CUT_NOTE_RE = /\n\n> ⚠️ Jawaban ter(?:putus|henti)[^\n]*/;
const PN_CODE_RE = /^[A-Z0-9][A-Z0-9./-]{4,}$/i;

function partNoColumn(children: ReactNode): number {
  const cells: string[] = [];
  const text = (n: unknown, d = 0): string => {
    if (d > 8) return '';
    if (typeof n === 'string') return n;
    if (Array.isArray(n)) return n.map(c => text(c, d + 1)).join('');
    if (n && typeof n === 'object' && 'props' in n) return text((n as { props: { children?: unknown } }).props.children, d + 1);
    return '';
  };
  const walk = (n: unknown, d = 0): void => {
    if (cells.length >= 12 || d > 8) return;
    if (Array.isArray(n)) { n.forEach(c => walk(c, d + 1)); return; }
    if (!n || typeof n !== 'object' || !('props' in n)) return;
    const el = n as { type?: unknown; props: { children?: unknown } };
    if (el.type === 'th') { cells.push(text(el.props.children).trim()); return; }
    if (el.type === 'tbody') return;
    walk(el.props.children, d + 1);
  };
  walk(children);
  if (cells.length < 3) return 0;
  const idx = cells.findIndex(c => /\b(part\s*(no|number)|pn|nomor\s*part)\b/i.test(c));
  return idx < 0 ? 0 : idx + 1;
}

function stickyClass(children: ReactNode): string | undefined {
  const c = partNoColumn(children);
  return c ? `sticky-pn sticky-col-${c}` : undefined;
}

const NOTE_RE = /^[\s*>|-]*((?:periode|masa berlaku|berlaku)[^\n|]{0,110}|[^\n|]{0,60}(?:belum termasuk|exclude|excl\.?)\s*ppn[^\n|]{0,40})$/gim;

function tableNotes(content: string): string[] {
  const seen = new Set<string>();
  for (const m of content.matchAll(NOTE_RE)) {
    const line = m[1].replace(/[*`]/g, '').replace(/\s+/g, ' ').trim().replace(/[.;,]$/, '');
    if (line.length > 8) seen.add(line);
    if (seen.size >= 3) break;
  }
  return [...seen];
}

const TableSaveCtx = createContext<((table: HTMLTableElement) => void) | undefined>(undefined);

function TableBlock({ children, sticky }: { children?: ReactNode; sticky?: string }) {
  const onSave = useContext(TableSaveCtx);
  const wrapRef = useRef<HTMLDivElement>(null);
  return (
    <div className="table-wrap-outer">
      <div
        ref={wrapRef}
        className="markdown-table-wrap"
        onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollLeft > 2)}
      >
        <table className={sticky}>{children}</table>
      </div>
      {onSave && (
        <div className="table-tools">
          <button
            className="table-expand-btn"
            onClick={() => {
              const el = wrapRef.current?.querySelector('table');
              if (el) onSave(el as HTMLTableElement);
            }}
            aria-label="Simpan tabel jadi gambar"
            title="Simpan gambar"
          >
            <ImageDown size={13} />
            <span>Simpan gambar</span>
          </button>
        </div>
      )}
    </div>
  );
}

function CodeSpan({ children }: { children?: ReactNode }) {
  const toast = useToast();
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : String(children ?? '');
  const copyable = PN_CODE_RE.test(text.trim()) && /\d/.test(text);
  if (!copyable) return <code>{children}</code>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text.trim()); toast('Disalin: ' + text.trim()); try { navigator.vibrate?.(6); } catch { } } catch { }
  };
  return <code className="code-copy" onClick={copy} role="button" tabIndex={0} title="Ketuk untuk salin">{children}</code>;
}

function StrongText({ children }: { children?: ReactNode }) {
  const text = typeof children === 'string'
    ? children
    : Array.isArray(children)
      ? children.map(c => (typeof c === 'string' ? c : '')).join('')
      : String(children ?? '');
  const words = text.split(/\s+/);
  const isPartLike = (
    words.length <= 2
    && /\d/.test(words[0])
    && /^[A-Z0-9][A-Za-z0-9.,:;/-]*$/.test(words[0])
    && (words.length === 1
        || (/^[A-Za-z°]+$/.test(words[1]) && words[1].length <= 5))
    && text.length <= 30
  );
  return isPartLike ? <code>{text}</code> : <strong>{children}</strong>;
}

// Module-level so component types never change: a new table type per chunk would rebuild the table DOM.
const MD_COMPONENTS: Components = {
  table: ({ children }) => <TableBlock sticky={stickyClass(children)}>{children}</TableBlock>,
  code: ({ children }) => <CodeSpan>{children}</CodeSpan>,
  strong: ({ children }) => <StrongText>{children}</StrongText>,
};

function SessionSkeleton() {
  return (
    <div className="chat-messages-list" aria-busy="true">
      <div className="msg-user"><div className="skeleton skeleton-user" /></div>
      <div className="skeleton-ai">
        <div className="skeleton" style={{ width: '92%' }} />
        <div className="skeleton" style={{ width: '78%' }} />
        <div className="skeleton" style={{ width: '85%' }} />
        <div className="skeleton" style={{ width: '40%' }} />
      </div>
      <div className="msg-user"><div className="skeleton skeleton-user" style={{ width: 120 }} /></div>
      <div className="skeleton-ai">
        <div className="skeleton" style={{ width: '88%' }} />
        <div className="skeleton" style={{ width: '60%' }} />
      </div>
    </div>
  );
}

interface ChatWindowProps {
  messages: Message[];
  isTyping: boolean;
  isStreaming: boolean;
  selectedModel: UnitModel;
  userName?: string;
  agentEvents?: AgentEvent[];
  pocketIds?: Set<string>;
  onTogglePocket?: (messageId: string) => void;
  onResend?: (text: string) => void;
  loadingSession?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  search_technical_manual: 'Technical Manual',
  search_parts_catalog:    'Parts Catalog',
  search_engine_manual:    'Engine Manual',
};

function eventLabel(e: AgentEvent): { icon: 'search' | 'check' | 'spark'; text: string } | null {
  if (e.type === 'thinking') return { icon: 'spark', text: e.message ?? 'Berpikir…' };
  if (e.type === 'tool_call') {
    const tool = e.tool ?? '';
    const friendly = TOOL_LABELS[tool] ?? tool;
    return { icon: 'search', text: `Mencari di ${friendly}…` };
  }
  if (e.type === 'tool_result') {
    const tool = e.tool ?? '';
    const friendly = TOOL_LABELS[tool] ?? tool;
    return {
      icon: 'check',
      text: e.found
        ? `Ditemukan di ${friendly}`
        : `Tidak ada data di ${friendly}`,
    };
  }
  return null;
}

const AgentThinkingIndicator = memo(function AgentThinkingIndicator({
  events,
}: { events: AgentEvent[] }) {
  let current: AgentEvent | null = null;
  let label: ReturnType<typeof eventLabel> = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const l = eventLabel(events[i]);
    if (l) { current = events[i]; label = l; break; }
  }

  const settled = label?.icon === 'check';
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (!settled) { setComposing(false); return; }
    const t = setTimeout(() => setComposing(true), 650);
    return () => clearTimeout(t);
  }, [settled, events.length]);

  if (!current || !label) return null;
  const view = composing
    ? { icon: 'compose' as const, text: 'Menyiapkan jawaban…' }
    : { icon: label.icon, text: label.text };

  return (
    <div className="agent-thinking-list">
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={view.text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="agent-thinking-item"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: '13px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 0',
          }}
        >
          {view.icon === 'search'  && <Search size={12} className="text-[var(--accent-main)]" />}
          {view.icon === 'check'   && <Check  size={12} style={{ color: current.found ? 'var(--status-success, #22c55e)' : 'var(--text-muted)' }} />}
          {view.icon === 'spark'   && <Sparkles size={12} className="text-[var(--accent-main)]" />}
          {view.icon === 'compose' && <Loader2 size={12} className="animate-spin text-[var(--accent-main)]" />}
          <span>{view.text}</span>
          {view.icon !== 'check' && (
            <span className="typing-dots-inline">
              {[0, 1, 2].map(i => (
                <m.span
                  key={i}
                  className="typing-dot"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </span>
          )}
        </m.div>
      </AnimatePresence>
    </div>
  );
});

const MessageItem = memo(function MessageItem({
  message, feedback, onFeedback, isStreaming = false, onSaveTable, inPocket = false, onTogglePocket, resendText, onResend,
}: {
  message: Message;
  feedback: 'up' | 'down' | null;
  onFeedback: (id: string, type: 'up' | 'down') => void;
  isStreaming?: boolean;
  onSaveTable?: (table: HTMLTableElement, notes: string[]) => void;
  inPocket?: boolean;
  onTogglePocket?: (messageId: string) => void;
  resendText?: string;
  onResend?: (text: string) => void;
}) {
  const isCut = message.role === 'assistant' && CUT_NOTE_RE.test(message.content);
  const contentRef = useRef(message.content);
  useEffect(() => { contentRef.current = message.content; });
  const saveTable = useCallback(
    (el: HTMLTableElement) => onSaveTable?.(el, tableNotes(contentRef.current)),
    [onSaveTable],
  );

  if (message.role === 'user') {
    return (
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <div className="msg-user">
          <div className="msg-user-group">
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-end">
                {message.attachments.map((url, i) => (
                  <img key={i} src={url} alt="Attachment"
                    className="max-w-[220px] max-h-[280px] object-contain rounded-xl" />
                ))}
              </div>
            )}
            {message.content && (
              <div className="user-bubble">
                <span>{message.content}</span>
              </div>
            )}
          </div>
        </div>
      </m.div>
    );
  }

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="msg-ai">
        <div className="ai-msg-wrap">
          <div className="markdown-body">
            <Suspense fallback={<span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>…</span>}>
              <TableSaveCtx.Provider value={!isStreaming && onSaveTable ? saveTable : undefined}>
                <Markdown components={MD_COMPONENTS}>
                  {stripLatex(isStreaming ? tidyStreamingTail(message.content) : message.content)}
                </Markdown>
              </TableSaveCtx.Provider>
            </Suspense>
            {isStreaming && <span className="typewriter-cursor" aria-hidden="true" />}
          </div>

          {isCut && !isStreaming && onResend && resendText && (
            <button className="resend-btn" onClick={() => onResend(resendText)}>
              <RotateCcw size={14} />
              <span>Kirim ulang pertanyaan</span>
            </button>
          )}

          <div className="ai-actions">
            <button className="action-btn" title="Respons bagus"
              onClick={() => onFeedback(message.id, 'up')}>
              <ThumbsUp size={14}
                style={feedback === 'up' ? { fill: 'currentColor', color: 'var(--status-success)' } : {}} />
            </button>
            <button className="action-btn" title="Respons kurang tepat"
              onClick={() => onFeedback(message.id, 'down')}>
              <ThumbsDown size={14}
                style={feedback === 'down' ? { fill: 'currentColor', color: 'var(--status-danger)' } : {}} />
            </button>
            {onTogglePocket && !isStreaming && (
              <button className="action-btn" title={inPocket ? 'Hapus dari Bookmark' : 'Simpan ke Bookmark (bisa dibaca offline)'}
                onClick={() => onTogglePocket(message.id)}>
                {inPocket
                  ? <BookmarkCheck size={14} style={{ color: 'var(--accent-main)' }} />
                  : <Bookmark size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </m.div>
  );
});

export function ChatWindow({
  messages, isTyping, isStreaming, selectedModel, userName, agentEvents = [], pocketIds, onTogglePocket, onResend, loadingSession = false,
}: ChatWindowProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const toast = useToast();
  const [savedImage, setSavedImage] = useState<{ url: string; name: string; blob: Blob } | null>(null);
  const closeImage = useCallback(() => {
    setSavedImage(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
  }, []);
  const saveTableImage = useCallback(async (table: HTMLTableElement, notes: string[]) => {
    try {
      const img = await import('../lib/tableImage');
      const blob = await img.renderTablePng(table, { unit: selectedModel, notes });
      const name = img.tableImageName(selectedModel);
      if (img.isIosLike()) {
        setSavedImage(prev => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(blob), name, blob };
        });
      } else {
        img.downloadBlob(blob, name);
        toast('Gambar tabel tersimpan');
      }
    } catch {
      toast('Gagal membuat gambar tabel');
    }
  }, [selectedModel, toast]);

  const shareSavedImage = useCallback(async () => {
    if (!savedImage) return;
    const img = await import('../lib/tableImage');
    const res = await img.shareImage(savedImage.blob, savedImage.name);
    if (res === 'shared') closeImage();
    else if (res === 'unsupported') {
      img.downloadBlob(savedImage.blob, savedImage.name);
      toast('Gambar diunduh ke Files');
    }
  }, [savedImage, closeImage, toast]);
  const pinnedRef = useRef(true);
  const prevLenRef = useRef(0);
  const firstIdRef = useRef<string | undefined>(undefined);

  // Latest values behind stable callbacks: new function props would defeat MessageItem's memo on every chunk.
  const latest = useRef({ feedback, messages, user, selectedModel, onTogglePocket, onResend });
  useEffect(() => { latest.current = { feedback, messages, user, selectedModel, onTogglePocket, onResend }; });

  const handleFeedback = useCallback((id: string, type: 'up' | 'down') => {
    const { feedback, messages, user, selectedModel } = latest.current;
    const next = feedback[id] === type ? null : type;
    setFeedback(prev => ({ ...prev, [id]: next }));
    if (!next || !user) return;
    const idx = messages.findIndex(m => m.id === id);
    const answer = idx >= 0 ? (messages[idx]?.content ?? '') : '';
    let question = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { question = messages[i].content; break; }
    }
    saveFeedback({ userId: user.uid, messageId: id, rating: next, question, answer, model: selectedModel }).catch(() => {});
  }, []);
  const togglePocket = useCallback((id: string) => latest.current.onTogglePocket?.(id), []);
  const resend = useCallback((text: string) => latest.current.onResend?.(text), []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = dist < 120;
    setShowScrollBtn(dist > 120);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lengthGrew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (messages[0]?.id !== firstIdRef.current) {
      firstIdRef.current = messages[0]?.id;
      pinnedRef.current = true;
    }
    if (lengthGrew && messages[messages.length - 1]?.role === 'user') pinnedRef.current = true;

    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
    }
  }, [messages, isTyping]);

  const hasMessages = messages.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    const list = el?.querySelector('.chat-messages-list');
    if (!el || !list) return;
    // Markdown loads lazily and grows the list after render; keep an opened chat on its latest answer.
    const ro = new ResizeObserver(() => { if (pinnedRef.current) el.scrollTop = el.scrollHeight; });
    ro.observe(list);
    return () => ro.disconnect();
  }, [hasMessages]);

  const isWelcome = messages.length === 0 && !isTyping && !loadingSession;

  return (
    <div
      className={`flex-1 bg-[var(--bg-app)] transition-colors duration-300 ${
        isWelcome ? 'flex flex-col overflow-hidden' : 'overflow-y-auto scrollbar-hide'
      }`}
      ref={scrollRef}
      onScroll={handleScroll}
    >
      <AnimatePresence initial={false}>
        {isWelcome && (
          <m.div
            key="welcome"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="welcome-screen"
          >
            <div className="welcome-inner">
              <div className="welcome-stack">
                <m.h1
                  className="welcome-greeting"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span>{getGreeting({ name: userName || 'Operator' })}</span>
                  <span className="welcome-badge" aria-hidden="true"><MessageCircleMore className="welcome-badge-icon" strokeWidth={2} /></span>
                </m.h1>
                <m.div
                  className="welcome-subtitle"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.12 }}
                >
                  Tanya <em>fault code</em>, <em>part number</em>, <em>spesifikasi teknis</em>, atau kirim{' '}
                  <button type="button" className="welcome-chip" onClick={() => window.dispatchEvent(new Event('hta:pick-photo'))}>
                    <Camera size={13} strokeWidth={2.2} /> Foto monitor
                  </button>
                </m.div>
              </div>


            </div>
          </m.div>
        )}
      </AnimatePresence>

      {loadingSession && messages.length === 0 && <SessionSkeleton />}

      {messages.length > 0 && (
        <div className="chat-messages-list">
          {messages.map((message, idx) => {
            const isLast = idx === messages.length - 1;
            const showCursor = isStreaming && isLast && message.role === 'assistant';
            let prevUser = '';
            if (message.role === 'assistant') {
              for (let i = idx - 1; i >= 0; i--) if (messages[i].role === 'user') { prevUser = messages[i].content; break; }
            }
            return (
              <MessageItem
                key={message.id}
                message={message}
                feedback={feedback[message.id] ?? null}
                onFeedback={handleFeedback}
                isStreaming={showCursor}
                onSaveTable={saveTableImage}
                inPocket={pocketIds?.has(message.id) ?? false}
                onTogglePocket={onTogglePocket ? togglePocket : undefined}
                resendText={isLast ? prevUser : undefined}
                onResend={onResend ? resend : undefined}
              />
            );
          })}
          {isTyping && agentEvents.length > 0 && <AgentThinkingIndicator events={agentEvents} />}

          <AnimatePresence>
            {isTyping && agentEvents.length === 0 && (
              <m.div
                key="typing"
                className="typing-dots"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {[0, 1, 2].map(i => (
                  <m.span
                    key={i}
                    className="typing-dot"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {savedImage && (
          <m.div
            key="table-image"
            className="vv-fill table-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Gambar tabel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="table-modal-bar">
              <span className="table-modal-title">Gambar tabel</span>
              <div className="table-modal-actions">
                <button className="table-modal-btn" onClick={closeImage} aria-label="Tutup">
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="table-image-body">
              <img src={savedImage.url} alt="Tabel harga" className="table-image-preview" />
              <button className="table-image-save" onClick={shareSavedImage}>
                <ImageDown size={16} />
                <span>Simpan / kirim gambar</span>
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {showScrollBtn && (
        <button
          className="scroll-fab"
          onClick={() => {
            pinnedRef.current = true;
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
          }}
          aria-label="Scroll ke bawah"
        >
          <ChevronDown size={18} />
        </button>
      )}
    </div>
  );
}
