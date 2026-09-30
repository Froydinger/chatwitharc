import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { LiquidMetalOverlay } from "@/components/ui/liquid-metal-overlay"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  metalPreset?: "silver" | "chromatic";
  metalStrength?: number;
};

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "center", sideOffset = 4, children, metalPreset = "silver", metalStrength = 0.25, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "arc-dropdown relative liquid-metal-surface z-50 w-72 rounded-xl glass-panel border border-border/40 p-4 text-foreground shadow-2xl outline-none",
        className
      )}
      {...props}
    >
      <LiquidMetalOverlay preset={metalPreset} strength={metalStrength} />
      {children}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
