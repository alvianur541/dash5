import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    setMsg(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 1600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <AnimatePresence>
        {msg && (
          <m.div
            key="toast"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="app-toast"
            role="status"
          >
            <Check size={13} />
            <span>{msg}</span>
          </m.div>
        )}
      </AnimatePresence>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
