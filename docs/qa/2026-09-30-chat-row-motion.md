# Chat row native motion

The transcript no longer has a Framer wrapper around each message. A native keyed-row adapter suppresses entrance animations when history first mounts or hydrates, fades newly inserted user rows, and leaves assistant entrance ownership with MessageBubble. Streamed final replies receive no second wrapper entrance. The fade class stays stable across response updates so an in-flight user entrance is not abruptly cancelled.

Removed redundant outer Framer presence from the mobile Canvas composer, scroll-to-bottom button, Search takeover and Builder takeover. Their existing native ConditionalTransition adapters still retain inert exits. The header, music control animations, dashboard navigation, message edit callback, CloudRunList placement and loading/visibility conditions are unchanged.

Evidence:

- Actual ChatMessageRows browser checks passed at 412px/1280px with normal and reduced motion: initial history suppression, new-user fade, stable node/class on answer insertion, no assistant wrapper animation, hydrated history suppression and immediate row removal.
- `node scripts/test-response-handoff-browser.mjs` passed with real response components and synthetic lifecycle: one indicator during partial text, no finishing labels, immediate completion/cancel/error cleanup, no streamed text replay, one 180ms answer fade, reduced motion.
- Source parity: all 38 MobileChatApp event bindings match baseline `7b3f51db`.
- New adapter and DEV fixture targeted ESLint passed; `git diff --check` passed.
- Production build passed in 1.87s, prerendering 16 pages.
- Native row fixture recorded for 3.85s; captured frame inspected. Local recording: `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-chat-rows-native-motion.mp4`.

Row recording uses synthetic labelled rows, not authenticated messages. The handoff test separately mounts actual MessageBubble/Thinking/composer components but does not call a provider or persist history. Full authenticated chat runtime and physical-device acceptance remain separate requirements.
