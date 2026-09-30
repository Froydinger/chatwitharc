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

`ComposerRequestSnapshot` captures original account/chat, execution mode, files, selected modes, reasoning selection, image options, app context and workspace. Arrays/context are immutable; files remain in memory. `useComposerQueue` owns one idle timer and both manual claim paths, rechecks current ownership/busy state and claims once. Opening another chat/mode holds FIFO; account change discards queued/recovery data. Stop pauses; failure pauses and exposes explicit Retry without replacing a newer draft. Cancellation does not manufacture a failed request. Rejected queued requests remain recoverable. Durable Work acknowledgement uncertainty uses its existing reconnect path and never enters the new retry UI.

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

Queue editing recomputes app intent from edited text using the captured app context, so editing a queued greeting into `/app …` retains the normal Builder route. The production adapter regression case uses the actual app classifier and verifies a newer open app does not replace captured context.

## Static entrance expansion

Converted 62 further static entrances across 29 components/pages to the native Transition component. No handlers, state, provider payloads, routing or layout properties changed. DashboardPage, DashboardPreviewPage and gooey-tab-nav remain excluded. Shared animation CSS is unchanged in this stage.

`node scripts/test-motion-entrance-parity.cjs d132ac7e <stage-ref>` compares the JSX/TypeScript after removing entrance declarations and wrappers, preserving keys, content and non-motion attributes. This proves source parity for this static stage, not provider E2E or later behavioral changes. Composer tests and the five-preset browser interruption/exit/reduced-motion/modal checks pass. Actual WelcomeSection and full-size image ThinkingIndicator render at 412px and 1280px, settle visible, and respect reduced motion in `test-motion-entrances-browser.mjs`.

The actual image-loader check caught a collision between its existing `animate-spin-slow` shorthand and the new entrance CSS: the fade inherited infinite iteration. Kept the three existing spinning-loader entrances on Framer for this batch, pending a separate loop migration. Audited the other converted children for existing CSS animation classes. The corrected actual-component checks pass. No failing batch was published.

Build/prerender passes. ESLint finds the same 19 existing errors and 19 warnings in changed files, with no new diagnostics (line-number references normalized for comparison). Recorded `/tmp/arc-motion-after.mp4` again, 315 browser frames over 5.8 seconds; this recording exercises the shared motion fixture and model dialog, not all 29 converted surfaces. DEV fixtures are provider-free and do not persist history.

## One reply-controls row

The owner requested Arc, Copy and Read Aloud only on the newest assistant reply, moving to an older reply when tapped. `ReplyActionsProvider` owns transient selection for each main/shared conversation. New assistant replies, streamed/final transitions, chat switches and deleted selections restore the latest eligible reply. User messages do not move the row. The existing dialog/audio/copy implementations and recorded model data are unchanged. Reply text supports Enter/Space selection; links, embedded buttons and text selection retain their behavior. The selected controls use the existing native fade with reduced-motion support. No dashboard navigation changes.

`node scripts/test-reply-actions-browser.mjs` exercises actual MessageBubble/MessageMetadata/ReplyActionsProvider at verified 412px and 1280px viewport widths, with synthetic text and no auth/provider/history writes. It checks one row, older tap, recorded model modal, keyboard, user messages, links, selected text, new replies, stream/final IDs, scope switches and removed messages. Screenshots `/tmp/arc-reply-controls-latest.png` and `/tmp/arc-reply-controls-older.png` were visually inspected at 412px. Build/prerender, composer regressions, motion dialog regressions and diff check pass. Targeted types show no errors in the changed provider/bubble/fixture; imported generated-schema errors remain. Changed-file lint has the existing MobileChatApp any/dependency diagnostics plus two provider export Fast Refresh warnings. This stage is browser interaction proof with actual components, not authenticated production provider E2E.

## Native expandable panels

Installed the transitions.dev accordion CSS verbatim, using the existing motion-scaled tokens in index.css. `AccordionPanel` retains closing content for the resolved CSS transition duration, makes it inert/hidden to accessibility immediately, cancels teardown on reopen, unmounts after close and handles reduced motion. Reading the resolved `transitionDuration` is necessary: Arc's speed preference uses calc-valued tokens. The first interruption check caught immediate teardown from parsing that calc as a number; corrected before release. Closed panels leave no residual grid height or parent spacing. No navigation selectors or dashboard files changed.

Queue, auth email form and documentation answers now use this lifecycle. Queue root/row motion and other remaining Framer animations are still pending. No dispatch/auth handlers, models, saved history or durable Work behavior changed. Auth form values remain in their existing parent state when presentation unmounts; no form was submitted during tests.

Checks: expanded `test-composer-queue-browser.mjs` covers interrupted-close DOM retention, inert/focus safety, no residual height, reduced motion, and all existing original-chat/File/retry/Stop/resume/account/teardown behavior. `test-accordion-browser.mjs` renders actual AuthModal and DocsPage at verified 412px/1280px widths and checks retained controlled input, slower calc-valued motion preference, close/unmount and reduced motion. Composer regressions, build/prerender, changed-file lint and diff check pass. Targeted typecheck reports no errors in changed components/fixture; existing imported generated-schema errors remain.

Recorded `/tmp/arc-queue-motion-after.mp4`: 368 browser frames over 7.6 seconds, actual queue component with synthetic requests; visually inspected its phone-width frame `/tmp/arc-queue-motion-frame.png`. This is local browser animation/behavior proof, not authenticated live provider or physical Android proof.

## Native image loader and user controls — September 30

ThinkingIndicator and MessageBubble now have no Framer imports. The full-size image loader uses the native fade/panel recipes; fade wrappers and spinning/glowing children have separate animation owners, avoiding the infinite-iteration collision found in the earlier static stage. Reduced motion stops both loops. Helper entrances already use ConditionalTransition and no longer have redundant AnimatePresence wrappers. User-message controls use native scale/fade and reveal on tap, hover and keyboard focus; the earlier hidden/group-hover display rule prevented tap-only phones from showing them.

Checks: actual welcome/image components at 412/1280px settle visible, have no overflow, preserve independent infinite loop ownership and stop loops with reduced motion. Actual reply controls retain latest/older selection, model ownership, dialog hover position, stream/final handoff, keyboard/links/selection, chat switches and deletion; added phone/desktop user-tap visibility checks. Build/prerender and diff check pass; lint has zero errors and the existing ThinkingIndicator shared-hook Fast Refresh warning. A test run overlapping a build/HMR reload lost its synthetic fixture; after the build settled, the same suite passed. Do not run builds while collecting local HMR animation evidence.

Recorded 36 actual component frames over 3.95 seconds in `/tmp/arc-thinking-native-motion.mp4`; inspected `/tmp/arc-thinking-native-frame.png`. The fixture background now uses a valid hsl theme value so underlying app UI cannot bleed into the recording. No provider request, saved history or physical device activity occurs in this fixture. Dashboard navigation remains unchanged. This is another stage, not full removal of Framer from the app.
