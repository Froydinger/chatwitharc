

## Changes to Dashboard Overview

### 1. Limit Recent Chats, Apps, Memories to 3 items on all screen sizes
- **Line 388**: Change `allChats.slice(0, isMobile ? 3 : 5)` → `allChats.slice(0, 3)`
- **Line 415**: Apps already shows 3 — no change needed
- **Line 427**: Change `contextBlocks.slice(0, 4)` → `contextBlocks.slice(0, 3)`

### 2. Add a fun fact / actionable advice row below the stats
After the stats grid (line 380), add a small card with a randomly picked fun fact or actionable tip about the user's data. Examples:
- "You've had {X} chats this week — keep the streak going!"
- "Try asking Arc to generate an image of your next project idea"
- "You have {X} memories saved — Arc remembers your preferences"
- "Start a new chat to brainstorm your next app idea"

Rendered as a subtle rounded card with a `Sparkles` icon, picking one tip at random on each mount using `useMemo` with the stats values.

### 3. Different colors for each stat icon
Replace the uniform `text-primary` on stat icons with per-stat colors:
- Chats → blue (`text-blue-400`)
- Images → purple (`text-purple-400`)
- Apps → orange (`text-orange-400`)
- Memories → emerald (`text-emerald-400`)

Also apply matching tinted backgrounds and glows to each stat card instead of the uniform primary gradient.

### Files changed
- `src/pages/DashboardPage.tsx` only

