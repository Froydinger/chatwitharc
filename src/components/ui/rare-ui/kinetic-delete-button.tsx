import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KineticDeleteButtonProps {
  onDelete: (e?: React.MouseEvent) => void;
  mode?: "confirm" | "hold-to-confirm" | "instant" | "lid-hover";
  holdDurationMs?: number;
  className?: string;
  size?: number;
  title?: string;
  disabled?: boolean;
}

/**
 * KineticDeleteButton inspired by Rare UI & Blocks.so (adapted for ArcAI Noir theme).
 * Features:
 * 1. Animated trash lid tilting open on hover (kinetic).
 * 2. Animated click-to-confirm pill ("Delete? ✓ ✗") with auto-timeout and click-outside dismissal (default).
 * 3. Optional hold-to-confirm circular progress ring mode.
 */
export function KineticDeleteButton({
  onDelete,
  mode = "confirm",
  holdDurationMs = 550,
  className,
  size = 15,
  title = "Delete",
  disabled = false,
}: KineticDeleteButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const autoResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-reset confirming state after 4 seconds
  useEffect(() => {
    if (isConfirming) {
      if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
      autoResetTimeoutRef.current = setTimeout(() => {
        setIsConfirming(false);
      }, 4000);

      const handleClickOutside = (e: MouseEvent | TouchEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsConfirming(false);
        }
      };

      document.addEventListener("pointerdown", handleClickOutside);
      return () => {
        document.removeEventListener("pointerdown", handleClickOutside);
        if (autoResetTimeoutRef.current) clearTimeout(autoResetTimeoutRef.current);
      };
    }
  }, [isConfirming]);

  const startHold = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || isConfirming) return;
    if (mode !== "hold-to-confirm") return;

    e.preventDefault();
    e.stopPropagation();
    setHolding(true);
    holdStartRef.current = Date.now();

    const update = () => {
      if (!holdStartRef.current) return;
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(1, elapsed / holdDurationMs);
      setProgress(pct);

      if (pct >= 1) {
        setHolding(false);
        setProgress(0);
        holdStartRef.current = null;
        onDelete();
      } else {
        animationFrameRef.current = requestAnimationFrame(update);
      }
    };

    animationFrameRef.current = requestAnimationFrame(update);
  };

  const stopHold = (e?: React.MouseEvent | React.TouchEvent) => {
    if (mode !== "hold-to-confirm") return;
    if (e) {
      e.stopPropagation();
    }
    setHolding(false);
    setProgress(0);
    holdStartRef.current = null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (autoResetTimeoutRef.current) {
        clearTimeout(autoResetTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;

    if (mode === "confirm") {
      setIsConfirming(true);
    } else if (mode === "instant" || mode === "lid-hover") {
      onDelete(e);
    }
  };

  const lidAngle = isHovered || holding ? -28 : 0;
  const lidY = isHovered || holding ? -2 : 0;

  return (
    <div ref={containerRef} className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <AnimatePresence mode="wait" initial={false}>
        {isConfirming ? (
          <motion.div
            key="confirm-pill"
            initial={{ opacity: 0, scale: 0.85, width: 0 }}
            animate={{ opacity: 1, scale: 1, width: "auto" }}
            exit={{ opacity: 0, scale: 0.85, width: 0 }}
            transition={{ type: "spring", stiffness: 450, damping: 28 }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-destructive/15 border border-destructive/35 text-destructive text-xs font-medium shadow-sm backdrop-blur-md z-30"
          >
            <span className="text-[10px] sm:text-[11px] font-semibold whitespace-nowrap pl-0.5">Delete?</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirming(false);
                onDelete(e);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/20 hover:bg-destructive hover:text-destructive-foreground transition-all"
              title="Confirm delete"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirming(false);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-all"
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="trash-button"
            type="button"
            disabled={disabled}
            title={mode === "hold-to-confirm" ? "Hold to delete" : mode === "confirm" ? "Click to delete (confirm required)" : title}
            onClick={handleClick}
            onMouseDown={startHold}
            onMouseUp={() => stopHold()}
            onTouchStart={startHold}
            onTouchEnd={() => stopHold()}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
              setIsHovered(false);
              stopHold();
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "relative inline-flex items-center justify-center rounded-lg p-1.5 transition-colors",
              "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
              holding && "bg-destructive/20 text-destructive shadow-[0_0_12px_hsl(var(--destructive)/0.3)]",
              disabled && "opacity-40 pointer-events-none",
              className
            )}
            aria-label={title}
          >
            {/* SVG Trash with separate Lid & Body for kinetic motion */}
            <svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="overflow-visible select-none pointer-events-none"
            >
              {/* Animated Lid */}
              <motion.g
                animate={{ rotate: lidAngle, y: lidY }}
                transition={{ type: "spring", stiffness: 350, damping: 22 }}
                style={{ originX: "20%", originY: "30%" }}
              >
                {/* Top handle bar */}
                <line x1="4" y1="7" x2="20" y2="7" />
                {/* Lid handle */}
                <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
              </motion.g>

              {/* Trash Can Body */}
              <path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>

            {/* Hold-to-confirm progress circle ring */}
            {mode === "hold-to-confirm" && holding && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none -rotate-90 scale-110"
                viewBox="0 0 36 36"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="100"
                  strokeDashoffset={100 - progress * 100}
                  className="text-destructive transition-all duration-75"
                />
              </svg>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
