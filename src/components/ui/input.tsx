import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl glass border border-border/40 px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:glass-glow disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all [&.landing-textarea]:border-0 [&.landing-textarea]:ring-0 [&.landing-textarea]:outline-none [&.landing-textarea]:shadow-none [&.landing-textarea:focus-visible]:ring-0 [&.landing-textarea:focus-visible]:ring-offset-0 [&.landing-textarea:focus]:border-0 [&.landing-textarea:focus]:outline-none [&.landing-textarea:focus]:shadow-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
