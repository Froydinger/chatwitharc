# Native suggestions and message image placeholder

SmartSuggestions now uses shared native panel/fade entrances and CSS hover/press
effects. Full-prompt preference, short-prompt fallback, Quick Ideas callback,
session flag and short-viewport resize behavior are preserved.

ImageGenerationPlaceholder now uses a finite native card entrance with separate
spin and pulse owners. Its existing shader surface, aspect ratio, prompt text,
logo, caption and image-generation behavior remain unchanged. Reduced motion
stops both loops. Dashboard navigation source and shared dashboard controls were
not changed.

The extended actual-component fixture checks welcome, prompt chips, suggestions,
the message image placeholder and Thinking together. At 412/1280 pixels under
normal/reduced motion, all 15 entrance nodes settle visible, all six loops have
independent ownership, no horizontal overflow appears, and selection returns the
correct prompt exactly once. A 450px-high viewport hides suggestion chips while
keeping Quick Ideas; increasing height restores them.

`ARC_RECORD_MOTION=1 node scripts/test-motion-entrances-browser.mjs` recorded 36
actual component frames over 3.92 seconds into
`/tmp/arc-suggestions-image-native-motion.mp4`. The inspected frame is
`/tmp/arc-suggestions-image-native-frame.png`. Final checks include the subsequent
short-viewport assertions, targeted lint, diff check and production build.

This fixture submits no prompts or image requests. It is local browser evidence,
not provider or physical-device E2E. The full migration remains in progress.
