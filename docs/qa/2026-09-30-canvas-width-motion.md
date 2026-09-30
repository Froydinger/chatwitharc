# Canvas native width motion

Replaces the Canvas version-history and desktop Canvas pane width animations with CSS transitions. The adapter adds no layout wrapper, retains closing content as inert, cancels removal when reopened, respects reduced motion, and disables transitions during resize. The existing editor and resize handlers remain unchanged. Builder's already-native unpublish confirmation no longer has a redundant Framer presence wrapper.

Validation:

- `node scripts/test-canvas-width-handler-parity.cjs`: all 38 MobileChatApp event bindings and 36 Builder bindings match release `7b3f51db`; Canvas editor bindings and extracted history contents also match.
- `node scripts/test-canvas-width-motion-browser.mjs`: actual history view and width adapter tested at 412px and 1280px, with and without reduced motion. Covers intermediate width, final 200px history width, selected restore payload, inert exit, interrupted reopen, percentage pane sizing, immediate resize/close, and overflow.
- New helper, extracted history, and DEV fixture targeted ESLint passed.
- Production build passed in 2.09s and prerendered 16 pages; `git diff --check` passed.
- Recorded 3.80s of actual component transitions; inspected the captured frame. Local recording: `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-canvas-width-native-motion.mp4`.

The browser fixture uses synthetic editor contents and version data. This does not prove authenticated editor persistence, a full MobileChatApp mouse drag, publishing/unpublishing, or physical Pixel behavior. No destructive Builder action was invoked. Dashboard navigation and its shared animation components are untouched.
