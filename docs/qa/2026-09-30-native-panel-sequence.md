# Native history/quote panel sequence

RightPanel now uses CSS slide state for its existing drawer, native theme-icon
entrance, and SequencedTransition for the existing wait-before-mount tab behavior.
Its safe-area geometry, history/quote children, subscription checks, sharing,
checkout and tab callbacks are preserved. The dashboard navigation is unchanged.

The new adapter retains committed outgoing content, makes it inert, then mounts
the latest requested content after exit. Reopening cancels the pending exit.
Animation events and computed CSS duration govern completion, including a
fallback for reduced motion or suppressed events in hidden tabs. Timers and
listeners are removed when interrupted or unmounted.

`ARC_RECORD_MOTION=1 node scripts/test-panel-motion-browser.mjs` passes on the
actual native adapter and drawer CSS in an isolated local React fixture. It
checks retained outgoing content, inert exit, rapid selection coalescing,
reopening, drawer close/open and reduced motion. The 36-frame recording spans
4.28 seconds at `/tmp/arc-panel-native-motion.mp4`.

Targeted ESLint and diff checks pass. Production build/prerender is a release
gate. These tests do not load account history, call paid providers or prove
authenticated production history/quote interaction. They do not claim that the
full animation migration is finished.
