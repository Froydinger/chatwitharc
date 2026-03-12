

## Problem

The bottom tab bar indicator (the blue line above the active tab) shifts to the wrong position when navigating back to the dashboard. This is caused by framer-motion's `layoutId` animation system, which can produce incorrect layout calculations on re-mount or when the component renders before layout is stable.

Additionally, the `touch-manipulation` fix may not fully resolve double-tap issues if there are competing event handlers or animation-related re-renders interfering with tap targets.

## Root Cause

1. **`layoutId="tab-indicator"`** — framer-motion measures DOM positions to animate between them. On page transitions or re-renders, it can calculate stale/wrong positions, causing the indicator to appear offset.
2. The indicator is conditionally rendered (`{isActive && <motion.div layoutId=.../>}`), which means on mount it animates FROM wherever framer-motion last saw that layoutId — potentially from a different page or render cycle.

## Fix

**Replace the `layoutId` approach with a deterministic transform-based indicator** that calculates position from the active tab index rather than relying on framer-motion layout measurements.

### Changes to `src/pages/DashboardPage.tsx`

1. Compute the active tab index from the `tabs` array.
2. Replace the per-button conditional `motion.div` with a single absolutely-positioned indicator that uses `translateX` based on the tab index.
3. This eliminates the layout measurement dependency entirely — the position is always correct regardless of mount timing.

```tsx
// Single indicator positioned by index, not layoutId
const activeIndex = tabs.findIndex(t => t.key === activeTab);

// In the tab bar container, render ONE indicator:
<motion.div
  className="absolute -top-1.5 h-0.5 w-6 rounded-full bg-primary"
  animate={{ left: `calc(${activeIndex} * (100% / ${tabs.length}) + (100% / ${tabs.length} / 2) - 12px)` }}
  transition={{ type: "spring", stiffness: 400, damping: 30 }}
/>
```

This approach:
- Never glitches on re-mount or navigation
- Still animates smoothly between tabs
- Removes the fragile `layoutId` dependency

