import { useEffect, useState } from 'react';
import { Fingerprint, Loader2, CheckCircle2 } from 'lucide-react';
import { m, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthProvider';
import { countPasskeys, registerDevicePasskey } from '../services/passkey';

type Phase = 'idle' | 'busy' | 'done';

export function PasskeyPrompt() {
  const { passkeyPrompt, closePasskeyPrompt } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<number | null>(null);
  const open = passkeyPrompt !== null;
  const isOffer = passkeyPrompt === 'offer';

  useEffect(() => {
    if (!open) return;
    setPhase('idle');
    setError(null);
    setRegistered(null);
    if (!isOffer) countPasskeys().then(setRegistered);
  }, [open, isOffer]);

  const close = () => {
    if (phase === 'busy') return;
    closePasskeyPrompt(isOffer && phase !== 'done');
  };

  const activate = async () => {
    setError(null);
    setPhase('busy');
    const res = await registerDevicePasskey();
    if (res.ok) { setPhase('done'); return; }
    setPhase('idle');
    if (res.message) setError(res.message);
  };

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={close}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl p-5 w-full max-w-[340px] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {phase === 'done' ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <CheckCircle2 className="w-9 h-9 text-green-400" />
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">Passkey aktif</p>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  Lain kali tekan tombol <span className="font-semibold text-[var(--text-primary)]">Passkey</span> di halaman login.
                </p>
                <button
                  onClick={() => closePasskeyPrompt(false)}
                  className="mt-1 w-full h-9 rounded-xl bg-[var(--accent-main)] hover:brightness-110 text-white text-[13px] font-semibold transition-all"
                >
                  Selesai
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-main)]/12 text-[var(--accent-main)]">
                    <Fingerprint size={18} />
                  </span>
                  <p className="text-[15px] font-semibold text-[var(--text-primary)] leading-tight">Masuk lebih cepat dengan passkey</p>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  Lain kali cukup sidik jari, Face ID, atau kunci layar HP ini — tanpa ketik NIK dan password. Password kamu tetap bisa dipakai.
                </p>
                {registered !== null && registered > 0 && (
                  <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                    Akun ini sudah punya {registered} passkey. Tambahkan untuk HP ini kalau belum.
                  </p>
                )}
                <p className="mt-2 text-[12px] text-[var(--text-muted)] leading-relaxed">
                  Aktifkan hanya di HP pribadi — siapa pun yang bisa membuka kunci HP ini bisa masuk ke akunmu.
                </p>
                {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
                <div className="flex gap-2.5 pt-4">
                  <button
                    type="button"
                    onClick={close}
                    disabled={phase === 'busy'}
                    className="flex-1 h-9 rounded-xl border border-[var(--border-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium transition-colors disabled:opacity-50"
                  >
                    {isOffer ? 'Nanti saja' : 'Tutup'}
                  </button>
                  <button
                    type="button"
                    onClick={activate}
                    disabled={phase === 'busy'}
                    className="flex-1 h-9 rounded-xl bg-[var(--accent-main)] hover:brightness-110 text-white text-[13px] font-semibold transition-all disabled:opacity-50 flex items-center justify-center"
                  >
                    {phase === 'busy' ? <Loader2 size={14} className="animate-spin" /> : 'Aktifkan'}
                  </button>
                </div>
              </>
            )}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
