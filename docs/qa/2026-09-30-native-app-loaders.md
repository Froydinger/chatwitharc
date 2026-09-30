# Native application loaders

FullscreenLoader and FastLoader are extracted into AppLoaders.tsx and still used
by App's existing startup and lazy-route gates. The full loader retains its
one-second spin-to-bloop phase, three turns, logo reveal/shrink and backdrop fade.
The fast loader retains its three-second continuous rotation. Scoped CSS uses
shared motion tokens and disables rotation, transitions and halo pulses under
reduced motion. Dashboard navigation and notification bell are untouched.

`node scripts/test-app-loader-extraction-parity.cjs 22b2b6ce` confirms all 36
non-loader App statements match the prior release, including route definitions,
authentication gates and provider wiring. No gating behavior is redesigned.

`node scripts/test-app-loaders-motion-browser.mjs` mounts the actual production
loaders at 412/1280 widths with normal/reduced motion. It checks centered geometry,
initial/final phases, opacity/scale completion, fast rotation's CSS state and
reduced-motion halo behavior. Its direct timer instrumentation verifies that the
one-second phase timer is cleared on unmount; instrumentation is restored after
the check. No auth or route operations are invoked.

`ARC_RECORD_MOTION=1` recorded 36 frames over 4.29 seconds. Inspected still:
`/tmp/arc-loaders-native-frame.png`. Durable local recording:
`/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-loaders-native-motion.mp4`.

New component/fixture lint, production build (2.16s), prerender (16 pages) and
whitespace checks passed. App retains one pre-existing catch-any lint error in
an unchanged route handler. Full motion migration and authenticated acceptance
remain incomplete; loader fixture checks are not live authentication E2E proof.
