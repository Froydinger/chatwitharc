# Native saved-links panel motion

LinksPanel replaces its Framer chevron rotation with scoped token-based CSS.
Link rows use the native fade adapter, and surviving rows move through the
shared cancellable WAAPI layout helper when an item is removed. Removed links
leave immediately; stale link actions are not retained. Existing Radix
collapsible, menu and dialog behavior stays in place.

The public component still obtains the same Zustand store. A typed controlled
view enables isolated actual-component tests without changing saved links.
`node scripts/test-links-panel-handler-parity.cjs 60057dc8` confirms all four
handler declarations and 17 event bindings match the prior release.

`ARC_RECORD_MOTION=1 node scripts/test-links-panel-motion-browser.mjs` passes
412/1280 widths, normal/reduced motion, actual row removal and survivor animation,
collapse/reopen, create/rename/delete callbacks, trimmed names and geometry.
Tests use synthetic data and do not open links or write to the persistent store.

36 actual-component frames were recorded over 3.74 seconds:
`/tmp/arc-links-native-motion.mp4`; inspected still:
`/tmp/arc-links-native-frame.png`.

Component/fixture lint and whitespace checks passed. Production build/prerender
is the release gate. Dashboard navigation and the notification bell remain
untouched. Persistent user-data/device acceptance and the remaining motion
migration are incomplete.
