import { m, AnimatePresence } from 'motion/react';
import type { ReactNode } from 'react';

type Tone = 'warn' | 'ok' | 'error';

const TONE: Record<Tone, { bg: string; border: string; text: string }> = {
  warn:  { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.15)',  text: 'text-amber-300' },
  ok:    { bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.15)',  text: 'text-emerald-300' },
  error: { bg: 'rgba(239,68,68,0.05)',   border: 'rgba(239,68,68,0.10)',   text: 'text-red-400' },
};

interface StatusBannerProps {
  show: boolean;
  tone: Tone;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  id: string;
}

export function StatusBanner({ show, tone, icon, children, action, id }: StatusBannerProps) {
  const t = TONE[tone];
  return (
    <AnimatePresence>
      {show && (
        <m.div
          key={id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="shrink-0 overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ background: t.bg, borderColor: t.border }}>
            <span className="shrink-0">{icon}</span>
            <span className={`text-[12.5px] flex-1 ${t.text}`}>{children}</span>
            {action}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
