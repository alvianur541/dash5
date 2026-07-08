
import { useEffect, useRef, useState, useCallback, Suspense, lazy, memo } from 'react';
import { Message, UnitModel } from '../types';
import { m, AnimatePresence } from 'motion/react';
import { Copy, ThumbsUp, ThumbsDown, RotateCcw, Check, ListChecks, Search, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { getGreeting } from '../lib/greeting';
import { hasProceduralContent } from '../lib/checklist';
import { saveFeedback } from '../services/supabase';
import { useAuth } from './AuthProvider';
import type { AgentEvent } from '../services/ai';

const ReactMarkdown = lazy(() => import('react-markdown'));

// Hapus LaTeX math notation yang bocor dari AI ($P_{LS}$, $$...$$, dll).
// Renderer tidak support LaTeX — tampil sebagai raw text yang membingungkan user.
// Convert: inline $...$ → `backtick`, display $$...$$ → plain text.
function stripLatex(text: string): string {
  const clean = (s: string) =>
    s.replace(/_\{([^}]+)\}/g, '_$1')
     .replace(/\^\{([^}]+)\}/g, '^$1')
     .replace(/\\[a-zA-Z]+\s?/g, '')
     .trim();
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => clean(inner))
    .replace(/\$([^$\n]+?)\$/g,     (_, inner) => '`' + clean(inner) + '`');
}

// Strict markdown sanitize schema — block iframe, embed, object, form, dll.
// Whitelist explicit tag yang aman untuk teknis content (table, code, dll).
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'span', 'div', 'hr',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [['href', /^(https?:\/\/|mailto:|tel:)/i], 'title'],
    code: ['className'],
    span: ['className'],
    div: ['className'],
  },
  protocols: { href: ['http', 'https', 'mailto', 'tel'] },
};

interface ChatWindowProps {
  messages: Message[];
  isTyping: boolean;
  isStreaming: boolean;
  selectedModel: UnitModel;
  onSendMessage: (content: string) => void;
  onRetry: (assistantMessageId: string) => void;
  userName?: string;
  hasHistory?: boolean;
  onOpenChecklist?: (messageId: string, content: string) => void;
  agentEvents?: AgentEvent[];
}

// Suggestion chips per model — fault code & topic VERIFIED ada di Supabase:
//
// ZX48U-5A & ZX65USB-5A: Yanmar 4TNV88, fault format 'ENG: xxxxx-xx'
//   contoh real: 0001D-02 (accelerator), 00436-04 (speed sensor)
// ZX138MF-5G & ZX200-5G: Isuzu, fault format 'xxxxx-x'
//   contoh real ZX200: 11006-2 (engine controller), 16606 (EC angle sensor)
//   contoh real ZX138: 11302-4 (boom raise pilot pressure), 11307 (sensor)
// KCM 60ZV: WM only — no fault code structure. Topic: brake/hydraulic/power groups
// 2 chip per model — chip 1 diagnosa (fault code / symptom), chip 2 nilai tambah
// yang beda per model (spec HCD, prosedur WM, estimasi biaya CPM+promo) supaya
// cakupan kemampuan terlihat. Semua menembak jalur RAG yang terverifikasi
// (lihat Quick Reference: Test Cases di CLAUDE.md) — demo tidak boleh zonk.
const SUGGESTION_CHIPS_BY_MODEL: Record<UnitModel, Array<{ icon: string; text: string }>> = {
  'ZX48U-5A': [
    { icon: '⚠️', text: 'Diagnosa fault code ENG:00436-04 dan langkah pengecekannya' },
    { icon: '📐', text: 'Relief pressure main pump beserta cara pengukurannya' },
  ],
  'ZX65USB-5A': [
    { icon: '⚠️', text: 'Diagnosa fault code ENG:0001D-02 dan langkah pengecekannya' },
    { icon: '🔍', text: 'Engine susah start — urutan pengecekan sistematis' },
  ],
  'ZX138MF-5G': [
    { icon: '⚠️', text: 'Diagnosa fault code 11302-4 pada sistem boom raise' },
    { icon: '🔍', text: 'Boom angkat lambat — analisa penyebab dan pengecekan' },
  ],
  'ZX200-5G': [
    { icon: '⚠️', text: 'Diagnosa fault code 11006-2 dan dampaknya ke unit' },
    { icon: '🔍', text: 'Hydraulic power lemah — diagnosa penyebab dan langkah cek' },
  ],
  'KCM 60ZV': [
    { icon: '🔍', text: 'Steering terasa berat — analisa penyebab dan pengecekan' },
    { icon: '📋', text: 'Prosedur adjust parking brake beserta spec-nya' },
  ],
};

const DEFAULT_CHIPS = [
  { icon: '⚠️', text: 'Diagnosa fault code yang muncul di monitor' },
  { icon: '🔍', text: 'Hydraulic power lemah — diagnosa penyebab dan langkah cek' },
];

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}


// Agent thinking indicator — show real-time progress saat ReAct loop jalan.
// Subtle styling, fade in/out via AnimatePresence. Auto-hide saat done event.
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
  return null; // done — handled di parent (clear list)
}

const AgentThinkingIndicator = memo(function AgentThinkingIndicator({
  events,
}: { events: AgentEvent[] }) {
  // SATU indikator saja — ambil event terakhir yang punya label, ganti (bukan tumpuk).
  let current: AgentEvent | null = null;
  let label: ReturnType<typeof eventLabel> = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const l = eventLabel(events[i]);
    if (l) { current = events[i]; label = l; break; }
  }
  if (!current || !label) return null;

  return (
    <div className="agent-thinking-list">
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={label.text}
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
          {label.icon === 'search' && <Search size={12} className="text-[var(--accent-main)]" />}
          {label.icon === 'check'  && <Check  size={12} style={{ color: current.found ? 'var(--status-success, #22c55e)' : 'var(--text-muted)' }} />}
          {label.icon === 'spark'  && <Sparkles size={12} className="text-[var(--accent-main)]" />}
          <span>{label.text}</span>
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
  message, feedback, onFeedback, onRetry, isTyping, isStreaming = false, onOpenChecklist,
}: {
  message: Message;
  feedback: 'up' | 'down' | null;
  onFeedback: (id: string, type: 'up' | 'down') => void;
  onRetry: (id: string) => void;
  isTyping: boolean;
  isStreaming?: boolean;
  onOpenChecklist?: (messageId: string, content: string) => void;
}) {

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
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, SANITIZE_SCHEMA]]}
                components={{
                  table: ({ children }) => (
                    <div className="markdown-table-wrap"><table>{children}</table></div>
                  ),
                  // Header tabel pakai font mono — selaras dengan body cell yg
                  // sering berisi PN/spec/code dalam backtick (juga mono).
                  th: ({ children }) => (
                    <th style={{ fontFamily: 'var(--font-mono)' }}>{children}</th>
                  ),
                  // Fallback: kalau AI bungkus PN/spec dalam **bold** alih-alih
                  // backtick, deteksi pattern PN/spec dan render mono.
                  // Pattern strict: max 2 words, word[0] punya digit, word[1]
                  // (kalau ada) cuma huruf max 5 char (unit kayak MPa/rpm/Nm).
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
              >{stripLatex(message.content)}</ReactMarkdown>
            </Suspense>
            {isStreaming && <span className="typewriter-cursor" aria-hidden="true" />}
          </div>
          <div className="ai-actions">
            <CopyButton text={message.content} />
            {onOpenChecklist && hasProceduralContent(message.content) && (
              <button
                className="action-btn"
                title="Checklist prosedur"
                onClick={() => onOpenChecklist(message.id, message.content)}
              >
                <ListChecks size={14} />
              </button>
            )}
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
            <button className="action-btn" title="Ulangi" disabled={isTyping}
              onClick={() => !isTyping && onRetry(message.id)}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>
    </m.div>
  );
});

export function ChatWindow({
  messages, isTyping, isStreaming, selectedModel, onSendMessage, onRetry, userName, hasHistory = false, onOpenChecklist, agentEvents = [],
}: ChatWindowProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const handleFeedback = (id: string, type: 'up' | 'down') => {
    setFeedback(prev => {
      const next = prev[id] === type ? null : type;
      // Persist HANYA saat memberi rating (bukan saat membatalkan) → sinyal learning loop.
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
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Welcome mode: flex-col supaya child bisa pakai flex:1 untuk isi penuh.
  // Tanpa ini, minHeight:'100%' di dalam overflow-y:auto = circular reference
  // → browser resolve ke 0 → welcome content top-aligned → gap besar di bawah.
  const isWelcome = messages.length === 0 && !isTyping;

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
            style={{}}
          >
            <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '26px' }}>

              {/* Hero — greeting editorial + subtitle kalem */}
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
                <m.p
                  className="welcome-subtitle"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.12 }}
                  style={{
                    fontSize: '13.5px',
                    color: 'var(--text-muted)',
                    letterSpacing: '-0.003em',
                    lineHeight: 1.55,
                    maxWidth: '330px',
                  }}
                >
                  {hasHistory
                    ? <>Lanjut sesi sebelumnya atau mulai topik baru di unit <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedModel}</strong>.</>
                    : <>Fault code, PN parts, atau spec teknis untuk <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedModel}</strong>.</>
                  }
                </m.p>
              </div>

              {/* Quick-start chips — tile ikon + label + panah */}
              <div className="chips-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', margin: '0 auto' }}>
                <p className="chips-label" style={{
                  textAlign: 'left',
                  paddingLeft: '4px',
                  marginBottom: '2px',
                  fontSize: '10px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}>
                  Mulai cepat
                </p>
                {(SUGGESTION_CHIPS_BY_MODEL[selectedModel] ?? DEFAULT_CHIPS).map((chip, i) => (
                  <m.button
                    key={chip.text}
                    className="suggestion-chip"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.22 + i * 0.06 }}
                    onClick={() => onSendMessage(chip.text)}
                  >
                    <span className="chip-tile" aria-hidden="true">{chip.icon}</span>
                    <span className="chip-text">{chip.text}</span>
                    <ChevronRight size={15} className="chip-arrow" />
                  </m.button>
                ))}
              </div>

            </div>
          </m.div>
        )}
      </AnimatePresence>

      {messages.length > 0 && (
        <div className="chat-messages-list">
          {messages.map((message, idx) => {
            // Cursor typewriter hanya tampil di pesan AI terakhir saat streaming
            const isLast = idx === messages.length - 1;
            const showCursor = isStreaming && isLast && message.role === 'assistant';
            return (
              <MessageItem
                key={message.id}
                message={message}
                feedback={feedback[message.id] ?? null}
                onFeedback={handleFeedback}
                onRetry={onRetry}
                isTyping={isTyping}
                isStreaming={showCursor}
                onOpenChecklist={onOpenChecklist}
              />
            );
          })}
          {/* Agent thinking — show progress saat ReAct loop jalan, hilang saat answer streaming */}
          {isTyping && agentEvents.length > 0 && <AgentThinkingIndicator events={agentEvents} />}

          <AnimatePresence>
            {isTyping && (
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

      {showScrollBtn && (
        <button
          className="scroll-fab"
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
          aria-label="Scroll ke bawah"
        >
          <ChevronDown size={18} />
        </button>
      )}
    </div>
  );
}
