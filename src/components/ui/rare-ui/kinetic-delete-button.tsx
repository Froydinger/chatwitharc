import { useState, useRef, useEffect } from "react";
import { motion, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";

export interface KineticDeleteButtonProps {
  onDelete: (e?: React.MouseEvent) => void;
  mode?: "instant" | "lid-hover" | "hold-to-confirm";
  holdDurationMs?: number;
  className?: string;
  size?: number;
  title?: string;
  disabled?: boolean;
}

/**
 * KineticDeleteButton from Rare UI (adapted for ArcAI Noir theme).
 * Features an animated trash lid tilting open on hover, and an optional hold-to-confirm progress ring.
 */
export function KineticDeleteButton({
  onDelete,
  mode = "lid-hover",
  holdDurationMs = 550,
  className,
  size = 15,
  title = "Delete",
  disabled = false,
}: KineticDeleteButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startHold = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    if (mode !== "hold-to-confirm") {
      onDelete(e as unknown as React.MouseEvent);
      return;
    }

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
    };
  }, []);

  const lidAngle = isHovered || holding ? -28 : 0;
  const lidY = isHovered || holding ? -2 : 0;

  return (
    <button
      type="button"
      disabled={disabled}
      title={mode === "hold-to-confirm" ? "Hold to delete" : title}
      onClick={(e) => {
        e.stopPropagation();
        if (mode !== "hold-to-confirm") {
          onDelete(e);
        }
      }}
      onMouseDown={startHold}
      onMouseUp={() => stopHold()}
      onTouchStart={startHold}
      onTouchEnd={() => stopHold()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        stopHold();
      }}
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
    </button>
  );
}
