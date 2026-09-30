# Native search-result carousel

SearchResultsCard no longer imports Framer. Its existing native pointer/keyboard
and cancellable RAF position logic drives the card transform directly instead
of sending every interpolated value through a second spring. The settle duration
uses the resolved shared CSS slow-duration token; CSS calc tokens and zero
resolved durations are handled. The independent per-image floating/swaying loop
moves to scoped CSS and stops under reduced motion.

Result-image changes cancel the outgoing interpolation before resetting to the
first image. Changing the OS reduced-motion preference during a settle cancels
it and snaps to the nearest image. Markdown, sources, image modal, gesture
velocity/capture, dot navigation, click suppression and URL handling are retained.

`node scripts/test-search-carousel-motion-browser.mjs` mounts the actual card
with local SVG fixture images. It covers 412/1280 pixels, normal/reduced motion,
markdown tables, keyboard wrap/Home/End, dots, actual CDP mouse dragging, drag
click suppression, intentional image modal opening/closing, replacing images
mid-settle, dynamic reduced motion, zero duration and viewport overflow. No
search provider requests or saved-history writes are made.

`ARC_RECORD_MOTION=1` recorded 36 actual-component frames over 4.10 seconds:
`/tmp/arc-search-native-motion.mp4`. Inspected still:
`/tmp/arc-search-native-frame.png`.

The new preference hook and fixture pass lint. The card's seven existing
no-explicit-any errors in its unchanged shared-markdown typography overrides
remain. Production build/prerender and whitespace checks are release gates.
Dashboard navigation and notification bell are untouched. Full migration and
authenticated/device acceptance remain incomplete.
