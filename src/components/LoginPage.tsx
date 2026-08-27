
import React, { useState } from 'react';
import { AlertCircle, LogIn, Loader2, Sun, Moon } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { LOGO_BASE64 } from '../lib/logo';
import { useAuth } from './AuthProvider';

interface LoginPageProps {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

export function LoginPage({ theme, onThemeToggle }: LoginPageProps) {
  const { login, authError } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const isDark = theme === 'dark';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    await login(username, password);
    setLoginLoading(false);
  };

  const inputClass = cn(
    "w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all",
    "focus:ring-2 focus:ring-[var(--accent-main)]/20",
    isDark
      ? "bg-[var(--bg-card)] border border-[var(--border-main)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--border-main)]"
      : "bg-white border border-[#e5e5e5] text-[#111] placeholder-[#bbb] focus:border-[#bbb] shadow-sm"
  );

  return (
    <div className={cn(
      "min-h-screen w-screen flex flex-col items-center justify-center px-4 transition-colors duration-400 bg-[var(--bg-app)] relative"
    )}>
      {}
      <button
        onClick={onThemeToggle}
        className={cn(
          "absolute top-5 right-5 p-2.5 rounded-xl transition-all",
          isDark ? "bg-white/5 hover:bg-white/10 text-[#888] hover:text-white"
                 : "bg-black/5 hover:bg-black/10 text-[#888] hover:text-[#111]"
        )}
        title={isDark ? 'Light mode' : 'Dark mode'}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <m.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-[360px] flex flex-col items-center gap-8"
      >
        {}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-[14px] overflow-hidden bg-[var(--accent-main)] shadow-[0_1px_2px_rgba(0,0,0,0.15)] flex items-center justify-center">
            <img src={LOGO_BASE64} alt="Dash⁵" width={56} height={56} className="w-full h-full object-cover" decoding="sync" fetchPriority="high" />
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--text-primary)]">
            Dash⁵
          </h1>
        </div>

        <m.form
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          onSubmit={handleLogin}
          className="w-full space-y-2.5"
        >
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            required
            autoComplete="username"
            autoFocus
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            className={inputClass}
          />

          <AnimatePresence>
            {authError && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2.5 text-[#f87171] bg-red-500/8 border border-red-500/15 px-3 py-2.5 rounded-xl"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-[13px]">{authError}</span>
              </m.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full h-11 mt-1 bg-[var(--accent-main)] hover:brightness-110 active:opacity-70 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[14px]"
          >
            {loginLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><span>Masuk</span><LogIn className="w-4 h-4" /></>
            }
          </button>
        </m.form>
      </m.div>

      <p className="absolute bottom-6 text-[11px] opacity-50 text-[var(--text-muted)]">
        Dash⁵ · AI Agent v2.0
      </p>
    </div>
  );
}
