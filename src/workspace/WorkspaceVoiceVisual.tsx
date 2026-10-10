import type { CSSProperties } from 'react';
import type { VoiceStatus } from '@/store/useVoiceModeStore';

const WAVE_HEIGHTS = [12, 22, 34, 21, 46, 31, 54, 31, 46, 21, 34, 22, 12];

/** Decorative only: every wave responds to the existing transport's real level. */
export function WorkspaceVoiceVisual({ status, amplitude, muted, label }: {
  status: VoiceStatus; amplitude: number; muted: boolean; label: string;
}) {
  const level = Number.isFinite(amplitude) ? Math.min(1, Math.max(0, amplitude)) : 0;
  return <div className="ws-voice-stage" data-state={status} data-muted={muted}>
    <div className="ws-voice-visual" aria-hidden="true" style={{ '--voice-level': level } as CSSProperties}>
      <div className="ws-voice-orbit ws-voice-orbit-outer" />
      <div className="ws-voice-orbit ws-voice-orbit-inner" />
      <div className="ws-voice-core"><span className="ws-voice-mark" /></div>
    </div>
    <div className="ws-voice-wave" aria-hidden="true" data-amplitude={level}>
      {WAVE_HEIGHTS.map((height, index) => <span key={index} style={{ height, transform: `scaleY(${0.1 + level * 0.9})` }} />)}
    </div>
    <div className="ws-voice-status" role="status" aria-live="polite" aria-atomic="true">
      <h2>{label}</h2><p>{status === 'connecting' ? 'Connecting to your conversation.' : muted ? 'Your microphone is off. You can still hear Arc.' : 'Talk naturally. You can interrupt anytime.'}</p>
    </div>
  </div>;
}
