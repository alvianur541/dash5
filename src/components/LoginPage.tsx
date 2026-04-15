/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertCircle, LogIn, Loader2, Sun, Moon, Wrench } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';

interface LoginPageProps {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

export function LoginPage({ theme, onThemeToggle }: LoginPageProps) {
  const { login, authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isDark = theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await login(username, password);
    setLoading(false);
  };

  return (
    <div className={cn(
      "min-h-screen w-screen flex flex-col items-center justify-center px-4 transition-colors duration-400",
      isDark ? "bg-[#111111]" : "bg-[#F5F4F1]"
    )}>

      {/* ── Theme Toggle ── */}
      <button
        onClick={onThemeToggle}
        className={cn(
          "absolute top-5 right-5 p-2.5 rounded-xl transition-all",
          isDark
            ? "bg-white/5 hover:bg-white/10 text-[#888] hover:text-white"
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
        {/* ── Brand ── */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-[var(--accent-main)] rounded-2xl flex items-center justify-center shadow-lg shadow-[var(--accent-main)]/20">
            <Wrench className="w-7 h-7 text-white" />
          </div>
          <h1 className={cn(
            "text-[26px] font-bold tracking-tight",
            isDark ? "text-white" : "text-[#111]"
          )}>Dash⁵</h1>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="w-full space-y-2.5">
          <input
            id="username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            required
            autoComplete="username"
            autoFocus
            className={cn(
              "w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all",
              "focus:ring-2 focus:ring-[var(--accent-main)]/20",
              isDark
                ? "bg-[#1c1c1c] border border-[#333] text-white placeholder-[#525252] focus:border-[#555]"
                : "bg-white border border-[#e5e5e5] text-[#111] placeholder-[#bbb] focus:border-[#bbb] shadow-sm"
            )}
          />
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            className={cn(
              "w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all",
              "focus:ring-2 focus:ring-[var(--accent-main)]/20",
              isDark
                ? "bg-[#1c1c1c] border border-[#333] text-white placeholder-[#525252] focus:border-[#555]"
                : "bg-white border border-[#e5e5e5] text-[#111] placeholder-[#bbb] focus:border-[#bbb] shadow-sm"
            )}
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
            disabled={loading}
            className="w-full h-11 mt-1 bg-[var(--accent-main)] hover:brightness-110 active:scale-[0.98] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[14px] shadow-lg shadow-[var(--accent-main)]/30"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><span>Masuk</span><LogIn className="w-4 h-4" /></>
            }
          </button>
        </form>
      </m.div>

      {/* ── Footer ── */}
      <p className={cn(
        "absolute bottom-6 text-[11px]",
        isDark ? "text-[#333]" : "text-[#ccc]"
      )}>
        Dash⁵ · AI Agent v2.0
      </p>
    </div>
  );
}
