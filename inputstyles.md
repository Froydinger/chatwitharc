# Arc input bar: structure, compatibility, and refactor plan

Status: **incremental implementation in progress**, September 29, 2026. Pure intent helpers, the controlled textarea, attachment-preview ownership, and viewport subscriptions are extracted; the queue now captures request ownership/files/context, and submission attempts guard terminal cleanup and retain explicit recovery. The remaining presentation/orchestration extraction is still in progress. The ledger records completed work separately from the proposed phases.

## Recommendation

Refactor incrementally. Keep the public ChatInput interface and existing service/store contracts. Extract pure routing helpers and presentation before moving submission orchestration. Do not replace the entire composer, introduce a new global store, or rewrite routing, layout, and async behavior in one release.

Keeping everything unchanged is the lowest immediate release risk, and is sensible while shipping an unrelated urgent fix. It is a poor long-term fit for frequent feature additions: ChatInput.tsx currently combines roughly 3,900 lines of intent detection, UI, attachments, permissions, queues, voice integration, and async execution. Splitting that responsibility makes future changes easier to isolate, but splitting files alone does not repair races.

There is no honest zero-regression guarantee. Compatibility comes from recording current behavior, keeping changes small, testing the same inputs and outputs, and reverting a failed phase. Each phase must be useful and independently reversible.

## Baseline and current adapters

| Location | Current responsibility | Preserve |
| --- | --- | --- |
| `src/components/ChatInput.tsx` | Intent classifiers, draft/files, modes, menus, upload/edit/paste/drop, send orchestration, queue draining, keyboard and viewport behavior; the input placeholder and stop/send button also reflect store busy flags | Public props/ref and behavior |
| `src/store/useArcStore.ts` | Session/messages, loading and image-generation state, search/memory activity | Existing persistent schema and session ownership |
| `src/services/ai.ts` | Chat transport, streaming and browser session events | Request/response contract |
| `src/services/cloudRuns.ts` | Durable Work requests | Explicit Chat/Work boundary |
| `src/store/useMessageQueueStore.ts` | In-memory immutable request snapshots plus manual failure recovery; atomic scoped claims, pause and account cleanup | Files remain File objects, no persistence migration or automatic retry |
| `src/services/messageQueue.ts` | Separate `localStorage` recovery queue with session IDs, status, retries, and arbitrary message payloads | Do not assume it backs the visible composer queue; trace any adoption separately |
| `src/components/MobileChatApp.tsx` and `src/components/ThinkingIndicator.tsx` | Own/render the existing chat progress indicator, including empty-chat placement and in-thread assistant thinking UI | Reuse this indicator; do not add a second composer spinner |
| Existing voice, image, Canvas, IDE, Git, model and search hooks/stores | Feature-specific state and services | Entitlements, provider routing, cancellation and persistence |

Public integration contract:

- Props: `onImagesChange`, `rightPanelOpen`, `inline`, `cloudExecutionMode`, `onCloudTextSubmit`, `onWorkSessionCreated`.
- Ref methods: `handleImageUploadFiles`, `focusInput`, `sendMessage`, `prefillInput`.
- `CloudTextSubmitIntent` carries captured files, session/message identity, workspace context and explicit force flags. Files are captured before clearing, and parent-owned Work observation survives composer remounts.
- Current Enter submits or queues; Shift+Enter remains newline. Ctrl/Cmd+Enter explicitly queues except where explicit Work bypasses the browser queue.
- Busy ordinary Chat queues non-empty text and clears the visible draft; selected files are not copied into that queue and remain in the mutable composer state. A files-only submit during busy state is not added to the text queue. Ctrl/Cmd+Enter can enqueue text while idle too. Queue items are global across chats and have no captured route/model/context.
- Explicit authenticated Work text can bypass the browser queue while busy, carrying captured attachments via `CloudTextSubmitIntent`; specialized image, app and local-AI paths keep their existing busy behavior. Preserve the ask/auto mode, authentication/local-preview/corporate gates, and durable parent-owned Work observation.
- The visible queue is the Zustand store above, not the separate localStorage `messageQueue` service. It drains after an `isLoading` true-to-false transition: waits 600 ms, polls store loading/image-generation up to 20 times at 250 ms, then dispatches after 50 ms. The queue UI also offers pause, edit, reorder, clear, and send-next. Treat these as current behavior to characterize; do not silently migrate persistence or ownership.
- `ChatInput` sets/clears shared loading and activity flags across many branches. `MobileChatApp` renders the existing `ThinkingIndicator` (with its own delayed helper copy at 3 seconds and 60 seconds); the indicator itself appears when the chat surface's existing busy conditions are met. On accepted work, the refactor must make that existing indicator appear at the earliest honest acceptance point, before upload/preparation/network awaits, and keep it continuous through tool handoff and streaming. Do not show a new indicator in the input bar. Typing availability and permission to submit remain separate concepts.

## Behavior that must stay unchanged

1. Ordinary Chat must never silently become durable Work. Keep model choices, free/Boost/admin limits and server enforcement.
2. Preserve text chat, image upload/generation/editing, documents, Canvas, web search, Deep/Ultra, remote Git, App Builder, local AI and voice entry paths.
3. Tavily remains normal web search; Perplexity remains Deep/Ultra. Scheduling continues through the existing authenticated tool path.
4. Private image references stay durable `private-image://` references. Resolve signed URLs at use time. Do not move uploads back to public avatars or persist expiring URLs in requests/history.
5. Git stays connected-remote-only with Arc branch/PR behavior. App Builder entitlement and *.askarc.chat hosting rules stay unchanged.
6. Video remains disabled; preserve playback of already saved local videos.
7. Keep Noir styling, current geometry, text, keyboard affordances, menu actions, focus and mobile safe areas. This is not a redesign.
8. Do not clear draft/files on validation, entitlement, or auth rejection. Preserve verified retry behavior; resolve uncertain failure semantics below before changing them.
9. Never send twice because a render, effect, remount, Enter press or timer repeated. Async completion must belong to the request/session that started it.
10. The existing `ThinkingIndicator` must reflect accepted work promptly and stay consistent through uploads, tool calls and streaming. Its earlier trigger is a required behavior change: set accepted-work state before the first awaited preparation step, then hand off that same state across the existing loading/activity projections. Keep its existing presentation and helper delays; do not add another visual indicator. Typing availability and permission to submit are separate concepts.

## Target structure (see implementation ledger for completed files)

```text
src/components/ChatInput.tsx              # compatible entry point, props/ref adapter
src/components/chat-input/
  ComposerView.tsx                        # layout and composition only
  ComposerTextarea.tsx                    # controlled text, keyboard and sizing
  AttachmentTray.tsx                      # previews/removal, no upload requests
  ComposerActions.tsx                     # buttons/tool menu, declarative actions
  ComposerOverlays.tsx                    # existing dialogs/docks wiring
  composerStyles.ts                      # shared named class groups if useful
src/hooks/chat-input/
  useComposerAttachments.ts               # file lifecycle, previews, cleanup
  useComposerViewport.ts                  # measured anchor + keyboard/safe-area observers
  useComposerDraft.ts                     # draft/mode lifecycle, only if extraction helps
  useComposerSubmission.ts                # submission ownership and queue integration
src/lib/chat-input/
  intent.ts                              # pure classification; existing precedence first
  types.ts                               # typed snapshots, outcomes, mode discriminants
  submissionPolicy.ts                    # derived canType/canSend/canQueue/canStop
```

Avoid a file for every trivial helper. Existing independent docks, model picker, voice hooks, service adapters and stores should be reused, not copied into this folder. Keep state at its actual lifetime: menu-open state is local; durable Work observation remains parent/service-owned; stored messages remain in useArcStore.

## Phased implementation and exit gates

### Phase 0: capture the baseline

Record representative current screens and request traces without logging private text or credentials. Map every handleSend branch and early return into an ordered route table. Capture all custom window events and ref callers. Add characterization cases for explicit commands, natural-language intents, mode conflicts, attachments and conversation context. Record behavior that looks wrong separately instead of silently preserving or fixing it.

Exit: approved behavior decisions, branch inventory, reproducible baseline, clean build. No runtime change.

### Phase 1: extract pure intent helpers

Move existing classifiers unchanged; preserve their ordering, context limits and exact fallbacks. Keep imports compatible. Do not consolidate overlapping regexes yet. Compare old/new classification for the same fixture inputs, including ordinary prose containing words such as image, app, git and search.

Exit: identical outputs for the baseline corpus, no UI/payload change. Independent commit.

### Phase 2: extract presentation

Move attachment tray, textarea, actions and overlays with controlled props/callbacks. Keep DOM hierarchy, stable keys, refs, portal roots, Framer Motion layout identifiers and classes. The parent still owns behavior. Avoid remounting the textarea when modes change.

Exit: visual and keyboard parity across desktop, narrow viewport, inline composer and side panel. Focus, selection, paste and IME composition verified. Independent commits per component.

### Phase 3: isolate attachment and viewport lifecycles

One attachment owner creates/revokes object URLs and captures files for accepted submissions. One viewport hook owns resize/scroll/visualViewport/ResizeObserver subscriptions and teardown. Preserve existing upload services and image-edit context. Do not revoke a preview still used by an in-flight operation.

Exit: file picker, paste, drop, remove, retry and remount coverage; mobile keyboard and menu positioning checked on real device. No storage migration.

### Phase 4: centralize submission ownership (highest risk; requires owner decisions below)

Introduce an immutable accepted-request snapshot: request id, session id, text, files, selected modes/model and route context. One coordinator owns transitions, cleanup and cancellation. Start with adapters around existing branch implementations; do not rewrite provider code.

Suggested phases: idle -> validating -> preparing -> submitting -> waiting/tool activity/streaming -> completed/failed/cancelled. Background Work retains its existing independent lifetime. Derive UI policy from foreground request state plus existing durable/image state; do not blindly replace every isLoading boolean with one global busy flag.

- Set accepted-work state at the agreed acceptance boundary and before the first upload/network await, so the already-existing `ThinkingIndicator` is visible promptly. Preserve its current locations and helper delays; wire its existing busy props to the accepted request without rendering a duplicate in the composer.
- Existing indicator consumes the same derived state as send/queue/stop controls.
- A request/session identity check rejects stale completion events.
- Central terminal cleanup runs once; each branch must settle on error, cancellation and success.
- Queue entries must capture their own context if attachment queueing is approved. Never consume whatever files happen to be selected later.
- Keep old store loading fields as compatibility projections until all callers have been audited. Do not run two writers indefinitely.

Exit: deterministic state-transition tests, delayed and out-of-order response tests, double-submit prevention, cancellation, tool handoff, session switching, queue and retry acceptance checks.

### Phase 5: document and release incrementally

Replace this proposed map with actual files and responsibilities. Record per-phase evidence in the ledger. Build and verify the specific release revision on the live site; test the relevant native wrappers too. If a phase fails, revert that commit, rebuild and confirm the restored behavior before proceeding. Since main pushes deploy, use local/offline fixtures for early checks and publish only a completed phase. Never shadow-run a second paid request to compare implementations.

## Likely break points and safeguards

| Risk | Why it is vulnerable | Required safeguard |
| --- | --- | --- |
| Wrong tool chosen | Several explicit flags, regexes and conversation context compete | Preserve ordered precedence; table-driven routing fixtures |
| Duplicate send | Button, Enter, imperative ref, queue timer and effects can converge | Atomic acceptance guard, request IDs, exactly-once dispatch assertions |
| Lost/misattached files | Files live in mutable React state while queue stores text | Snapshot files/context; confirm queue policy before redesign |
| Indicator gap | Loading is set/cleared in many branches and tool transitions | One accepted-request lifecycle and shared UI derivation |
| Queue stalls/reorders | Loading transition effect, timers and stale closures | Deterministic queue ownership and timer cleanup; FIFO/pause tests |
| Wrong chat receives result | Active session can change during await | Capture session id; never read current session to finish old work |
| Draft disappears on error | Clearing varies across routing branches | Explicit acceptance point and failure recovery policy |
| Voice breaks | Shared composer state, external events and specialized delegation | Preserve voice hooks/events and test start/interrupt/stop separately |
| Work stops on navigation | Composer may unmount while durable job continues | Keep observation outside composer; remount/reconnect checks |
| Focus or mobile jumps | DOM movement, animation keys, portals and viewport observers | Stable textarea/ref; screenshot and real keyboard checks |
| Upload previews leak/break | Object URL revocation too early or never | One attachment lifecycle owner and cleanup coverage |
| Access/provider regression | UI routing also touches auth, limits and mode selection | Keep server boundaries and existing services; test allowed/denied paths |

## Confirmed decisions — September 29

- Queued requests keep their original chat and capture selected attachments. Never dispatch them into whichever chat happens to be open later. Hold requests when their original chat is not active; background dispatch is not introduced.
- Stop cancels foreground work and pauses pending requests; Clear remains separate.
- Failed requests remain recoverable for an explicit manual retry without replacing a newer draft.
- Preserve current typing, mode precedence, concurrency and temporary drafts. Validate/authenticate/capture before accepted-work progress; use the existing chat-level indicator before awaited preparation, without adding another spinner.

## Decisions for Jake before submission-state work

These are product decisions, not blockers for the unrelated browser fix or early pure extraction. The first four affect request ownership and should be answered before Phase 4; the rest can follow before the relevant behavior changes. Proposed defaults are recommendations only, not approved scope.

1. **Queue ownership across chats (Phase 4 prerequisite):** if a message is queued in chat A and the user opens chat B, should it remain tied to A and wait, send in A in the background, or be cancelled? Current queue entries are global and lack a session ID, so current dispatch reads whatever session is active later. Recommendation: capture the original session and never silently send into B; decide whether to pause or allow background dispatch.
2. **Files while busy (Phase 4 prerequisite):** when text and files are selected during an active answer, should Enter queue both as one request or wait until idle? Current ordinary busy path queues text only and leaves files mutable; a files-only send does not queue. Recommendation: queue one immutable request (text, files, session, route) as an intentional behavior change with a recoverable attachment lifecycle.
3. **Stop and pending queue (Phase 4 prerequisite):** should Stop cancel only active work, or also pause/clear queued messages? Current Stop calls global cancellation/reset flags; queue is not explicitly cleared or paused. Recommendation: stop active work and pause the queue; keep Clear as a distinct user action.
4. **Acceptance and progress timing (Phase 4 prerequisite):** exactly when is a request accepted for progress and when should the draft clear? Recommendation: after validation/auth/entitlement checks and request snapshot capture, set the existing indicator state synchronously before the first upload/network await, then clear only the submitted snapshot. Keep drafts intact on rejection. Confirm behavior for slow attachment preparation.
5. **Failure and retry:** on upload/network failure, should the composer restore submitted text/files or expose retry on the failed message? Current behavior varies by branch. Recommendation: retain a recoverable request without overwriting text typed after submission; define duplicate-safe retry.
6. **Busy Chat interaction:** keep typing available and Enter auto-queues text (current behavior), or block send and require an explicit queue action? Ctrl/Cmd+Enter currently explicitly queues even while idle. Recommendation: retain both affordances while separating typing from submission permission.
7. **Intent conflicts:** should an explicit selected mode/command win over inferred wording? Confirm concrete cases: image mode + “search for a reference”, code mode + “build an app”, and a follow-up “edit that”. Current ordered logic must remain unchanged until an approved table specifies any policy changes.
8. **Image-generation concurrency:** can ordinary Chat submit while an image is generating, or should it wait in queue? Current busy behavior queues text for non-Work; preserve until a concurrency feature is approved.
9. **Draft persistence:** should drafts survive chat switching/reload per chat, or remain temporary component state? Current draft is local to the mounted composer. Recommendation: no persistence migration in mechanical phases; design separately if wanted.

Unknowns must be resolved with observed behavior and code tracing before implementation. Do not ask Jake to decode implementation details; present short concrete before/after examples.

## Acceptance matrix

For every affected phase, check desktop web and Arc desktop; mobile layout in browser and actual Android keyboard/attachments for viewport/file changes.

- Text: send button, Enter, Shift+Enter, Ctrl/Cmd+Enter, paste, IME, whitespace, long prompt, focus after send.
- Busy: immediate indicator, tool handoff without flicker, queue FIFO/pause, repeated Enter, stop, session switch, remount, delayed/error responses.
- Attachments: one/multiple images, documents, paste/drop, remove, generation versus edit, failed upload retry, private-image resolution.
- Routes: plain Chat, explicit Work, instant search, Deep/Ultra, Canvas writing/code, remote Git, App Builder create/edit, local AI.
- Access: signed out, free, Boost, admin, pending entitlement lookup, quota rejection; disabled video remains hidden/rejected.
- Voice: startup, speech transcript, interruption, stop, attached image and no accidental Work delegation.
- Layout: welcome state, long thread, inline mode, side panel, small height, menu anchoring, safe areas, keyboard open/close, reduced motion.
- Persistence: reload/resume existing Work, saved chat/history intact, no duplicate message or orphaned busy state.

Use synthetic fixtures for most branches; a build alone is not behavioral proof. Live paid image/search/voice checks should be bounded and authorized. Never test a reminder by inadvertently scheduling or emailing a real recipient.

## How to add a feature after implementation

1. Define its intent and precedence with examples, including near-misses.
2. Add a typed capability/action definition and entitlement policy; retain server enforcement.
3. Route through the submission coordinator with a captured request, cancellation and terminal outcome. Do not start provider calls in visual components or render effects.
4. Reuse existing services and tool activity rendering. New tool actions must not control global loading independently.
5. Put its visual control in ComposerActions/Overlays, preserving keyboard labels/focus. Reuse the existing chat-level `ThinkingIndicator` for progress state; layout moves must not change request logic or add a parallel spinner.
6. Add routing, lifecycle, failure and access coverage plus the relevant acceptance matrix rows.
7. Update this file's actual structure, extension example and ledger in the same commit.

### Styling rules

Use existing glass utilities, Noir theme and shared spacing. Keep domain state out of class-name logic except via explicit view props. Use local shared class groups only when repeated; avoid global textarea/button overrides. Anchored docks use the measured composer rectangle, not unrelated window-bottom constants. Preserve portal stacking, safe-area padding and reduced-motion support. Do not add a second progress indicator.

## Implementation ledger

| Date | Work | Status / evidence |
| --- | --- | --- |
| 2026-09-29 | Phase 2 attachment tray: `AttachmentTray` renders controlled document/image previews; composer retains file state, callbacks, access checks, options, portal anchors and uploads | Exact rendered DOM matches pre-extraction revision `536decb1` for six empty/single/full file states; existing footer callbacks unchanged. Actual composer browser checks at 412/1280px cover combined files, individual removal, both clear actions and outer geometry; preview cleanup/IME/selection and queue regressions pass. No provider requests or physical Pixel checks in this stage. |
| 2026-09-29 | Phase 4 request ownership/recovery stage: typed immutable snapshots, `useComposerQueue`, scoped `addMessage`, attempt-owned cleanup and foreground admission guard | Node tests cover FIFO/chat/account/mode, File retention, original-session persistence, stale completion, cancellation, document failure, denied image-edit access and uncertain Work acknowledgement. Actual React hook + queue view browser checks cover hold, failure/manual retry, newer draft, rapid clicks, Stop/resume, owner change and unmount. Queue/recovery is in-memory; reload recovery and background dispatch are not introduced. |
| 2026-09-29 | Phase 2 first component + Phase 3: `ComposerTextarea`, `useAttachmentPreviews`, `useComposerViewport`; prevent IME Enter submission and refresh imperative callbacks with current render state | Desktop/412px browser checks pass for IME, newline, sizing/selection, File retention, exact preview revocation and subscription/observer teardown. Geometry and public ref methods preserved. Real Android keyboard/file-picker checks are not claimed; owner took Pixel and requested Mac testing. |
| 2026-09-29 | Phase 1: moved 24 pure classifiers/context helpers to `src/lib/chat-input/intent.ts`, preserving `ChatInput` exports and branch order | 504 old/new comparisons matched; 25 permanent command/near-miss cases pass; helper lint and production build pass. Full typecheck is blocked by existing JSX errors in unchanged `AdminSettingsPanel.tsx`. Queue/submission behavior unchanged. |
| 2026-09-28 | Inspected ChatInput responsibilities, public interface, busy/queue behavior and Work boundary; wrote this plan | Documentation only; no composer implementation changes |

After approval and each phase, add changed files, preserved behavior, intentional behavior changes, checks actually run, release revision and rollback commit. Never mark an unchecked acceptance row as passed.

### Narrow browser fixes after the plan

The browser handoff now restores its displayed owner-scoped session into the request store before submitting the follow-up. Explicit site-open requests use a bounded server preflight, and hand-back reads the current browser page before model reasoning. Browser/thinking status transitions clear stale memory/search labels in the existing indicator. These were targeted fixes. The ledger above records the subsequent incremental composer implementation.
