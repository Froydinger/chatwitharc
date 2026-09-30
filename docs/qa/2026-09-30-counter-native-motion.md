# Native digit counters

AnimatedCounter replaces Framer springs with clipped CSS digit reels, using the app's medium duration and smooth-out token. Adapted from the transitions.dev spinning-counter structure for quiet count updates rather than jackpot spins. Legacy spring parameters remain accepted for caller compatibility; native timing now comes from shared motion tokens. Value normalization, prefix/suffix, digit order, sizing and caller data remain unchanged.

Actual-component local browser fixture passed at 412/1280 widths and normal/reduced motion: intermediate translation, interrupted updates, added digits, negative/nonfinite normalization and no overflow. Reduced motion settles immediately. Intermediate motion is sampled within browser animation frames to avoid a flaky single delayed observation.

Targeted component/fixture lint and production build passed (1.75 seconds). Recorded 3.85 seconds and inspected the settled frame. Local recording: Documents/ArcAI QA/2026-09-30/arc-counter-native-motion.mp4.

No authentication, persistence, count logic, provider, billing or dashboard navigation component changes. Browser fixture is isolated; this is not authenticated history-count E2E evidence.
