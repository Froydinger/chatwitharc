# ArcAI motion and composer release evidence

## Scope and protections

- Compact reply row: 18px Arc icon, Copy and Read Aloud. Details open only on tap.
- Details use Arc's recorded model identity and “Powered by GPT 6”; older replies without enough recorded data use Arc Matrix. Technical IDs and reasoning levels stay hidden. Actual tool names are recorded for future replies; existing memory/weather/search metadata supplies historical fallbacks.
- Bug icon opens the existing bug-report form. It never submits a report automatically.
- Dashboard navigation bar, its drag/lens/spring behavior, and DashboardPage/DashboardPreviewPage remain unchanged.
- No provider/model/auth/entitlement, history migration, backend or Builder request changes in the motion stage.
- Pixel verification stopped when the owner took the phone. Subsequent checks run in an isolated Mac browser, including a narrow 412px viewport; this is browser evidence, not Android keyboard/device proof.

## Completed checks

- Pixel production: compact row dimensions, modal open/close, hidden technical IDs/reasoning, bug-form handoff and focus. Closed without submission.
- Intent extraction: 504 comparisons against the original implementation; 25 permanent command/near-miss tests.
- Chat transport regression: activity, final results, errors, timeout bounds, client cancellation and backend stream cancellation.
- Native CSS motion browser checks: all five presets, retained exit then removal, pointer blocking during exit, rapid reopen preserving the DOM node, reduced-motion immediate cleanup, branded/tool metadata, collapsed-source keyboard behavior, centered modal geometry and return focus.
- Actual animation recording: `/tmp/arc-motion-after.mp4`, 293 captured browser frames across 5.8 seconds in the initial run. Includes synthetic fixtures, not provider activity. Baseline Pixel clips are `/tmp/arc-motion-baseline.mp4` and `/tmp/arc-animation-before.mp4`.
- Production builds and changed/new component lint. Existing dropdown-menu self-assignment lint finding is unchanged.
- Targeted TypeScript checks have existing generated Supabase schema errors for `is_work`. Whole-project typecheck also has existing JSX errors in unchanged AdminSettingsPanel. A newly found optional-source-title mismatch was corrected.

## Native motion architecture

`src/components/transitions/Transition.tsx` adapts Jakub Antalik's transitions.dev patterns to React using Radix Presence and Slot. CSS in `src/styles/transitions.css` owns timing/easing. Slot avoids adding a layout wrapper and preserves refs; Presence handles interruption and CSS exit completion. Reduced motion removes animations and settles immediately. Positioning transforms are preserved through independent scale/translate properties.

First stage covers reply-card entrances, music-popup entrances, shared dialog/alert-dialog, popover/dropdown/context menus, select, hover-card and tooltip animations, plus the source accordion. Remaining gesture/layout/loop animations are inventoried for later stages; this is not a complete Framer removal.

## Composer work

Phase 1 extracted pure intent helpers without changing precedence. Presentation/lifecycle extractions are being checked separately. The owner approved original-chat queues with captured attachments, Stop pausing the queue, and explicit recoverable retries that preserve newer drafts. Those behavioral changes are a separate stage, not yet shipped with native motion.

## Rollback policy

Each main commit is independently releasable. If a production regression is reproduced, revert the affected stage, push, verify the previously working route/interaction, then repair and retest locally before publishing again. Do not advance over a failing gate or call local fixtures provider E2E.
