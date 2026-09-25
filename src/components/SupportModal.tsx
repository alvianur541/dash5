
import { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Mail, MessageCircleQuestion, Download, Wrench, ExternalLink, Database, Loader2, CheckCircle2 } from 'lucide-react';
import { fetchDocumentCatalog, CatalogEntry } from '../services/supabase';
import { cn } from '../lib/utils';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
}

type Platform = 'ios' | 'android' | 'desktop';

const HOST = typeof window !== 'undefined' ? window.location.host : 'dash5.my.id';

const INSTALL_STEPS: Record<Platform, { label: string; steps: string[]; note: string }> = {
  ios: {
    label: 'iPhone / iPad',
    steps: [
      `Buka ${HOST} menggunakan Safari.`,
      'Ketuk tombol Bagikan (ikon kotak dengan panah ke atas) di bar bawah.',
      'Gulir ke bawah, lalu pilih "Tambah ke Layar Utama" (Add to Home Screen).',
      'Ketuk "Tambah". Ikon aplikasi akan muncul di layar utama.',
    ],
    note: 'Aplikasi di layar utama memiliki penyimpanan terpisah dari Safari, sehingga Anda perlu login satu kali lagi di dalam aplikasi.',
  },
  android: {
    label: 'Android',
    steps: [
      `Buka ${HOST} menggunakan Google Chrome.`,
      'Ketuk menu ⋮ di pojok kanan atas.',
      'Pilih "Instal aplikasi" atau "Tambahkan ke layar utama".',
      'Ketuk "Instal". Ikon aplikasi akan muncul di layar utama dan daftar aplikasi.',
    ],
    note: 'Jika opsi instal belum muncul, muat ulang halaman lalu tunggu beberapa detik sebelum membuka menu.',
  },
  desktop: {
    label: 'Laptop / PC',
    steps: [
      `Buka ${HOST} menggunakan Google Chrome atau Microsoft Edge.`,
      'Klik ikon Instal di ujung kanan kolom alamat (ikon monitor dengan tanda panah).',
      'Jika ikon tidak terlihat, buka menu browser lalu pilih "Instal Hexindo Technical Assistant" atau "Aplikasi → Instal situs ini sebagai aplikasi".',
      'Klik "Instal". Aplikasi terbuka di jendela sendiri dan dapat disematkan ke taskbar.',
    ],
    note: 'Aplikasi yang terpasang tetap memperbarui diri secara otomatis setiap kali dibuka.',
  },
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function isInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

const FAQS = [
  {
    q: 'Apa itu Hexindo Technical Assistant?',
    a: 'Hexindo Technical Assistant adalah asisten teknis digital untuk tim service PT Hexindo Adiperkasa. Setiap jawaban disusun dari manual dan katalog resmi Hitachi dan KCM untuk model unit yang sedang dipilih, bukan dari pengetahuan umum internet.',
  },
  {
    q: 'Jenis pertanyaan apa yang dapat diajukan?',
    a: 'Arti dan penanganan fault code, analisa gejala kerusakan, langkah troubleshooting sistem hydraulic, electrical, dan engine, spesifikasi komponen, kapasitas fluida, prosedur pembongkaran dan pemasangan, part number, harga promo parts, serta daftar parts Periodic Maintenance per interval jam kerja.',
  },
  {
    q: 'Bagaimana cara bertanya agar jawabannya tepat?',
    a: 'Pastikan model unit yang dipilih sesuai dengan unit yang ditangani, lalu sebutkan komponen, gejala, kondisi saat gangguan muncul, atau fault code secara spesifik. Contoh: "boom turun sendiri saat engine mati", "fault code 11006-2", "berat travel device", atau "part untuk service 2000 jam".',
  },
  {
    q: 'Apakah foto dapat dianalisa?',
    a: 'Ya. Kirim foto layar monitor untuk membaca fault code, atau foto label dan daftar part untuk mencari part number beserta harganya. Satu foto per pesan, dan Anda dapat menambahkan keterangan agar analisanya lebih terarah.',
  },
  {
    q: 'Seberapa akurat jawabannya?',
    a: 'Hexindo Technical Assistant hanya menyampaikan angka, part number, dan prosedur yang tercantum di dokumen resmi. Jika informasi tidak ditemukan, keterbatasan tersebut disampaikan secara terbuka tanpa perkiraan. Untuk pekerjaan kritis seperti torsi, tekanan, dan setting, cocokkan kembali dengan manual fisik atau plat unit sebelum dikerjakan.',
  },
  {
    q: 'Apa yang berada di luar cakupan?',
    a: 'Unit di luar daftar model yang tersedia, topik non-teknis, pemesanan parts, klaim warranty, dan keputusan komersial. Harga promo bersifat informasi, belum termasuk PPN, dan perlu dikonfirmasi ke Parts Counter sebelum transaksi.',
  },
  {
    q: 'Apakah riwayat percakapan tersimpan?',
    a: 'Ya. Percakapan tersimpan otomatis dan dapat dibuka kembali dari panel History di sidebar, termasuk dari perangkat lain yang login dengan akun yang sama. Percakapan yang dihapus tidak lagi tampil di aplikasi.',
  },
  {
    q: 'Bagaimana jika tidak dapat login?',
    a: 'Password dapat diganti sendiri melalui menu akun di bagian bawah sidebar. Jika lupa password atau akun belum terdaftar, hubungi admin melalui email di bawah.',
  },
];

function InstallGuide() {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const installed = isInstalled();
  const { steps, note } = INSTALL_STEPS[platform];

  return (
    <div className="space-y-2.5">
      {installed && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          <span className="text-[12px] text-[var(--text-secondary)]">Aplikasi sudah terpasang di perangkat ini.</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-app)] border border-[var(--border-main)]">
        {(Object.keys(INSTALL_STEPS) as Platform[]).map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={cn(
              'py-1.5 rounded-lg text-[11.5px] font-medium transition-colors',
              p === platform
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            {INSTALL_STEPS[p].label}
          </button>
        ))}
      </div>

      <ol className="space-y-1.5">
        {steps.map((text, i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-main)]">
            <span className="w-5 h-5 rounded-full bg-[var(--accent-main)]/12 text-[var(--accent-main)] text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="text-[12.5px] text-[var(--text-secondary)] leading-snug">{text}</span>
          </li>
        ))}
      </ol>

      <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed px-1">
        {note} Jika ikon atau tampilan tidak berubah setelah pembaruan, hapus aplikasi dari layar utama lalu pasang ulang.
      </p>
    </div>
  );
}

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
        <span className="text-[12.5px] font-medium text-[var(--text-primary)] pr-2 leading-snug">
          Dokumen apa saja yang menjadi sumber jawaban?
        </span>
        <span className="text-[var(--text-muted)] text-[11px] shrink-0 group-open:rotate-180 transition-transform duration-200">▾</span>
      </summary>
      <div className="px-3 pb-3 border-t border-[var(--border-main)] pt-2.5">
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-2.5">
          Setiap model unit memiliki kumpulan dokumen resmi tersendiri. Pilih model untuk melihat dokumen yang tersedia.
        </p>

        {loading && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={13} className="animate-spin text-[var(--accent-main)]" />
            <span className="text-[12px] text-[var(--text-muted)]">Memuat daftar dokumen...</span>
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
                  {entries.sort((a, b) => a.kategori.localeCompare(b.kategori)).map(({ kategori }) => (
                    <div key={kategori} className="px-3 py-1.5 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] shrink-0" />
                      <span className="text-[11.5px] text-[var(--text-secondary)] flex-1 min-w-0 truncate">
                        {kategori === 'CPM' ? 'Periodic Maintenance' : kategori.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
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
  return (
    <AnimatePresence>
      {open && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="vv-fill z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
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
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-9 h-1 rounded-full bg-[var(--border-main)]" />
            </div>

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

            <div className="px-4 sm:px-5 py-4 space-y-4 max-h-[72dvh] sm:max-h-[65vh] overflow-y-auto scrollbar-hide">

              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Download size={12} className="text-[var(--text-muted)]" />
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Instalasi Aplikasi</p>
                </div>
                <InstallGuide />
              </div>

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
