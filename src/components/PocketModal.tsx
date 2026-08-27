
import { Suspense, lazy, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Trash2 } from 'lucide-react';
import { PocketItem } from '../services/storage';
import { stripLatex } from './ChatWindow';

const Markdown = lazy(() => import('./Markdown'));

function formatSavedAt(ts: number): string {
  return new Date(ts).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function PocketModal({ item, onClose, onDelete }: {
  item: PocketItem | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  return (
    <AnimatePresence>
      {item && (
        <m.div
          key="pocket-modal"
          className="table-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Jawaban tersimpan"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="table-modal-bar">
            <span className="table-modal-title">Bookmark · {item.model} · {formatSavedAt(item.savedAt)}</span>
            <div className="table-modal-actions">
              <button
                className="table-modal-btn pocket-delete-btn"
                onClick={() => { onDelete(item.id); onClose(); }}
                aria-label="Hapus dari Bookmark"
                title="Hapus dari Bookmark"
              >
                <Trash2 size={15} />
              </button>
              <button className="table-modal-btn" onClick={onClose} aria-label="Tutup">
                <X size={17} />
              </button>
            </div>
          </div>
          <div className="table-modal-scroll">
            <div className="pocket-modal-inner">
              <div className="pocket-question">{item.question || '(tanpa pertanyaan)'}</div>
              <div className="markdown-body">
                <Suspense fallback={<span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>…</span>}>
                  <Markdown
                    components={{
                      table: ({ children }) => (
                        <div className="markdown-table-wrap"><table>{children}</table></div>
                      ),
                    }}
                  >{stripLatex(item.answer)}</Markdown>
                </Suspense>
              </div>
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
