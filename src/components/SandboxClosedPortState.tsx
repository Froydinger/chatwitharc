import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, RefreshCw, Terminal, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SandboxClosedPortStateProps {
  url: string;
  port?: string | number | null;
  onRetry?: () => void;
  className?: string;
  isCompact?: boolean;
}

export function SandboxClosedPortState({
  url,
  port,
  onRetry,
  className,
  isCompact = false,
}: SandboxClosedPortStateProps) {
  const [isPrompting, setIsPrompting] = useState(false);
  const [promptSent, setPromptSent] = useState(false);

  const targetPort = port || '4173';

  const handleRepromptArc = () => {
    setIsPrompting(true);
    setPromptSent(true);

    const promptText = `Please start the preview server on port ${targetPort} in the cloud sandbox (e.g. npm run preview -- --host 0.0.0.0 or npm run dev) so the live app is running and accessible.`;
    
    // Dispatch standard Arc triggerPrompt custom event handled by ChatInput
    window.dispatchEvent(
      new CustomEvent('arcai:triggerPrompt', {
        detail: { prompt: promptText },
      })
    );

    setTimeout(() => {
      setIsPrompting(false);
    }, 2500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex flex-col items-center justify-center text-center p-6 bg-gradient-to-b from-background/90 to-background/95 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-2xl relative overflow-hidden h-full min-h-[360px]",
        className
      )}
    >
      {/* Background ambient glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Status icon with pulse ring */}
      <div className="relative mb-3.5">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
          <Terminal className="h-6 w-6" />
        </div>
        <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500 border-2 border-background"></span>
        </span>
      </div>

      {/* Badges */}
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[11px] font-medium font-mono mb-2">
        <span>Server Offline</span>
        <span className="text-amber-500/60">•</span>
        <span>Port :{targetPort}</span>
      </div>

      {/* Main copy */}
      <h3 className="text-sm sm:text-base font-semibold text-foreground tracking-tight mb-1.5">
        App Server Isn't Running Yet
      </h3>
      <p className="text-xs text-muted-foreground/90 max-w-sm leading-relaxed mb-5">
        The cloud sandbox is active, but the dev or preview server has stopped or hasn't started on port <span className="font-mono text-foreground font-medium">:{targetPort}</span>. Prompt Arc to launch it in the background.
      </p>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 w-full max-w-xs">
        <button
          type="button"
          onClick={handleRepromptArc}
          disabled={isPrompting}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shadow-lg cursor-pointer",
            promptSent
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20"
          )}
        >
          {isPrompting ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Prompting Arc...</span>
            </>
          ) : promptSent ? (
            <>
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Reprompt Arc Again</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Reprompt Arc to Start Server</span>
            </>
          )}
        </button>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            title="Check server status again"
            className="p-2.5 rounded-xl border border-border/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {promptSent && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[11px] text-emerald-500 mt-3 font-medium flex items-center gap-1.5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Prompt sent! Arc is launching your preview server...
        </motion.p>
      )}

      {/* Live Polling Hint */}
      <div className="mt-4 pt-3 border-t border-border/30 w-full flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/60">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
        <span>Auto-connecting as soon as the server answers</span>
      </div>
    </motion.div>
  );
}
