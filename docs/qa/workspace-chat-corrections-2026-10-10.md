# Workspace chat correction review

Base commit: `251d889af61653983b82688fc1c310a0b2d62ebf`.

## Implemented

- The approved Arc mark, existing rotating greeting, `Ask. Reflect. Create.` helper, and original quick-prompt cards form one cluster inside the actual message scroller. They are no longer fixed inside the composer dock.
- Workspace picks one existing Ask, Reflect, and Create prompt. The prompt text and prefill/library callbacks are reused. Legacy chat keeps its original selection and placement; its missing `CyclingGreeting` import is restored.
- New empty conversations reset that scroller to the top. Old scheduled scroll callbacks are cancelled when switching sessions.
- The composer stays a separate floating rounded card, with inset focus feedback, safe-area clearance, and at least 16px mobile side gutters. The frame minimum cannot exceed the keyboard's visual viewport height. No opaque shelf or zoom restriction is added.
- The active Workspace navigation now exposes All chats and existing pin, rename, move-to-folder, and confirmed-delete actions. Sessions and destination folders are owner-filtered, with ownership checked again at the action boundary.
- Pinned chats sort first. Deleting the currently open chat exits its stale route without flushing its deleted canvas back into history.
- Workspace action portals have neutral theme tokens, mobile drawer-safe stacking, 16px rename text, and keyboard-aware dialog positioning. Short sidebars scroll with a usable Recent area. Legacy action styling and default focus behavior are preserved.

## Checks passed

- `node scripts/test-workspace-chat-welcome.mjs`: AST scroll ownership, hydration/legacy gates, category selection using original prompt objects, SSR element order, real prompt/library callbacks, short-viewport effect, new-session scroll reset/cancellation, and parsed CSS constraints.
- `node scripts/test-workspace-sidebar-actions.mjs`: active Chrome SSR and callback forwarding, All chats navigation/drawer closure, pin ordering, session/folder ownership, folder removal, rename/save, delete confirmation, and portal/theme constraints.
- `node scripts/test-workspace-rollout.mjs` and `node scripts/test-workspace-composer-actions.mjs`.
- `npm run test:composer`, `node scripts/test-gpt-lineup-frontend.mjs`, and `npm run test:voice` (offline/mocked transport; no microphone, paid provider, or device calls).
- `npm run build:dev`: bundle and all 16 static prerender pages.
- Real application TypeScript program: zero diagnostics in the seven touched source files. `scripts/test-workspace-chat-types.mjs` makes this scoped check repeatable.
- Focused ESLint for the changed shared components and Workspace files: zero errors, two existing warnings.
- Independent source review and `git diff --check`.

## Limits and existing failures

- No browser screenshots or physical keyboard/device verification were performed for this correction. Actual nested drawer/dialog focus, mobile keyboard-open/closed geometry, light/dark/system rendering, and desktop visual regression still need integrated browser QA.
- Whole-repository `tsc -p tsconfig.app.json --noEmit` is blocked by existing malformed JSX in unused `AdminSettingsPanel.tsx` around lines 678–742. A full compiler-program diagnostic query reports 57 repository-wide diagnostics; the scoped result is not a full typecheck pass.
- `MobileChatApp.tsx` ESLint has the same pre-existing explicit-any error and two hook warnings as the base commit. No unrelated lint cleanup is included.
- Existing store rename/delete persistence error handling is reused unchanged; these offline checks do not prove live backend persistence.
- The build used development mode, not a production deployment configuration.

## Integration boundaries

`WorkspaceShell`'s `flushCanvas`, `go`, `newChat`, `openChat`, and `toggleCanvas` are byte-for-byte unchanged from the base. Retain the dashboard branch's newer owner-bound canvas hydration when combining branches. Keep the create-mode branch's `workspaceUI` prop on `PromptLibrary` and its separate mode stylesheet.

The nine-action composer menu, Builder device/Publish guards, voice engine and transport, model/usage routing, billing, and AEO content are unchanged by this patch. This review branch is not a deployment.
