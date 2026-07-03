import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Loader2, BarChart3, ShieldAlert } from 'lucide-react';
import { getAuthToken } from '../services/supabase';

interface MonitorModalProps {
  open: boolean;
  onClose: () => void;
}

interface Snap {
  generated_at: string;
  totals: { questions: number; technicians: number; tokens: number; idr: number; usd: number; last_at: string | null };
  today: { questions: number; idr: number; tokens: number };
  per_user: { teknisi: string; pertanyaan: number; tokens: number; idr: number; last_at: string }[];
  per_model: { model: string; pertanyaan: number; tokens: number; idr: number }[];
  per_tool: { tool: string; kali: number }[];
  daily: { hari: string; pertanyaan: number; tokens: number; idr: number }[];
  recent: { created_at: string; teknisi: string; model: string; tokens: number; llm_calls: number; tools_used: string[] | null; idr: number }[];
  census: { docs: number; models: number; sessions: number; session_users: number; niks: number };
}
interface DashboardResponse {
  snapshot: Snap;
  pricing: { inputPerMUsd: number; outputPerMUsd: number; usdToIdr: number };
}

const PROXY_URL = (import.meta.env.VITE_VERTEX_PROXY_URL as string).replace(/\/$/, '');

const rp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const num = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
const dec2 = (n: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const dt = (s: string | null) =>
  s ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s)).replace('.', ':') : '—';
const jam = (s: string | null) =>
  s ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(s)).replace('.', ':') : '—';

const TOOL_LABEL: Record<string, string> = {
  search_technical_manual: 'Technical Manual',
  search_parts_catalog: 'Parts Catalog',
  search_engine_manual: 'Engine Manual',
  search_circuit_diagram: 'Circuit Diagram',
  decompose_query: 'Dekomposisi query',
  '(tanpa tool)': 'Tanpa retrieval',
};
const toolLabel = (t: string) =>
  TOOL_LABEL[t] ?? t.replace(/^search_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const toolShort = (t: string) => (t === '(tanpa tool)' ? 'Langsung' : toolLabel(t).split(' ')[0]);

/** Statistik ringkas — label kalem di atas, angka tebal di bawah. */
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-app)] px-4 py-3.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="text-[19px] font-semibold text-[var(--text-primary)] tabular-nums leading-none mt-1.5">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-1.5">{sub}</p>}
    </div>
  );
}

/** Bar horizontal — satu hue, flat, ujung membulat. tone 'accent' untuk metrik utama. */
function Bar({ name, value, sub, pct, tone = 'accent' }: { name: string; value: string; sub?: string; pct: number; tone?: 'accent' | 'muted' }) {
  const fill = tone === 'accent' ? 'var(--accent-main)' : 'color-mix(in srgb, var(--text-muted) 45%, transparent)';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-[var(--text-primary)] truncate">{name}</span>
        <span className="text-[12.5px] font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
          {value}{sub && <span className="text-[var(--text-muted)] font-normal"> · {sub}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border-main)]/45 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(pct, 2)}%`, background: fill }} />
      </div>
    </div>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {aside && <span className="text-[11px] text-[var(--text-muted)] shrink-0">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function MonitorModal({ open, onClose }: MonitorModalProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${PROXY_URL}/v1/dashboard`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.status === 403) throw new Error('Halaman monitoring khusus admin.');
      if (res.status === 401) throw new Error('Sesi berakhir — silakan masuk kembali.');
      if (!res.ok) throw new Error('Gagal memuat data monitoring.');
      setData((await res.json()) as DashboardResponse);
    } catch (e) {
      setError((e as Error)?.message ?? 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const snap = data?.snapshot;
  const pricing = data?.pricing;
  const maxUserIdr = snap ? Math.max(1, ...snap.per_user.map(u => u.idr)) : 1;
  const maxTool = snap ? Math.max(1, ...snap.per_tool.map(t => t.kali)) : 1;
  const avgIdr = snap && snap.totals.questions ? snap.totals.idr / snap.totals.questions : 0;
  const avgTok = snap && snap.totals.questions ? snap.totals.tokens / snap.totals.questions : 0;

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
            className="w-full sm:max-w-3xl bg-[var(--bg-card)] border border-[var(--border-main)]
                       rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden sm:mx-4 flex flex-col
                       max-h-[94dvh] sm:max-h-[88vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle — mobile */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
              <div className="w-9 h-1 rounded-full bg-[var(--border-main)]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-4 border-b border-[var(--border-main)] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent-main)]/12 flex items-center justify-center shrink-0">
                  <BarChart3 size={16} className="text-[var(--accent-main)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[var(--text-primary)] leading-tight">Monitoring Pemakaian</p>
                  <p className="text-[11px] text-[var(--text-muted)] leading-tight flex items-center gap-1.5 mt-0.5">
                    {snap && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    <span className="tabular-nums truncate">
                      {snap ? `Data langsung · diperbarui ${jam(snap.generated_at)} WIB` : 'Menghubungkan ke Supabase'}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={load}
                  disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-white/8 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                  title="Muat ulang"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/8 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-4 sm:px-5 py-4 sm:py-5 overflow-y-auto scrollbar-hide">
              {loading && !snap && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 size={22} className="animate-spin text-[var(--accent-main)]" />
                  <p className="text-[13px] text-[var(--text-muted)]">Memuat data monitoring…</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                  <ShieldAlert size={26} className="text-[var(--text-muted)]" />
                  <p className="text-[13px] text-[var(--text-secondary)]">{error}</p>
                  <button onClick={load} className="mt-1 px-4 h-9 rounded-xl bg-[var(--accent-main)] hover:brightness-110 text-white text-[13px] font-semibold transition-all">
                    Coba lagi
                  </button>
                </div>
              )}

              {snap && !error && (
                <div className="space-y-4">
                  {/* Ringkasan — hero + stat strip */}
                  <section className="rounded-2xl border border-[var(--border-main)] overflow-hidden">
                    <div className="bg-[var(--bg-app)] px-5 pt-4 pb-5">
                      <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Total biaya · periode berjalan</p>
                      <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mt-2">
                        <span className="text-[32px] sm:text-[34px] leading-none font-semibold tracking-tight text-[var(--accent-main)] tabular-nums">{rp(snap.totals.idr)}</span>
                        <span className="text-[12.5px] text-[var(--text-muted)] mb-0.5 tabular-nums">
                          setara ${dec2(snap.totals.usd)} · {rp(snap.today.idr)} hari ini
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--border-main)] border-t border-[var(--border-main)]">
                      <Stat label="Total Query" value={num(snap.totals.questions)} sub={`${num(snap.today.questions)} hari ini`} />
                      <Stat label="Token Terpakai" value={num(snap.totals.tokens)} sub={`${num(avgTok)}/query`} />
                      <Stat label="Teknisi Aktif" value={num(snap.totals.technicians)} sub={`dari ${num(snap.census.niks)} terdaftar`} />
                      <Stat label="Biaya / Query" value={rp(avgIdr)} sub={`${num(avgTok)} token`} />
                    </div>
                  </section>

                  {/* Biaya per teknisi */}
                  <Panel title="Biaya per Teknisi" aside="diurutkan berdasarkan biaya">
                    <div className="flex flex-col gap-3.5">
                      {snap.per_user.map(u => (
                        <Bar key={u.teknisi} name={u.teknisi} value={rp(u.idr)} sub={`${num(u.pertanyaan)} query`} pct={(u.idr / maxUserIdr) * 100} />
                      ))}
                      {snap.per_user.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Belum ada aktivitas.</p>}
                    </div>
                  </Panel>

                  {/* Sumber data + cakupan sistem */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Panel title="Sumber Data Terpakai" aside="per query">
                      <div className="flex flex-col gap-3.5">
                        {snap.per_tool.map(t => (
                          <Bar key={t.tool} name={toolLabel(t.tool)} value={`${num(t.kali)}×`} pct={(t.kali / maxTool) * 100} tone="muted" />
                        ))}
                        {snap.per_tool.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Belum ada aktivitas.</p>}
                      </div>
                    </Panel>

                    <Panel title="Cakupan Sistem">
                      <div className="grid grid-cols-2 gap-px bg-[var(--border-main)] rounded-xl overflow-hidden border border-[var(--border-main)]">
                        {[
                          { v: num(snap.census.docs), l: 'Dokumen (chunk)' },
                          { v: num(snap.census.models), l: 'Model unit' },
                          { v: num(snap.census.sessions), l: 'Sesi percakapan' },
                          { v: num(snap.census.niks), l: 'Pengguna terdaftar' },
                        ].map(({ v, l }) => (
                          <div key={l} className="bg-[var(--bg-app)] px-3.5 py-3">
                            <p className="text-[19px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">{v}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">{l}</p>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  </div>

                  {/* Aktivitas terbaru */}
                  <Panel title="Aktivitas Terbaru" aside={`${snap.recent.length} query terakhir`}>
                    <div className="overflow-x-auto scrollbar-hide -mx-1">
                      <table className="w-full text-[12.5px] min-w-[460px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)] text-left">
                            <th className="font-medium pb-2.5 pr-3">Waktu</th>
                            <th className="font-medium pb-2.5 pr-3">Teknisi</th>
                            <th className="font-medium pb-2.5 pr-3">Sumber</th>
                            <th className="font-medium pb-2.5 pr-3 text-right">Token</th>
                            <th className="font-medium pb-2.5 text-right">Biaya</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snap.recent.map((r, i) => (
                            <tr key={i} className="border-t border-[var(--border-main)]/50">
                              <td className="py-2.5 pr-3 text-[var(--text-muted)] tabular-nums whitespace-nowrap">{dt(r.created_at)}</td>
                              <td className="py-2.5 pr-3 text-[var(--text-primary)] font-medium whitespace-nowrap">{r.teknisi}</td>
                              <td className="py-2.5 pr-3 text-[var(--text-secondary)] whitespace-nowrap">
                                {(r.tools_used && r.tools_used.length) ? r.tools_used.map(toolShort).join(', ') : <span className="text-[var(--text-muted)]">Langsung</span>}
                              </td>
                              <td className="py-2.5 pr-3 text-right text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{num(r.tokens)}</td>
                              <td className="py-2.5 text-right text-[var(--text-primary)] font-semibold tabular-nums whitespace-nowrap">{rp(r.idr)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>

                  {/* Catatan tarif */}
                  {pricing && (
                    <p className="text-[10.5px] text-[var(--text-muted)] leading-relaxed px-1">
                      Tarif gemini-3.5-flash · input ${dec2(pricing.inputPerMUsd)} / output ${dec2(pricing.outputPerMUsd)} per 1 juta token · kurs Rp {num(pricing.usdToIdr)}. Data langsung dari basis data internal, khusus admin.
                    </p>
                  )}
                </div>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
