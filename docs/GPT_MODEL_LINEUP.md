# GPT model lineup: October 10, 2026 review candidate

This describes the cloud release candidate based on
`e562f1fdc5f1a729d083b3b95d5a190c9efc4f63`. It does not claim a production
deployment or a live provider test. Billing catalog/copy work is tracked
separately; do not publish new prices before checkout and entitlement support.

## Approved model and allowance policy

| Choice | Route | Reasoning | Access |
| --- | --- | --- | --- |
| Auto | Luna for conversation/analysis; Sol for writing, Canvas, code, file generation and quick web search | Task-dependent | Free and Boost; clear premium-allowance warning |
| GPT 6 Luna | `gpt-6-luna` | none/low/medium/high by task difficulty | Everyone, no ordinary account allowance |
| GPT 6.1 Sol | `gpt-6.1-sol` | low for chat; low/medium/high elsewhere | Free and Boost, Sol pool |
| GPT 6 Astra | `gpt-6-astra` | low for chat; low/medium elsewhere | Current server-verified Boost or existing admin identity; separate Astra pool |

UI Light maps to the real API enum `low`. Exact icons are RefreshCcwDot,
MoonStar, Sun and Galaxy. The existing Lucide package lacks Galaxy, so its
official ISC-licensed icon geometry is locally wrapped without upgrading
unrelated icons. Retired Think/Flash/Flynn and old effort preferences migrate
to Auto; historical message metadata remains truthful.

Approved accounting policy is Free Sol $0.05/day and $1/calendar month,
Boost Sol $6/calendar month, and Boost Astra $3/calendar month. Boost has no
additional daily premium cap. Administrators are observed without an account
cap. Luna cannot have quota enforcement enabled. These are internal cost
allowances, not a customer wallet or bill; the UI displays percentages only.
Auto and explicit premium requests fall back to Luna when the relevant pool
is exhausted, with the actual model and a visible notice.
During staged rollout, new nonadmin premium requests also fall back to Luna
until their policy is both configured and active. The notice explains that
premium models are being updated. Existing provider sessions retain their
actual route and finite provider ceiling; administrators remain metered.

The future Boost Pro pricing tile contains only its name and a diagonal
Coming soon banner. It has no price, features, checkout or activated billing.

## Runtime coverage and compatibility

- `arcModelRouting.ts` is the pure shared selection/task/effort resolver.
  `arcModelAccess.ts` verifies existing `admin_users` and `user_has_boost` on
  the server. Client flags, editable metadata and claimed email grant nothing.
- Ordinary Chat, event streaming, Canvas/code/tool loops and durable Work/Git
  use the existing Agents pipeline for premium requests. The raw Luna/none
  stream remains available and requests final usage metadata. Sol/Astra never
  enter the unsupported Chat Completions function-tool route.
- `arcModelUsage.ts` reserves each logical submission/provider attempt,
  pins durable actual routes, records cumulative usage and rejects ambiguous
  repeated provider POSTs. Effective completion inputs and media identities
  are hashed, never stored as prompt/attachment content in the ledger.
- `arcTextCompletion.ts` covers text/document/image analysis and file content.
  Text-only premium completions reserve a conservative UTF-8 input bound,
  cache-write upper bound and capped output/reasoning tokens. Premium vision
  uses a provider-capped Agents session, retaining every image input rather
  than estimating image tokens from a URL's length.
- Inline non-image document payloads preserve the existing Luna transport
  and show an explicit model-switch notice. The documented Agents input
  schema supports text/images, not native file blocks. Extracted text can
  still use premium models. Do not claim native premium PDF support.
- Durable Work retains its existing Boost/tool/approval gates. App Builder
  retains Fast/Pro, current Boost access, file ownership and publication fences;
  Pro Sol uses the same account ledger. Resume never relabels an already-started
  provider when an allowance replenishes. Done-state retries reserve nothing.
- Prepared-but-not-started durable attempts are released on failure/expiry;
  unknown POSTs and existing sessions keep their holds. Confirmed terminal
  cancellation settles available usage. A final accounting outage retains
  its hold without discarding a finished answer; interim accounting failure
  stops further model rounds.
- Actual model, effort and fallback notice survive queues, continuations,
  durable results, analysis and file calls. File tools inherit the selected
  route instead of silently escalating explicit Luna to Auto Sol.
- New UI image choices are GPT-only. The two exact old Nano/Lite request IDs
  are compatibility aliases to Flare HQ for server-verified Boost/admin users;
  Free, unverified tiers and other Gemini IDs remain blocked. Aliased requests
  use normal Flare pricing (1–2 credits), lower than the old Lite/Nano 3/5, and
  return actual Flare metadata plus the existing fallback notice. This does
  not claim identical Nano image quality. Original native/1K request hashes
  remain identity-only so existing jobs replay unchanged and never rerun or
  recharge. No Google provider call occurs.
  GPT Flare/Sunburst, old stored images, credits, source ownership, alpha,
  refunds and legacy in-flight settlement remain. Multi-source GPT edits pass
  all ten supported inputs and preserve source shapes within existing limits.
- Deep `/search` + Luna synthesis and Ultra `/v1/agent` preset low remain
  unchanged, including the existing synchronous compatibility fallback.
  Perplexity remains the explicit research exception.
- Voice source files, provider settings, audio, limits and tests remain
  unchanged. Untagged camera analysis ignores raw premium overrides and uses
  the exact legacy Luna contract. The narrow unparameterized voice reminder
  client uses Luna/low without the new ledger or usage notifications. Explicit
  typed text selections during a call remain normally metered. Old installed
  Chat clients with retired effort selectors or no model selector stay on Luna
  with their supported prior effort and no new accounting dependency. Canonical
  premium selectors still require authorization and accounting; a conflicting
  raw premium hint on the retired-selector path is narrowed to Luna.
- Existing background summaries/titles/prompts, scheduled tasks, parallel
  Luna helpers and legacy builder calls were audited as Luna, not Gemini.
  This patch does not introduce comprehensive new telemetry for every
  background or voice call. Premium allowance coverage is not an invoice for
  every service Arc operates.

## Accounting limits that must remain explicit

Agents spend control is a positive whole-cent session limit. The application
uses the atomic reservation's ceiling and applies it to legacy resumed
sessions before continuation. The provider docs do not establish a zero-
overshoot financial guarantee. Account reservations prevent ordinary races;
reported overshoot is recorded and blocks subsequent premium admission.

Agents token counts are best-effort, may be revised after completion, and omit
cache-write detail. Missing writes are conservatively estimated and labeled;
unknown total usage is not zero. Aggregate long-context uncertainty is also
labeled. A completed session is not an authoritative invoice. Unknown or
ambiguous outcomes are held for reconciliation, not automatically refunded
by age. The revision-fenced reconciliation RPC requires trusted accounting
facts. See `docs/qa/arc-usage-ledger.md`.

## Verification evidence and open gates

- Production Vite build and all 16 prerendered public pages pass with dummy
  public client configuration, without a production query.
- 67 endpoint regression groups pass using real handlers, routing/accounting
  helpers and Agents wire adapter with mocked database/provider traffic.
- 439 offline Deno cases pass across the available shared runtime and
  cloud-run endpoint suites, including lifecycle/provider and staged-policy
  fallback cases.
- Composer, unchanged voice transport/lifecycle, GPT selectors, captured
  selection/metadata, percentage owner isolation, and 30 image-picker renders
  pass. Focused ESLint and changed-source syntax checks pass.
- Billing adds 38 mocked real-handler regression groups and 536 serial SQL
  assertions across 68 accounts. Website/Play DOM checks preserve localized
  store pricing, the old SKUs, grandfathered renewals and current $15/$115 offers.
- The final nine-entrypoint Deno check lost its execution-session result after
  a cancelled tool review; its completion is unverified. The completed broad
  runtime test/typecheck suite above is separate evidence, not a substitute
  for the missing final entrypoint result.
- Full application TypeScript still reports the same eight pre-existing
  `AdminSettingsPanel.tsx` JSX errors as HEAD. Unchanged old cloud-image test
  fixtures also have nine existing type mismatches. These are not silently
  reported as a complete clean repository type check.
- Broad Deno exclusions: old cloud-image fixture mismatches; its native SQL
  test assumes macOS Homebrew/Postgres sockets; publisher test requires a
  separate WASM fetch; safeRemoteMedia test requires the unavailable JSR
  assert module. Existing media-guard and new GPT-image fixtures pass.
- PGlite accounting tests and native PostgreSQL 17 single-backend SQL tests
  pass. Native multi-connection races and browser smoke cannot run because
  the cloud environment rejects local IPC/Unix sockets. No native concurrency
  or browser pass is claimed. The existing detached frontend-lifetime
  integration test also assumes macOS Homebrew PostgreSQL and requires the
  unavailable socket-based cluster; its first pure Git-routing case passes.
- All 46 tracked voice/realtime/speech source and test files are byte-identical
  to freshly fetched remote main `e562f1f`; dedicated voice tests pass.
- Independent SQL review found account/pool advisory lock order consistent,
  private table grants/RLS correct, owner-only reads, service-role-only writes,
  revision-fenced reconciliation and retained totals across tier changes. Its
  final runtime recheck stopped under a platform restriction. That final
  independent gate remains incomplete; subsequent ordinary mocked functional
  regression checks pass and are not a substitute for that review.
- No paid model calls or Git push were made. After release-owner approval,
  the two additive migrations and eight model Edge bundles were staged in
  production; all policy flags remain off. Retrieved runtime source matches
  the reviewed commit byte-for-byte. Billing Edge functions and the frontend
  are still pending their coordinated stage. Live provider execution is unverified.

## Verified production baseline

Read-only verification on October 10, 2026 confirmed current production Netlify
`6ac9aec72a09190008c924eb`, Published main at the baseline SHA above:
<https://6ac9aec72a09190008c924eb--askarc.netlify.app/>. Main auto-publishing is on.
The deployment details are
<https://app.netlify.com/projects/askarc/deploys/6ac9aec72a09190008c924eb>.
`docs/qa/gpt-release-baseline-20261010.json` records all 11 affected live Edge
bundle versions, SHA256 values and existing JWT flags. Preserve those flags;
function version numbers alone do not establish source identity.

Billing infrastructure is unchanged. Missing expected webhook variable names
were investigated read-only; no current payment outage or regression caused by
this patch was demonstrated. Actual Stripe webhook delivery remains untested.
See `docs/BOOST_BILLING_CATALOG.md`; the pricing rollout is not an authentication
or gateway redesign and does not change credentials.

## Release sequence

1. Review this patch, the billing patch and the explicit gaps above. Keep
   unchanged voice functions out of every deployment list.
2. Apply `20261010051758_arc_usage_ledger.sql` observation-only. Apply the
   additive `20261010051816_boost_price_catalog_v2.sql` billing migration. Snapshot policy/rollout state first; never change current
   subscriptions or replace old Stripe prices.
3. Deploy covered backend bundles before the frontend: `chat`,
   `analyze-image`, `analyze-document`, `generate-file`, `generate-image`,
   `edit-image`, `cloud-run`, `cloud-worker`. Leave `cloud-scheduled-worker`
   v21 unchanged: although it imports the worker module, its registered sweep
   is the unchanged Luna-only reminder path. Both retrieved-live and candidate
   boundary tests prove fixed Luna/low/4096/no tools and no premium selector.
   Updating its unrelated older import closure is deliberately excluded.
   Deploy `create-checkout` and `payments-webhook` for the current purchase
   catalog; keep `payments-portal` and the existing Stripe authentication path unchanged. Shared modules ship inside these bundles.
   `perplexity-search` has a comment-only correction; no behavior deployment
   is needed for this model migration.
4. Verify authentication, existing-owner access, schema/RPC grants, current
   entitlement reads, worker health and observation policy using approved
   non-spending checks. Old image-analysis/file clients remain Luna-compatible;
   old Nano/Lite generation/edit preferences use the documented lower-cost
   Flare alias with truthful metadata. Physical installed-iOS behavior remains
   untested; its separate source/binary is not present in this checkout.
5. Deploy the frontend only when checkout resolves the verified new prices,
   grandfathered subscriptions remain recognized and all backend bundles are
   confirmed. A push to main is a frontend production release, not a backend
   deployment.
6. After the release owner's explicit go-ahead, atomically activate only the
   Sol and Astra policy rows. Verify owner percentage RPCs and policy values.
   Do not activate Luna or the unused observation pools. New nonadmin premium
   admission stays on Luna until activation, so staging cannot open an
   unbounded account allowance. Inspect/drain legacy unlimited provider
   sessions before activation. Any live paid smoke test requires separate
   approval.
7. Verify live revision/configuration and preserve the independent review gaps
   in release notes. For a problem, keep Luna available and block new premium
   admission; do not turn off quotas to disguise a failing premium route.

The release owner controls each stage and records actual production evidence.
Stages 1–3 were approved for additive schema/model staging only; that does not
authorize billing deployment, frontend publication or allowance activation.

### Stage rollback and verification

- Database stage: keep the additive schema and approved policy rows disabled;
  do not destructively drop ledger/history tables. Old clients and servers do
  not depend on the new tables. Record applied migration versions and verify
  grants, policy amounts, and the two disabled premium flags read-only.
- Backend stage: use the reviewed old Edge bundles if a new function regresses,
  before enabling premium policy. Keep the old frontend until all covered
  functions are present. Record each deployed function version/revision and
  compare its retrieved source manifest with the reviewed artifact, including
  bundled shared modules. A successful deployment command alone is not proof
  of the expected code running. Do not test by spending provider credits.
- Frontend stage: revert the frontend to its prior release if necessary while
  leaving compatible schema/backend in place. Old checkout price requests
  must ask the customer to refresh rather than silently changing the amount.
  Keep current-subscription recognition and renewal prices intact.
- Activation stage: after this runtime is deployed everywhere, disabling Sol
  and Astra policy together blocks new nonadmin premium admission through the
  staged Luna fallback; it no longer opens uncapped premium access. Existing
  provider sessions remain pinned and capped until terminal. Do not deploy an
  old uncapped premium backend after activation as a shortcut rollback.
- In all stages, Luna, existing authentication/tool behavior and the unchanged
  voice deployment remain available. Unknown provider outcomes keep holds for
  evidence-based reconciliation. They are never refunded solely by age.
