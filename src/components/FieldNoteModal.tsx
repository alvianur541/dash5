import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Check, NotebookPen, Loader2 } from 'lucide-react';
import { UnitModel, KnowledgeGap } from '../types';
import { extractComponent, polishFieldNote, submitFieldNote } from '../services/fieldNotes';

interface FieldNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: UnitModel;
  contributorName: string;
  gap?: KnowledgeGap;
  sourceMessageId?: string;
  sourceQuestion?: string;
  sourceAnswer?: string;
}

type Phase = 'edit' | 'submitting' | 'done';

export function FieldNoteModal({
  isOpen, onClose, model, contributorName, gap, sourceMessageId, sourceQuestion, sourceAnswer,
}: FieldNoteModalProps) {
  const [component, setComponent] = useState('');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>('edit');
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string | null>(null);

  // Reset + pre-fill komponen via AI saat modal dibuka
  useEffect(() => {
    if (!isOpen) return;
    setComponent(''); setNote(''); setPhase('edit'); setError(null); setRejectReason(null); setPolishing(false);
    const q = sourceQuestion ?? gap?.topic ?? '';
    let alive = true;
    if (q) extractComponent(q, model).then(c => { if (alive && c) setComponent(c); }).catch(() => {});
    return () => { alive = false; };
  }, [isOpen, sourceQuestion, gap?.topic, model]);

  const handlePolish = async () => {
    if (!note.trim() || polishing) return;
    setPolishing(true);
    try {
      const cleaned = await polishFieldNote(note, sourceQuestion ?? gap?.topic ?? '', model);
      setNote(cleaned);
    } finally {
      setPolishing(false);
    }
  };

  const handleSubmit = async () => {
    if (note.trim().length < 10) { setError('Tulis catatan minimal 1 kalimat bermakna.'); return; }
    setPhase('submitting'); setError(null); setRejectReason(null);
    const res = await submitFieldNote({
      model,
      contributorName,
      sourceMessageId,
      sourceQuestion: sourceQuestion ?? gap?.topic,
      sourceAnswer,
      gapReason: gap?.reason ?? 'manual',
      component,
      noteContent: note,
    });
    if (res.ok && res.verdict === 'worthy') {
      setPhase('done');
      setTimeout(() => { onClose(); }, 2000);
    } else if (res.ok && res.verdict === 'reject') {
      // Juri AI menilai belum layak — bukan error, kasih alasan & biarkan diperbaiki.
      setPhase('edit');
      setRejectReason(res.reason ?? 'Catatan belum cukup spesifik untuk masuk knowledge base. Tambah detail teknis (gejala, penyebab, langkah) lalu kirim lagi.');
    } else {
      setPhase('edit');
      setError(res.error ?? 'Gagal mengirim. Coba lagi.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // Inline position:fixed (NEVER createPortal — sesuai PWA layout rule)
          style={{ position: 'fixed', inset: 0, zIndex: 50 }}
          className="flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={onClose}
        >
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-2xl w-full max-w-[460px] shadow-2xl flex flex-col max-h-[86dvh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5 border-b border-[var(--border-main)] shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className="shrink-0 grid place-items-center w-7 h-7 rounded-lg"
                  style={{ background: 'color-mix(in srgb, var(--accent-main) 16%, transparent)', color: 'var(--accent-main)' }}
                >
                  <NotebookPen size={15} />
                </span>
                <div className="flex flex-col min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">Catatan Lapangan</p>
                  <p className="text-[10.5px] text-[var(--text-muted)] mt-px truncate">{model} · bagikan ilmu ke teknisi lain</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/8 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                aria-label="Tutup"
              >
                <X size={14} />
              </button>
            </div>

            {phase === 'done' ? (
              /* Success state */
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <m.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="grid place-items-center w-12 h-12 rounded-full"
                  style={{ background: 'var(--accent-main)' }}
                >
                  <Check size={22} color="#fff" strokeWidth={3} />
                </m.span>
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">Tersimpan &amp; langsung aktif!</p>
                <p className="text-[12px] text-[var(--text-muted)] leading-relaxed max-w-[290px]">
                  Catatan kamu lolos kurasi AI dan langsung masuk knowledge base. Teknisi lain yang menanyakan hal serupa akan terbantu ilmu kamu.
                </p>
              </div>
            ) : (
              <>
                {/* Body */}
                <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 flex flex-col gap-3">
                  {/* Konteks gap */}
                  {(sourceQuestion || gap?.topic) && (
                    <div
                      className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed"
                      style={{ background: 'color-mix(in srgb, var(--accent-main) 8%, transparent)', color: 'var(--text-muted)' }}
                    >
                      <span className="text-[var(--text-primary)] font-medium">Belum ada di knowledge base:</span>{' '}
                      "{(sourceQuestion ?? gap?.topic ?? '').slice(0, 160)}"
                    </div>
                  )}

                  {/* Komponen */}
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">Komponen / Sistem</span>
                    <input
                      value={component}
                      onChange={e => setComponent(e.target.value)}
                      placeholder="mis. sistem pendingin engine"
                      className="w-full rounded-lg px-3 py-2 text-[13px] bg-[var(--bg-input,transparent)] border border-[var(--border-main)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-main)] transition-colors"
                    />
                  </label>

                  {/* Catatan */}
                  <label className="flex flex-col gap-1">
                    <span className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">Catatan / trik lapangan</span>
                      <button
                        onClick={handlePolish}
                        disabled={polishing || note.trim().length < 15}
                        className="flex items-center gap-1 text-[10.5px] font-medium text-[var(--accent-main)] disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
                        title="Rapikan tulisan dengan AI (tanpa mengubah fakta)"
                      >
                        {polishing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        {polishing ? 'Merapikan…' : 'Rapikan AI'}
                      </button>
                    </span>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      rows={6}
                      placeholder="Tulis temuan/trik dari lapangan: gejala, penyebab sebenarnya, langkah cek, angka bila tahu. Contoh: 'Swing lambat pas pagi dingin biasanya grease swing bearing kering, bukan pump — cek & lumasi dulu sebelum bongkar.'"
                      className="w-full rounded-lg px-3 py-2 text-[13px] leading-relaxed bg-[var(--bg-input,transparent)] border border-[var(--border-main)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-main)] transition-colors resize-none"
                    />
                  </label>

                  <p className="text-[10.5px] text-[var(--text-muted)] leading-relaxed">
                    Kalau lolos kurasi AI, langsung aktif sebagai <span className="text-[var(--text-primary)]">kontribusi teknisi (belum resmi)</span> — takkan menimpa spesifikasi manual.
                  </p>

                  {rejectReason && (
                    <div
                      className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed"
                      style={{ background: 'color-mix(in srgb, #d9a557 14%, transparent)', color: 'var(--text-primary)' }}
                    >
                      <span className="font-semibold">Belum bisa disimpan.</span> {rejectReason}
                    </div>
                  )}
                  {error && <p className="text-[11.5px] text-red-400">{error}</p>}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-[var(--border-main)] shrink-0">
                  <button
                    onClick={onClose}
                    className="px-3 h-8 rounded-md text-[12px] font-medium text-[var(--text-muted)] hover:bg-white/6 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={phase === 'submitting' || note.trim().length < 10}
                    className="flex items-center gap-1.5 px-3.5 h-8 rounded-md text-[12px] font-semibold bg-[var(--accent-main)] text-white hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {phase === 'submitting' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    {phase === 'submitting' ? 'Mengirim…' : 'Kirim'}
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
