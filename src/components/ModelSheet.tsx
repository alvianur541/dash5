import { m, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { UnitModel } from '../types';
import { MODEL_GROUPS } from './Sidebar';

interface ModelSheetProps {
  open: boolean;
  selected: UnitModel;
  onSelect: (model: UnitModel) => void;
  onClose: () => void;
}

export function ModelSheet({ open, selected, onSelect, onClose }: ModelSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <m.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="model-sheet"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-[var(--border-main)]" /></div>
            <div className="flex items-center justify-between px-5 pb-2">
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">Pilih unit</p>
              <button onClick={onClose} className="topbar-hamburger" aria-label="Tutup"><X size={16} /></button>
            </div>
            {MODEL_GROUPS.map(({ type, models }) => (
              <div key={type} className="px-3 pb-2">
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{type}</p>
                {models.map(model => (
                  <button
                    key={model}
                    onClick={() => onSelect(model)}
                    className={cn('model-sheet-item', model === selected && 'model-sheet-item-active')}
                  >
                    <span className={cn('w-2 h-2 rounded-full shrink-0', model === selected ? 'bg-[var(--accent-active)]' : 'bg-[var(--text-muted)]/40')} />
                    <span>{model}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="safe-area-spacer" />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
