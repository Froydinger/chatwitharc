# Workspace creation surfaces: review and QA

Base: `251d889af61653983b82688fc1c310a0b2d62ebf`.
This is a review-only frontend change. It does not approve a merge or deployment.

## Presentation and preserved contracts

- The original nine `+` actions, upload handlers, file limits, send/queue handlers,
  and actual generation/search/Git/publish callbacks remain in place.
- Workspace image, attachment, Git and enhancer controls share one naturally
  sized, viewport-bounded stack rather than estimated per-panel offsets.
- Image size/count use native selects in Workspace, with the same stored models,
  options, entitlement checks, edit/source aspect and image counts.
- Git uses the same allowed repositories, default branches, owner-bound execution
  mode store and explicit retry. A redundant component effect was removed:
  the store already performs the initial repository load, and the old effect
  could retry an empty/error response forever. Rejected actions still surface
  through the existing toast and are caught after the store records the error.
- Prompt Library uses the existing category service/cache/refresh and exact
  selection callback. Workspace adds accessible Dialog/Tabs and displays the
  supplied starter prompts. Selection is delivered after modal focus cleanup.
- Writing/code Canvas, version history, Deep/Ultra Search, and their existing
  publish/site/image dialogs use scoped Workspace presentation. The controllers,
  editor configuration, warnings and consequential actions are unchanged.
- Workspace gates default false. Native iOS and the build-time rollback retain
  legacy renderers. Voice, backend, models, billing and caps are untouched.
- `workspace.css` is unchanged, so the separate greeting/sidebar correction can
  be integrated without overwriting its styles. MobileChatApp only adds the
  `workspaceUI` prop to its existing PromptLibrary.

## Automated verification

No real login, microphone, generation, search, publishing or Git write occurs in
these tests. JSDOM is a DOM harness, not Safari or visual verification.

Install JSDOM separately if it is not available, and set `QA_JSDOM_PATH` to that
installation's `lib/api.js`. Do not change production dependencies just for QA.

- `node scripts/test-workspace-create-modes.mjs`
- `node scripts/test-workspace-prompt-library.mjs`
- `node scripts/test-workspace-canvas-modes.mjs`
- `node scripts/test-workspace-create-fixture.mjs`
- `node scripts/test-workspace-composer-actions.mjs`
- `node scripts/test-gpt-image-ui.mjs`
- `npm run test:composer`
- `npm run test:voice`
- Existing Workspace voice controls/invariants/persistence/stale-tool checks
- `node scripts/test-gpt-aeo-contract.mjs`
- `node scripts/test-gpt-lineup-frontend.mjs`
- `node scripts/test-media-guards.mjs`

The image render test ignores CSS imports because it checks server-rendered
control semantics. CSS parsing, scope and Noir-specificity contracts are checked
separately. All fixtures and service mocks are under `scripts/`, outside the
production entry graph.

A standard Vite production build plus 16 AEO prerenders was verified using inert
build-only Supabase configuration. This proves compilation, not live account
connectivity. Full app-project TypeScript checking remains blocked by eight
pre-existing JSX syntax diagnostics in `AdminSettingsPanel.tsx`; focused semantic
checking of the mode/dialog production files is separate evidence. Including the
one-line MobileChatApp prop change exposes one existing missing CyclingGreeting
import, owned by the parallel greeting fix. Strict scoped ESLint has zero new
diagnostics versus the pinned base (57 existing errors and 14 existing warnings).
Use `node scripts/check-workspace-create-types.mjs` and
`node scripts/check-workspace-create-lint.mjs` to reproduce those scoped reports.

The pinned base's aggregate Workspace rollout script has an obsolete welcome
layout assertion at line 116. The greeting/sidebar correction owns that update.
Older Canvas/Search motion-parity scripts pin older releases (`7b3f51db` and
`014fe504`) and also fail against the current base; the new Canvas suite pins this
review's exact base and compares 128 handler/effect/editor/action contracts.
CDP/Chromium-only browser scripts are not evidence for this Safari-only review.

## Isolated Safari fixture

Build: `node scripts/build-workspace-create-qa.mjs /tmp/arc-workspace-create-qa`
Serve that directory over localhost, for example:
`python3 -m http.server 5182 --bind 127.0.0.1 --directory /tmp/arc-workspace-create-qa`
Open `http://127.0.0.1:5182/` in Safari on the same computer.

The fixture uses actual production view components with explicit local mocks.
It includes image options, attachment previews, Git controls, prompt library,
enhancer previews and the existing nine-action menu. It is built for Safari 16+
and scans the output for live service markers. It is never imported by the app.
Writing/code/search action buttons in this fixture only set a local draft or
status; their actual panels/shared dialogs are covered by the separate offline
component suite and require the production Safari checklist below.

## Safari-only visual checklist (not yet run)

Check 320, 390, 844 landscape, 1024 and 1440px widths, plus keyboard-visible and
reduced-motion cases. Do not use Chrome/Chromium as a substitute.

1. Dark, light and system: pure-black dark page, neutral raised cards, clear
   selected Git/image states, readable hover/focus/disabled states, no old glow.
2. Open every `+` item; close via Escape/outside/trigger and repeat. Verify all
   original callbacks still select their real mode and focus the correct field.
3. Image controls: Free and Boost fixture modes, each model, all sizes/counts,
   edit's Match original, no horizontal clipping or overlapping panels.
4. Attachments: long filenames, images and documents together, each remove and
   Clear, overflow scrolling, real allowed/unsupported file and limit handling.
   File-picker Cancel must leave the composer usable.
5. Git: empty list/error/refresh, allowed-repository filtering, long repo/branch
   text, Normal/Pro entitlement states, clear mode/reopen. Use fixtures for
   connect/disconnect; do not change live credentials or repository access.
6. Prompt library: categories/keyboard, refresh loading/error fallback, exact
   selection/prefill, repeated open/close, focus return after Escape and no focus
   theft after a selected prompt. Do not select image presets on a live account,
   because the unchanged production callback can send them immediately.
7. Writing/code Canvas: format, undo/redo, save/restore, copy/download,
   code/preview/device controls, close/reopen, mobile menus and safe-area overflow.
8. Deep/Ultra Search: existing depth controls, query/follow-up fields, saved links,
   history menus and dismissal. Inspect existing/local results; do not run a paid
   search solely for this visual QA.
9. Publish/site/image dialogs: rounded neutral presentation, keyboard keeps
   fields/footer visible, Tab focus stays in dialog, Escape/outside behavior and
   return focus. Retain warnings and disabled-busy states. Do not publish,
   update, unpublish, upload or change account data during visual review.
10. Integrate greeting/sidebar/dashboard work, then repeat affected checks and
    aggregate rollout/build before considering release approval.
