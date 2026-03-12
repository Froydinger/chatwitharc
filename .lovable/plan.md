

# Fix: Animations "Blipping" Repeatedly Across the App

## Problem

Animations replay their entrance (`initial → animate`) every time their parent component re-renders. This causes items to fade/slide in repeatedly — "blipping" — especially when:
1. State changes trigger re-renders (data loading, search filtering, tab switches)
2. List items use staggered `delay` based on index, causing cascading re-animations
3. The `AnimatePresence mode="wait"` on dashboard tab content triggers full exit→enter cycles

## Root Cause

Using `initial` + `animate` on `motion.div` without guarding against re-mounts. Every time React re-renders these components, framer-motion replays the entrance animation from `initial` to `animate`. Sub-components like `ChatCard`, `ImageCard`, `AppListCard`, and the overview stat cards all have `initial={{ opacity: 0 }}` that fires on every render.

## Fix Strategy

**Two-pronged approach:**

### 1. Dashboard Page (`src/pages/DashboardPage.tsx`)
- Add `initial={false}` to the top-level `AnimatePresence` wrapping tab content, so switching tabs doesn't replay entrance animations for content that's already visible
- On sub-components (`ChatCard`, `ImageCard`, `AppListCard`, overview stat cards, memory items), change `initial` to only fire on first mount by using `initial={false}` after the component has mounted, or more practically: remove staggered `delay` from list items and use `initial={false}` on paginated list items (since pagination already implies the user chose to see them — no need to animate each one in)
- For the overview tab's stat cards and sections, keep entrance animations but use `viewport={{ once: true }}` pattern or guard with a ref so they only play once per session

### 2. Sub-components with entrance animations
- `ChatCard`: Remove `initial`/`animate` motion wrapper or set `initial={false}` — these are list items that shouldn't re-animate
- `ImageCard`: Same — remove entrance animation, keep only `whileHover`
- `AppListCard`: Same treatment
- Overview memory items (lines 463-472): Remove `initial`/`animate`

### 3. Header and fixed elements
- The header (`motion.div` line 314), chat input wrapper (line 351), and subscription badge (line 356) all have entrance animations that replay on every render. Add `initial={false}` after first mount or wrap in a "mount once" guard.

### 4. RightPanel sidebar (`src/components/RightPanel.tsx`)
- Replace `layoutId="panel-tab-bubble"` with deterministic positioning (same fix as dashboard tabs) to prevent the bubble from glitching on re-mount

## Specific Changes

**`src/pages/DashboardPage.tsx`:**
- Paginated list items (chats, apps, memories lines ~506, ~722, ~776): Remove `initial`/`animate` from individual `motion.div` wrappers, or convert to plain `div` since they don't need entrance animations after pagination
- `ChatCard`, `ImageCard`, `AppListCard` sub-components: Remove `initial`/`animate`, keep only hover/tap interactions
- Overview stat cards (line 385-402): Use a mounted ref to only animate on first mount
- Header/input/badge wrappers (lines 314, 351, 356): Use a mounted ref or `initial={false}` after first render

**`src/components/RightPanel.tsx`:**
- Replace `layoutId="panel-tab-bubble"` with index-based `style.left` + `motion.animate`, matching the dashboard fix

## Impact
This will eliminate the repeated fade-in "blipping" across the dashboard and sidebar. Animations will play once on initial load, then items will appear instantly on subsequent renders, tab switches, and pagination changes.

