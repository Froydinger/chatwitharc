# Native composer finger notices

FingerPopupContainer is mounted by App and its store is used by ChatInput.
The notice visuals now use the native dropdown presence pattern. A visual
snapshot retains removed notices only through CSS exit, then clears them on
animation completion or a computed-duration fallback. Reopening the same ID
preserves its node; closing notices are inert and remain pointer-events:none.
Timers clean up when notice inputs change or the list unmounts.

The Zustand store and its three-second auto-removal timer are unchanged. No
composer handlers, event dispatch, dashboard navigation or notification bell
code changes.

A local baseline render of the previous Framer component at x=220/y=250 measured
left=160/top=180/width=156.40625 after settling. Framer had overwritten the old
inline translateX(-50%). The native component removes that obsolete translation
and matches the measured left/top in normal and reduced-motion browser tests.
The temporary baseline module was removed after inspection.

`ARC_RECORD_MOTION=1 node scripts/test-finger-popup-motion-browser.mjs` checks
multiple keyed notices, retained inert exit, same-node interrupted reopening,
complete removal, reduced motion and positioning. The actual controlled notice
list uses synthetic items and does not submit a chat or mutate its store.

36 frames were recorded over 3.96 seconds:
`/tmp/arc-finger-native-motion.mp4`; inspected still:
`/tmp/arc-finger-native-frame.png`. Targeted lint and diff checks passed.
Production build/prerender is the release gate. The broader migration and
actual authenticated chat acceptance remain incomplete.
