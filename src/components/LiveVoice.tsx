import { Hand, PhoneOff } from 'lucide-react';
import type { LivePhase } from '../hooks/useLiveVoice';

const LABEL: Record<LivePhase, string> = {
  idle: '', connecting: 'Menghubungkan…', listening: 'Silakan bicara…', speaking: 'Menjawab…',
};

export function LiveBar({ phase, unit, onStop, onInterrupt }: { phase: LivePhase; unit: string; onStop: () => void; onInterrupt: () => void }) {
  return (
    <div className="message-input-bar px-4 pt-0 pb-1 md:px-6 md:pt-1 flex flex-col">
      <div className="mx-auto w-full" style={{ maxWidth: 'var(--input-content-max)' }}>
        <div className="live-bar" data-phase={phase} role="status" aria-live="polite">
          <div className="live-eq" aria-hidden="true"><span /><span /><span /><span /><span /></div>
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
