/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, Suspense, lazy, memo } from 'react';
import { Message, UnitModel } from '../types';
import { m, AnimatePresence } from 'motion/react';
import { Copy, ThumbsUp, ThumbsDown, RotateCcw, Check, Wrench } from 'lucide-react';

const ReactMarkdown = lazy(() => import('react-markdown'));
import rehypeSanitize from 'rehype-sanitize';

interface ChatWindowProps {
  messages: Message[];
  isTyping: boolean;
  selectedModel: UnitModel;
  onSelectModel: (model: UnitModel) => void;
  onSendMessage: (content: string) => void;
  onRetry: (assistantMessageId: string) => void;
  userName?: string;
}

const SUGGESTION_CHIPS = [
  'Berapa berat Swing Motor?',
  'Torsi pengencangan baut Flywheel Engine',
  'Troubleshooting unit mistrack',
  'Engine overheat, apa yang harus dicek?',
];

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const CopyButton = memo(function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
});

// Memoized message item — only re-renders if message or feedback changes
const MessageItem = memo(function MessageItem({
  message,
  feedback,
  onFeedback,
  onRetry,
  isTyping,
}: {
  message: Message;
  feedback: 'up' | 'down' | null;
  onFeedback: (id: string, type: 'up' | 'down') => void;
  onRetry: (id: string) => void;
  isTyping: boolean;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {message.role === 'user' ? (
        <div className="flex justify-end">
          <div className="max-w-[80%] space-y-1">
            <div className="px-4 py-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-main)] text-[15px] text-[var(--text-primary)] leading-relaxed shadow-sm">
              {message.content}
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.attachments.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt="Attachment"
                      className="max-w-[260px] max-h-[320px] object-contain rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>
            {message.timestamp && (
              <p className="text-[10px] text-[var(--text-muted)] text-right pr-1">
                {formatTime(message.timestamp)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-xl bg-[var(--accent-main)] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
            <Wrench className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="markdown-body text-[15px] text-[var(--text-primary)]">
              <Suspense fallback={<span className="text-[var(--text-muted)] text-sm">...</span>}>
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{message.content}</ReactMarkdown>
              </Suspense>
            </div>
            <div className="flex items-center gap-1 pt-1">
              <CopyButton text={message.content} />
              <button
                onClick={() => onFeedback(message.id, 'up')}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                title="Respons bagus"
              >
                <ThumbsUp
                  size={14}
                  className={feedback === 'up' ? 'text-green-400' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}
                  style={feedback === 'up' ? { fill: 'currentColor' } : {}}
                />
              </button>
              <button
                onClick={() => onFeedback(message.id, 'down')}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                title="Respons kurang tepat"
              >
                <ThumbsDown
                  size={14}
                  className={feedback === 'down' ? 'text-red-400' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}
                  style={feedback === 'down' ? { fill: 'currentColor' } : {}}
                />
              </button>
              <button
                onClick={() => !isTyping && onRetry(message.id)}
                disabled={isTyping}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Ulangi jawaban"
              >
                <RotateCcw size={14} />
              </button>
              {message.timestamp && (
                <span className="ml-auto text-[10px] text-[var(--text-muted)] pr-1">
                  {formatTime(message.timestamp)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </m.div>
  );
});

export function ChatWindow({
  messages,
  isTyping,
  selectedModel,
  onSendMessage,
  onRetry,
  userName,
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | null>>({});

  const handleFeedback = (id: string, type: 'up' | 'down') => {
    setFeedback(prev => ({ ...prev, [id]: prev[id] === type ? null : type }));
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div
      className="flex-1 overflow-y-auto scrollbar-hide bg-[var(--bg-app)] transition-colors duration-400"
      ref={scrollRef}
    >
      <AnimatePresence initial={false}>

        {/* ── Welcome / Empty State ── */}
        {messages.length === 0 && !isTyping && (
          <m.div
            key="welcome"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center min-h-full py-16 px-4"
          >
            <div className="w-full max-w-xl md:max-w-2xl space-y-8">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center mb-2">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--accent-main)] flex items-center justify-center shadow-xl shadow-[var(--accent-main)]/20">
                    <Wrench className="w-7 h-7 text-white" />
                  </div>
                </div>
                <h1
                  className="text-[var(--text-primary)] tracking-tight leading-snug md:whitespace-nowrap"
                  style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 400 }}
                >
                  Hai {userName || 'Operator'}, ada yang bisa Dash⁵ bantu?
                </h1>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-card)] border border-[var(--border-main)] mt-2">
                  <span className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-widest">Model Unit</span>
                  <span className="w-1 h-1 rounded-full bg-[var(--border-main)]" />
                  <span className="text-[13px] text-[var(--accent-main)] font-bold">{selectedModel}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider text-center">
                  Contoh pertanyaan
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTION_CHIPS.map((chip, i) => (
                    <button
                      key={i}
                      onClick={() => onSendMessage(chip)}
                      className="w-full text-left px-4 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-main)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-main)]/20 hover:bg-[var(--bg-card-hover)] transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </m.div>
        )}

        {/* ── Messages ── */}
        {messages.length > 0 && (
          <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-8">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                feedback={feedback[message.id] ?? null}
                onFeedback={handleFeedback}
                onRetry={onRetry}
                isTyping={isTyping}
              />
            ))}

            {/* Typing Indicator */}
            <AnimatePresence>
              {isTyping && (
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-7 h-7 rounded-xl bg-[var(--accent-main)] flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Wrench className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex flex-col justify-center gap-1 py-2">
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <m.div
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]"
                        />
                      ))}
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        )}

      </AnimatePresence>
    </div>
  );
}
