import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Loader2, BarChart3, ShieldAlert } from 'lucide-react';
import { getAuthToken } from '../services/supabase';
import { cn } from '../lib/utils';

interface MonitorModalProps {
  open: boolean;
  onClose: () => void;
}

interface Snap {
  generated_at: string;
  totals: { questions: number; technicians: number; tokens: number; input_tokens: number; output_tokens: number; idr: number; usd: number; last_at: string | null };
  today: { questions: number; idr: number; tokens: number };
  hourly: { jam: number; query: number; tokens: number; idr: number }[];
  per_user: { teknisi: string; pertanyaan: number; tokens: number; idr: number; last_at: string }[];
  per_model: { model: string; pertanyaan: number; tokens: number; idr: number }[];
  per_tool: { tool: string; kali: number; idr: number }[];
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
const fixColon = (s: string) => s.replace('.', ':');
const dt = (s: string | null) =>
  s ? fixColon(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s))) : '—';
const jam = (s: string | null) =>
  s ? fixColon(new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date(s))) : '—';
const dayShort = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const dayLong = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const TOOL_LABEL: Record<string, string> = {
  search_technical_manual: 'Technical Manual',
  search_parts_catalog: 'Parts Catalog',
  search_engine_manual: 'Engine Manual',
  search_circuit_diagram: 'Circuit Diagram',
  decompose_query: 'Dekomposisi query',
  '(tanpa tool)': 'Tanpa retrieval',
};
const toolLabel = (t: string) => TOOL_LABEL[t] ?? t.replace(/^search_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const toolShort = (t: string) => (t === '(tanpa tool)' ? 'Langsung' : toolLabel(t).split(' ')[0]);

type Bucket = { key: string; axis: string; label: string; query: number; tokens: number; idr: number };
type Metric = 'idr' | 'query' | 'token';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-app)] px-4 py-3.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="text-[19px] font-semibold text-[var(--text-primary)] tabular-nums leading-none mt-1.5">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-1.5">{sub}</p>}
    </div>
  );
}

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

function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {aside && <div className="text-[11px] text-[var(--text-muted)] shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-[var(--bg-card)] border border-[var(--border-main)] p-0.5 gap-0.5">
      {options.map(o => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn('px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors whitespace-nowrap',
            value === o.v ? 'bg-[var(--accent-main)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Chart tren interaktif — bar per jam / per hari, toggle metrik, readout saat hover. */
function TrendChart({ hourly, daily }: { hourly: Bucket[]; daily: Bucket[] }) {
  const [gran, setGran] = useState<'jam' | 'hari'>('jam');
  const [metric, setMetric] = useState<Metric>('idr');
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { setHover(null); }, [gran]);

  const buckets = gran === 'jam' ? hourly : daily;
  const mval = (b: Bucket) => (metric === 'idr' ? b.idr : metric === 'query' ? b.query : b.tokens);
  const mfmt = (b: Bucket) => (metric === 'idr' ? rp(b.idr) : metric === 'query' ? `${num(b.query)} query` : `${num(b.tokens)} token`);
  const maxV = Math.max(1, ...buckets.map(mval));
  const peak = buckets.length ? buckets.reduce((best, b, i) => (mval(b) > mval(buckets[best]) ? i : best), 0) : 0;
  const active = hover != null && hover < buckets.length ? hover : peak;
  const ab = buckets[active];
  const step = gran === 'jam' ? 6 : Math.max(1, Math.ceil(buckets.length / 8));
  const showAxis = (i: number) => (gran === 'jam' ? i % step === 0 : i % step === 0 || i === buckets.length - 1);
  const emptyDay = gran === 'jam' && buckets.every(b => b.query === 0);

  return (
    <section className="rounded-2xl border border-[var(--border-main)] bg-[var(--bg-app)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Tren Aktivitas</h3>
        <Segmented value={gran} onChange={setGran} options={[{ v: 'jam', label: 'Per jam · hari ini' }, { v: 'hari', label: 'Per hari' }]} />
      </div>

      {/* Metric toggle + readout bucket aktif */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">{ab ? mfmt(ab) : '—'}</span>
            <span className="text-[12px] text-[var(--text-muted)]">{ab ? ab.label : ''}</span>
          </div>
          {ab && (
            <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-1.5">
              {num(ab.query)} query · {num(ab.tokens)} token · {rp(ab.idr)}
            </p>
          )}
        </div>
        <Segmented value={metric} onChange={setMetric} options={[{ v: 'idr', label: 'Biaya' }, { v: 'query', label: 'Query' }, { v: 'token', label: 'Token' }]} />
      </div>

      {/* Bars + garis rata-rata (hanya dari bucket aktif) */}
      <div className="relative">
        {(() => {
          const activeVals = buckets.map(mval).filter(v => v > 0);
          const avg = activeVals.length >= 2 ? activeVals.reduce((a, v) => a + v, 0) / activeVals.length : 0;
          if (!avg) return null;
          return (
            <div
              className="absolute left-0 right-0 border-t border-dashed border-[var(--text-muted)]/45 pointer-events-none z-10"
              style={{ bottom: `${(avg / maxV) * 100}%` }}
            >
              <span className="absolute right-0 -top-[15px] text-[9px] text-[var(--text-muted)] bg-[var(--bg-app)] pl-1.5">
                rata-rata
              </span>
            </div>
          );
        })()}
        <div className="flex items-end gap-[2px] h-[132px]" onMouseLeave={() => setHover(null)}>
          {buckets.map((b, i) => {
            const v = mval(b);
            const h = v > 0 ? Math.max((v / maxV) * 100, 4) : 0;
            const dim = hover != null && hover !== i;
            return (
              <button
                key={b.key}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setHover(i)}
                className="flex-1 h-full flex flex-col justify-end min-w-0 outline-none"
                title={`${b.label} — ${mfmt(b)}`}
                style={{ opacity: dim ? 0.35 : 1, transition: 'opacity .15s' }}
              >
                <div
                  className="w-full rounded-t-[3px]"
                  style={{ height: v > 0 ? `${h}%` : '2px', background: v > 0 ? 'var(--accent-main)' : 'var(--border-main)' }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Axis */}
      <div className="flex gap-[2px] mt-1.5">
        {buckets.map((b, i) => (
          <div key={b.key} className="flex-1 text-center text-[9.5px] text-[var(--text-muted)] tabular-nums truncate min-w-0">
            {showAxis(i) ? b.axis : ''}
          </div>
        ))}
      </div>

      {(emptyDay || (gran === 'hari' && buckets.length < 2)) && (
        <p className="text-[11px] text-[var(--text-muted)] mt-3">
          {emptyDay ? 'Belum ada aktivitas hari ini.' : 'Tren harian terisi seiring bertambahnya hari pemakaian.'}
        </p>
      )}
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
                       max-h-[94dvh] sm:max-h-[90vh]"
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
                <button onClick={load} disabled={loading} title="Muat ulang"
                  className="p-1.5 rounded-lg hover:bg-white/8 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50">
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/8 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
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

              {snap && !error && (() => {
                const maxUserIdr = Math.max(1, ...snap.per_user.map(u => u.idr));
                const maxTool = Math.max(1, ...snap.per_tool.map(t => t.kali));
                const avgIdr = snap.totals.questions ? snap.totals.idr / snap.totals.questions : 0;
                const avgTok = snap.totals.questions ? snap.totals.tokens / snap.totals.questions : 0;
                const hourlyB: Bucket[] = (snap.hourly ?? []).map(h => ({
                  key: `h${h.jam}`, axis: String(h.jam).padStart(2, '0'), label: `${String(h.jam).padStart(2, '0')}:00 WIB`,
                  query: h.query, tokens: h.tokens, idr: h.idr,
                }));
                const dailyB: Bucket[] = (snap.daily ?? []).map(d => ({
                  key: d.hari, axis: dayShort(d.hari), label: dayLong(d.hari), query: d.pertanyaan, tokens: d.tokens, idr: d.idr,
                }));
                const inTok = snap.totals.input_tokens ?? 0;
                const outTok = snap.totals.output_tokens ?? 0;
                const inIdr = pricing ? (inTok / 1e6) * pricing.inputPerMUsd * pricing.usdToIdr : 0;
                const outIdr = pricing ? (outTok / 1e6) * pricing.outputPerMUsd * pricing.usdToIdr : 0;
                const compTot = inIdr + outIdr || 1;
                const inPct = (inIdr / compTot) * 100;
                const outPct = 100 - inPct;

                return (
                  <div className="space-y-4">
                    {/* Ringkasan */}
                    <section className="rounded-2xl border border-[var(--border-main)] overflow-hidden">
                      <div className="bg-[var(--bg-app)] px-5 pt-4 pb-5">
                        <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Total biaya · periode berjalan</p>
                        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mt-2">
                          <span className="text-[32px] sm:text-[34px] leading-none font-semibold tracking-tight text-[var(--accent-main)] tabular-nums">{rp(snap.totals.idr)}</span>
                          <span className="text-[12.5px] text-[var(--text-muted)] mb-0.5 tabular-nums">setara ${dec2(snap.totals.usd)} · {rp(snap.today.idr)} hari ini</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--border-main)] border-t border-[var(--border-main)]">
                        <Stat label="Total Query" value={num(snap.totals.questions)} sub={`${num(snap.today.questions)} hari ini`} />
                        <Stat label="Token Terpakai" value={num(snap.totals.tokens)} sub={`${num(avgTok)}/query`} />
                        <Stat label="Teknisi Aktif" value={num(snap.totals.technicians)} sub={`dari ${num(snap.census.niks)} terdaftar`} />
                        <Stat label="Biaya / Query" value={rp(avgIdr)} sub={`${num(avgTok)} token`} />
                      </div>
                    </section>

                    {/* Tren interaktif */}
                    <TrendChart hourly={hourlyB} daily={dailyB} />

                    {/* Biaya per teknisi + komposisi biaya */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Panel title="Biaya per Teknisi" aside="urut biaya">
                        <div className="flex flex-col gap-3.5">
                          {snap.per_user.map(u => {
                            const share = snap.totals.idr > 0 ? (u.idr / snap.totals.idr) * 100 : 0;
                            return (
                              <Bar key={u.teknisi} name={u.teknisi} value={rp(u.idr)}
                                sub={`${num(u.pertanyaan)} query · ${share.toFixed(0)}%`}
                                pct={(u.idr / maxUserIdr) * 100} />
                            );
                          })}
                          {snap.per_user.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Belum ada aktivitas.</p>}
                        </div>
                      </Panel>

                      <Panel title="Komposisi Biaya" aside="input vs output">
                        <div className="flex gap-[3px] h-2.5 rounded-full overflow-hidden mb-3.5">
                          <div className="rounded-l-full" style={{ width: `${inPct}%`, background: 'var(--accent-main)' }} />
                          <div className="rounded-r-full" style={{ width: `${outPct}%`, background: 'color-mix(in srgb, var(--text-muted) 45%, transparent)' }} />
                        </div>
                        <div className="space-y-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="flex items-center gap-2 text-[12.5px] text-[var(--text-primary)] min-w-0">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: 'var(--accent-main)' }} />
                              Input <span className="text-[var(--text-muted)]">· context + prompt</span>
                            </span>
                            <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums shrink-0">{rp(inIdr)} <span className="text-[var(--text-muted)] font-normal">· {dec2(inPct)}%</span></span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="flex items-center gap-2 text-[12.5px] text-[var(--text-primary)] min-w-0">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: 'color-mix(in srgb, var(--text-muted) 45%, transparent)' }} />
                              Output <span className="text-[var(--text-muted)]">· jawaban</span>
                            </span>
                            <span className="text-[12px] font-semibold text-[var(--text-primary)] tabular-nums shrink-0">{rp(outIdr)} <span className="text-[var(--text-muted)] font-normal">· {dec2(outPct)}%</span></span>
                          </div>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-3.5 pt-3 border-t border-[var(--border-main)]/60">
                          {num(inTok)} token input vs {num(outTok)} token output — biaya didominasi context (RAG + system prompt).
                        </p>
                      </Panel>
                    </div>

                    {/* Sumber data + cakupan */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Panel title="Sumber Data Terpakai" aside="frekuensi · biaya">
                        <div className="flex flex-col gap-3.5">
                          {snap.per_tool.map(t => (
                            <Bar key={t.tool} name={toolLabel(t.tool)} value={`${num(t.kali)}×`} sub={rp(t.idr)} pct={(t.kali / maxTool) * 100} tone="muted" />
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
                              <tr key={i} className="border-t border-[var(--border-main)]/50 hover:bg-[var(--accent-main)]/[0.045] transition-colors">
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
                );
              })()}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
