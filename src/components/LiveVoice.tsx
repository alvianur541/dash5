import { useEffect, useRef, type RefObject } from 'react';
import { Hand, PhoneOff } from 'lucide-react';
import type { LivePhase } from '../hooks/useLiveVoice';
import { createLevelSmoother } from '../lib/liveAudio';

const LABEL: Record<LivePhase, string> = {
  idle: '', connecting: 'Menghubungkan…', listening: 'Silakan bicara…', searching: 'Mencari data…', speaking: 'Menjawab…',
};

type Levels = { outLevel: RefObject<() => number>; micLevel: RefObject<number> };

// Small technician mascot: mouth follows the AI voice, ring follows the user's mic.
export function LiveAvatar({ phase, outLevel, micLevel }: { phase: LivePhase } & Levels) {
  const mouth = useRef<SVGRectElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const out = createLevelSmoother(0.55, 0.18, 5), mic = createLevelSmoother(0.5, 0.12, 6);
    let raf = 0;
    const tick = () => {
      const o = out(outLevel.current?.() ?? 0), m = mic(micLevel.current ?? 0);
      const h = 3 + o * 11;
      mouth.current?.setAttribute('height', h.toFixed(1));
      mouth.current?.setAttribute('y', (71 - h / 2).toFixed(1));
      if (ring.current) { ring.current.style.transform = `scale(${(1 + m * 0.22).toFixed(3)})`; ring.current.style.opacity = (0.25 + m * 0.6).toFixed(2); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [outLevel, micLevel]);
  return (
    <div className="live-avatar" data-phase={phase} aria-hidden="true">
      <span ref={ring} className="live-avatar-ring" />
      <svg viewBox="0 0 100 100" className="live-avatar-face">
        <circle cx="50" cy="57" r="35" className="la-head" />
        <path d="M24 37 C24 15 76 15 76 37 Z" className="la-hat" />
        <rect x="17" y="34" width="66" height="6" rx="3" className="la-hat" />
        <rect x="47" y="15" width="6" height="14" rx="3" className="la-hat-ridge" />
        <g className="la-eyes">
          <rect x="36.5" y="50" width="6" height="10" rx="3" className="la-ink" />
          <rect x="57.5" y="50" width="6" height="10" rx="3" className="la-ink" />
        </g>
        <rect ref={mouth} x="42" y="69.5" width="16" height="3" rx="1.5" className="la-ink" />
      </svg>
    </div>
  );
}

export function LiveBar({ phase, unit, onStop, onInterrupt, outLevel, micLevel }: { phase: LivePhase; unit: string; onStop: () => void; onInterrupt: () => void } & Levels) {
  return (
    <div className="message-input-bar px-4 pt-0 pb-1 md:px-6 md:pt-1 flex flex-col">
      <div className="mx-auto w-full" style={{ maxWidth: 'var(--input-content-max)' }}>
        <LiveAvatar phase={phase} outLevel={outLevel} micLevel={micLevel} />
        <div className="live-bar" data-phase={phase} role="status" aria-live="polite">
          <div className="flex-1 min-w-0">
            <div className="live-title">Live <span className="live-unit">· {unit}</span></div>
            <div className="live-status">{LABEL[phase]}</div>
          </div>
          {phase === 'speaking' && (
            <button type="button" onClick={onInterrupt} className="live-cut" aria-label="Sela jawaban">
              <Hand size={15} /><span>Sela</span>
            </button>
          )}
          <button type="button" onClick={onStop} className="live-end" aria-label="Akhiri Live">
            <PhoneOff size={16} /><span>Akhiri</span>
          </button>
        </div>
      </div>
      <div className="safe-area-spacer" />
    </div>
  );
}
