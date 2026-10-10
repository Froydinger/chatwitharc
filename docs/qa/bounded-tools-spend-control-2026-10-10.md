# Bounded tool transport repair: October 10, 2026

Status: **offline-tested candidate; not deployed; no live or paid model tests**.
Baseline: released main `6bcee0db5b42c63acd3a39773ddb0f4f976c2b35`, live Chat v108.
This report covers the provider/tool repair only, not the separate UI hotfix.

## Confirmed failure

Read-only production logs showed an initial `/v1/agents/sessions` HTTP 400
rejecting `spend_control`, before a session or tool action was created. The
failure occurred for Astra and Luna. The prior recovery intentionally handled
only plain-text work, so a weather/action prompt could still fail before
`get_weather`. The weather service itself is the existing Open-Meteo integration.
No private conversation content, API keys or credentials were needed to diagnose
the request-shape error. All 27 live Chat v108 files matched the released source.

Four active callers created Agents sessions: Chat, premium image analysis,
durable Work/Git and durable App Builder. Fixing Chat alone would leave three
caller families broken. Existing deployed analysis/file/worker closures also
contained an older shared rejection classifier, so their whole import closures
must be deployed together when approved.

## Compatibility boundary

New canonical requests use supported Responses function tools through a reversible
adapter. The existing Chat tool loop and durable engine still own execution,
approvals, receipts, owner checks, interruptions and result presentation.

Before **each** generation, the adapter sends the complete effective input,
instructions, media, function schemas and reasoning configuration to
`/v1/responses/input_tokens`. It then chooses a finite `max_output_tokens`
(including reasoning) within the existing remaining reservation, using the
highest applicable input/cache-write rate and long-context rates. It requests
standard service tier and only registered Arc functions, with parallel calls
disabled. There are no provider built-in paid tools and no automatic POST retry.
Luna retains a finite per-run ceiling even when its unmetered ledger is unavailable.

Each confirmed response stores actual cumulative cost under an immutable receipt.
The response's reservation ID and pre-response cumulative boundary are checked
before accounting, so replaying a saved response does not add its cost twice.
A present mismatched model cannot be priced or released by polling or cleanup.
Missing usage and an interim ledger failure block subsequent model steps. A final
ledger outage preserves the completed answer and the reservation for reconciliation.

HTTP 408/409, server errors, malformed accepted responses and network timeouts
remain ambiguous. They retain the hold and never trigger a second generation.
Only definite pre-generation rejection can settle zero **new** cost; prior
confirmed rounds still remain charged. Known terminal cancellation settles actual
reported cost. Tool-phase stops retain the last confirmed response ID for cleanup,
but an unresolved newer generation intent prevents settling an older response.

Initial input-fit exhaustion may switch premium to a fresh Luna reservation only
after proving no generation started and releasing the unused premium hold.
Durable jobs checkpoint this server-owned marker and then pin the Luna route and
distinct attempt identity on the next lease before POST. Later-turn exhaustion
does not restart or reroute already performed work. There is no new SQL migration.

### Streaming and voice

The ordinary frontend uses `streamEvents: true`, not the raw `stream` flag.
That path keeps incremental assistant text using `background: true, stream: true`
on the same bounded Responses creation request. A disconnected stream switches
only to GET polling of the accepted response ID. The SSE reader is display-only:
tool execution/accounting waits for the authoritative full response. It excludes
reasoning, commentary, function arguments and subagent output, deduplicates
events, bounds memory, and cleans up on abort.

The raw text stream also emits incremental text in its existing delta/done shape;
the final result includes actual model/effort, switch notices, signed tool history,
weather/search data and supported presentation metadata. Canvas/code artifacts
remain complete-result deliveries, rather than displaying partial artifact JSON.

Voice and legacy installed-client markers retain their original provider path.
Independent baseline/candidate testing found 64/64 identical actual-handler voice
provider payloads/transports, 67 protected files byte-identical, and unchanged
native voice/WebRTC transport tests passing. No voice configuration was edited.

## Caller and tool coverage

“Passed” below means offline/mocked execution or source parity, **not** a live
provider or third-party service check. Missing capabilities are not disguised as
a successful plain-chat fallback.

| Caller / capability | Candidate behavior | Evidence / status |
| --- | --- | --- |
| Auto, explicit Luna/Sol/Astra Chat | Bounded Responses; actual route/effort preserved | Actual-handler tools across all three models; independent 528 wire combinations, 288 route cases, 24 Free-Astra denials, 288 price cases passed |
| Weather near me | Existing `get_weather`, user-provided location context and Open-Meteo result/card | Luna/Sol/Astra tool rounds; coordinates, city, absent-location clarification, service error and actual result synthesis passed |
| Quick web search | Existing function and source/result presentation | Real Chat dispatcher with mocked search passed for all three models |
| Deep / Ultra research | Existing Perplexity `/search` plus Luna synthesis / `/v1/agent` preset low | Source routing and existing mocks passed; unchanged; live research unrun |
| Canvas / write / code | Same forced functions and complete artifact schema | All-model actual-handler dispatcher and raw/event stream artifact tests passed |
| Git chat / Work | Existing repository, branch, owner and approval gates | All-model Chat Git functions and durable Git/Actions suites passed |
| Work continuation / approvals | Same durable tool receipts, interruption and resume contract | Worker/engine fixtures passed, including replay, cancellation, limits, failed checkpoints and unknown outcomes |
| App Builder Fast / Pro | Existing Luna/Sol routes, six functions and publish fences | Offline App/worker fixtures passed; external WASM publication build unrun |
| Image analysis | Premium bounded image-aware Responses; existing Luna compatibility | Actual-handler multi-image, input-fit fallback, missing usage, 408/409 and release-failure fixtures passed |
| Document / file / prompt enhancement | Existing text completions; definite rejection classifier corrected | Actual-handler route/access/ledger fixtures passed; inline non-image native documents still explicitly use Luna |
| Image generation / editing | Existing Flare/Sunburst jobs and separate credit reservations | Source and existing mocked image-policy/ownership/refund tests; unchanged; live paid image calls unrun |
| Scheduled tasks / background helpers | Existing Luna-only scheduling execution and helper routes | Registration/routing and existing task/helper mocks passed; scheduler bundle unchanged |
| Voice / camera / old installed client | Original compatibility model, effort and transport | Exact baseline/candidate parity passed; no live voice call |

All 18 Chat function names are exercised through the actual dispatcher for Luna,
Sol and Astra (54 tool/model combinations):

- `open_bug_report`, `web_search`, `search_past_chats`
- `update_canvas`, `update_code`, `generate_file`, `save_memory`, `get_weather`
- `send_notification`, `schedule_task`, `update_scheduled_task`, `spawn_subagents`
- `git_search_repository`, `git_read_repository`, `git_apply_repository_changes`
- `browserbase_open_live_site`, `browserbase_act`, `browserbase_close_session`

Work's complete available registry has 23 functions: the two Canvas functions,
two read/search functions, memory, schedule get/create/update, file, image
generate/edit, notification, weather, three repository functions, four GitHub
Actions functions, and three browser functions. `build_app` remains deliberately
disabled in Work. Builder's six functions remain inspect, read, apply, publish,
image generation and image editing. Existing function authorization, approval,
quota and separate paid-service reservations are unchanged. This repair does not
claim to create new all-service accounting coverage where none existed before.

## Reproducible validation

All requests in these suites use injected fake database/provider/tool services;
unexpected network access fails. The test harnesses are checked in:

```sh
node scripts/test-bounded-chat-tools.mjs
node scripts/test-bounded-durable-tools.mjs
node scripts/test-gpt-server-lineup.mjs
deno test --no-remote \
  supabase/functions/_shared/boundedResponseStream_test.ts \
  supabase/functions/_shared/boundedResponsesProvider_test.ts \
  supabase/functions/_shared/arcModelUsage_test.ts \
  supabase/functions/_shared/arcModelRouting_test.ts \
  supabase/functions/_shared/cloudRunEngine_test.ts \
  supabase/functions/_shared/cloudRunWorker_test.ts \
  supabase/functions/_shared/durableArcProvider_test.ts \
  supabase/functions/_shared/chatArtifactStream_test.ts
```

Final candidate rerun:

| Suite | Result |
| --- | --- |
| Native Deno shared production/typechecked suites above | 187 passed, 0 failed |
| Actual Chat handler and all 18 tools | 82/82 passed; 0 external network attempts |
| Durable Work, App, worker and artifact stream (offline loader) | 123/123 passed |
| Actual model-aware server handlers | 72/72 passed |
| SSE reader (included in native total) | 30/30 passed |

Totals overlap; do not add them as unique test cases.
The provider fixture also checks 360 model/reservation/input/output combinations,
including the 272,000-token long-context boundary, without generating any tokens.
Focused lint, whitespace checks and the production Vite build with dummy public
configuration passed; the build prerendered all 16 public pages.

Blocked/unrun checks must remain explicit:

- Full native endpoint typechecking is blocked by uncached remote Deno/Supabase
  imports under `--no-remote`. Shared production helpers are checked by native
  Deno tests. Transpiled actual-handler fixtures are not a substitute for that
  missing full endpoint typecheck.
- Existing cloud-image fixtures have unrelated configuration/type failures; the
  publisher test needs an external WASM fetch. Neither is reported as passing.
- Existing full-app TypeScript JSX errors are outside this provider patch.
- No production database write, deployment, push, live weather/search/browser
  action, paid model/image call, or live model-quality assertion was performed.
- The single user-authorized Astra live-test allowance is unconsumed here and
  remains coordinated by the release owner, with no automatic retry.
- Existing research quota/citation limitations remain separate pre-existing
  follow-ups. This change does not assert complete citation coverage.

## Staging and rollback

After independent review, the affected runtime deployment closures are:

1. `chat`
2. `cloud-worker` (includes Work and App Builder)
3. `analyze-image`
4. `analyze-document`
5. `generate-file`

Deploy each with its complete shared import closure. No schema migration or
secret creation is needed. `cloud-run` uses routing only to validate access and
discards its resolved task/model; actual execution routing is in the patched
worker, so the alias-regex edit does not require its redeployment. Do not
redeploy unchanged voice, scheduled-worker, research or image-generation bundles.
The scheduled worker imports the worker HTTP boundary transitively but executes
its own unchanged Luna-only sweep.

The configuration switch `ARC_BOUNDED_RESPONSES_ENABLED=false` returns **fresh**
Chat/Work/Builder selection to the prior Agents adapter with its spend cap still
present. This may restore the known provider rejection; it is a safe stop/revert,
not an unbounded compatibility bypass. Saved Agents sessions remain Agents;
saved Responses jobs remain Responses even after switching selection off.

Do not restore a pre-adapter `cloud-worker` bundle while saved Responses jobs
exist, because it cannot safely continue their transport. Use the selector switch
and keep this compatible worker, or drain/reconcile those jobs before restoring
older code. Image analysis is request-scoped and can use its previous bundle
after in-flight HTTP requests finish. Keep reservations and receipts intact.

## Official provider contract references

- [Input-token counting guide](https://developers.openai.com/api/docs/guides/token-counting)
- [Responses input-token count API](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count)
- [Responses creation API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Background responses and streaming](https://developers.openai.com/api/docs/guides/background)

These establish the request and streaming contracts. Offline tests verify Arc's
use of them; they do not establish this project's live provider availability.
