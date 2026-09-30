# Admin support native motion

AdminTicketList delegates its list/form UI to a typed controlled view. Native page/card fades, a grid accordion, and keyed layout movement replace its Framer wrappers. Shared GlassButton and dashboard navigation remain unchanged. The existing filtering predicate is extracted without modification for reuse by the actual controller and test fixture.

Evidence:

- Source parity against `c9b2be9c`: controller statements before filtering/rendering, ticket/profile queries, create handler, selected-ticket branch, all event bindings, and the filter expression match.
- Actual controlled view/filter browser checks passed at 412px and 1280px, normal and reduced motion. Real pointer events activate Radix tabs/selects. Tests cover status tabs, email search, no-results state, ticket selection, required assignment, priority choice, subject/body callback payload, inert Cancel exit, interrupted reopen/draft retention, final removal, and overflow.
- Targeted lint for controller/view/filter/DEV fixture passed with no errors or warnings; `git diff --check` passed.
- Production build passed in 1.90 seconds, prerendering 16 pages.
- Recorded 4.71 seconds and inspected captured frame. Local recording: `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-admin-support-native-motion.mp4`.

The first test attempt used DOM click on a Radix tab and did not activate it; the harness was corrected to use actual pointer events, then the full suite passed. No production handler change was needed.

Synthetic user/ticket data and local callbacks only: no database insert, admin impersonation, real ticket selection, email, or backend entitlement test. Existing backend behavior is preserved by source comparison, not proved by a live admin write.
