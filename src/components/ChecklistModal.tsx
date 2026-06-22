import { useState, useEffect, useMemo } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Check, RotateCcw, Copy } from 'lucide-react';
import { extractChecklistItems } from '../lib/checklist';
import { useChecklist } from '../hooks/useChecklist';

interface ChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  rawContent: string;
  title?: string;
}

export function ChecklistModal({
  isOpen, onClose, messageId, rawContent, title = 'Checklist Prosedur',
}: ChecklistModalProps) {
  const initialItems = useMemo(() => extractChecklistItems(rawContent), [rawContent]);
  const { items, toggleItem, resetAll, completedCount, totalCount } =
    useChecklist(messageId, initialItems);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!isOpen) setCopied(false); }, [isOpen]);

  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isComplete = totalCount > 0 && completedCount === totalCount;

  const handleCopy = async () => {
    const text = items.map(i => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // Inline style position:fixed + z-50 (NEVER createPortal — sesuai PWA layout rule)
          style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          className="flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={onClose}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl w-full max-w-[420px] shadow-2xl flex flex-col max-h-[80dvh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5 border-b border-[var(--border-main)] shrink-0">
              <div className="flex flex-col min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{title}</p>
                <p className="text-[10.5px] text-[var(--text-muted)] mt-px">
                  {completedCount}/{totalCount} selesai
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/8 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                aria-label="Tutup checklist"
              >
                <X size={14} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="px-4 pt-2.5 shrink-0">
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--border-main)' }}
              >
                <m.div
                  initial={false}
                  animate={
                    isComplete
                      ? { width: `${progress}%`, opacity: [1, 0.65, 1] }
                      : { width: `${progress}%`, opacity: 1 }
                  }
                  transition={
                    isComplete
                      ? {
                          width:   { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
                          opacity: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
                        }
                      : { duration: 0.35, ease: [0.4, 0, 0.2, 1] }
                  }
                  style={{ height: '100%', background: 'var(--accent-main)' }}
                />
              </div>
            </div>

            {/* List — compact, monospace */}
            <div className="flex-1 overflow-y-auto scrollbar-hide px-2 py-2">
              <ul className="space-y-0.5">
                {items.map(item => (
                  <li key={item.id}>
                    <button
                      onClick={() => toggleItem(item.id)}
                      className="w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/5 transition-colors"
                    >
                      <span
                        className="shrink-0 mt-[3px] w-[14px] h-[14px] rounded border-[1.5px] flex items-center justify-center transition-all duration-150"
                        style={{
                          borderColor: item.done ? 'var(--accent-main)' : 'var(--border-main)',
                          background:  item.done ? 'var(--accent-main)' : 'transparent',
                        }}
                      >
                        {item.done && <Check size={9} color="#fff" strokeWidth={3.5} />}
                      </span>
                      <span
                        className="flex-1 transition-all duration-200"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11.5px',
                          lineHeight: '1.5',
                          color: 'var(--text-primary)',
                          textDecoration: item.done ? 'line-through' : 'none',
                          opacity: item.done ? 0.5 : 1,
                        }}
                      >
                        {item.text}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-[var(--border-main)] shrink-0">
              <button
                onClick={resetAll}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11.5px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <RotateCcw size={11} />
                Reset semua
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11.5px] font-semibold bg-[var(--accent-main)] text-white hover:brightness-110 transition-all"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Tersalin' : 'Salin teks'}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
