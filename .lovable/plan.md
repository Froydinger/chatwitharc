# Plan: Float menus above the input bar (smart per-route)

All changes confined to `src/components/ChatInput.tsx` (+ a tiny tweak in `src/components/ImageOptionsDock.tsx` consumers). No business logic touched.

## 1. ImageOptionsDock — anchor above the input bar
- Replace the current viewport-bottom math with an **input-relative anchor**: read `inputBarRef.current?.getBoundingClientRect()` and compute `bottom: window.innerHeight - rect.top + 12px` (plus extra offset when image/doc preview rows are present).
- Recompute on `resize`, `scroll`, visualViewport `resize`, and whenever `selectedImages` / `selectedDocuments` length changes.
- **Dashboard exception:** when `isDashboard` is true, keep the existing behavior (dock stays where it is now, since the input already sits high on the page).
- Same input-relative offset is also applied to the floating `UsageMeter` pill so it tracks the input together with the dock.

## 2. StarMenu — always above the input (except dashboard)
- Remove the `isDashboard ? below : above` branch for non-dashboard routes; on those routes, anchor with `bottom: window.innerHeight - barRect.top + 8` and `left: barRect.left`.
- **Dashboard:** unchanged — keep current placement (below input) since the input is already near the top of the screen.

## 3. Mobile keyboard stability
- Because both menus now anchor off `rect.top` of the input bar (which already rides above the soft keyboard via `glass-dock`), they move with the input as one unit. No more jerk when the keyboard opens/closes.
- Listen to `window.visualViewport`'s `resize` + `scroll` events to recompute during keyboard transitions.

## 4. Desktop StarMenu sizing — match the mobile feel
- Currently the desktop StarMenu renders smaller/tighter than the mobile pill. Bump desktop to match:
  - Pill height ~`h-12` (was ~`h-10`), padding `px-4`, icon size `h-5 w-5`, label text `text-sm`/`text-base`.
  - Wider min-width so labels breathe; rounded-full preserved.
  - Keep the existing entry animation and accent-color theming.
- Mobile stays as-is (already the target size).

## Out of scope
- No changes to `ImageOptionsDock.tsx`'s internal markup beyond continuing to use the existing `bottomOffset` prop.
- No backend, no subscription, no message logic changes.
