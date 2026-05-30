## 1. Corporate Mode consent modal — readable in dark mode

`src/components/CorporateMemoryConsentModal.tsx`

- Replace every `text-muted-foreground` inside the dialog with `text-foreground` so all body copy is white in dark mode (and black in light mode) — title, description, both tile descriptions, the bottom "You can change this any time…" note.
- Bump the small bottom note from `text-[11px]` to `text-xs` and drop the muted tone so it still reads but matches the rest.
- Keep the primary "Cache & use memories" button styling unchanged (stays accent-colored white-on-primary). The ghost "Don't use memories" button stays text-only but inherits `text-foreground` for legibility.
- Soften the tile containers (`bg-muted/30` → `bg-foreground/5`, `border-border/40` → `border-foreground/10`) so they're visible without graying the text.

## 2. Light mode as the default

`src/store/useAccentStore.ts`
- In the `themeMode` initializer, when nothing is saved and there's no legacy `lightMode` flag, return `"light"` instead of `"dark"`. Legacy `lightMode === "true"` still maps to `"light"`; legacy `lightMode === "false"` now stays `"dark"` (only true legacy users keep dark).
- Catch-all fallback also returns `"light"`.

`index.html` (blocking preload script)
- Mirror the same default: when neither `themeMode` nor legacy `lightMode` is present, set `savedMode = 'light'`.
- The `catch` fallback at the bottom currently adds `dark` — switch it to `light` so a failed read also lands on light.

Accent color is untouched — it still defaults to blue and the user's saved accent always wins. "Unless a user has a specific color set" is satisfied because any saved `themeMode` (dark / light / system) still overrides.

## 3. Landing page — always light mode

`src/pages/Index.tsx`
- Replace the "force dark when unauthenticated" effect with "force light when unauthenticated": remove `light`, add `light` class; remove `dark`.

`src/components/LandingScreen.tsx`
- Drop the hardcoded `className="dark"` on the root wrapper (line 458).
- Comb pass to remove every dark-only hardcoded color and replace with light-mode-appropriate equivalents. Specifically:
  - `text-white` on body copy / headings → `text-slate-900` (or `text-foreground`).
  - `text-gray-400` on secondary copy and nav links → `text-slate-600`, hover → `text-slate-900`.
  - `bg-black/20` browser-chrome strip and similar → `bg-slate-100` with `border-slate-200`.
  - `border-white/5`, `border-white/10` → `border-slate-200`.
  - Section backgrounds that rely on dark gradients → light gradients (`from-slate-50 to-white`, etc.) keeping the same shape.
  - CTA gradients (`from-blue-600 to-cyan-600 text-white`) stay — they're brand buttons and read fine on light.
  - Selection color `selection:bg-purple-500 selection:text-white` stays.
  - Shadow tokens that assumed dark bg get swapped for soft slate shadows so cards still pop.
- Embedded demo components referenced from Landing (`LandingVoiceDemo`, `LandingCanvasDemo`, the `TabSwitcher` / `FeatureCard` helpers in this file) get the same treatment: any `text-white` / `text-gray-400` / dark surface tokens swapped for the light equivalents.

`src/pages/SharedChatPage.tsx` — leave as-is (shared chat is its own surface, not the landing).

## 4. Memory updates

- Update `mem://features/landing-page-theme-constraints` to reflect "Landing is always light mode (was always dark). On logout, force `light`, clear cached theme."
- Update the Core memory line about theme default: explicitly note "Default themeMode is `light` when unset (legacy `lightMode=false` still respected)."

## Technical notes

- The blocking script in `index.html` runs before React, so updating its default is required for first-paint to land on light — otherwise new visitors get a dark flash before the store initializes.
- The Index.tsx force-light effect runs only when `!user && !loading`, so signed-in users keep their saved themeMode everywhere including the home route.
- Landing changes are purely className swaps + the wrapper class removal — no structural or behavioral changes.
- After the landing pass, I'll grep the file for any remaining `text-white`, `text-gray-`, `bg-black`, `border-white/` to confirm no stragglers.
