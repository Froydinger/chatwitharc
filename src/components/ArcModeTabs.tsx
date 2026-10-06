import { cn } from '@/lib/utils';

type ArcModeTabsProps = {
  onChat: () => void;
  onBuild: () => void;
  className?: string;
  buildLoading?: boolean;
};

/** Build is navigation; Work remains an explicit composer choice. */
export function ArcModeTabs({ onChat, onBuild, className, buildLoading = false }: ArcModeTabsProps) {
  return (
    <div className={cn('t-tabs arc-mode-tabs w-[min(11rem,calc(100vw-2rem))]', className)}
      data-active="ask" role="group" aria-label="Chat or Build">
      <span className="t-tabs-pill" aria-hidden="true" />
      <button type="button" className="t-tab" aria-pressed onClick={onChat}>Chat</button>
      <button type="button" className="t-tab" title={buildLoading ? "Checking builder access" : "Open App Builder"} disabled={buildLoading} aria-busy={buildLoading} onClick={onBuild}>Build</button>
    </div>
  );
}
