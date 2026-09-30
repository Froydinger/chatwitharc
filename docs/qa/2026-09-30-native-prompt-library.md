# Native prompt library

PromptLibrary now uses the native retaining backdrop/modal adapter and
SequencedTransition for its existing exit-before-enter category switching.
CSS owns card hover lift, press scale, refresh-icon hover and the loading icon's
separate spin/pulse loops. Reduced motion removes loops and interaction motion.
Prompt generation, cache keys, refresh requests, selection payloads and close
callbacks remain unchanged. No dashboard navigation source was changed.

`ARC_RECORD_MOTION=1 node scripts/test-prompt-library-browser.mjs` mounts the
actual component with cached local fixtures, preserving and restoring the old
test-browser cache. At 412/1280 pixels with normal/reduced motion it checks rapid
Reflect/Create selection, the correct captured prompt delivered once, inert
exit, eventual removal, close-button behavior and viewport geometry. Refresh
provider calls are not exercised by this fixture.

36 actual component frames were recorded over 4.16 seconds into
`/tmp/arc-prompt-library-native-motion.mp4`; the inspected frame is
`/tmp/arc-prompt-library-native-frame.png`.

Targeted lint has no errors and retains the existing refreshPrompts dependency
warning. Production build/prerender and diff checks are release gates. This is
local browser evidence, not authenticated prompt-generation or Pixel evidence,
and does not complete the remaining animation migration.
