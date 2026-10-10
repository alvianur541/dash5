import { useEffect, useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthProvider';

const INPUT_CLASS = 'w-full px-3 py-2.5 rounded-xl text-[16px] outline-none bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-main)]/50 transition-colors';

function pwErrorText(msg = ''): string {
  if (/different from the old/i.test(msg)) return 'Password baru harus berbeda dari password lama.';
  if (/weak|at least|characters/i.test(msg)) return 'Password terlalu lemah. Pakai minimal 6 karakter, campur huruf dan angka.';
  if (/network|fetch/i.test(msg)) return 'Gagal terhubung ke server. Cek koneksi kamu.';
  if (/session|jwt|expired/i.test(msg)) return 'Sesi login habis. Keluar lalu masuk lagi, kemudian ulangi.';
  return 'Gagal ganti password. Coba lagi.';
}

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const isDemo = user?.isDemoAccount === true;
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const close = () => {
    if (loading) return;
    setPwNew(''); setPwConfirm(''); setError(null); setSuccess(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemo) return;
    setError(null);
    if (pwNew.length < 6) { setError('Password minimal 6 karakter.'); return; }
    if (pwNew !== pwConfirm) { setError('Password tidak cocok.'); return; }
    if (!supabase) { setError('Layanan tidak tersedia.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwNew });
    setLoading(false);
    if (err) { setError(pwErrorText(err.message)); return; }
    setSuccess(true);
    setTimeout(() => { setPwNew(''); setPwConfirm(''); setSuccess(false); onClose(); }, 1500);
  };

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="vv-fill z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={close}
        >
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label="Ganti Password"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[var(--text-primary)] font-heading font-semibold text-[17px] mb-4">Ganti Password</p>
            {isDemo ? (
              <div className="space-y-3 text-[13px] text-[var(--text-secondary)]">
                <p>Akun demo tidak bisa ubah password.</p>
                <button type="button" onClick={close}>Tutup</button>
              </div>
            ) : success ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
                <p className="text-[13px] text-[var(--text-secondary)]">Password berhasil diubah!</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-2.5">
                <input
                  type="password"
                  value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  placeholder="Password baru"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  autoFocus
                  className={INPUT_CLASS}
                />
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  placeholder="Konfirmasi password"
                  required
                  autoComplete="new-password"
                  className={INPUT_CLASS}
                />
                {error && <p role="alert" className="text-[12px] text-[var(--status-danger)]">{error}</p>}
                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 h-10 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-10 rounded-xl bg-[var(--accent-main)] hover:brightness-110 text-white text-[13px] font-semibold transition-all disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : 'Simpan'}
                  </button>
                </div>
              </form>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
