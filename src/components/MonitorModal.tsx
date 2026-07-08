import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { m, AnimatePresence } from 'motion/react';
import {
  X, RefreshCw, Loader2, BarChart3, ShieldAlert, Clock, PieChart, BookOpen, User,
  TrendingUp, TrendingDown, FilterX, Package, Wrench, Zap, Split,
} from 'lucide-react';
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
const rp0 = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
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

/** Ikon per sumber data — anchor visual, senada chip-tile di welcome screen. */
function toolIcon(t: string, size = 14) {
  switch (t) {
    case 'search_technical_manual': return <BookOpen size={size} />;
    case 'search_parts_catalog':    return <Package size={size} />;
    case 'search_engine_manual':    return <Wrench size={size} />;
    case 'search_circuit_diagram':  return <Zap size={size} />;
    case 'decompose_query':         return <Split size={size} />;
    default:                        return <Zap size={size} />;
  }
}

const initialOf = (s: string) => (s.trim().charAt(0) || '?').toUpperCase();

/** Avatar inisial — hangat, accent-wash; `solid` untuk state terpilih. */
function Avatar({ name, size = 30, solid = false }: { name: string; size?: number; solid?: boolean }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-semibold shrink-0 transition-colors"
      style={{
        width: size, height: size,
        fontSize: size * 0.42,
        background: solid ? 'var(--accent-main)' : 'color-mix(in srgb, var(--accent-main) 15%, transparent)',
        color: solid ? '#fff' : 'var(--accent-main)',
      }}
    >
      {initialOf(name)}
    </span>
  );
}

type Bucket = { key: string; axis: string; label: string; query: number; tokens: number; idr: number };
type Metric = 'idr' | 'query' | 'token';

/* ── Building blocks ─────────────────────────────────────────────────────── */

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--bg-app)] px-4 py-3.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="text-[19px] font-semibold text-[var(--text-primary)] tabular-nums leading-none mt-1.5">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-1.5">{sub}</p>}
    </div>
  );
}

function Panel({ title, aside, hint, children, className, delay = 0 }: { title: string; aside?: ReactNode; hint?: string; children: ReactNode; className?: string; delay?: number }) {
  return (
    <m.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('rounded-[20px] border border-[var(--border-main)] bg-[var(--bg-app)] p-4 sm:p-5', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {aside && <div className="text-[11px] text-[var(--text-muted)] shrink-0">{aside}</div>}
      </div>
      {hint && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{hint}</p>}
      <div className="mt-4">{children}</div>
    </m.section>
  );
}

/** Segmented control dengan pill aktif yang meluncur (Motion layoutId). */
function Segmented<T extends string>({ id, value, onChange, options }: { id: string; value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-[var(--bg-card)] border border-[var(--border-main)] p-0.5 gap-0.5">
      {options.map(o => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className="relative px-2.5 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap"
        >
          {value === o.v && (
            <m.span
              layoutId={`segpill-${id}`}
              className="absolute inset-0 rounded-md bg-[var(--accent-main)]"
              transition={{ type: 'spring', bounce: 0.18, duration: 0.42 }}
            />
          )}
          <span className={cn('relative z-10 transition-colors', value === o.v ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
            {o.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Sparkline area kecil — bentuk hari/periode dalam satu tarikan garis. */
function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  if (max <= 0) return null;
  const W = 132, H = 40, PAD = 3;
  const xy = points.map((v, i) => [
    (i / (points.length - 1)) * W,
    H - PAD - (v / max) * (H - PAD * 2),
  ]);
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden="true">
      <path d={area} fill="var(--accent-main)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--accent-main)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="3" fill="var(--accent-main)" stroke="var(--bg-app)" strokeWidth="1.5" />
    </svg>
  );
}

/** Donut 2 segmen (input vs output) — hover segmen untuk detail di tengah. */
function CostDonut({ inIdr, outIdr }: { inIdr: number; outIdr: number }) {
  const [seg, setSeg] = useState<'in' | 'out' | null>(null);
  // Arc digambar animasi dari 0 saat mount — hook WAJIB sebelum early-return.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(t);
  }, []);
  const total = inIdr + outIdr;
  if (total <= 0) return <p className="text-[12px] text-[var(--text-muted)]">Belum ada aktivitas.</p>;
  const R = 42, SW = 13, C = 2 * Math.PI * R;
  const GAP = 14; // px sepanjang keliling (2 celah) — lebar karena rounded cap makan SW/2 tiap ujung
  const inLen  = Math.max((inIdr / total) * C - GAP, 0.001);
  const outLen = Math.max(C - (inIdr / total) * C - GAP, 0.001);
  const inPct  = (inIdr / total) * 100;
  const NEUTRAL = 'color-mix(in srgb, var(--text-muted) 42%, transparent)';
  const center = seg === 'in'
    ? { v: rp0(inIdr), l: 'Input' }
    : seg === 'out'
      ? { v: rp0(outIdr), l: 'Output' }
      : { v: rp0(total), l: 'Total' };
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" onMouseLeave={() => setSeg(null)}>
        <svg width="118" height="118" viewBox="0 0 118 118" className="-rotate-90">
          <circle
            cx="59" cy="59" r={R} fill="none"
            stroke="var(--accent-main)"
            strokeWidth={seg === 'in' ? SW + 3 : SW}
            strokeDasharray={drawn ? `${inLen} ${C - inLen}` : `0.001 ${C}`}
            strokeDashoffset={-GAP / 2}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .8s cubic-bezier(.22,1,.36,1), stroke-width .15s', opacity: seg === 'out' ? 0.35 : 1, cursor: 'pointer' }}
            onMouseEnter={() => setSeg('in')}
            onClick={() => setSeg(s => (s === 'in' ? null : 'in'))}
          />
          <circle
            cx="59" cy="59" r={R} fill="none"
            stroke={NEUTRAL}
            strokeWidth={seg === 'out' ? SW + 3 : SW}
            strokeDasharray={drawn ? `${outLen} ${C - outLen}` : `0.001 ${C}`}
            strokeDashoffset={-(inLen + GAP * 1.5)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .8s cubic-bezier(.22,1,.36,1), stroke-width .15s', opacity: seg === 'in' ? 0.35 : 1, cursor: 'pointer' }}
            onMouseEnter={() => setSeg('out')}
            onClick={() => setSeg(s => (s === 'out' ? null : 'out'))}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums leading-tight">{center.v}</span>
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">{center.l}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 min-w-0 flex-1">
        <button type="button" className="text-left" onMouseEnter={() => setSeg('in')} onMouseLeave={() => setSeg(null)}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: 'var(--accent-main)' }} />
            <span className="text-[12.5px] text-[var(--text-primary)] font-medium">Input</span>
            <span className="text-[11px] text-[var(--text-muted)]">context + prompt</span>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] tabular-nums mt-0.5 pl-[18px]">{rp(inIdr)} · {dec2(inPct)}%</p>
        </button>
        <button type="button" className="text-left" onMouseEnter={() => setSeg('out')} onMouseLeave={() => setSeg(null)}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: NEUTRAL }} />
            <span className="text-[12.5px] text-[var(--text-primary)] font-medium">Output</span>
            <span className="text-[11px] text-[var(--text-muted)]">jawaban AI</span>
          </div>
          <p className="text-[12px] text-[var(--text-secondary)] tabular-nums mt-0.5 pl-[18px]">{rp(outIdr)} · {dec2(100 - inPct)}%</p>
        </button>
      </div>
    </div>
  );
}

/** Chart tren — bar interaktif dgn tooltip melayang, gridline, garis rata-rata. */
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
  const activeVals = buckets.map(mval).filter(v => v > 0);
  const avg = activeVals.length >= 2 ? activeVals.reduce((a, v) => a + v, 0) / activeVals.length : 0;

  return (
    <m.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] border border-[var(--border-main)] bg-[var(--bg-app)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Tren Aktivitas</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Arahkan kursor atau sentuh batang untuk rincian.</p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented id="metric" value={metric} onChange={setMetric} options={[{ v: 'idr', label: 'Biaya' }, { v: 'query', label: 'Query' }, { v: 'token', label: 'Token' }]} />
          <Segmented id="gran" value={gran} onChange={setGran} options={[{ v: 'jam', label: 'Jam' }, { v: 'hari', label: 'Hari' }]} />
        </div>
      </div>

      {/* Readout bucket aktif */}
      <div className="flex items-baseline gap-2 mt-4 mb-3">
        <span className="text-[22px] font-semibold text-[var(--text-primary)] tabular-nums leading-none">{ab ? mfmt(ab) : '—'}</span>
        <span className="text-[12px] text-[var(--text-muted)]">
          {ab ? `${ab.label}${hover == null && !emptyDay ? ' · tertinggi' : ''}` : ''}
        </span>
      </div>

      {/* Plot */}
      <div className="relative" onMouseLeave={() => setHover(null)}>
        {/* Gridlines halus */}
        {[0.25, 0.5, 0.75].map(g => (
          <div key={g} className="absolute left-0 right-0 border-t border-[var(--border-main)]/35 pointer-events-none" style={{ bottom: `${g * 100}%` }} />
        ))}
        {/* Garis rata-rata */}
        {avg > 0 && (
          <div className="absolute left-0 right-0 border-t border-dashed border-[var(--text-muted)]/50 pointer-events-none z-10" style={{ bottom: `${(avg / maxV) * 100}%` }}>
            <span className="absolute right-0 -top-[15px] text-[9px] text-[var(--text-muted)] bg-[var(--bg-app)] pl-1.5">rata-rata</span>
          </div>
        )}
        {/* Tooltip melayang — clamp di tepi supaya tidak bikin overflow horizontal */}
        {hover != null && buckets[hover] && (() => {
          const posPct = ((hover + 0.5) / buckets.length) * 100;
          const tx = posPct < 14 ? '0%' : posPct > 86 ? '-100%' : '-50%';
          return (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: `${posPct}%`,
              transform: `translateX(${tx})`,
              bottom: `calc(${Math.min(Math.max((mval(buckets[hover]) / maxV) * 100, 4), 100)}% + 8px)`,
            }}
          >
            <div className="rounded-lg border border-[var(--border-main)] bg-[var(--bg-card)] shadow-lg px-2.5 py-1.5 whitespace-nowrap">
              <p className="text-[10px] text-[var(--text-muted)] leading-tight">{buckets[hover].label}</p>
              <p className="text-[11.5px] font-semibold text-[var(--text-primary)] tabular-nums leading-tight mt-0.5">{mfmt(buckets[hover])}</p>
              <p className="text-[10px] text-[var(--text-muted)] tabular-nums leading-tight mt-0.5">
                {num(buckets[hover].query)} query · {rp0(buckets[hover].idr)}
              </p>
            </div>
          </div>
          );
        })()}
        {/* Bars */}
        <div className="flex items-end gap-[2px] h-[136px]">
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
                aria-label={`${b.label} — ${mfmt(b)}`}
                style={{ opacity: dim ? 0.3 : 1, transition: 'opacity .15s' }}
              >
                <div
                  className="w-full rounded-t-[3px]"
                  style={{
                    height: v > 0 ? `${h}%` : '2px',
                    background: v > 0 ? 'var(--accent-main)' : 'var(--border-main)',
                    transition: 'height .5s cubic-bezier(.22,1,.36,1)',
                  }}
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
          {emptyDay ? 'Belum ada aktivitas hari ini.' : 'Tren harian akan terisi seiring bertambahnya hari pemakaian.'}
        </p>
      )}
    </m.section>
  );
}

/* ── Modal utama ─────────────────────────────────────────────────────────── */

export function MonitorModal({ open, onClose }: MonitorModalProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selTeknisi, setSelTeknisi] = useState<string | null>(null);

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

  useEffect(() => { if (open) { setSelTeknisi(null); load(); } }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const snap = data?.snapshot;
  const pricing = data?.pricing;

  /* Turunan data untuk visual + narasi — dihitung sekali per snapshot */
  const derived = useMemo(() => {
    if (!snap) return null;
    const inTok = snap.totals.input_tokens ?? 0;
    const outTok = snap.totals.output_tokens ?? 0;
    const inIdr = pricing ? (inTok / 1e6) * pricing.inputPerMUsd * pricing.usdToIdr : 0;
    const outIdr = pricing ? (outTok / 1e6) * pricing.outputPerMUsd * pricing.usdToIdr : 0;

    const hourlyB: Bucket[] = (snap.hourly ?? []).map(h => ({
      key: `h${h.jam}`, axis: String(h.jam).padStart(2, '0'), label: `${String(h.jam).padStart(2, '0')}:00 WIB`,
      query: h.query, tokens: h.tokens, idr: h.idr,
    }));
    const dailyB: Bucket[] = (snap.daily ?? []).map(d => ({
      key: d.hari, axis: dayShort(d.hari), label: dayLong(d.hari), query: d.pertanyaan, tokens: d.tokens, idr: d.idr,
    }));

    // Sparkline: pakai tren harian kalau sudah >1 hari; kalau belum, bentuk hari ini per jam (sampai jam aktif terakhir)
    let sparkPts: number[] = [];
    if (dailyB.length > 1) sparkPts = dailyB.map(d => d.idr);
    else {
      const lastActive = hourlyB.reduce((last, b, i) => (b.query > 0 ? i : last), -1);
      if (lastActive >= 1) sparkPts = hourlyB.slice(0, lastActive + 1).map(b => b.idr);
    }

    // Delta vs hari sebelumnya (muncul otomatis begitu ada ≥2 hari data)
    let delta: { pct: number; up: boolean } | null = null;
    if (dailyB.length >= 2) {
      const prev = dailyB[dailyB.length - 2].idr;
      const today = dailyB[dailyB.length - 1].idr;
      if (prev > 0) delta = { pct: Math.abs((today - prev) / prev) * 100, up: today >= prev };
    }

    // Narasi otomatis — kalimat profesional dari pola data
    const insights: { icon: ReactNode; text: string }[] = [];
    const activeHours = hourlyB.filter(b => b.query > 0);
    if (activeHours.length > 0 && snap.today.questions > 0) {
      const peakH = activeHours.reduce((a, b) => (b.query > a.query ? b : a));
      const share = Math.round((peakH.query / snap.today.questions) * 100);
      insights.push({
        icon: <Clock size={13} />,
        text: `Aktivitas terpadat pukul ${peakH.label} — ${num(peakH.query)} query, ${share}% dari volume hari ini.`,
      });
    }
    if (inIdr + outIdr > 0) {
      const pct = Math.round((inIdr / (inIdr + outIdr)) * 100);
      insights.push({
        icon: <PieChart size={13} />,
        text: `Struktur biaya didominasi token input (${pct}%) — bobot terbesar ada di context pencarian manual, bukan panjang jawaban.`,
      });
    }
    const realTools = snap.per_tool.filter(t => t.tool !== '(tanpa tool)');
    if (realTools.length > 0) {
      const top = realTools.reduce((a, b) => (b.kali > a.kali ? b : a));
      insights.push({
        icon: <BookOpen size={13} />,
        text: `${toolLabel(top.tool)} menjadi rujukan tersering — ${num(top.kali)} kali, dengan total biaya ${rp0(top.idr)}.`,
      });
    }
    if (snap.per_user.length > 1 && snap.totals.idr > 0) {
      const top = snap.per_user[0];
      insights.push({
        icon: <User size={13} />,
        text: `${top.teknisi} menyumbang ${Math.round((top.idr / snap.totals.idr) * 100)}% dari total biaya periode berjalan.`,
      });
    }

    return { inIdr, outIdr, hourlyB, dailyB, sparkPts, delta, insights };
  }, [snap, pricing]);

  const filteredRecent = useMemo(() => {
    if (!snap) return [];
    return selTeknisi ? snap.recent.filter(r => r.teknisi === selTeknisi) : snap.recent;
  }, [snap, selTeknisi]);

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
            className="w-full sm:max-w-4xl bg-[var(--bg-card)] border border-[var(--border-main)]
                       rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden sm:mx-4 flex flex-col
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

              {snap && derived && !error && (
                <div className="space-y-4">
                  {/* ── Hero ── */}
                  <m.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                    className="rounded-[20px] border border-[var(--border-main)] overflow-hidden"
                  >
                    <div
                      className="px-5 pt-4 pb-5 flex items-end justify-between gap-4"
                      style={{ background: 'linear-gradient(150deg, color-mix(in srgb, var(--accent-main) 10%, var(--bg-app)) 0%, var(--bg-app) 68%)' }}
                    >
                      <div className="min-w-0">
                        <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Total biaya · periode berjalan</p>
                        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mt-2">
                          <span className="text-[34px] sm:text-[38px] leading-none font-semibold tracking-[-0.02em] text-[var(--accent-main)] tabular-nums">{rp(snap.totals.idr)}</span>
                          {derived.delta && (
                            <span className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--text-secondary)] tabular-nums mb-0.5">
                              {derived.delta.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {dec2(derived.delta.pct)}% vs kemarin
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[var(--text-muted)] tabular-nums mt-1.5">
                          setara ${dec2(snap.totals.usd)} · {rp(snap.today.idr)} hari ini
                        </p>
                      </div>
                      <div className="shrink-0 hidden sm:flex flex-col items-end gap-1">
                        <Spark points={derived.sparkPts} />
                        {derived.sparkPts.length > 1 && (
                          <span className="text-[9.5px] text-[var(--text-muted)]">
                            {derived.dailyB.length > 1 ? 'biaya per hari' : 'biaya per jam · hari ini'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--border-main)] border-t border-[var(--border-main)]">
                      <Stat label="Total Query" value={num(snap.totals.questions)} sub={`${num(snap.today.questions)} hari ini`} />
                      <Stat label="Token Terpakai" value={num(snap.totals.tokens)} sub={`${num(snap.totals.questions ? snap.totals.tokens / snap.totals.questions : 0)}/query`} />
                      <Stat label="Teknisi Aktif" value={num(snap.totals.technicians)} sub={`dari ${num(snap.census.niks)} terdaftar`} />
                      <Stat label="Biaya / Query" value={rp(snap.totals.questions ? snap.totals.idr / snap.totals.questions : 0)} sub="rata-rata periode" />
                    </div>
                  </m.section>

                  {/* ── Sorotan (narasi otomatis) ── */}
                  {derived.insights.length > 0 && (
                    <m.section
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.38, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                      className="rounded-[20px] border border-[var(--border-main)] bg-[var(--bg-app)] p-4 sm:p-5"
                    >
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3.5">Sorotan</h3>
                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                        {derived.insights.map((ins, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <span
                              className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0"
                              style={{ background: 'color-mix(in srgb, var(--accent-main) 13%, transparent)', color: 'var(--accent-main)' }}
                            >
                              {ins.icon}
                            </span>
                            <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed tabular-nums pt-0.5">{ins.text}</p>
                          </div>
                        ))}
                      </div>
                    </m.section>
                  )}

                  {/* ── Tren interaktif ── */}
                  <TrendChart hourly={derived.hourlyB} daily={derived.dailyB} />

                  {/* ── Teknisi (drill-down) + Donut komposisi ── */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Panel title="Biaya per Teknisi" aside="urut biaya" hint="Klik nama untuk menyaring Aktivitas Terbaru." delay={0.14}>
                      <div className="flex flex-col gap-1">
                        {snap.per_user.map(u => {
                          const share = snap.totals.idr > 0 ? (u.idr / snap.totals.idr) * 100 : 0;
                          const maxIdr = Math.max(1, ...snap.per_user.map(x => x.idr));
                          const isSel = selTeknisi === u.teknisi;
                          return (
                            <button
                              key={u.teknisi}
                              type="button"
                              onClick={() => setSelTeknisi(isSel ? null : u.teknisi)}
                              aria-pressed={isSel}
                              className={cn(
                                'flex items-center gap-3 text-left rounded-xl px-2.5 py-2 -mx-1 transition-colors',
                                isSel ? 'bg-[var(--accent-main)]/[0.08]' : 'hover:bg-[var(--accent-main)]/[0.04]',
                              )}
                            >
                              <Avatar name={u.teknisi} solid={isSel} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                  <span className={cn('text-[13px] truncate', isSel ? 'font-semibold text-[var(--accent-main)]' : 'text-[var(--text-primary)]')}>
                                    {u.teknisi}
                                  </span>
                                  <span className="text-[12.5px] font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
                                    {rp(u.idr)}<span className="text-[var(--text-muted)] font-normal"> · {num(u.pertanyaan)} query · {share.toFixed(0)}%</span>
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--border-main)]/45 overflow-hidden">
                                  <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                                    style={{ width: `${Math.max((u.idr / maxIdr) * 100, 2)}%`, background: 'var(--accent-main)' }} />
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        {snap.per_user.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Belum ada aktivitas.</p>}
                      </div>
                    </Panel>

                    <Panel title="Komposisi Biaya" aside="input vs output" hint="Arahkan kursor ke segmen untuk rincian." delay={0.18}>
                      <CostDonut inIdr={derived.inIdr} outIdr={derived.outIdr} />
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-4 pt-3 border-t border-[var(--border-main)]/60 tabular-nums">
                        {num(snap.totals.input_tokens)} token input · {num(snap.totals.output_tokens)} token output. Tarif output {pricing ? `${(pricing.outputPerMUsd / pricing.inputPerMUsd).toFixed(0)}×` : ''} lebih tinggi, namun volume input yang menentukan total biaya.
                      </p>
                    </Panel>
                  </div>

                  {/* ── Sumber data + cakupan ── */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Panel title="Sumber Data Terpakai" aside="frekuensi · biaya" delay={0.22}>
                      <div className="flex flex-col gap-3">
                        {snap.per_tool.map(t => {
                          const maxTool = Math.max(1, ...snap.per_tool.map(x => x.kali));
                          return (
                            <div key={t.tool} className="flex items-center gap-3">
                              <span
                                className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
                                style={{ background: 'color-mix(in srgb, var(--text-muted) 12%, transparent)', color: 'var(--text-secondary)' }}
                              >
                                {toolIcon(t.tool, 15)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                  <span className="text-[13px] text-[var(--text-primary)] truncate">{toolLabel(t.tool)}</span>
                                  <span className="text-[12.5px] font-semibold text-[var(--text-primary)] tabular-nums shrink-0">
                                    {num(t.kali)}×<span className="text-[var(--text-muted)] font-normal"> · {rp0(t.idr)}</span>
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--border-main)]/45 overflow-hidden">
                                  <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                                    style={{ width: `${Math.max((t.kali / maxTool) * 100, 2)}%`, background: 'color-mix(in srgb, var(--text-muted) 45%, transparent)' }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {snap.per_tool.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Belum ada aktivitas.</p>}
                      </div>
                    </Panel>

                    <Panel title="Cakupan Sistem" delay={0.26}>
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

                  {/* ── Aktivitas terbaru (terfilter drill-down) ── */}
                  <Panel
                    title="Aktivitas Terbaru"
                    delay={0.3}
                    aside={
                      selTeknisi ? (
                        <button
                          type="button"
                          onClick={() => setSelTeknisi(null)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--accent-main)]/[0.08] text-[var(--accent-main)] font-medium hover:bg-[var(--accent-main)]/[0.14] transition-colors"
                        >
                          {selTeknisi}
                          <FilterX size={11} />
                        </button>
                      ) : (
                        `${snap.recent.length} query terakhir`
                      )
                    }
                  >
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
                          {filteredRecent.map((r, i) => (
                            <tr key={i} className="border-t border-[var(--border-main)]/50 hover:bg-[var(--accent-main)]/[0.045] transition-colors">
                              <td className="py-2.5 pr-3 text-[var(--text-muted)] tabular-nums whitespace-nowrap">{dt(r.created_at)}</td>
                              <td className="py-2.5 pr-3 whitespace-nowrap">
                                <span className="flex items-center gap-2">
                                  <Avatar name={r.teknisi} size={20} />
                                  <span className="text-[var(--text-primary)] font-medium">{r.teknisi}</span>
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-[var(--text-secondary)] whitespace-nowrap">
                                {(r.tools_used && r.tools_used.length) ? r.tools_used.map(toolShort).join(', ') : <span className="text-[var(--text-muted)]">Langsung</span>}
                              </td>
                              <td className="py-2.5 pr-3 text-right text-[var(--text-secondary)] tabular-nums whitespace-nowrap">{num(r.tokens)}</td>
                              <td className="py-2.5 text-right text-[var(--text-primary)] font-semibold tabular-nums whitespace-nowrap">{rp(r.idr)}</td>
                            </tr>
                          ))}
                          {filteredRecent.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-[12px] text-[var(--text-muted)]">
                                Tidak ada aktivitas {selTeknisi ? `dari ${selTeknisi} ` : ''}di daftar terbaru.
                              </td>
                            </tr>
                          )}
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
