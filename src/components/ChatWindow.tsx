
import { useEffect, useRef, useState, useCallback, Suspense, lazy, memo } from 'react';
import { Message, UnitModel } from '../types';
import { m, AnimatePresence } from 'motion/react';
import { Copy, ThumbsUp, ThumbsDown, Check, Lightbulb, Search, Loader2, ChevronDown, ArrowRight, Maximize2, X, Plus, Minus, Bookmark, BookmarkCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { getGreeting } from '../lib/greeting';
import { saveFeedback } from '../services/supabase';
import { useAuth } from './AuthProvider';
import type { AgentEvent } from '../services/ai';

const ReactMarkdown = lazy(() => import('react-markdown'));

// Hapus LaTeX math notation yang bocor dari AI ($P_{LS}$, $$...$$, dll).
// Renderer tidak support LaTeX — tampil sebagai raw text yang membingungkan user.
// Convert: inline $...$ → `backtick`, display $$...$$ → plain text.
export function stripLatex(text: string): string {
  const clean = (s: string) =>
    s.replace(/_\{([^}]+)\}/g, '_$1')
     .replace(/\^\{([^}]+)\}/g, '^$1')
     .replace(/\\[a-zA-Z]+\s?/g, '')
     .trim();
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => clean(inner))
    .replace(/\$([^$\n]+?)\$/g,     (_, inner) => '`' + clean(inner) + '`')
    // Notasi pangkat satuan bocor dari data ({mm}^2, mm^2, cm^3) → Unicode superscript.
    // Deterministik di renderer — menutup juga jawaban lama yang sudah ter-cache.
    .replace(/\{?(mm|cm|m)\}?\^([23])\b/g, (_, u: string, d: string) => u + (d === '2' ? '²' : '³'));
}

// Strict markdown sanitize schema — block iframe, embed, object, form, dll.
// Whitelist explicit tag yang aman untuk teknis content (table, code, dll).
export const SANITIZE_SCHEMA = {
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

// Ekstrak teks polos dari node hast — untuk deteksi blockquote "catatan lapangan"
// (biar bisa dikasih shading beda dari data manual resmi).
function hastText(node: unknown): string {
  const n = node as { type?: string; value?: string; children?: unknown[] } | null;
  if (!n) return '';
  if (n.type === 'text') return n.value ?? '';
  if (Array.isArray(n.children)) return n.children.map(hastText).join('');
  return '';
}

interface ChatWindowProps {
  messages: Message[];
  isTyping: boolean;
  isStreaming: boolean;
  selectedModel: UnitModel;
  userName?: string;
  hasHistory?: boolean;
  onOpenFieldNote?: (messageId: string) => void;
  agentEvents?: AgentEvent[];
  pocketIds?: Set<string>;
  onTogglePocket?: (messageId: string) => void;
}

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
          {label.icon === 'spark'  && <Loader2 size={12} className="animate-spin text-[var(--accent-main)]" />}
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
  message, feedback, onFeedback, isStreaming = false, onOpenFieldNote, onExpandTable, inPocket = false, onTogglePocket,
}: {
  message: Message;
  feedback: 'up' | 'down' | null;
  onFeedback: (id: string, type: 'up' | 'down') => void;
  isStreaming?: boolean;
  onOpenFieldNote?: (messageId: string) => void;
  onExpandTable?: (table: ReactNode) => void;
  inPocket?: boolean;
  onTogglePocket?: (messageId: string) => void;
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
                  // Tombol ekspansi di LUAR container scroll (absolute di outer) supaya
                  // tidak ikut tergeser saat tabel di-scroll horizontal.
                  table: ({ children }) => (
                    <div className="table-wrap-outer">
                      <div className="markdown-table-wrap"><table>{children}</table></div>
                      {onExpandTable && !isStreaming && (
                        <button
                          className="table-expand-btn"
                          onClick={() => onExpandTable(<table>{children}</table>)}
                          aria-label="Buka tabel layar penuh"
                          title="Layar penuh"
                        >
                          <Maximize2 size={13} />
                        </button>
                      )}
                    </div>
                  ),
                  // Blockquote yang berisi "catatan lapangan" → callout shaded (ilmu
                  // teknisi, belum resmi) supaya beda jelas dari data manual resmi.
                  blockquote: ({ children, node }) => (
                    hastText(node).toLowerCase().includes('catatan lapangan')
                      ? <blockquote className="fieldnote-callout">{children}</blockquote>
                      : <blockquote>{children}</blockquote>
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

          {/* Catatan Lapangan — muncul saat AI MENDETEKSI teknisi berbagi ilmu di
              pesannya. Sudah terisi hasil ekstraksi AI; teknisi tinggal cek & simpan. */}
          {!isStreaming && message.knowledgeCandidate && onOpenFieldNote && (
            <button
              className="fieldnote-cta"
              onClick={() => onOpenFieldNote(message.id)}
            >
              <span className="fieldnote-cta-icon"><Lightbulb size={15} /></span>
              <span className="fieldnote-cta-text">
                <span className="fieldnote-cta-title">Sepertinya kamu berbagi ilmu lapangan</span>
                <span className="fieldnote-cta-sub">
                  {message.knowledgeCandidate.component ? `${message.knowledgeCandidate.component} · ` : ''}ketuk untuk cek &amp; simpan ke knowledge base
                </span>
              </span>
              <ArrowRight size={15} className="fieldnote-cta-arrow" />
            </button>
          )}

          <div className="ai-actions">
            <CopyButton text={message.content} />
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
            {/* Saku — simpan jawaban untuk dibaca offline. Disembunyikan saat streaming
                (jangan simpan jawaban setengah jadi). */}
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
  messages, isTyping, isStreaming, selectedModel, userName, hasHistory = false, onOpenFieldNote, agentEvents = [], pocketIds, onTogglePocket,
}: ChatWindowProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // Tabel layar penuh — simpan node tabel yang diperbesar + ukuran font (kontrol A−/A+,
  // lebih andal utk sarung tangan daripada pinch yang diblokir viewport maximum-scale=1).
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
  // "Menempel di bawah" — auto-scroll HANYA saat user memang di dasar chat.
  // Kalau user scroll ke atas (baca awal jawaban saat streaming), jangan diseret turun.
  const pinnedRef = useRef(true);
  const prevLenRef = useRef(0);

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
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = dist < 120;
    setShowScrollBtn(dist > 120);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Pesan baru dari user → selalu pin ke bawah (user pasti mau lihat pesannya terkirim).
    const lengthGrew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (lengthGrew && messages[messages.length - 1]?.role === 'user') pinnedRef.current = true;

    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      // Konten tumbuh saat user di atas → pastikan tombol "ke bawah" tampil.
      setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
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
                  {hasHistory ? (
                    <>
                      <span>Mau lanjut obrolan sebelumnya, atau ada yang baru di unit <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedModel}</strong>?</span>
                      <span>Ketik aja langsung di bawah: fault code, part number, atau spec teknis.</span>
                      <span>Ada kode error di monitor? Kirim aja fotonya, nanti aku bantu analisa.</span>
                    </>
                  ) : (
                    <>
                      <span>Ada yang mau dicek di unit <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedModel}</strong>?</span>
                      <span>Ketik aja langsung di bawah: fault code, part number, atau spec teknis.</span>
                      <span>Ada kode error di monitor? Kirim aja fotonya, nanti aku bantu analisa.</span>
                    </>
                  )}
                </m.div>
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
                isStreaming={showCursor}
                onOpenFieldNote={onOpenFieldNote}
                onExpandTable={openTable}
                inPocket={pocketIds?.has(message.id) ?? false}
                onTogglePocket={onTogglePocket}
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

      {/* Tabel layar penuh — overlay solid, scroll 2 arah, kontrol ukuran font */}
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
            <div className="table-modal-scroll">
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
            pinnedRef.current = true; // kembali menempel — auto-scroll aktif lagi
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
