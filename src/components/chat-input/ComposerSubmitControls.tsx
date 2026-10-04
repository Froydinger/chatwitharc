import type { ReactNode } from 'react';
import { ArrowRight, Square } from 'lucide-react';

/** Presentation only. Request ownership, cancellation and voice permissions stay
 * with the composer; changing button layout cannot start another request. */
export function ComposerSubmitControls({ busy, hasContent, showVoice, showDictation = false, onStop, onSend, children }: {
  busy: boolean;
  hasContent: boolean;
  showVoice: boolean;
  showDictation?: boolean;
  onStop: () => void;
  onSend: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 self-center">
      {!busy && showDictation && children}
      {busy ? (
        <button
          onClick={onStop}
          className="arc-composer-press flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-lg transition-all"
          title="Stop response"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : hasContent ? (
        <button
          onClick={onSend}
          className="arc-composer-press flex items-center justify-center w-9 h-9 rounded-full bg-transparent text-primary hover:text-neon-600 dark:hover:text-neon-400 hover:bg-neon-500/10 transition-all"
          aria-label="Send"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : showVoice && !showDictation ? children : null}
    </div>
  );
}
