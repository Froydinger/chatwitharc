import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const glassButtonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 haptic glass glass-glow",
  {
    variants: {
      variant: {
        default: "text-primary-foreground hover:opacity-80 rounded-[var(--radius-xl)]",
        bubble: "bubble-nav-item text-foreground hover:glass-strong rounded-[var(--radius-xl)]",
        ghost: "hover:glass hover:text-foreground rounded-[var(--radius)]",
        glow: "glass-glow animate-glow-pulse text-primary-foreground rounded-[var(--radius-xl)]"
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 px-4 py-2",
        lg: "h-14 px-8 py-4",
        bubble: "h-16 w-16 rounded-full",
        icon: "h-12 w-12"
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  asChild?: boolean;
  ripple?: boolean;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant, size, asChild = false, ripple = true, children, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([]);

    const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!ripple) return;
      
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      const newRipple = { id: Date.now(), x, y };
      setRipples(prev => [...prev, newRipple]);
      
      // Remove ripple after animation
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== newRipple.id));
      }, 600);
    };

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      createRipple(event);
      
      // Haptic feedback simulation
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
      
      onClick?.(event);
    };

    return (
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ 
          type: "spring", 
          damping: 20, 
          stiffness: 400,
          mass: 0.5
        }}
        className="relative"
        style={{
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
          willChange: 'transform'
        }}
      >
        <Comp
          className={cn(glassButtonVariants({ variant, size, className }), "relative overflow-hidden")}
          ref={ref}
          onClick={handleClick}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)'
          }}
          {...props}
        >
          {children}
          
          {/* Ripple Effects */}
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="absolute pointer-events-none bg-white/20 rounded-full animate-ripple"
              style={{
                left: ripple.x - 10,
                top: ripple.y - 10,
                width: 20,
                height: 20,
                backfaceVisibility: 'hidden',
                transform: 'translateZ(0)'
              }}
            />
          ))}
        </Comp>
      </motion.div>
    );
  }
);

GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };