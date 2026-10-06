# Monthly image policy: local source handoff

Base: `86a32b3c5972d247861a0f701d69322409ab9b89` (`origin/main` at inspection). Work was implemented in an isolated clone; unrelated changes in `/Users/jakefreudinger/chatwitharc` remain untouched. No push, deployment, production SQL, paid provider request, billing change, new secret, native build or TestFlight upload occurred.

## Implemented policy

- Free: 30 Flare Low outputs per UTC calendar month; other models remain unavailable.
- Boost: 250 shared monthly credits. Square costs: Flare Low/Medium 1, Lite 3, Sunburst High 4, Nano Banana 2 5. Larger/source edits: Flare Low 1, Flare Medium 2, Sunburst High 6. Admins bypass quantity limits.
- Automatic monthly renewal and optional one manual 100% base refill per month. Claims replace the unused base balance rather than stacking. Free/Boost refill flags are independent; server enforcement rejects stale clients. Bonuses remain separate.
- Scheduled bonus, extra-refill and unlimited offers support preview, confirmation, reason, audit and pause/resume/revoke. Unlimited offers retain model eligibility. Bulk Free/Boost base reset uses a previewed account cohort and does not reset bonuses.
- Builder assets use a real owned running app/project context, Flare Low by default, including transparency. Sunburst requires the actual user's request for better images. Configurable attempted-output caps default to 50/day, 10/run; premium subset 5/day, 3/run. Admin quantity bypass remains. Builder usage does not debit ordinary image credits and is not advertised as a plan perk.
- Reservation, claim, job request and admin confirmation replays are idempotent. Allocation refunds retain bucket generation and month; tier changes retain consumption. Legacy in-flight jobs keep legacy settlement.

## Models and provider readiness

GPT models remain `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`. Quality is now captured explicitly: Flare Low/Medium or Sunburst High. Supported sizes are 1024x1024, 1536x1024, 1024x1536, 1536x864; matching-source edits use auto and conservative larger-shape cost.

Google models are `gemini-3.1-flash-lite-image` and existing `gemini-3.1-flash-image`, using the existing Interactions adapter, native 1K JPEG output. Lite has no invented medium/high API quality switch. Free starts with Flare Low; paid users can choose all five picker configurations. Saved valid paid choices are preserved.

Code expects existing `OPENAI_API_KEY` and `GEMINI_API_KEY`, existing private image storage, Supabase auth/service configuration and existing cloud-run infrastructure. Production secret presence, Lite model access and real provider/storage completion have **not** been verified. No secrets were copied into the clone. Provider fixture tests cannot prove paid account readiness.

## Validation

- `node scripts/test-monthly-image-policy.mjs`: PASS against a disposable local PostgreSQL cluster, compiling the complete migration and exercising actual RPCs. Includes concurrent admission, tier cycling, month rollover, late refunds, real Work/Builder receipt paths, admin privilege boundaries, campaigns and refill fencing. Requires PostgreSQL binaries on PATH; no remote database.
- `deno test --allow-env --allow-net supabase/functions/_shared/imagePolicy_test.ts supabase/functions/_shared/arcImageFlash_test.ts`: 8 passed, 0 failed; provider calls are mocked.
- Deno check of changed generation/edit/cloud-worker endpoints and shared runtime files: PASS.
- `VITE_SUPABASE_URL=https://fixture.example.test VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build`: PASS, including blog prerender.
- Focused ESLint: 0 errors, one existing-style Fast Refresh warning for the quota hook's exported constants.
- `git diff --check`: PASS. AGENTS.md, CLAUDE.md and CODEX.md remain identical.
- Actual browser fixture checks: PASS at 412px and 1280px for tier picker, Lite choice, monthly balances, refill confirmation/claim, disabled control hiding, admin preview/confirm/settings allowlist, no horizontal overflow and no JS exceptions. Screenshot evidence accompanies this file.
- Existing shared cloud suite: 27 passed, 3 failed. The same 3 fail on the untouched baseline: native 16:9 provider dimensions, durable storage-outage receipt, R2 accepted-upload reconciliation. Existing storage fixtures are out of date. Deno type-checking those test fixtures has baseline errors; endpoint checks pass.
- Full frontend type-check remains blocked by baseline AdminSettingsPanel JSX syntax. With that unused file excluded, baseline and changed checkout have the same 47 TypeScript error signatures; none are introduced by this patch. Production build passes. The temporary exclusion config was removed.

Browser reproduction: start Vite on 5174 with fixture.supabase.co and a fixture publishable key; start isolated Chrome using `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --no-first-run --disable-background-networking --remote-debugging-port=9237 --user-data-dir=/tmp/arc-monthly-ui-fixture`; run `node scripts/test-monthly-image-ui.mjs`. All external requests are intercepted. Software WebGL is necessary for the app's existing glass dialog effect in headless Chrome. The QA page is DEV-only.

## Release gates and iOS coordination

The migration changes existing unlimited Boost to a finite monthly balance. Decide the transition/grandfathering and announcement policy before applying it. Defaults enable both refill controls; no campaign is created by the migration. The accepted base-plus-one-refill Boost output-only estimate is approximately $6.72/month, not a total invoice or input/storage estimate.

Release the SQL migration and compatible backend/frontend together after review and account readiness checks. Old native clients assume unlimited Boost and may request Sunburst edits on Free; server restrictions will reject unsupported requests. Validate an actual authenticated image/edited image through private storage after release authorization.

The inspected build21 archive contains bundled `dist-ios` web assets, no server.url and no live updater. UI changes require a new native/TestFlight build. The existing release thread **Resume Arc Fixes and Signing** (`01a10204-95e6-7189-921e-63efc1c350cf`) owns native packaging/signing. This task supplies source only; do not duplicate its archive or upload work.
