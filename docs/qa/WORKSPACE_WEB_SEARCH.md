# Workspace ordinary web-search results

The existing ordinary search result card now opens a read-only answer/source
viewer in the Workspace theme. The source badge used by automatic tool searches
and reply metadata opens the same viewer on its Sources tab. Opening a result
never repeats a provider request or consumes an allowance.

## Boundaries

- Ordinary search still uses the existing Chat/Work route. Source excerpts accept
  both Tavily's `content` and Work's `snippet` fields.
- Deep/Ultra research, source persistence, model routing, quotas, billing,
  AEO/prerender and voice controllers are unchanged.
- Legacy/native fallback retains its existing card and source accordion.
- The image carousel remains in the original result card with its existing
  callbacks. The answer uses the shared rich Markdown renderer.
- The viewer shows every recorded source, including unavailable links without
  making them actionable. Only HTTP(S) source URLs can be opened.
- Loading feedback applies to loading the answer view; render failures preserve
  the source list and a return-to-chat action. Search/provider errors remain in
  the existing request flow. A result with no sources is explicitly labeled.

## Automated checks

From the repository root:

1. `node scripts/test-workspace-web-search.mjs`
   - Uses actual React/Radix components in JSDOM, inert source data and mocked
     service-connected artifact leaves. No browser, login or provider calls.
   - Covers result/source entry points, Markdown tables, all source excerpts,
     filtering/empty state, invalid URLs, copy success/failure, lazy loading and
     render errors, title focus, focus trap, Escape/restore/reopen, nested reply
     dialogs, legacy isolation, and dark/light Noir input cascade.
   - Uses `QA_JSDOM_PATH` if set. Default local QA dependency path is documented
     in the script; install jsdom separately when running elsewhere.
2. `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=offline-build-placeholder npm run build`
   - Build-only inert values. No live provider calls. Expect 16 prerender pages.
3. `node scripts/test-workspace-canvas-modes.mjs`
4. `npm run test:voice` and `npm run test:composer`

The baseline currently has unrelated TypeScript diagnostics in other files and
seven pre-existing `no-explicit-any` lint errors in SearchResultsCard's shared
Markdown typography map. Do not call the whole project type/lint clean.

## Safari visual QA

Build the isolated fixture:

`node scripts/build-workspace-web-search-qa.mjs /tmp/arc-workspace-web-search-qa`

Serve that directory on localhost and open it in Safari. The fixture mounts the
actual production card, source badge, dialog, theme and rich Markdown map, with
inert QA data and artifact leaves. It contains no account/provider client.

Check 320px and 390px phones, 768px tablet and a wide desktop:

- Dark is flat black/neutral; Light is opaque light; System follows Safari's OS
  preference. No frosted backdrop, glossy effect or colored carousel controls.
- View search opens the answer; the source-count badge opens Sources. Both have
  a visible close button and return to the exact trigger after dismissal.
- Tab stays within the dialog. Arrow keys switch tabs. Escape and outside click
  dismiss. A source viewer opened from reply details closes before its parent.
- The long-query option wraps/scrolls the title without hiding controls. Every
  source is reachable. Long URLs and snippets stay within the panel.
- Source filter text is 16px. Opening the modal does not summon the keyboard.
  While typing, the panel fits the visual viewport, retains safe-area clearance,
  and keeps Close/Back to chat reachable without horizontal scroll or iOS zoom.
- Filter to a missing word, clear it, copy the answer and deny clipboard access.
  Empty/error feedback is readable and doesn't replace the recorded reply.
- Close and reopen repeatedly; the intended tab/filter reset, no stale copied
  state, and the underlying chat remains in place.
- Legacy presentation keeps the previous card and expandable source list.

No Safari screenshot or physical Safari layout validation is implied by the
fixture build or JSDOM checks. Live search health is a separate backend check.
