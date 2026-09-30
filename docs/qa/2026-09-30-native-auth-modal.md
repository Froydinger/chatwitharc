# Native sign-in modal motion

AuthModal now relies on its existing Radix/CSS Dialog entrance and exit instead
of adding a nested Framer scale/fade. Background blob and logo loops use scoped
CSS; the logo motion applies to the small logo card rather than its full-width
row. Button hover/press feedback uses individual CSS scale, preserving password
button positioning and existing theme hover colors. Reduced motion stops loops
and hover scale transitions. No shared navigation/button component is changed.

`node scripts/test-auth-modal-handler-parity.cjs ab9228c5` parses both versions
with TypeScript and confirms all five authentication handler declarations and
14 event bindings are unchanged. This includes Google/email/guest flows and the
existing iOS submit workaround. It is source parity, not an authentication E2E
test.

`ARC_RECORD_MOTION=1 node scripts/test-auth-modal-motion-browser.mjs` mounts the
actual modal without an AuthProvider or credential submission. It passes light
and dark themes at 412/1280 widths, normal/reduced motion, logo/blob loops,
hover scaling, email-form collapse/inert/restore, retained synthetic email,
password reveal, signup autocomplete, close/reopen and Escape dismissal.

36 actual-component frames were recorded over 4.25 seconds into
`/tmp/arc-auth-modal-native-motion.mp4`; inspected still:
`/tmp/arc-auth-modal-native-frame.png`. Targeted component/fixture lint and diff
checks passed. Production build/prerender is the release gate. Dashboard bar
and notification bell are untouched. Actual authentication, physical-device
acceptance and the remainder of the motion migration remain incomplete.
