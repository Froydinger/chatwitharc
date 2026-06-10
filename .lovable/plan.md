## Problem

Two issues with the Tools & Actions menu:

1. **Not centered** — The menu uses `position: fixed` with `left-1/2 top-1/2`, but the chat input's ancestors use framer-motion transforms (`motion.div`). CSS spec: a transformed ancestor makes `fixed` behave like `absolute`, so the menu pins to the input bar instead of the viewport.
2. **Input bar turns gray** — The backdrop `fixed inset-0 bg-black/50 backdrop-blur-sm` is also inside that transformed ancestor, so it only covers a region near the input (not the whole screen), and the dark overlay sits on top of the input box, making it appear gray.

## Fix

Render both the backdrop and the menu through `createPortal` into `document.body` so they escape the transformed ancestor. Then:

- Backdrop truly covers the full viewport (so the input isn't selectively darkened).
- Menu actually centers on the viewport on both mobile and desktop.
- Account for iOS PWA top dynamic island/status bar area, do not touch the bottom of the app whatsoever just ensure this new addition respects the current ios PWA layout. 

### Technical changes (single file: `src/components/ChatInput.tsx`)

- Import `createPortal` from `react-dom`.
- Wrap the `AnimatePresence` block for the menu (lines ~2388–end of menu) in `createPortal(..., document.body)`.
- Keep existing styles (centered fixed positioning, solid background, grid tiles) — no design changes, just escape the transform context.
- No other files touched.