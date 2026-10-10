# Arc Workspace integration review — 2026-10-10

## Candidate scope

This is a review candidate, not a production release. The release parent is
`93e188034b16b32fbc43c8cfcfbf06967680e18e`. The final immutable commit/tree and
command logs accompany the review bundle; `candidate.json` identifies the
source of the separate Safari fixture.

Integrated slices:

- Workspace repairs through `251d889af61653983b82688fc1c310a0b2d62ebf`:
  model/picker corrections, anchored creation menu and desktop-only Builder gates.
- Dashboard through `c67057440133d3b73218789979e8c4b06e6796e6`:
  distinct Overview, Chats, Apps, Images, Canvases and Memory views; account-owned
  folders and canvas hydration; cancelled New Canvas saves cannot navigate after
  the owner, route or view changes.
- Reminders/Shared `66e4a18daab1d1277c60a608a07fdeb4b500dfbd`:
  real lists, actions and detail presentations. Its nine scoped files are retained
  exactly after dashboard integration.
- Chat corrections `d26361b6dd9c4794bb873fb8d348889d4740238a`:
  one original greeting in the real scroller, balanced prompts, floating composer,
  All chats and owner-checked sidebar organization actions.
- Creation modes `00e344332a573ed6fcb515106c0fbe4891359044`, source
  `bd9113b89c39c415c0a10f3ef682d8274c7bfd75`: actual Git, image, attachment,
  prompt, canvas, search and related dialog presentations with legacy defaults.
- Settings descendants `d6fe38e49ea001c635d80e2d2fd52ed831478c8c`:
  optional Workspace presentation through all six real Settings sections and
  their notification, local-AI, privacy, shared-link and usage descendants.
- Foreground Chat ordering fix through
  `28b74e61b348880b2da87b82c06b662d4e4a9664` (including its first commit
  `524649fa6e8f563d589d29374889b2e0b0e0d1c0`): wait for the exact owned session
  and user turn to be durably saved before provider submission; preserve retry
  identity, cancellation/account/navigation guards and default voice/Work timing.
- Safe WebGL fallback patch, SHA-256
  `4dda5da3bc7b7df36df4812d5200acadabf8dbb711e9fb5fca52b0ba4cbb701f`:
  decorative effects fail safely without changing voice presets or controls.

Integration changes retain the new sidebar appearance while restoring desktop
hide, hover-to-peek and saved per-account docking. Nested dialogs keep the peek
open, and closing a dialog restores focus to a visible control. Main content is
not remounted by sidebar changes. Duplicate toolbar page/conversation titles are
removed; the in-page headings remain. The Chat/Work control and selected segment
are fully rounded, with unchanged selection/Boost callbacks. Two small typing
repairs make the closed menu's standard `inert` attribute work with React 18 and
return the required result from a development-only memory fixture callback.

## Protected contracts

- Landing, hidden AEO markup, prerender inputs/routing and sitemap remain exact
  to the release parent. H1 remains “Ask. Reflect. Create.” with the small model
  chip. Production build must generate all 16 prerender pages.
- The entire `supabase/` tree remains exact to reviewed deployed backend
  `dacdcb739b66ebdaa2d216976ebacbe860e7eb94`. This integration does not deploy it.
- Existing voice models, provider/transport, prompts, tuning, audio, names and
  controls remain protected by the invariant suite. The decorative import-only
  fallback is the documented exception.
- Existing pricing, caps, billing identities, Stripe flows and credentials are
  outside this integration. Native iOS retains its legacy route/layout gate.
- Dark is pure black; Light and System remain supported. Mobile inputs remain
  16 px, pinch zoom remains enabled, and all Builder entry/publish gates remain
  desktop-only.

## Reproducible offline verification

Use the repository lockfile. Tests requiring JSDOM accept `ARC_JSDOM_MODULE` or
`QA_JSDOM_PATH` pointing to its installed API module; WebGL lifecycle tests accept
`METAL_FX_TEST_TOOLS` pointing to installed React test tools. No provider calls,
account login, microphone/audio session, deployment or production writes are
needed for these checks.

Run the composer and voice package scripts; Workspace rollout, welcome, sidebar
navigation/actions, toggle, creation/mode, canvas fence, memory, Settings and voice
suites; GPT frontend/server/image, model-effort, build-access, billing/usage and
ownership/persistence suites. `test-chat-spend-recovery-node.mjs` executes the
reviewed Deno-defined cases under an offline Node adapter; it is not a Deno
runtime check. The isolated PGlite usage-ledger test does not substitute for
native PostgreSQL concurrency validation.

Build with real deployment configuration when releasing. An offline build can
use command-local inert configuration:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=offline-build-placeholder npm run build
node scripts/test-gpt-aeo-contract.mjs
```

Do not commit those placeholder variables.

Known baseline limits:

- `tsc --noEmit --project tsconfig.app.json` stops at eight existing
  `AdminSettingsPanel.tsx` parser errors. Plain root `tsc` is not meaningful:
  the root configuration has `files: []`.
- A full app TypeScript program has 56 diagnostics on the release parent and
  54 on this candidate. The two removed diagnostics concern Shared attachments.
  A Sandpack union-member display order differs, but its existing diagnostic is
  unchanged. No introduced app-program diagnostic remains.
- Global ESLint is not clean on the release parent. Compare diagnostic identity
  rather than shifted source line numbers; retain the exact baseline/candidate
  report in the review bundle.
- The older `test-voice-regressions.mjs` harness fails on both parent and candidate
  because its mocked voice store lacks `subscribe`. The dedicated transport,
  ownership, live-control and stale-tool suites are separate passing gates.
- Native PostgreSQL binaries and real Safari/device validation are separate
  release gates. Browser suites that require Chromium/CDP are not run here.

## Actual-component Safari fixture

Build outside the production output:

```sh
node scripts/build-workspace-release-qa.mjs /tmp/arc-workspace-release-qa
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/arc-workspace-release-qa
```

In Safari, open `http://127.0.0.1:8765/viewport.html`. The fixture is never imported
by the production app. Use true iframe widths 375, 390, 768, 1024 and 1440, and
short/tall heights. It mounts actual WorkspaceChrome/sidebar/dialogs, all dashboard
views, chat welcome/composer/toggle presentations, Reminders and Shared lists,
and Git/image/attachment/prompt controls. Settings bodies are source-hashed HTML
rendered from actual SettingsPanel, all named descendants and actual UI primitives;
their controls are deliberately inert. No provider, account or billing operation
is available. The fixture does not prove authenticated end-to-end behavior.

Inspect in Light, Dark and System:

1. Hide, hover-peek, keyboard-open, dock and hide again. Verify no content reset,
   correct composer centering and unobscured footer/menus. Check long chat titles,
   All chats, folders, pin/move/rename/delete UI and visible keyboard focus.
2. Open Search from an undocked peek, then close it. Focus must return visibly.
   Open Rename, click its backdrop, then cancel. The sidebar must stay available.
3. Check one in-page heading, no duplicate toolbar title, and consistent list,
   empty, loading and error states across each dashboard, Reminders and Shared.
4. Check greeting, balanced prompt rows, floating composer, fully round Chat/Work
   pill/selected segment, real Boost indicator and 16 px mobile inputs. Exercise
   the creation menu, local Work selection, prompt library, attachments, Git and
   image options. Use the modes fixture's anchored state and short viewport.
5. Inspect all six Settings sections and available populated/loading/error
   snapshots, including actual child surfaces and visible theme choices.
6. At narrow widths check drawer scrolling, safe-area spacing, no horizontal
   overflow, focus visibility and keyboard-adjusted layout. Physical Safari
   keyboard/pinch zoom and installed-wrapper titlebars still need device QA.

Canvas editor, research and publish/site/image dialogs have real controller/DOM
regressions but are not mounted in this visual fixture. Their Safari geometry,
authenticated submission against the live backend, real account transitions,
physical keyboard/zoom, native-iOS legacy behavior and live voice/audio remain
explicitly unverified unless separately recorded by the release reviewer.

## Release and rollback

Publish only an isolated review branch until the candidate's immutable source,
review evidence and Safari results are accepted. A main push triggers the
frontend deploy and requires a separate final release decision. Do not redeploy
unchanged Supabase functions or change billing/accounting flags.

For a frontend-only UI rollback, rebuild with `VITE_WORKSPACE_UI_ENABLED=false`.
`VITE_WORKSPACE_VOICE_UI_ENABLED=false` separately restores the old voice
presentation while retaining captured-session safety. Both require tabs to
reload the rebuilt frontend. If a full code rollback is needed, create an
ordinary revert commit restoring the reviewed frontend release parent; do not
force-push or rewrite history, and do not undo the already-reviewed live backend
as a side effect. Verify the deployment and the protected AEO/model contracts
after either rollback.
