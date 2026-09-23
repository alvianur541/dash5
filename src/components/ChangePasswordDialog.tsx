import { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabase';

const INPUT_CLASS = 'w-full px-3 py-2.5 rounded-xl text-[13px] outline-none bg-[var(--bg-app)] border border-[var(--border-main)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent-main)]/50 transition-colors';

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pwNew.length < 6) { setError('Password minimal 6 karakter.'); return; }
    if (pwNew !== pwConfirm) { setError('Password tidak cocok.'); return; }
    if (!supabase) { setError('Layanan tidak tersedia.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwNew });
    setLoading(false);
    if (err) { setError(err.message || 'Gagal ganti password.'); return; }
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
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[320px] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-4">Ganti Password</p>
            {success ? (
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
                  autoFocus
                  className={INPUT_CLASS}
                />
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  placeholder="Konfirmasi password"
                  required
                  className={INPUT_CLASS}
                />
                {error && <p className="text-[12px] text-red-400">{error}</p>}
                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 h-9 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-9 rounded-xl bg-[var(--accent-main)] hover:brightness-110 text-white text-[13px] font-semibold transition-all disabled:opacity-50 flex items-center justify-center"
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
