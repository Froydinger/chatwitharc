import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationBellProps {
  count?: number;
  hasUnread?: boolean;
  onClick?: () => void;
  className?: string;
  size?: number;
  animationStyle?: "jiggle" | "pulse" | "bounce" | "none";
}

/**
 * NotificationBell from Rare UI (adapted for ArcAI Noir theme).
 * Features physics-driven rotational bell ringing and spring badge pop.
 */
export function NotificationBell({
  count = 0,
  hasUnread = false,
  onClick,
  className,
  size = 20,
  animationStyle = "jiggle",
}: NotificationBellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const showBadge = (count > 0) || hasUnread;

  const getBellVariants = () => {
    if (animationStyle === "none") return {};
    return {
      idle: {
        rotate: 0,
        transition: { duration: 0.2 },
      },
      ringing: {
        rotate: [0, -14, 12, -10, 8, -4, 0],
        transition: {
          duration: 0.85,
          ease: "easeInOut",
          repeat: hasUnread && !isHovered ? Infinity : 0,
          repeatDelay: 3.5,
        },
      },
    };
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "relative p-2 rounded-full text-foreground/80 hover:text-foreground",
        "transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
        className
      )}
      aria-label={`Notifications ${count > 0 ? `(${count} unread)` : ""}`}
    >
      <motion.div
        variants={getBellVariants()}
        animate={isHovered || (hasUnread && animationStyle === "jiggle") ? "ringing" : "idle"}
        style={{ originX: "50%", originY: "10%" }}
        className="flex items-center justify-center"
      >
        <Bell style={{ width: size, height: size }} />
      </motion.div>

      {/* Spring Pop Badge */}
      <AnimatePresence>
        {showBadge && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 450, damping: 20 }}
            className={cn(
              "absolute top-1.5 right-1.5 flex items-center justify-center",
              "min-w-[15px] h-[15px] px-1 rounded-full",
              "bg-primary text-primary-foreground text-[9px] font-bold leading-none font-mono",
              "border border-background shadow-[0_0_8px_hsl(var(--primary)/0.4)] pointer-events-none"
            )}
          >
            {count > 99 ? "99+" : count > 0 ? count : ""}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
