

## Plan: Restructure Landing Page Sections

### Current Layout (top to bottom)
1. "Think fast. Type faster." — two-column with Memory + Multimodal cards
2. "Real Life, Real Talk" + "Unlimited Everything" — side-by-side tiles
3. Music section
4. Voice Mode demo
5. Canvas demo
6. "Choose your plan" pricing section

### Proposed Layout
1. **"Think fast. Type faster."** — keep as-is
2. **"Real Life, Real Talk"** — expand into a full-width narrative section (not a small tile). Apple-style left-aligned statement with a right-side visual element (animated chat bubbles showing a life conversation). More immersive, matching the scale of Voice/Canvas demos.
3. **Music section** — keep as-is
4. **Voice Mode demo** — keep as-is
5. **Canvas demo** — keep as-is
6. **"Unlimited Everything" merged into pricing intro** — remove the standalone tile. Instead, replace the plain "Choose your plan" heading with a bold narrative intro: "Unlimited Everything" headline + subtitle that flows directly into the Free/Pro plan cards. The Crown icon + gradient accent carry over as the visual anchor.

### Technical Changes

**`src/components/LandingScreen.tsx`**:
- **Remove** Section 2 (lines 636-690) — the side-by-side grid with both tiles
- **Replace** with a new full-width "Real Life, Real Talk" section using a two-column layout: left side has the headline, tagline, and 2-3 bullet points about life coaching features; right side has animated mock chat bubbles (user asks about a career pivot, AI responds thoughtfully) using framer-motion staggered reveals
- **Update** pricing section (lines 766-828): replace the simple "Choose your plan" h2 + subtitle with the "Unlimited Everything" branding — gradient headline, Crown icon, descriptive subtitle about removing limits, flowing into the existing plan cards below

No new files needed. All changes in `LandingScreen.tsx`.

