import * as React from "react";
import { motion, MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, keyof MotionProps> {
  variant?: 'default' | 'strong' | 'bubble';
  glow?: boolean;
  float?: boolean;
  children?: React.ReactNode;
}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', glow = false, float = false, children, ...props }, ref) => {
    const baseClasses = "relative";
    
    const variantClasses = {
      default: "glass",
      strong: "glass-strong", 
      bubble: "bubble"
    };

    const glowClass = glow ? "glass-glow" : "";
    const floatClass = float ? "animate-float" : "";

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={cn(
          baseClasses,
          variantClasses[variant],
          glowClass,
          floatClass,
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = "GlassCard";

export { GlassCard };