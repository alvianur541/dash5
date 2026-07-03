import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { m, AnimatePresence } from 'motion/react';
import {
  X, RefreshCw, Loader2, BarChart3, Coins, MessageSquare, Cpu,
  Users, CalendarDays, Database, ShieldAlert,
} from 'lucide-react';
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
const intFmt = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
const dt = (s: string | null) =>
  s ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s)) : '—';
const clock = (s: string | null) =>
  s ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(s)) : '—';

const TOOL_LABEL: Record<string, string> = {
  search_technical_manual: 'Technical Manual',
  search_parts_catalog: 'Parts Catalog',
  search_engine_manual: 'Engine Manual',
  search_circuit_diagram: 'Circuit Diagram',
  decompose_query: 'Decompose',
  '(tanpa tool)': 'Tanpa tool RAG',
};
const toolLabel = (t: string) =>
  TOOL_LABEL[t] ?? t.replace(/^search_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function Kpi({ icon, label, value, sub, hero }: { icon: ReactNode; label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${hero
      ? 'border-[var(--accent-main)]/30 bg-[var(--accent-main)]/[0.06]'
      : 'border-[var(--border-main)] bg-[var(--bg-app)]'}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={hero ? 'text-[var(--accent-main)]' : 'text-[var(--text-muted)]'}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      </div>
      <p className={`text-[22px] leading-none font-semibold tracking-tight tabular-nums ${hero ? 'text-[var(--accent-main)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] mt-1.5 tabular-nums">{sub}</p>}
    </div>
  );
}

function BarRow({ name, amount, pct, primary, badge }: { name: string; amount: string; pct: number; primary?: boolean; badge?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className={`text-[13px] truncate ${primary ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{name}</span>
        <span className="text-[12.5px] font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
          {amount}{badge && <span className="text-[var(--text-muted)] font-normal"> · {badge}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--border-main)]/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(pct, 1.5)}%`, background: primary
            ? 'linear-gradient(90deg, var(--accent-main), var(--accent-active))'
            : 'linear-gradient(90deg, color-mix(in srgb, var(--accent-main) 55%, transparent), var(--accent-main))' }}
        />
      </div>
    </div>
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
      const res = await fetch(`${PROXY_URL}/v1/dashboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) throw new Error('Halaman monitoring khusus admin.');
      if (res.status === 401) throw new Error('Sesi habis — silakan login ulang.');
      if (!res.ok) throw new Error('Gagal memuat data monitoring.');
      const json = (await res.json()) as DashboardResponse;
      setData(json);
    } catch (e) {
      setError((e as Error)?.message ?? 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

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
                    {snap && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                    <span className="tabular-nums truncate">
                      {snap ? `Live · ${clock(snap.generated_at)} WIB` : 'Data live dari Supabase'}
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
            <div className="px-4 sm:px-5 py-4 overflow-y-auto scrollbar-hide">
              {loading && !snap && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={22} className="animate-spin text-[var(--accent-main)]" />
                  <p className="text-[13px] text-[var(--text-muted)]">Memuat data monitoring…</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
                  <ShieldAlert size={26} className="text-[var(--text-muted)]" />
                  <p className="text-[13px] text-[var(--text-secondary)]">{error}</p>
                  <button
                    onClick={load}
                    className="mt-1 px-4 h-9 rounded-xl bg-[var(--accent-main)] hover:brightness-110 text-white text-[13px] font-semibold transition-all"
                  >
                    Coba lagi
                  </button>
                </div>
              )}

              {snap && !error && (
                <div className="space-y-5">
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <Kpi hero icon={<Coins size={13} />} label="Total Biaya"
                      value={rp(snap.totals.idr)} sub={`≈ $${(snap.totals.usd || 0).toFixed(3)}`} />
                    <Kpi icon={<MessageSquare size={13} />} label="Pertanyaan"
                      value={intFmt(snap.totals.questions)} sub={`${intFmt(snap.today.questions)} hari ini`} />
                    <Kpi icon={<Cpu size={13} />} label="Token"
                      value={intFmt(snap.totals.tokens)} sub={`Ø ${intFmt(avgTok)}/tanya`} />
                    <Kpi icon={<Users size={13} />} label="Teknisi"
                      value={intFmt(snap.totals.technicians)} sub={`dari ${intFmt(snap.census.niks)} NIK`} />
                    <Kpi icon={<CalendarDays size={13} />} label="Hari Ini"
                      value={rp(snap.today.idr)} sub={`${intFmt(snap.today.tokens)} token`} />
                    <Kpi icon={<BarChart3 size={13} />} label="Rata / Tanya"
                      value={rp(avgIdr)} sub={`${intFmt(avgTok)} token`} />
                  </div>

                  {/* Biaya per teknisi */}
                  <section className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4">
                    <div className="flex items-center justify-between mb-3.5">
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Biaya per Teknisi</h3>
                      <span className="text-[11px] text-[var(--text-muted)]">urut termahal</span>
                    </div>
                    <div className="space-y-3">
                      {snap.per_user.map((u, i) => (
                        <BarRow key={u.teknisi} name={u.teknisi} amount={rp(u.idr)}
                          badge={`${intFmt(u.pertanyaan)} tanya`} pct={(u.idr / maxUserIdr) * 100} primary={i === 0} />
                      ))}
                      {snap.per_user.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Belum ada data.</p>}
                    </div>
                  </section>

                  {/* Tool + Sistem */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <section className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4">
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3.5">Pemakaian Tool RAG</h3>
                      <div className="space-y-3">
                        {snap.per_tool.map((t) => (
                          <BarRow key={t.tool} name={toolLabel(t.tool)} amount={`${intFmt(t.kali)}×`}
                            pct={(t.kali / maxTool) * 100} />
                        ))}
                        {snap.per_tool.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Belum ada data.</p>}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4">
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3.5">Ringkasan Sistem</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { icon: <Database size={12} />, v: intFmt(snap.census.docs), l: 'Chunk KB' },
                          { icon: <Cpu size={12} />, v: intFmt(snap.census.models), l: 'Model unit' },
                          { icon: <MessageSquare size={12} />, v: intFmt(snap.census.sessions), l: 'Sesi chat' },
                          { icon: <Users size={12} />, v: intFmt(snap.census.niks), l: 'NIK terdaftar' },
                        ].map(({ icon, v, l }) => (
                          <div key={l} className="rounded-xl border border-[var(--border-main)] px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">{icon}
                              <span className="text-[10px] uppercase tracking-wider">{l}</span></div>
                            <p className="text-[18px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">{v}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  {/* Riwayat terbaru */}
                  <section className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Pertanyaan Terbaru</h3>
                      <span className="text-[11px] text-[var(--text-muted)]">{snap.recent.length} terakhir</span>
                    </div>
                    <div className="overflow-x-auto scrollbar-hide -mx-1">
                      <table className="w-full text-[12.5px] min-w-[440px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] text-left">
                            <th className="font-semibold pb-2 pr-3">Waktu</th>
                            <th className="font-semibold pb-2 pr-3">Teknisi</th>
                            <th className="font-semibold pb-2 pr-3">Tool</th>
                            <th className="font-semibold pb-2 pr-3 text-right">Token</th>
                            <th className="font-semibold pb-2 text-right">Biaya</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snap.recent.map((r, i) => (
                            <tr key={i} className="border-t border-[var(--border-main)]/60">
                              <td className="py-2 pr-3 text-[var(--text-muted)] tabular-nums whitespace-nowrap">{dt(r.created_at)}</td>
                              <td className="py-2 pr-3 text-[var(--text-primary)] font-medium whitespace-nowrap">{r.teknisi}</td>
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {(r.tools_used && r.tools_used.length)
                                  ? r.tools_used.map(t => toolLabel(t).split(' ')[0]).join(', ')
                                  : <span className="text-[var(--text-muted)]">—</span>}
                              </td>
                              <td className="py-2 pr-3 text-right text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{intFmt(r.tokens)}</td>
                              <td className="py-2 text-right text-[var(--text-primary)] font-semibold tabular-nums whitespace-nowrap">{rp(r.idr)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Footer note */}
                  {pricing && (
                    <p className="text-[10.5px] text-[var(--text-muted)] text-center leading-relaxed px-2">
                      Tarif: input ${pricing.inputPerMUsd} · output ${pricing.outputPerMUsd} /1M token · kurs Rp {intFmt(pricing.usdToIdr)}
                      <br />Data live dari <span className="text-[var(--text-secondary)]">usage_logs · chat_sessions · documents</span> — khusus admin.
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
