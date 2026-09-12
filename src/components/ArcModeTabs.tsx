import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

type ArcModeTabsProps = {
  mode: 'ask' | 'auto';
  available: boolean;
  onChange: (mode: 'ask' | 'auto') => void;
  onUnavailable: () => void;
  className?: string;
};

export function ArcModeTabs({ mode, available, onChange, onUnavailable, className }: ArcModeTabsProps) {
  return (
    <div
      className={cn('t-tabs arc-mode-tabs w-[min(13rem,calc(100vw-2rem))]', className)}
      data-active={mode}
      role="group"
      aria-label="Arc Chat or Arc Work mode"
    >
      <span className="t-tabs-pill" aria-hidden="true" />
      <button
        type="button"
        className="t-tab"
        aria-pressed={mode === 'ask'}
        onClick={() => onChange('ask')}
      >
        Arc Chat
      </button>
      <button
        type="button"
        className="t-tab gap-1"
        aria-pressed={mode === 'auto'}
        title={available ? 'Arc Work keeps running after you leave' : 'Arc Work requires Boost'}
        onClick={() => available ? onChange('auto') : onUnavailable()}
      >
        Arc Work
        {!available && <Crown className="h-3 w-3 text-primary" aria-hidden="true" />}
      </button>
    </div>
  );
}
