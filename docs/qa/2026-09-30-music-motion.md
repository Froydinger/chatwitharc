# Music motion dependency cleanup

BenchoNowPlaying already owns its geometry and play/pause morph with an interruptible native RAF tween. This pass replaces only Framer's reduced-motion preference hook with the existing native media-query hook. Bencho source/license, rendering, geometry, controls, outside-click handling and audio/store implementation are unchanged.

Evidence:

- Source equality against `0e96e094`, allowing exactly the import and hook-call substitution, passed (`scripts/test-music-motion-parity.cjs`).
- Actual component browser tests passed at 412px/1280px with normal/reduced motion: play/previous/next/like/seek callback ports, intermediate collapse width-independent geometry, final heights 78/189px, collapsed keyboard availability, reopen, outside pointer close, overflow, and dynamically enabling reduced motion mid-collapse.
- Component and DEV fixture ESLint passed; git diff check passed.
- Build passed in 1.89 seconds and prerendered 16 pages.
- Recorded 3.99 seconds; inspected captured open/play-state frame. Local recording: `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-music-native-motion.mp4`.

The isolated local browser fixture replaces playback actions with local doubles, then restores the full store and its original persisted storage value. No play/pause or seek operation reaches the actual audio element. This verifies UI callback wiring and motion, not audible playback or track loading. Dashboard navigation, shared music/header controls and notification bell are untouched.
