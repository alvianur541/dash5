
import { useState, useEffect } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Mail, MessageCircleQuestion, BookOpen, Wrench, ExternalLink, Database, Loader2 } from 'lucide-react';
import { fetchDocumentCatalog, CatalogEntry } from '../services/supabase';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

const FAQS = [
  {
    q: 'Pertanyaan apa saja yang bisa diajukan?',
    a: 'Dash⁵ dirancang untuk pertanyaan teknis alat berat Hitachi/KCM: analisa gejala kerusakan, arti fault code, troubleshooting sistem hydraulic/electrical/engine, spec detail komponen, kapasitas fluida, prosedur pengecekan, part number, harga promo jika tersedia, dan daftar parts service berkala.',
  },
  {
    q: 'Contoh pertanyaan yang ideal seperti apa?',
    a: 'Gunakan format yang spesifik: sebut model unit, gejala, komponen, kondisi kejadian, atau fault code. Contoh: "ZX200-5G hydraulic power lemah saat arm in", "spec main pump pressure ZX48U-5A", "fault code 11006-2 artinya apa?", atau "PN hydraulic filter service 1000 jam".',
  },
  {
    q: 'Apa batasan pertanyaan yang bisa diajukan?',
    a: 'Dash⁵ tidak ditujukan untuk pertanyaan umum di luar technical support alat berat, seperti berita, cuaca, hiburan, resep, atau topik non-unit. Dash⁵ juga tidak melakukan pemesanan parts, klaim warranty, keputusan komersial, atau instruksi kerja yang tidak memiliki dasar data manual.',
  },
  {
    q: 'Apa limitasi jawaban Dash⁵?',
    a: 'Jawaban difilter berdasarkan model unit yang dipilih. Dash⁵ tidak menebak PN, torque, pressure, kapasitas, harga, atau prosedur yang tidak ada di data. Jika informasi belum tersedia, Dash⁵ akan menyebutkan keterbatasannya dan menyarankan verifikasi ke manual fisik atau referensi internal.',
  },
  {
    q: 'Data apa yang digunakan Dash⁵?',
    a: 'Dash⁵ menggunakan data manual dan katalog yang sudah di-ingest per model unit: Technical Manual, Workshop Manual, Engine Manual, Operator Manual, Hydraulic Circuit Diagram, Parts Catalog, Engine Parts Catalog, CPM, dan data promo parts jika tersedia.',
  },
  {
    q: 'Apakah Dash⁵ bisa membaca gambar fault code?',
    a: 'Ya. Lampirkan foto layar monitor unit. Dash⁵ akan mengekstrak fault code yang terlihat, mencocokkan ke data manual, lalu memberi analisa per kode.',
  },
  {
    q: 'Apakah riwayat chat tersimpan?',
    a: 'Ya, sesi chat tersimpan otomatis dan bisa dibuka kembali dari panel Riwayat di sidebar.',
  },
];

function CatalogPanel() {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (catalog !== null) return;
    setLoading(true);
    try {
      const data = await fetchDocumentCatalog();
      setCatalog(data);
    } finally {
      setLoading(false);
    }
  };

  const grouped = catalog
    ? catalog.reduce<Record<string, CatalogEntry[]>>((acc, entry) => {
        if (!acc[entry.model]) acc[entry.model] = [];
        acc[entry.model].push(entry);
        return acc;
      }, {})
    : null;

  return (
    <details
      className="group rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] overflow-hidden"
      onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) load(); }}
    >
      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none select-none">
        <span className="text-[13px] font-medium text-[var(--text-primary)] pr-2">
          Data yang digunakan Dash⁵?
        </span>
        <span className="text-[var(--text-muted)] text-[11px] shrink-0 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-3 border-t border-[var(--border-main)] pt-2.5">
        <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed mb-2.5">
          Dash⁵ menggunakan data internal yang sudah di-ingest per model unit. Daftar di bawah menunjukkan kategori dokumen yang tersedia untuk pencarian.
        </p>

        {loading && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={13} className="animate-spin text-[var(--accent-main)]" />
            <span className="text-[12px] text-[var(--text-muted)]">Memuat data...</span>
          </div>
        )}

        {grouped && (
          <div className="space-y-1.5 mt-1">
            {Object.entries(grouped)
              .sort(([a], [b]) => {
                const num = (s: string) => parseInt(s.match(/\d+/)?.[0] ?? '0', 10);
                return num(a) - num(b);
              })
              .map(([model, entries]) => (
              <details key={model} className="group/model rounded-lg border border-[var(--border-main)] overflow-hidden">
                <summary className="flex items-center justify-between px-3 py-1.5 bg-[var(--accent-main)]/6 cursor-pointer list-none select-none">
                  <div className="flex items-center gap-2">
                    <Database size={10} className="text-[var(--accent-main)] shrink-0" />
                    <span className="text-[11.5px] font-bold text-[var(--accent-main)] tracking-wide">{model}</span>
                  </div>
                  <span className="text-[var(--accent-main)]/60 text-[10px] group-open/model:rotate-180 transition-transform duration-200">▾</span>
                </summary>
                <div className="divide-y divide-[var(--border-main)]">
                  {entries.sort((a, b) => a.kategori.localeCompare(b.kategori)).map(({ kategori, count }) => (
                    <div key={kategori} className="px-3 py-1.5 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] shrink-0" />
                      <span className="text-[11.5px] text-[var(--text-secondary)] flex-1 min-w-0 truncate">
                        {kategori.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                      <span className="text-[10.5px] text-[var(--text-muted)] tabular-nums shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function SupportModal({ open, onClose }: SupportModalProps) {
  // Aksesibilitas keyboard: Escape menutup modal (anti-slop R-32)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <m.div
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="w-full sm:max-w-md bg-[var(--bg-card)] border border-[var(--border-main)]
                       rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden
                       sm:mx-4"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-9 h-1 rounded-full bg-[var(--border-main)]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-4 border-b border-[var(--border-main)]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent-main)]/12 flex items-center justify-center shrink-0">
                  <MessageCircleQuestion size={16} className="text-[var(--accent-main)]" />
                </div>
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">Bantuan & Support</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/8 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body — scrollable, no visible scrollbar */}
            <div className="px-4 sm:px-5 py-4 space-y-4 max-h-[72dvh] sm:max-h-[65vh] overflow-y-auto scrollbar-hide">

              {/* Cara Pakai */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <BookOpen size={12} className="text-[var(--text-muted)]" />
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Cara Pakai</p>
                </div>
                <div className="space-y-1.5">
                  {[
                    { icon: '①', text: 'Pilih model unit di sidebar sebelum bertanya' },
                    { icon: '②', text: 'Ketik gejala, nama komponen, atau fault code langsung' },
                    { icon: '③', text: 'Lampirkan foto monitor untuk analisa fault code otomatis' },
                    { icon: '④', text: 'Riwayat chat tersimpan — bisa dibuka kembali kapan saja' },
                  ].map(({ icon, text }) => (
                    <div key={icon} className="flex items-start gap-3 px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-main)]">
                      <span className="text-[13px] text-[var(--accent-main)] font-bold shrink-0 mt-px leading-snug">{icon}</span>
                      <span className="text-[12.5px] text-[var(--text-secondary)] leading-snug">{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAQ */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Wrench size={12} className="text-[var(--text-muted)]" />
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">FAQ</p>
                </div>
                <div className="space-y-1.5">
                  {FAQS.map(({ q, a }) => (
                    <details
                      key={q}
                      className="group rounded-xl border border-[var(--border-main)] bg-[var(--bg-app)] overflow-hidden"
                    >
                      <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none select-none">
                        <span className="text-[12.5px] font-medium text-[var(--text-primary)] pr-2 leading-snug">{q}</span>
                        <span className="text-[var(--text-muted)] text-[11px] shrink-0 group-open:rotate-180 transition-transform duration-200">▾</span>
                      </summary>
                      <div className="px-3 pb-3">
                        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border-main)] pt-2.5">{a}</p>
                      </div>
                    </details>
                  ))}
                  <CatalogPanel />
                </div>
              </div>
            </div>

            {/* Contact footer */}
            <div className="px-4 sm:px-5 py-3.5 border-t border-[var(--border-main)] bg-[var(--bg-app)]">
              <p className="text-[11.5px] text-[var(--text-muted)] mb-2">Hubungi kami untuk saran dan support lainnya:</p>
              <a
                href="mailto:admin@dash5.my.id"
                className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-[var(--accent-main)]/8 border border-[var(--accent-main)]/20 hover:bg-[var(--accent-main)]/14 active:scale-[0.98] transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Mail size={14} className="text-[var(--accent-main)]" />
                  <span className="text-[12.5px] font-medium text-[var(--accent-main)]">admin@dash5.my.id</span>
                </div>
                <ExternalLink size={12} className="text-[var(--accent-main)]/60 group-hover:text-[var(--accent-main)] transition-colors" />
              </a>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
