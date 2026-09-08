import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface DigitColumnProps {
  digit: number;
  height?: number;
  damping?: number;
  stiffness?: number;
}

function DigitColumn({ digit, height = 24, damping = 20, stiffness = 160 }: DigitColumnProps) {
  const spring = useSpring(digit, { damping, stiffness });

  useEffect(() => {
    spring.set(digit);
  }, [digit, spring]);

  const y = useTransform(spring, (latest) => -latest * height);

  return (
    <span
      className="inline-block overflow-hidden relative"
      style={{ height, lineHeight: `${height}px` }}
    >
      <motion.span
        style={{ y }}
        className="flex flex-col select-none items-center"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span
            key={n}
            className="flex items-center justify-center font-mono font-medium"
            style={{ height, lineHeight: `${height}px` }}
          >
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export interface AnimatedCounterProps {
  value: number;
  direction?: "up" | "down";
  className?: string;
  prefix?: string;
  suffix?: string;
  height?: number;
  damping?: number;
  stiffness?: number;
}

/**
 * AnimatedCounter from Rare UI (adapted for ArcAI Noir theme).
 * Creates rolling spring digit micro-interactions for tokens, stats, and limits.
 */
export function AnimatedCounter({
  value,
  className,
  prefix = "",
  suffix = "",
  height = 20,
  damping = 22,
  stiffness = 180,
}: AnimatedCounterProps) {
  const safeValue = Math.max(0, Math.floor(isFinite(value) ? value : 0));
  const digits = String(safeValue).split("");

  return (
    <span className={cn("inline-flex items-center font-mono tabular-nums leading-none", className)}>
      {prefix && <span className="mr-0.5 select-none">{prefix}</span>}
      {digits.map((ch, idx) => {
        const num = Number.parseInt(ch, 10);
        if (Number.isNaN(num)) {
          return (
            <span key={idx} className="select-none">
              {ch}
            </span>
          );
        }
        return (
          <DigitColumn
            key={idx}
            digit={num}
            height={height}
            damping={damping}
            stiffness={stiffness}
          />
        );
      })}
      {suffix && <span className="ml-0.5 select-none">{suffix}</span>}
    </span>
  );
}
