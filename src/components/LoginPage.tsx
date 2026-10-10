
import React, { useState } from 'react';
import { AlertCircle, LogIn, Loader2, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';
import { DemoBanner } from './DemoBanner';



interface LoginPageProps {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

export function LoginPage({ theme, onThemeToggle }: LoginPageProps) {
  const { login, authError } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);


  const isDark = theme === 'dark';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try { await login(username, password); } finally { setLoginLoading(false); }
  };

  const inputClass = cn(
    "w-full px-4 py-3 rounded-xl text-[16px] outline-none transition-all",
    "bg-[var(--bg-card)] border text-[var(--text-primary)] placeholder-[var(--text-muted)]",
    "focus:ring-2 focus:ring-[var(--accent-main)]/20 focus:border-[var(--accent-main)]/50",
    isDark ? "border-[var(--border-main)]" : "border-black/10 shadow-sm"
  );

  return (
    <div className={cn(
      "relative h-full w-full overflow-y-auto flex flex-col items-center justify-center px-4 bg-[var(--bg-app)]"
    )}>
      <button
        onClick={onThemeToggle}
        className={cn(
          "login-theme-btn p-2.5 rounded-xl transition-all text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          isDark ? "bg-white/5 hover:bg-white/10" : "bg-black/5 hover:bg-black/10"
        )}
        aria-label={isDark ? 'Tema terang' : 'Tema gelap'}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <m.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-[360px] flex flex-col items-center gap-8"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center">
            <span className="login-logo"><img src="/haplogo.png" alt="Hexindo Technical Assistant" className="logo-light h-[56px] w-auto" decoding="sync" fetchPriority="high" /><img src="/hexindo-logo-dark-v5.png" alt="Hexindo Technical Assistant" className="logo-dark h-[68.6px] w-auto" decoding="sync" fetchPriority="high" /></span>
          </div>
          <h1 className="text-[20px] font-bold tracking-tight text-[var(--text-primary)]">
            Hexindo Technical Assistant
          </h1>
        </div>

        <div className="w-full flex flex-col gap-3">
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
              placeholder="NIK atau email"
              aria-label="NIK atau email"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className={inputClass}
            />
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                required
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={cn(inputClass, 'pr-12')}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={showPw ? 'Sembunyikan password' : 'Lihat password'}
                aria-pressed={showPw}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <AnimatePresence>
              {authError && (
                <m.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  role="alert"
                  className="flex items-center gap-2.5 text-[var(--status-danger)] bg-red-500/8 border border-red-500/15 px-3 py-2.5 rounded-xl"
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
            <DemoBanner />
          </m.form>
        </div>
      </m.div>


    </div>
  );
}
