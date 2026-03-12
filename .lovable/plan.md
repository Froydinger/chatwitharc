

# Dashboard Button & Layout Refinement

## Problem
1. **Buttons**: Dashboard header buttons (Back to chat, Music, Settings) use `rounded-2xl` with custom styling, while the main chat header uses `Button variant="outline" size="icon"` with `rounded-full glass-shimmer`. They should match.
2. **Layout**: The dashboard content is tightly packed at the top. The new chat screen (image 1) has a spacious, vertically centered layout. The dashboard should adopt similar spacing — more breathing room, content pushed toward center.

## Changes

### 1. Dashboard Header Buttons → Match Main App Style
**File: `src/pages/DashboardPage.tsx`** (lines ~325-358)

Replace the three custom `<button>` elements (Back to chat, Music, Settings) with `<Button variant="outline" size="icon" className="rounded-full glass-shimmer">` wrapped in the same `motion.div` hover/tap animations used in `MobileChatApp.tsx`. This gives them:
- `rounded-full` instead of `rounded-2xl`
- Same glass shimmer effect
- Same size (`h-10 w-10` from `size="icon"`)
- Same hover spring animation

### 2. Spread Out Dashboard Layout
**File: `src/pages/DashboardPage.tsx`** (lines ~307-316)

- Increase vertical spacing in the main container: change `space-y-5 sm:space-y-6` → `space-y-6 sm:space-y-8`
- Increase top padding: change `py-5 sm:py-8` → `py-8 sm:py-12`
- Add more vertical breathing room around the chat input and stats sections
- Center the greeting + input section with more generous top margin so it feels more like the spacious new-chat screen

### 3. New Chat Button in Chats Tab
**File: `src/pages/DashboardPage.tsx`** (line ~491-497)

Change the "New chat" button from `rounded-xl` custom styling to `Button variant="outline" size="icon" className="rounded-full glass-shimmer"` for consistency.

