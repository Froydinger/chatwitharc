# CSS-only Liquid Glass Facelift

Ship a production-grade "liquid glass" visual upgrade with zero new dependencies, zero React 19 migration, and full browser support (Safari, Firefox, Chrome, iOS, iPad PWA). Stays inside the existing dark-mode-only + accent-color system.

## What changes (visually)

1. **Refractive edge** on every glass surface — SVG `feTurbulence` + `feDisplacementMap` filter producing a subtle warped rim that fakes light bending at the boundary.
2. **Specular sweep** — animated conic-gradient highlight that travels across glass on hover, focus, and tap (slow idle drift on the dock).
3. **Chromatic rim** — 1px inset rainbow-tinted shadow on `:hover`/`:focus-visible` simulating dispersion at the bevel.
4. **Shape morph** — spring-eased `border-radius` transitions on pills, dock items, and buttons (15px → 22px → 15px) so they feel liquid when interacted with.
5. **Thick-glass bevel** — new `.liquid-rim` layered inset shadow (highlight on top, shadow on bottom) so surfaces read as a physical pane, not a flat tint.
6. **Liquid press** — `:active` adds a brief inward displacement + scale 0.97 with spring bounce-back (uses existing framer-motion where present).

## What surfaces get it

- `.glass`, `.glass-strong`, `.glass-dock` base classes (covers ~80% of UI automatically)
- `GlassButton` — adds specular sweep + shape morph variants
- `GlassCard` — adds liquid-rim and optional refractive edge via `liquid` prop
- Dock / bottom nav pill (DashboardPage)
- Message bubbles (MessageBubble)
- Modals (Dialog primitives + UpgradeModal, PrivacyTerms, etc.)
- Chat input bar (ChatInput, LandingChatInput)
- Star menu / slash picker pills
- Music popup, support popup, finger popup
- Toast/sonner

Because most are already styled via `.glass*` classes in `index.css`, upgrading those base classes lights everything up at once.

## Files touched

```text
src/index.css              # new liquid tokens, .liquid-rim, specular sweep, refractive filter wrapper, shape-morph timing
src/components/ui/liquid-filter.tsx   # NEW: one mounted <svg> with feTurbulence/feDisplacementMap defs, referenced by url(#liquid-edge)
src/App.tsx                # mount <LiquidFilter /> once at root
src/components/ui/glass-button.tsx    # add "liquid" variant, specular sweep, shape morph springs
src/components/ui/glass-card.tsx      # add liquid prop, apply filter + rim
tailwind.config.ts         # add keyframes: specular-sweep, liquid-morph; new utilities
```

No component rewrites — `.glass`/`.glass-strong`/`.glass-dock` edits cascade everywhere. Per-component touches only where we want extra polish (dock, buttons, bubbles).

## Technical details

**Refraction filter** (lives once in DOM, referenced by `filter: url(#liquid-edge)` on a `::before` pseudo so it warps the border layer only, not the content):

```text
<svg style="position:absolute;width:0;height:0">
  <filter id="liquid-edge">
    <feTurbulence baseFrequency="0.015 0.02" numOctaves="2" seed="3" />
    <feDisplacementMap in="SourceGraphic" scale="6" />
  </filter>
</svg>
```

Applied to a 1-2px inset pseudo-element so the displacement only affects the rim — content stays sharp and readable.

**Specular sweep** keyframe:
```text
@keyframes specular-sweep {
  0%   { transform: translateX(-120%) rotate(8deg); opacity: 0; }
  40%  { opacity: 0.6; }
  100% { transform: translateX(120%) rotate(8deg); opacity: 0; }
}
```
Triggered on `:hover`/`:focus-visible` via a `::after` with `mix-blend-mode: overlay`.

**Liquid morph** uses framer-motion `transition={{ type: "spring", damping: 14, stiffness: 280 }}` on `borderRadius` for GlassButton (already wrapped in motion.div).

**Performance guardrails:**
- Filter only on rim pseudo (~2px wide strip), not whole surface — keeps GPU cost low.
- `will-change: transform, opacity` only during interaction, removed after.
- iPad PWA already has `is-ipad` class — skip the displacement filter there (gradient + sweep only) to avoid compositor stress per existing memory.
- Respect `prefers-reduced-motion`: disable sweep + morph, keep static rim/bevel.

**Accent integration:** specular highlight uses `hsl(var(--primary-glow) / 0.4)` so it picks up the user's chosen accent automatically. Noir gets a pure-white sweep (already the primary).

**Compatibility:** `backdrop-filter`, SVG filters, conic-gradient, and CSS keyframes work in all current Safari/Firefox/Chrome. No polyfill needed.

## Out of scope

- No React 19 migration
- No liquid-dom, WebGPU, or new runtime deps
- No backend/auth/payment changes
- No color token changes — accent system stays the source of truth
- No Three.js / starfield changes
