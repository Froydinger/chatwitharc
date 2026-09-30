# Native living-memory panel motion

ContextBlocksPanel now uses the existing transitions.dev CSS accordion for its
add/edit form and the native modal presence adapter for its outer panel. Closing
content is retained for the collapse, inert during exit, and removed afterward.
Padding stays inside the grid track. Reduced motion settles without animation.
The redundant outer Framer presence wrapper is removed.

The production hook remains in the public component. A typed view accepts the
same memory operations, enabling actual component QA with synthetic memory and
no authenticated reads or writes. Add/update/clear implementations, saved-memory
storage, outside-click delay, draft trimming and mobile autofocus policy remain
unchanged.

`node scripts/test-context-panel-motion-browser.mjs` checks 412/1280 widths,
normal/reduced motion, empty-save disabling, add/edit payloads, cancel, clear,
rapid reopening, inert exit, form unmount, outside-click dismissal and reopening.
`ARC_RECORD_MOTION=1` records the actual panel. The recording is
`/tmp/arc-context-native-motion.mp4` (36 frames, 3.82 seconds); inspected still:
`/tmp/arc-context-native-frame.png`.

Targeted component/fixture lint passed. Production build/prerender passed
(2.14 seconds, 16 static pages). Diff whitespace checks passed. These are local
browser and build checks, not proof of authenticated saved-memory persistence.
Dashboard navigation and the notification bell are untouched. The full motion
migration and authenticated live/device acceptance remain incomplete.
