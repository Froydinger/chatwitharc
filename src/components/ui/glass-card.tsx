import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
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
      bubble: "bubble glass-glow animate-bounce-gentle"
    };

    const glowClass = glow ? "glass-glow" : "";
    const floatClass = float ? "animate-float" : "";

    return (
      <div
        ref={ref}
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
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";

export { GlassCard };