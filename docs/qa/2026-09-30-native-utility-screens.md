# Native utility-screen loops

AuthPage, InfoPanel and NotFound move their remaining Framer decorative loops
to scoped CSS. The sign-in and information logo motions now affect the logo
itself, avoiding the phone-width overflow caused by rotating/scaling a full-width
row. Reduced motion stops these loops and the information tech-chip hover scale.

InfoPanel's stale GPT-5.6 and Google-only image prose now describes Arc Think,
Arc Flash, Arc Image and Arc Image Flash. Its outdated Lucide Github import is
replaced by the existing GitHub SVG component.

`ARC_RECORD_MOTION=1 node scripts/test-utility-motion-browser.mjs` mounts the
actual screens in a local fixture and passes at 412/1280 pixels under normal
and reduced motion. Checks cover viewport overflow, current model copy,
password reveal, forgot-password/back navigation and 404 Home navigation. No
credentials are entered and no authentication submission is made.

36 actual-component frames were recorded over 3.92 seconds into
`/tmp/arc-utility-native-motion.mp4`; the inspected frame is
`/tmp/arc-utility-native-frame.png`.

InfoPanel/NotFound lint has no errors; the DEV fixture has one Fast Refresh
warning. AuthPage's two pre-existing `any` errors remain in unchanged handlers.
Build/prerender and diff checks are release gates. Dashboard navigation, auth
handlers, routing and provider configuration are unchanged. Full migration and
authenticated/device verification remain incomplete.
