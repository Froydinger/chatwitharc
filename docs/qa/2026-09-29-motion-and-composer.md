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

## Stop queue regression (2026-09-29)

Stop now idempotently pauses the queue before loading becomes idle, preventing the existing idle-drain effect from dispatching another request. Pending entries remain available for explicit Resume. `node scripts/test-message-queue.mjs` checks repeated Stop pause semantics, FIFO retention and explicit resume; production SSE/cancellation tests and production build pass. This stage does not yet fix original-chat ownership, file snapshots or recoverable failed requests.

### Attachment dismissal correction

A targeted typecheck exposed two stale calls to the removed `setImagePreviewUrls` setter, in Clear All and the voice image-dismiss event. Removed them; the preview hook already clears/revokes URLs when files change. Expanded the actual local ChatInput browser test to attach a File, dismiss through both paths, assert the tray disappears and capture uncaught errors. Both pass, along with the existing lifecycle checks and production build. Published separately before queue work.

## Queue ownership and recoverable requests

`ComposerRequestSnapshot` captures original account/chat, execution mode, files, selected modes, reasoning selection, image options, app intent and workspace. Arrays/context are immutable; files remain in memory. `useComposerQueue` owns one idle timer and both manual claim paths, rechecks current ownership/busy state and claims once. Opening another chat/mode holds FIFO; account change discards queued/recovery data. Stop pauses; failure pauses and exposes explicit Retry without replacing a newer draft. Cancellation does not manufacture a failed request. Rejected queued requests remain recoverable. Durable Work acknowledgement uncertainty uses its existing reconnect path and never enters the new retry UI.

Foreground attempts use their own identity, begin existing progress before preparation, and ignore stale completion/cleanup after Stop or a newer attempt. Ordinary text/document failures retain the captured request. `addMessage` accepts an optional target session; image replacement and Canvas/code append adapters also target the owner, so late results update its history/persistence while leaving the active chat unchanged. Canvas opening is held when another chat is on screen. Existing callers and deferred durable persistence retain their behavior. Image-edit entitlement is checked before clear/upload. No schema, model defaults, dashboard navigation or auth routing changed.

Checks:
- `test-message-queue.mjs`: immutable File/mode snapshots, account/chat/route hold, FIFO, idempotent pause/resume, atomic claims, edit retention and manual recovery claims/account cleanup.
- `test-composer-submission.mjs`: extracted production adapter with synthetic providers checks captured route/reasoning, prompt progress, foreground admission, original-session result, stale completion, draft preservation, document failure retention, pre-upload image-edit rejection, cancellation and uncertain durable handoff without Chat fallback.
- `test-session-message-ownership.mjs`: production append reducer checks inactive-session completion, persona, unchanged active caller, deferred durable save, deleted-session guard, owned image replacement and owned Canvas/code artifacts.
- `test-composer-queue-browser.mjs`: actual React queue hook/view in a DEV-only offline fixture, at 412px; holds in another chat, retains file bytes, pauses on error, manual retry, rapid double clicks, preserves newer draft, Stop/resume, account cleanup and timer teardown.
- `test-composer-stream-finalization.mjs`: waits for asynchronous final-result persistence before releasing queue admission, carries captured reasoning metadata, and converts persistence failures into terminal recovery. Title metadata runs without delaying the response.
- Existing composer browser, intent, SSE cancellation checks and production build pass. No paid provider called by these synthetic fixtures. This is not physical Android or live provider proof.

Remaining composer extraction and broader animation migration are still pending. Generated schema and unrelated type errors still block a whole-project clean typecheck; the changed queue/request files have no newly introduced targeted errors.

Recovery UI was visually inspected in the local browser screenshot `/tmp/arc-queue-recovery.png`; the fixture contains only synthetic text/files and never saves production history.
