import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Brain, Sparkles } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/rare-ui/animated-counter";
import { cn } from "@/lib/utils";

export interface ReasoningTrayProps {
  reasoning: string;
  durationSeconds?: number;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * ReasoningTray from Blocks.so (adapted for ArcAI Noir theme).
 * Expandable tray for model reasoning / chain-of-thought with live duration counter and status indicator.
 */
export function ReasoningTray({
  reasoning,
  durationSeconds = 0,
  isStreaming = false,
  defaultExpanded = false,
  className,
}: ReasoningTrayProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!reasoning && !isStreaming) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/40 bg-muted/15 backdrop-blur-md overflow-hidden transition-colors",
        isExpanded && "border-primary/30 bg-muted/25 shadow-sm",
        className
      )}
    >
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          {/* Animated Status Glyph */}
          <div className="relative flex items-center justify-center">
            <Brain className="h-3.5 w-3.5 text-primary" />
            {isStreaming && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            )}
          </div>

          <span className="font-medium text-[11px] uppercase tracking-wider text-foreground/80">
            {isStreaming ? "Thinking..." : "Reasoning process"}
          </span>

          {/* Duration Counter */}
          {durationSeconds > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/80 font-mono">
              · <AnimatedCounter value={Math.round(durationSeconds)} suffix="s" height={16} />
            </span>
          )}
        </div>

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground",
            isExpanded && "rotate-180 text-foreground"
          )}
        />
      </button>

      {/* Expandable Reasoning Body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3 pt-1 text-xs text-muted-foreground/90 font-mono leading-relaxed border-t border-border/20 whitespace-pre-wrap selection:bg-primary/20 max-h-72 overflow-y-auto">
              {reasoning}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-primary animate-pulse align-middle" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
