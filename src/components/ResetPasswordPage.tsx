
import React, { useState } from 'react';
import { KeyRound, Loader2, CheckCircle2, Sun, Moon } from 'lucide-react';
import { m } from 'motion/react';
import { cn } from '../lib/utils';
import { LOGO_BASE64 } from '../lib/logo';
import { useAuth } from './AuthProvider';

interface ResetPasswordPageProps {
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

export function ResetPasswordPage({ theme, onThemeToggle }: ResetPasswordPageProps) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isDark = theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('Password minimal 6 karakter.'); return; }
    if (password !== confirm) { setError('Password tidak cocok.'); return; }
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Gagal update password.'); return; }
    setSuccess(true);
  };

  return (
    <div className={cn(
      "min-h-screen w-screen flex flex-col items-center justify-center px-4 transition-colors duration-400",
      isDark ? "bg-[#111111]" : "bg-[#F5F4F1]"
    )}>
      <button
        onClick={onThemeToggle}
        className={cn(
          "absolute top-5 right-5 p-2.5 rounded-xl transition-all",
          isDark ? "bg-white/5 hover:bg-white/10 text-[#888] hover:text-white"
                 : "bg-black/5 hover:bg-black/10 text-[#888] hover:text-[#111]"
        )}
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
          <div className="w-14 h-14 rounded-[14px] overflow-hidden bg-[var(--accent-main)] shadow-lg flex items-center justify-center">
            <img src={LOGO_BASE64} alt="Dash⁵" width={56} height={56} className="w-full h-full object-cover" decoding="sync" fetchPriority="high" />
          </div>
          <h1 className={cn("text-[26px] font-bold tracking-tight", isDark ? "text-white" : "text-[#111]")}>
            Dash⁵
          </h1>
          <p className={cn("text-[14px]", isDark ? "text-[#888]" : "text-[#888]")}>
            Buat password baru
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
            <p className={cn("text-[15px] font-semibold text-center", isDark ? "text-white" : "text-[#111]")}>
              Password berhasil diubah!
            </p>
            <p className={cn("text-[13px] text-center", isDark ? "text-[#888]" : "text-[#888]")}>
              Silakan login dengan password baru kamu.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full space-y-2.5">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password baru"
              required
              autoFocus
              className={cn(
                "w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all",
                "focus:ring-2 focus:ring-[var(--accent-main)]/20",
                isDark ? "bg-[#1c1c1c] border border-[#333] text-white placeholder-[#525252] focus:border-[#555]"
                       : "bg-white border border-[#e5e5e5] text-[#111] placeholder-[#bbb] focus:border-[#bbb] shadow-sm"
              )}
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Konfirmasi password baru"
              required
              className={cn(
                "w-full px-4 py-3 rounded-xl text-[14px] outline-none transition-all",
                "focus:ring-2 focus:ring-[var(--accent-main)]/20",
                isDark ? "bg-[#1c1c1c] border border-[#333] text-white placeholder-[#525252] focus:border-[#555]"
                       : "bg-white border border-[#e5e5e5] text-[#111] placeholder-[#bbb] focus:border-[#bbb] shadow-sm"
              )}
            />
            {error && (
              <p className="text-[13px] text-red-400 px-1">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-1 bg-[var(--accent-main)] hover:brightness-110 active:scale-[0.98] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[14px] shadow-lg shadow-[var(--accent-main)]/30"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-4 h-4" /><span>Simpan Password</span></>}
            </button>
          </form>
        )}
      </m.div>

      <p className={cn("absolute bottom-6 text-[11px]", isDark ? "text-[#333]" : "text-[#ccc]")}>
        Dash⁵ · AI Agent v2.0
      </p>
    </div>
  );
}
