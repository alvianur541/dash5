import { useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="vv-fill z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={onCancel}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-1">{title}</p>
            <p className="text-[var(--text-secondary)] text-[13px] leading-relaxed mb-5">{body}</p>
            <div className="flex gap-2.5">
              <button
                onClick={onCancel}
                className="flex-1 h-10 rounded-xl border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={onConfirm}
                className={cn(
                  'flex-1 h-10 rounded-xl text-white text-[13px] font-semibold transition-colors',
                  danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--accent-main)] hover:bg-[var(--accent-active)]',
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
