import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Volume2, RotateCw, GitFork, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AIActionBarProps {
  content: string;
  onCopy?: () => void;
  onReadAloud?: () => void;
  onRetry?: () => void;
  onFork?: () => void;
  onShare?: () => void;
  className?: string;
  isSpeaking?: boolean;
}

/**
 * AIActionBar from Blocks.so (adapted for ArcAI Noir theme).
 * A compact, floating glassmorphism action bar with micro-interactions for AI message responses.
 */
export function AIActionBar({
  content,
  onCopy,
  onReadAloud,
  onRetry,
  onFork,
  onShare,
  className,
  isSpeaking = false,
}: AIActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-1 rounded-full",
        "bg-background/80 backdrop-blur-md border border-border/50 shadow-sm",
        "text-muted-foreground transition-all duration-200",
        className
      )}
    >
      {/* Copy Button with Animated Checkmark */}
      <button
        type="button"
        onClick={handleCopy}
        className="relative p-1.5 rounded-full hover:text-foreground hover:bg-muted/40 transition-colors focus:outline-none"
        title={copied ? "Copied!" : "Copy to clipboard"}
      >
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.div
              key="check"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="text-primary"
            >
              <Check className="h-3.5 w-3.5" />
            </motion.div>
          ) : (
            <motion.div
              key="copy"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Copy className="h-3.5 w-3.5" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Read Aloud Button */}
      {onReadAloud && (
        <button
          type="button"
          onClick={onReadAloud}
          className={cn(
            "p-1.5 rounded-full hover:text-foreground hover:bg-muted/40 transition-colors focus:outline-none",
            isSpeaking && "text-primary bg-primary/10 animate-pulse"
          )}
          title={isSpeaking ? "Stop reading" : "Read aloud"}
        >
          <Volume2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Retry Button */}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="p-1.5 rounded-full hover:text-foreground hover:bg-muted/40 transition-colors focus:outline-none"
          title="Regenerate response"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Fork/Branch to new chat */}
      {onFork && (
        <button
          type="button"
          onClick={onFork}
          className="p-1.5 rounded-full hover:text-foreground hover:bg-muted/40 transition-colors focus:outline-none"
          title="Fork conversation from here"
        >
          <GitFork className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Share Button */}
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          className="p-1.5 rounded-full hover:text-foreground hover:bg-muted/40 transition-colors focus:outline-none"
          title="Share response"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
