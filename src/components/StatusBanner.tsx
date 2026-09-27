import { m, AnimatePresence } from 'motion/react';
import type { ReactNode } from 'react';

type Tone = 'warn' | 'ok' | 'error';

interface StatusBannerProps {
  show: boolean;
  tone: Tone;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  id: string;
}

export function StatusBanner({ show, tone, icon, children, action, id }: StatusBannerProps) {
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
          role={tone === 'error' ? 'alert' : 'status'}
        >
          <div className={`status-banner status-banner--${tone}`}>
            <span className="shrink-0 flex">{icon}</span>
            <span className="flex-1">{children}</span>
            {action}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
