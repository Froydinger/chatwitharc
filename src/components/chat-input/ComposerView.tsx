import type { ReactNode, RefObject } from 'react';
import { cn } from '@/lib/utils';

/** Layout only. Slots retain their existing refs, keys and handlers. The entry
 * point owns drafts, attachments, entitlements and every submission effect. */
export function ComposerView({ inputBarRef, active, voiceActive, onFocusRequest, menu, field, actions, footer }: {
  inputBarRef: RefObject<HTMLDivElement>;
  active: boolean;
  voiceActive: boolean;
  onFocusRequest: () => void;
  menu: ReactNode;
  field: ReactNode;
  actions: ReactNode;
  /** Opt-in Workspace row; omission retains the legacy DOM. */
  footer?: ReactNode;
}) {
  return (
    <div
      ref={inputBarRef}
      className={cn(
        'relative flex max-h-[360px] origin-bottom flex-col gap-2 p-0.5 transition-all duration-300 ease-out cursor-text',
        footer != null && 'workspace-live-composer',
        active ? 'opacity-100' : 'opacity-95',
        voiceActive && 'max-h-0 translate-y-3 scale-95 overflow-hidden p-0 opacity-0 pointer-events-none select-none',
      )}
      aria-hidden={voiceActive}
      onClick={event => {
        if ((event.target as HTMLElement).closest('button, input, a, [role="button"]')) return;
        onFocusRequest();
      }}
    >
      {footer != null ? <>
        <div className="ws-live-composer-top">{field}{actions}</div>
        <div className="ws-live-composer-bottom">{menu}{footer}</div>
      </> : <div className="flex items-end gap-2 relative">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="relative flex items-center gap-2">
            {menu}
            {field}
          </div>
        </div>
        {actions}
      </div>}
    </div>
  );
}
