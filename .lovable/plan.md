# Slimmer Input Bar Plan

## Goal
Make the chat input bar approximately half its current **thickness** (height) across all contexts — main chat, dashboard, and landing page — without breaking layout, touch targets, or portal positioning.

## Current State
- The input bar currently renders at roughly ~76–88px total thickness (glass-dock padding + inner textarea + buttons).
- The main levers are: `.glass-dock` padding (`1rem`), textarea `min-h-[44px]`, and `w-10 h-10` action buttons.

## Target
Reduce to ~40–48px total thickness (roughly 50–60% of current).

## Files & Changes

### 1. `src/index.css`
- **`.glass-dock`**: Change `padding: 1rem` to `padding: 0.5rem` (16px → 8px). This is the single biggest driver of thickness reduction and applies globally to every instance.

### 2. `src/components/ChatInput.tsx`
- **Textarea**: Reduce `min-h-[44px]` → `min-h-[36px]` and `py-3` → `py-2`.
- **Menu button**: Reduce `w-10 h-10` → `w-9 h-9`.
- **Send / Stop / Voice buttons**: Reduce `w-10 h-10` → `w-9 h-9`.
- **Icons inside buttons**: Reduce from `h-5 w-5` to `h-4 w-4` to stay proportional.

### 3. `src/components/LandingChatInput.tsx`
- **Buttons**: Reduce `h-12 w-12` → `h-10 w-10`.
- **Textarea**: Reduce `min-h-[52px]` → `min-h-[40px]`.
- **Textarea padding**: Reduce `py-3` → `py-2`.

### 4. `src/components/MobileChatApp.tsx`
- **Initial `inputHeight`**: Reduce from `96` → `64` so the scroll-bottom padding reserve matches the new thinner bar.

## Why This Won't Break Anything
- All portaled elements (prompt enhancer, usage meter, image/doc previews) anchor to the input bar's live bounding rect, so their `bottom` offsets automatically adjust.
- The `inputHeight` is dynamically measured via ResizeObserver in MobileChatApp, so scroll padding self-corrects after first render.
- Mobile touch targets remain at 36px (buttons), which is acceptable. The main reduction comes from outer padding and textarea height, not from crushing buttons to an unusable size.

## Estimated Result
- Main chat: ~76px → ~48px
- Dashboard: same (shared `.glass-dock` class)
- Landing: ~88px → ~56px