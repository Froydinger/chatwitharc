# User support native motion

The signed-in non-admin Help Center uses a controlled SupportTicketView with native page/card fades, a grid accordion for the new-ticket form, and keyed native ticket layout movement. Controller state, auth/admin branches, ticket queries, creation, notifications, and ticket-chat handoff remain in SupportPage unchanged.

Checks:

- `node scripts/test-support-handler-parity.cjs`: all controller statements before the final view return and all event bindings match `98e5f6f7`, including ticket inserts and transactional-email invocation.
- Actual controlled view browser tests passed at 412px/1280px with normal and reduced motion: empty form disabled, subject/body enable submission, callback payload, Cancel inert exit, interrupted reopening with retained draft, final form removal, ticket selection, and no horizontal overflow.
- Targeted view/fixture lint passed. Controller lint has its existing fetchTickets effect-dependency warning, with no errors.
- `git diff --check` and production build passed; build 1.87s and 16 prerendered pages.
- Recorded 3.86s and inspected a captured frame. Local recording: `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-support-native-motion.mp4`.

The fixture uses synthetic ticket data and records local callbacks only. It sends no email, creates no ticket, and proves no authenticated backend operation. AdminTicketList and protected shared GlassButton/dashboard navigation animations are unchanged and still pending migration where applicable.
