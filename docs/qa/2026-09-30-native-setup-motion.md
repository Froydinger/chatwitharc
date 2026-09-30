# Native onboarding and Mac-install motion

Both surfaces are mounted in production: Index renders OnboardingScreen and App
renders MacInstallPrompt. Onboarding's remaining Framer logo rotation moves to
the existing CSS logo loop, on the image rather than its full-width wrapper.
Reduced motion stops it. Profile-saving handlers are unchanged.

MacInstallPrompt keeps its platform/route/30-day cooldown checks and 2.5-second
delay. Its controlled view uses native retained panel entrance/exit; a dismissed
prompt becomes inert through exit and then unmounts. Download still records the
existing decision and navigates to /downloads. No installation flow is invoked
by tests.

`node scripts/test-setup-handler-parity.cjs 287f0345` confirms the profile/Mac
handlers, cooldown constants and effects match the previous release.
`ARC_RECORD_MOTION=1 node scripts/test-setup-motion-browser.mjs` checks actual
onboarding and Mac views at 412/1280 widths under normal/reduced motion: required
name state, geometry, logo loop, dismiss/download callbacks, retained inert exit
and reopening. It never submits onboarding or downloads a package.

The same browser suite mounts the actual Mac policy component in Mac Chrome:
/downloads stays hidden, the prompt is hidden after one second and shown after
three seconds, dismissal writes its decision, and a fresh route remains hidden
through the cooldown. The isolated browser's dedicated decision key is restored
after the test.

36 frames recorded over 4.24 seconds:
`/tmp/arc-setup-native-motion.mp4`; inspected still:
`/tmp/arc-setup-native-frame.png`. Mac component/fixture lint and whitespace
checks pass. Onboarding retains its one pre-existing catch-any lint error.
Production build/prerender is the release gate. Dashboard bar, notification
bell, authentication and profile storage remain unchanged. Full migration and
authenticated acceptance remain incomplete.
