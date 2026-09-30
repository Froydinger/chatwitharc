# Native queue layout motion

MessageQueue now uses native panel/fade entrances and browser animation API
position tweens for its keyed rows. The shared hook reads the transitions.dev
duration/easing tokens. It preserves existing DOM nodes, starts interrupted
movement from its visible offset, and leaves an unchanged animation alone when
typing or status causes another render. Removed rows are not retained or copied.

Reduced-motion changes cancel active position animations immediately. Listener
and animation ownership is local to the mounted queue. Dispatcher, captured
Files/models/chat/account, FIFO, Stop/pause, recovery and persistence contracts
are unchanged. No dashboard navigation source was changed.

`ARC_RECORD_MOTION=1 node scripts/test-queue-layout-browser.mjs` exercises the
actual MessageQueueView in the existing synthetic dispatch fixture at 412px.
It checks surviving row movement, interrupted removal, stable keyed DOM,
unchanged movement during draft updates, dynamic reduced motion, zero dispatch
from animations and unmount cleanup. The 36-frame actual-component recording
spans 3.87 seconds at `/tmp/arc-queue-native-motion.mp4`.

The existing composer Node checks and browser queue recovery suite remain
required, alongside targeted lint, production build/prerender and diff checks.
No authenticated provider, account history or physical Pixel request is made
by these fixtures. Full animation/composer migration remains unfinished.
