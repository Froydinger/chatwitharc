# Native blog, documentation and downloads motion

BlogIndexPage and DocsPage replace Framer card wrappers with native panel
entrances and the shared row-layout helper. Surviving keyed cards move when
filters change. Removed results leave immediately rather than retaining old
clickable results; reduced motion suppresses entrance/position animations.
Existing documentation accordions remain native and unchanged.

DownloadPage's select/confirm transition uses the native sequencer, retaining an
inert outgoing platform view until exit completes and then showing the latest
selection. Its public wrapper keeps the same useDownloadInfo hook; a typed view
accepts fixture download metadata for tests. Actual download handlers are
unchanged and are not invoked by QA.

`node scripts/test-public-pages-handler-parity.cjs 315c82d8` confirms selected
filter/content/helper declarations and every event binding match the prior
release (Blog 7, Docs 4, Downloads 4). Source diff is limited to animation
orchestration and the controlled download-view boundary; SEO and content are
unchanged.

`ARC_RECORD_MOTION=1 node scripts/test-public-pages-motion-browser.mjs` checks
actual pages at 412/1280 under normal/reduced motion: blog categories, surviving
node identity and WAAPI movement, search/no-results/reset, article navigation;
documentation accordion, categories, search/restore; download platform/back and
retained inert exit; viewport overflow on all three pages. It neither submits
account actions nor starts downloads. Local MemoryRouter contains navigation.

48 frames recorded over 5.96 seconds; inspected still:
`/tmp/arc-public-native-frame.png`. Durable recording:
`/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-public-native-motion.mp4`.

Production-page lint has no errors; the DEV location probe has one Fast Refresh
warning. Build/prerender passed (2.11s, 16 pages); whitespace checks passed.
Dashboard navigation, notification bell, billing and download metadata lookup
remain untouched. The wider migration and authenticated acceptance remain
incomplete.
