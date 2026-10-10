# Live voice inside Workspace

## Scope and ownership

The new voice design renders within the Workspace content area. Desktop uses a side-by-side Arc-mark/rings/control panel and live transcript. Narrow layouts put the controls above the scrolling transcript. Other pages and other selected chats use a compact panel with a “Return to voice chat” action. The transcript comes directly from `useVoiceModeStore.liveCaptionEntries`; amplitudes come from the existing input/output fields. No simulated state machine is shipped.

`WorkspaceBoundary` owns a single `WorkspaceVoiceHost`, keyed only by the authenticated account. The host and its controller stay mounted across Workspace/public route changes, themes, chat selection and view size changes. `MobileChatApp` renders its original controller/overlay only when that host does not own voice. Native iOS uses that original layout and routed lifecycle. Web, Electron and Android wrappers use the Workspace host.

The host captures the chat when voice activates, before controller initialization. An explicit `requireConversation` barrier prevents an external-store render from initializing a new call with a previous call’s context. The existing start gesture/permission/quota flow is unchanged. Camera, image attachment, mute handoff, voice switching, reconnect and push-to-talk use the existing overlay handlers. Volume uses the same store and restores 0.8 when unmuting audio.

## Narrow persistence changes

The optional controller adapter changes only conversation ownership and persistence for the hosted path:

- All turn and tool-card adds use the captured session ID. Image completion uses the existing owned patch method. Image history and reminder association use that same conversation.
- Saved identities survive late user insertion and the engine’s rolling 120-turn window. Stable caption IDs deduplicate repeated saves; fallback IDs are assigned per call/turn, with image updates retaining their identity.
- A late user turn uses an optional `beforeMessageId` on the existing session-scoped append. Without this option, append behavior is unchanged. Missing anchors append normally. Other chats’ anchors are never consulted.
- Final saves capture their input before queuing. Pagehide uses the same queue. A completed old final save cannot clear a newly started call.
- Empty live voice chats are pinned through final-save completion so New Chat does not auto-delete them before the first turn arrives.
- Captured sessions carry the existing owner field. Legacy persistence rejects an owner mismatch after obtaining the current authenticated user. Auth events revoke the old adapter synchronously, even before React’s auth UI rerenders; unmount ends active voice. A rerender cannot reauthorize a revoked adapter.
- Late image/search/weather/reminder results cannot populate a restarted call’s visual state. The native path retains its original behavior when no adapter is supplied.

No transport, realtime hook, voice store, provider model, prompt text, audio constraints, interruption logic, camera sampling settings, voice names, quota or entitlement file changes are included. `VoiceModeController` has a reviewed ownership-only exception; the invariant test compares its protected prompt/tuning declarations and the existing overlay control handlers exactly with the base.

## Rollback

- `VITE_WORKSPACE_VOICE_UI_ENABLED=false`: restores the original voice bar and in-chat captions. The single stable host and captured-session safety remain.
- `VITE_WORKSPACE_UI_ENABLED=false`: restores the original routed UI and voice ownership.
- Neither flag affects model, billing, voice limits or audio configuration. They are build-time flags. Native iOS stays on its legacy path either way.

## Verification

All focused tests use local stores, mocked provider methods and mocked device access. No microphone/camera permission, audio test, paid API call, upload, account change or production write was performed.

Passed:
- `node scripts/test-workspace-rollout.mjs`
- `node scripts/test-workspace-voice-persistence.mjs`
- `node scripts/test-workspace-voice-stale-tools.mjs`
- `node scripts/test-session-message-ownership.mjs`
- `WORKSPACE_BASELINE_DIR=<unchanged base checkout> node scripts/test-workspace-voice-invariants.mjs`
- `ARC_JSDOM_MODULE=<installed jsdom module> node scripts/test-workspace-voice-controls.mjs`
- `npm run test:voice`
- Independent mocked-host/actual-controller mount, route, auth-revocation, restart-context, live-caption identity and transcript-scroll fixtures supplied by the integration reviewer.

The JSDOM control harness accepts an installed `jsdom` module path without changing the app’s production dependencies. Its test-only presentation fixture does not import or replace the production transport.

Full typechecking is not a clean gate in the base checkout: it has inherited AdminSettingsPanel JSX syntax errors and existing realtime/store/Supabase typing errors. No errors were reported in the new voice adapter/view/controller files by the focused dependency check. The isolated older snapshot initially failed bundling on unrelated missing Stripe offer exports, excluded from this patch. After integration onto `d488198`, the complete production build with placeholder public Supabase configuration passed, including all 16 prerendered pages and source/artifact AEO preservation checks. The final combined snapshot also passed the GPT frontend, pricing DOM, 38 billing handler groups, voice transport and composer suites. Focused lint passed with zero errors (seven Fast Refresh warnings in the test-only mock module). Browser-layout verification remains separate. An attempted isolated headless Chromium layout run was blocked by this executor’s socket restrictions even after the supported escalation; no real-device/audio verification is claimed.
