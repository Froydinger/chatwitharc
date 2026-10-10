import { BoostIcon } from '@/components/BoostIcon';

/** Presentation only. The caller owns the existing entitlement/mode transition. */
export function WorkspaceChatWorkToggle({ mode, onToggle, hasBoost }: {
  mode: 'ask' | 'auto'; onToggle: () => void; hasBoost: boolean;
}) {
  return <div className="ws-mode-switch" role="group" aria-label="Chat or Work">
    <button type="button" aria-pressed={mode === 'ask'} onClick={() => { if (mode !== 'ask') onToggle(); }}>Chat</button>
    <button type="button" aria-label="Work (Boost)" aria-pressed={mode === 'auto'} onClick={() => { if (mode !== 'auto') onToggle(); }}>Work <BoostIcon hasBoost={hasBoost} className="ws-boost-icon" /></button>
  </div>;
}
