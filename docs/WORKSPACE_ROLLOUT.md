# Workspace UI rollout

## Scope and rollback

Workspace is enabled by default for authenticated non-anonymous users on web,
including desktop/mobile web, installed PWAs, Electron and Android wrappers.
Native iOS (the explicit `arc-native-ios` marker or Capacitor iOS runtime) retains
the existing layout. Ordinary Safari/iOS PWAs are web, not native iOS.

Set `VITE_WORKSPACE_UI_ENABLED=false` and rebuild/release the frontend to restore
the previous authenticated UI. The separate voice presentation flag is documented
in `docs/WORKSPACE_VOICE_ROLLOUT.md`. These flags have no
model, accounting, subscription, billing, provider, audio or database effects.
It is a build-time rollback, so existing tabs must reload the rebuilt frontend.
Do not disable model/accounting flags to roll back Workspace.

The boundary is outside the existing route tree and is not keyed by route,
theme, model selection or voice activity. Public, auth, checkout, public-share,
SEO/AEO and crawler routes keep their existing rendering. The original RootGate,
providers, Route elements and global theme controller remain in place.

## Existing feature ownership

- Dashboard keeps the existing live `DashboardPreviewPage`, including its
  notification tray, account menu and tab handlers. Only redundant navigation
  and branding are hidden inside Workspace; the existing library tabs still use
  `DashboardPageInner`.
- Chat history uses the account-owned session store. The existing full history
  remains available through Search → All chats and history.
- The new-chat and share buttons delegate to the mounted chat's original
  handlers; Music opens the existing music popup. Nothing autoplays.
- Model selection uses the existing `ChatModelPicker`; upward placement is
  optional and its default header placement remains downward.
- Chat/Work reuses the existing `onWorkModeToggle` callback and its Boost/handoff
  gates. The shared `BoostIcon` is presentation only.
- Canvas header actions require the selected session to match the chat URL and
  contain its own persisted writing/code artifact. They never fall back to
  unrelated global canvas content. Closing flushes current content; reopening
  hydrates the exact current artifact before calling the existing reopen action.
- The original single `CyclingGreeting` instance, strings and timing are
  unchanged. A Workspace-only positioning class places it in the empty-chat area.
- `ComposerView` retains its exact legacy DOM when no Workspace footer is passed.
- Voice model, transport, limits, interruption and microphone permission paths
  are unchanged. The separately approved live-transcript presentation uses a
  single authenticated host across route changes and captured-chat persistence.
  Native iOS keeps the original routed voice mount. See the voice rollout guide.
- Existing desktop drag/window controls stay in place; the Workspace header and
  sidebar reserve the existing titlebar, admin-banner and device safe areas.
- Light/Dark/System use the existing theme store. Workspace only sets its scoped
  token attribute and follows OS updates. Dark background/sidebar are #000000.

## Verification

Run `node scripts/test-workspace-rollout.mjs`. This checks the route/auth/rollback
matrix, native runtime matrix, conversation ownership, legacy composer markup,
voice-hidden composer state, parser correctness and scoped CSS. With an optional
`WORKSPACE_BASELINE_DIR` pointing to the staged baseline, it also compares all
original Route declarations, RootGate, the legacy composer DOM, exclusive voice host ownership and
key existing chat handlers exactly.

Also run `node scripts/test-gpt-lineup-frontend.mjs` and the existing composer
checks. These use in-memory fixtures, not production model calls. After merging
with concurrent model/billing work, run the standard production build and the
repository's full release checks. No preview login, sample data, simulator,
separate entrypoint, or public-config fixtures belong in the production bundle.

UI QA still needs real authenticated layout inspection, without sending paid
prompts or starting microphones/audio: desktop/mobile navigation, new chat,
Back/Forward, model menu placement, share dialog, theme changes, per-chat canvas
open/close/switch, native-iOS rollback, and desktop titlebar spacing.
