
import { useEffect, useRef, useState, useCallback, Suspense, lazy, memo } from 'react';
import { Message, UnitModel } from '../types';
import { m, AnimatePresence } from 'motion/react';
import { Copy, ThumbsUp, ThumbsDown, Check, Search, Sparkles, Loader2, ChevronDown, Maximize2, X, Plus, Minus, Bookmark, BookmarkCheck, Share2, RotateCcw } from 'lucide-react';
import { useToast } from './Toast';
import type { ReactNode } from 'react';
import { getGreeting } from '../lib/greeting';
import { saveFeedback } from '../services/supabase';
import { useAuth } from './AuthProvider';
import type { AgentEvent } from '../services/ai';

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
const PN_CODE_RE = /^[A-Z0-9][A-Z0-9.\/-]{4,}$/i;

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

function ShareButton({ text }: { text: string }) {
  if (typeof navigator === 'undefined' || !navigator.share) return null;
  const share = async () => {
    try { await navigator.share({ text: text.replace(CUT_NOTE_RE, '') }); } catch { }
  };
  return (
    <button onClick={share} className="action-btn" title="Bagikan" aria-label="Bagikan">
      <Share2 size={14} />
    </button>
  );
}

export function SessionSkeleton() {
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
  hasHistory?: boolean;
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
  search_circuit_diagram:  'Hydraulic Circuit',
  decompose_query:         'memecah query',
};

function eventLabel(e: AgentEvent): { icon: 'search' | 'check' | 'spark'; text: string } | null {
  if (e.type === 'thinking') return { icon: 'spark', text: e.message ?? 'Berpikir…' };
  if (e.type === 'tool_call') {
    const tool = e.tool ?? '';
    const friendly = TOOL_LABELS[tool] ?? tool;
    return { icon: 'search', text: tool === 'decompose_query' ? `Memecah query…` : `Mencari di ${friendly}…` };
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

const CopyButton = memo(function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="action-btn" title="Copy">
      {copied
        ? <Check size={14} style={{ color: 'var(--status-success)' }} />
        : <Copy size={14} />
      }
    </button>
  );
});

const MessageItem = memo(function MessageItem({
  message, feedback, onFeedback, isStreaming = false, onExpandTable, inPocket = false, onTogglePocket, resendText, onResend,
}: {
  message: Message;
  feedback: 'up' | 'down' | null;
  onFeedback: (id: string, type: 'up' | 'down') => void;
  isStreaming?: boolean;
  onExpandTable?: (table: ReactNode) => void;
  inPocket?: boolean;
  onTogglePocket?: (messageId: string) => void;
  resendText?: string;
  onResend?: (text: string) => void;
}) {
  const isCut = message.role === 'assistant' && CUT_NOTE_RE.test(message.content);

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
              <Markdown
                components={{
                  table: ({ children }) => (
                    <div className="table-wrap-outer">
                      <div className="markdown-table-wrap" onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollLeft > 2)}><table className={stickyClass(children)}>{children}</table></div>
                      {onExpandTable && !isStreaming && (
                        <button
                          className="table-expand-btn"
                          onClick={() => onExpandTable(<table className={stickyClass(children)}>{children}</table>)}
                          aria-label="Buka tabel layar penuh"
                          title="Layar penuh"
                        >
                          <Maximize2 size={13} />
                        </button>
                      )}
                    </div>
                  ),
                  code: ({ children }) => <CodeSpan>{children}</CodeSpan>,
                  strong: ({ children }) => {
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
                    return isPartLike
                      ? <code>{text}</code>
                      : <strong>{children}</strong>;
                  },
                }}
              >{stripLatex(message.content)}</Markdown>
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
            <CopyButton text={message.content} />
            <ShareButton text={message.content} />
            <span className="ai-actions-gap" />
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
  messages, isTyping, isStreaming, selectedModel, userName, hasHistory = false, agentEvents = [], pocketIds, onTogglePocket, onResend, loadingSession = false,
}: ChatWindowProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [expandedTable, setExpandedTable] = useState<ReactNode | null>(null);
  const [tableFont, setTableFont] = useState(15);
  const openTable = useCallback((table: ReactNode) => { setTableFont(15); setExpandedTable(table); }, []);
  const closeTable = useCallback(() => setExpandedTable(null), []);

  useEffect(() => {
    if (!expandedTable) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedTable(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedTable]);
  const pinnedRef = useRef(true);
  const prevLenRef = useRef(0);

  const handleFeedback = (id: string, type: 'up' | 'down') => {
    setFeedback(prev => {
      const next = prev[id] === type ? null : type;
      if (next && user) {
        const idx = messages.findIndex(m => m.id === id);
        const answer = idx >= 0 ? (messages[idx]?.content ?? '') : '';
        let question = '';
        for (let i = idx - 1; i >= 0; i--) {
          if (messages[i].role === 'user') { question = messages[i].content; break; }
        }
        saveFeedback({ userId: user.uid, messageId: id, rating: next, question, answer, model: selectedModel }).catch(() => {});
      }
      return { ...prev, [id]: next };
    });
  };

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
    if (lengthGrew && messages[messages.length - 1]?.role === 'user') pinnedRef.current = true;

    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
    }
  }, [messages, isTyping]);

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
            <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '26px' }}>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '9px', textAlign: 'center' }}>
                <m.h1
                  className="welcome-greeting"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    fontFamily: '"DM Serif Display", var(--font-serif)',
                    fontSize: 'clamp(23px, 5.4vw, 29px)',
                    fontWeight: 400,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.16,
                    color: 'var(--text-primary)',
                  }}
                >
                  {getGreeting({ name: userName || 'Operator' })}
                </m.h1>
                <m.div
                  className="welcome-subtitle"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.12 }}
                  style={{
                    fontSize: '13.5px',
                    color: 'var(--text-muted)',
                    letterSpacing: '-0.003em',
                    lineHeight: 1.6,
                    maxWidth: '380px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '9px',
                  }}
                >
                  <span>Ada yang mau dicek di unit <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedModel}</strong>?</span>
                  <span>Ketik langsung di bawah — fault code, part number, atau spec teknis.</span>
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
                onExpandTable={openTable}
                inPocket={pocketIds?.has(message.id) ?? false}
                onTogglePocket={onTogglePocket}
                resendText={isLast ? prevUser : undefined}
                onResend={onResend}
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
        {expandedTable && (
          <m.div
            key="table-modal"
            className="table-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Tabel layar penuh"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="table-modal-bar">
              <span className="table-modal-title">Tabel</span>
              <div className="table-modal-actions">
                <button className="table-modal-btn" onClick={() => setTableFont(f => Math.max(12, f - 1.5))} aria-label="Perkecil teks">
                  <Minus size={16} />
                </button>
                <button className="table-modal-btn" onClick={() => setTableFont(f => Math.min(21, f + 1.5))} aria-label="Perbesar teks">
                  <Plus size={16} />
                </button>
                <button className="table-modal-btn" onClick={closeTable} aria-label="Tutup">
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="table-modal-scroll" onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollLeft > 2)}>
              <div className="markdown-body table-modal-body" style={{ fontSize: `${tableFont}px` }}>
                {expandedTable}
              </div>
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
