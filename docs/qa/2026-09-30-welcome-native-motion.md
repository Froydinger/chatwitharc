# Native welcome and prompt motion

The welcome avatar fade now uses the shared native transitions.dev adapter.
Its float and glow have separate CSS animation owners, keeping infinite loops
out of the finite entrance/exit lifetime. Prompt chips use staggered native
panel entrances plus CSS hover lift and press scale. Their existing custom
event and callback remain unchanged. ImageModal no longer wraps its native
retaining transition in redundant Framer presence.

No dashboard navigation, request routing, provider, authentication, history,
voice behavior or Builder source was changed in this stage.

## Evidence

- `ARC_RECORD_MOTION=1 node scripts/test-motion-entrances-browser.mjs` passes
  at 412 and 1280 pixels, with normal and reduced motion.
- The fixture mounts actual WelcomeSection, QuickPrompts and ThinkingIndicator.
  Assertions cover visible entrance settlement, four independently owned
  infinite loops, reduced-motion loop removal, loaded avatar, no horizontal
  overflow and exactly one callback per chip click.
- 36 actual component screenshots were recorded over 4.09 seconds into
  `/tmp/arc-thinking-native-motion.mp4`; the inspected frame is
  `/tmp/arc-thinking-native-frame.png`.
- Component ESLint reports zero errors, with the three pre-existing
  WelcomeSection hook/Fast Refresh warnings still present.
- Production build/prerender and `git diff --check` are release gates.

This is local browser component evidence. It does not claim authenticated
provider or physical-device verification, nor completion of the full animation
migration. The Pixel is unavailable because its owner requested remaining
testing on the Mac.
