# Gemini handoff: dormant integration reference

**Status: historical reference only. Gemini is retired from the GPT-only Arc
lineup. Do not use this document, a retained adapter, an old model ID, or a
configured secret as permission to enable a provider.** Perplexity research is
a separate integration and remains in scope for the active product.

This audit records the implementation at commit
`e562f1fdc5f1a729d083b3b95d5a190c9efc4f63`, inspected on October 10, 2026,
before the GPT-only changes. File descriptions below describe that baseline,
not a claim that those imports are still active after the migration. Use
`git show e562f1fdc5f1a729d083b3b95d5a190c9efc4f63:<path>` to recover an exact
historical implementation. Retained adapters are reusable reference code;
restoration is a separate, explicitly approved integration project.

The audit used source, tests, migrations, and existing QA documentation. It did
not inspect secret values, contact a paid model, change production, change
billing, or verify live account/model readiness. Model IDs and API contracts
below are **literal historical application configuration**, not a promise that
Google currently exposes them to a particular account. Some previous QA notes
explicitly say authenticated Gemini completion was unverified.

## 1. Important migration findings

The intended removal of Gemini model choice does not itself remove chat,
tools, image generation/editing, voice, research, Work, or App Builder. However,
two concrete image behavior differences require verification or an explicit
product decision before declaring replacement complete:

1. **Multi-source editing:** the old edit endpoint accepted up to ten source
   images. The Gemini branch passed all of them through
   `imageFlashInputs(sources)`. The baseline OpenAI implementation in
   `callOpenAIEditsSingle` appended only `blobs[0]` to multipart form data.
   Simply deleting the Google branch would silently discard the remaining
   references for merge/composition edits. A GPT replacement must forward every
   authorized input using its supported multi-image contract and test input
   order, or explicitly reject unsupported multi-source requests.
2. **Matching the original shape:** Gemini chose the closest of ten native
   aspect ratios. The baseline GPT `sizeFromDimensions` preserved square and
   16:9 specially, but mapped most other portrait/landscape sources to 2:3/3:2.
   A 3:4 source previously selected 3:4 on Gemini. Verify or disclose the new
   behavior; a model retirement must not silently promise exact source shape
   while changing it. Adding new GPT dimensions may also require a reviewed
   quota-configuration change, because SQL validates allowed dimensions.

Those are source-level findings, not claims about a completed provider test.
The migration's implementation and QA evidence should record their resolution.
Changing providers also changes output appearance and potentially latency, but
this audit provides no comparative quality/latency measurement.

The local October 10 migration now forwards every authorized GPT edit source
(up to ten, in order), normalizes retired saved image choices to Flare Low, and
preserves additional source aspect ratios within the existing pixel/cost
envelope. Offline handler and picker fixtures verify these changes; no paid
provider quality or latency comparison was performed. See
`docs/GPT_MODEL_LINEUP.md` for the release candidate and remaining gates.

For old installed clients that still submit the two exact Nano/Lite IDs, the
release candidate adds a server-verified Boost/admin-only alias to GPT Flare
HQ. New jobs charge normal Flare credits (1–2 per output, below old Lite/Nano
3/5), store the actual GPT model/quality and expose `fallback_model` to the
existing client notice. The original native/1K hash is retained for request
identity only, so old jobs and repeated requests never rerun or recharge.
Free/unverified requests and other Gemini IDs remain unavailable. This is an
OpenAI compatibility route, not an active Gemini integration or a promise of
identical Nano quality. No physical installed-iOS smoke test was performed.

## 2. Baseline architecture and source map

| Surface | Baseline path | Gemini involvement |
| --- | --- | --- |
| Explicit Arc Flash chat | `src/store/useModelStore.ts`, `src/components/ChatModelPicker.tsx`, `src/components/ArcControlPicker.tsx`, `src/services/ai.ts`, `supabase/functions/chat/index.ts` | `flynn` selection requested `gemini-3.8-flash`; the server independently admitted the account |
| Auto greeting fast path | `_shared/arcFlashAccess.ts`, `chat/index.ts` | Only narrowly matched greeting/thanks messages; shared the Flash allowance |
| Chat provider/tools | `_shared/flynnProvider.ts`, `_shared/flynnChatSession.ts` | Native `fetch`, Google OpenAI-compatible Chat Completions, bounded function-tool conversation |
| Ordinary persisted Chat | `_shared/ordinaryChatIntake.ts`, `_shared/ordinaryChatResponse.ts` | Captured the submitted model/selection and called the ordinary handler; preserved actual final model metadata |
| Durable Work adapter reference | `_shared/flynnCloudProvider.ts` | Implemented a completion adapter but was already unreferenced by active Work composition |
| Generation | `generate-image/index.ts`, `_shared/arcImageFlash.ts` | Explicit Nano/Lite branch using Google's native Interactions endpoint |
| Editing | `edit-image/index.ts`, `_shared/arcImageFlash.ts` | Same native image API, with all prepared source images as inline input |
| Image preference/picker | `src/store/useImageGenStore.ts`, `src/components/ImageEditModal.tsx`, `src/hooks/useImageQuota.tsx`, `src/components/SettingsPanel.tsx` | `flash`/`lite` modes; shared generation/edit selection and readiness display |
| Historical attribution | `src/lib/imageModelNames.ts`, `src/components/MessageMetadata.tsx`, `src/utils/routeRequest.ts`, `src/lib/pollImageJob.ts` | Names and actual stored model IDs; these are not provider dispatch authority |
| Flash quota | `20260930070000_arc_flash_daily_message_quota.sql` | Atomic Free admission, UTC day counter, private percentage getter |
| Image quota/readiness | `20260930071352_arc_daily_image_credits.sql`, `20261006031918_monthly_image_policy.sql`, `_shared/imagePolicy.ts` | Legacy settlement plus monthly configuration, Lite readiness, reservations and refunds |
| Product/model descriptions | `_shared/arcModelCatalog.ts`, `_shared/arcChatPrompts.ts`, `chat/index.ts`, public pages/SEO | Advertised old choices; text alone did not prove provider availability |

Paths beginning `_shared/` are under `supabase/functions/`. Migration filenames
are under `supabase/migrations/`. Do not modify previously applied migrations
just to erase a retired provider's name.

### Actual network boundaries

- Chat: `POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- Generation and editing: `POST https://generativelanguage.googleapis.com/v1beta/interactions`
- No Google SDK was imported for either path. The implementation used Deno/
  Web Platform `fetch`, `AbortController`, `AbortSignal`, `Response`, `Blob`,
  base64 conversion, and JSON. `package.json` and `deno.lock` did not contain a
  Gemini SDK dependency. A protobuf `google/` namespace is not a Gemini client.
- Supporting libraries were Supabase JS in Edge Functions and ImageScript
  `1.2.17` in the editing pipeline. ImageScript normalized source bytes; it was
  not a provider integration.

## 3. Model IDs, old names, and compatibility labels

| Literal ID/selection | Historical meaning |
| --- | --- |
| `gemini-3.8-flash` | Arc Flash text/tool model; internal constant `FLYNN_MODEL` |
| `flynn` | Persisted chat reasoning selection, not a provider's public model ID |
| `flash` | Arc chat mode label; also a separate image-mode label in image preferences |
| `gemini-3.1-flash-image` | Nano Banana 2; `ARC_IMAGE_FLASH_MODEL` / `IMAGE_NANO` |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite; readiness-gated; `ARC_IMAGE_LITE_MODEL` / `IMAGE_LITE` |
| `lite` | Persisted image mode, not a provider model ID |
| `gemini-3.5-flash-lite` | Already-retired text preference mapped to Luna by `LEGACY_MODEL_MAP` |
| `google/gemini-2.5-flash` | Older SQL profile default; not a baseline active dispatcher |
| `google/gemini-3-flash-preview` | Later historical profile/scheduled-task default; subsequently normalized |
| `Gemini 2.5 Pro` | Stale comments in research/history code; not a baseline live provider call |
| `cloud-image-edit-fallback` | Historical source category retained by frontend result rendering; not an active fallback implementation |

`normalizeArcTextSelection`, `normalizeArcChatMode`, stored
`arc-model-family` preferences, `arc-image-gen-prefs`, queued composer request
snapshots, and backend admission all need compatible retirement handling.
Removing a picker entry alone does not stop an old/native/stale client from
requesting its literal ID. Migrating a future preference must not rewrite
`modelUsed`, `preferred_model`, or `fallback_model` on past completed results.

## 4. Historical chat and tool contract

### Routing and admission

- The frontend translated `reasoningEffort === 'flynn'` into `FLYNN_MODEL`.
  Code/canvas requests used the event-based completion path for this selection,
  not raw token streaming. `chat/index.ts` rejected explicit Flash with
  `stream: true`; `streamEvents` could still carry Arc status/final events.
- Explicit Flash was disabled for Collab Chat. Guests and anonymous Supabase
  users were not eligible. Authorization came from a verified authenticated
  user, never a client profile or a picker-only check.
- `reserveArcFlashSubmission` required a server key, registered identity, and
  UUID submission ID, then called `reserve_arc_flash_message`. A malformed or
  failed RPC response failed closed. An already-reserved Free submission
  returned a 409 rather than launching another paid request.
- Free had 20 accepted user submissions per UTC day; assistant messages and
  subsequent tool turns did not consume more. Boost/admin entitlement bypassed
  this quota. The SQL Boost branch returned before inserting a reservation, so
  **the quota RPC was not a universal provider idempotency mechanism**. The
  surrounding ordinary-chat submission lifecycle remained important.
- The Free ledger used a row lock per account/day and a unique
  `(user_id, request_id)` reservation to avoid double counting, including the
  UTC-midnight race. Provider work happened after the transaction.
- `get_arc_flash_usage_today` exposed only the caller's percentage. Tables and
  reservation RPC were unavailable to ordinary clients; only service role
  could reserve. There was no provider-failure refund path for chat quota.
- Auto routing required `selection === 'auto'`, `arcMode === 'chat'`, no raw
  stream, no explicit web/canvas/code/Git mode, registered auth and a key. The
  full text had to match a greeting or thanks, such as `hello` or `thank you`.
  It was not a general task classifier or a background research provider.
- Auto used Luna if Flash admission was unavailable/exhausted; replay errors
  were not bypassed. Explicit Flash returned its access/quota error rather
  than silently changing providers. Once a Gemini turn started, the adapter
  did not silently fall back to OpenAI on provider failure.

### Wire request and validation

`requestFlynnCompletion` supplied `Authorization: Bearer <server key>` and
`Content-Type: application/json`. Its JSON included:

```json
{
  "model": "gemini-3.8-flash",
  "messages": [],
  "reasoning_effort": "low",
  "max_completion_tokens": 65536,
  "stream": false,
  "tools": [],
  "tool_choice": "auto"
}
```

The last two fields were omitted when no tools were supplied. The wrapper
accepted only a positive integer output budget up to 65,536 and a positive
timeout up to 60 seconds. It composed caller cancellation with its own timer,
made one POST, and never automatically retried an accepted request. Provider
errors exposed only the HTTP status, not the raw upstream body.

Response requirements:

- `choices[0].message` had to be an object with `role: "assistant"`.
- `finish_reason` had to be `stop` or `tool_calls`; truncation was an error.
- `flynnModelTurn` required a nonnegative safe-integer `usage.total_tokens`.
- Each tool call needed a unique nonempty ID, `type: "function"`, a function
  name, and JSON arguments encoded as a string. Tool presence had to agree
  with the finish reason. A final answer needed nonempty text.
- The **entire assistant message** was retained in private execution history,
  including `tool_calls[*].extra_content.google.thought_signature` and other
  provider metadata. Reconstructing a minimal assistant message before the
  next provider turn could invalidate signed tool history.
- Tool results used `{ role: "tool", tool_call_id, content }`. Arc executed its
  own tools and sent their results back; the provider did not acquire ambient
  credentials or direct access to arbitrary application actions.
- Public replies were reduced to safe final prose plus Arc's explicit tool/
  source/artifact metadata. Raw signed messages were never returned as chat
  prose. `model_used` recorded the model that actually answered.

### Request-scoped tool loop

`flynnChatSession` bounded a request to eight completion rounds, no more than
16 calls per turn, 65,536 aggregate reported tokens in the Chat caller, and an
80-second total deadline. Each individual provider call used the smaller of
60 seconds or the remaining deadline. Stop/deadline checks happened before
and after model calls and before tool execution.

Only names from the supplied registry were accepted. `tool_choice: "required"`
required a call; a named forced tool had to match the first returned call.
All authorization and side-effect controls in the tool handlers still applied.

The registry included web search, past-chat search, memory save, code/prose
canvas, generated files, weather, notifications, scheduled tasks, and bounded
Luna helper work. Remote Git/browser tools were additionally gated. Code and
canvas modes restricted the registry to their respective forced artifact
tool. Gemini selected tool calls; subordinate helpers, file generation and
memory synthesis could still use OpenAI internally. This was not an
end-to-end Google-only execution system.

### Ordinary persistence versus Work

`ordinaryChatIntake` accepted/deduplicated the submitted Chat turn, captured
its provider inputs, then invoked the existing Chat handler in detached work.
It preserved the exact final model and safe metadata across disconnect/
reconnect. A disconnected socket was not Stop. Do not resubmit an already
accepted turn merely because the client missed its answer.

The retained `flynnCloudProvider` converted Responses-style content into the
compatible Chat format: `input_text`/`output_text` to `text`, `input_image` to
`image_url`, `input_file` to `file`, and `function_call_output` to a tool result.
It rejected unsupported history instead of stripping it. Its completion
adapter used a 25-second timeout, could force the first tool for the
`:model:0` request key, and rejected `startModel`/`pollModel` because no durable
response polling contract was implemented. Active Work already constructed
`cloudAgentsProvider` on every lease, including saved Flash runs.

## 5. Historical image API contract

The Nano/Lite image path did **not** use Chat Completions or a Google SDK. It
used `callImageFlash` in `_shared/arcImageFlash.ts` with the native Interactions
endpoint and `x-goog-api-key` authentication.

```json
{
  "model": "gemini-3.1-flash-image",
  "input": [
    { "type": "text", "text": "A simple blue ceramic bowl" }
  ],
  "response_format": {
    "type": "image",
    "mime_type": "image/jpeg",
    "aspect_ratio": "1:1",
    "image_size": "1K"
  },
  "store": false,
  "stream": false
}
```

For an edit, each source added an `input` item shaped as
`{ type: "image", data: <base64 bytes>, mime_type: <actual MIME> }`.
These were inline image bytes, not provider file IDs or a stored interaction
chain. No interaction ID was persisted or resumed.

- Allowed model IDs were exactly the two Nano/Lite constants. Their quality
  was `native`; there was no invented Google medium/high switch. Output stayed
  at 1K JPEG. An old rollout note saying PNG was stale relative to the audited
  adapter and its tests.
- A request accepted one to three output images. It issued one independent
  POST per image in parallel, with a 180-second default timeout per POST.
  Successful outputs survived partial-batch failure. There was no automatic
  POST retry and no cross-provider fallback.
- Aspect helper choices were `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`,
  `9:16`, `16:9`, `21:9`; unknown values defaulted to `3:2`. For `source` with
  known dimensions it chose the nearest ratio using logarithmic distance.
  The normal UI picker exposed a smaller subset.
- `extractImageFlashOutput` required `status: "completed"`, a `model_output`
  step, and an image block with `mime_type: "image/jpeg"` and nonempty base64
  data, bounded to 32 MiB of encoded text. Thought images, input echoes,
  unfinished responses, URI-only images and mismatched MIME were ignored.
  The adapter selected the last valid completed image block from that call.
- Successful output was normalized to Arc's existing `data: [{ url }]`
  envelope using `data:image/jpeg;base64,...`. Raw upstream error bodies were
  not logged or returned by this adapter because they might echo private
  inputs or key material.
- Google alpha output was not supported. Generation/edit handlers rejected
  transparent-background requests for these models and directed users to
  Flare/Sunburst. Do not fake alpha with a checkerboard or convert JPEG to PNG
  and claim it has transparency.

### Input and storage lifecycle

1. Authenticate a registered user; obtain `arc_image_snapshot`; validate
   model, tier, quality, size, readiness and provider key before admission.
2. Capture request identity from a UUID plus SHA-256 of the effective request.
   `image_generation_jobs` enforced uniqueness of `(user_id, image_request_key)`;
   a repeat with matching hash returned the existing job, while conflicting
   inputs were rejected.
3. Reserve credits atomically before starting provider work. Return a job ID;
   run `processGenerateJob` or `processEditJob` with `EdgeRuntime.waitUntil`.
4. For edits, resolve owned `private-image://` references or permitted public
   media through the existing safe downloader. The baseline allowed at most
   ten sources, checked source sizes, normalized inputs to PNG with ImageScript
   when needed, and fit oversized inputs within 1024 by 1024 while retaining
   their ratio. This was Arc preprocessing, not a claim that every provider
   inherently required PNG. Do not bypass ownership/SSRF protections when
   reusing the adapter.
5. Keep edit source bytes invocation-local. `base_image_urls` was stored as
   null to avoid filling Postgres with large base64 payloads.
6. Upload completed outputs to `private-user-images`, using owner-prefixed
   names and actual MIME (`.jpg` for JPEG). Persist durable `private-image://`
   references, not expiring URLs. Preserve successful uploads if others fail.
7. Finalize credits according to the number of successfully stored images;
   failures/refused/empty results and failed storage were refunded through
   the reservation finalizer. Image jobs recorded their selected/actual model.
8. `image-job-status` verified owner access and signed previews for 900 seconds.
   It returned both `imageRefs` and display URLs plus historical model metadata.
   It was a read/status endpoint, not a Gemini dispatch or retry endpoint.

No generic resume dispatcher for legacy Google image jobs was found. Those
jobs were invocation-local background work. Active durable Work/Builder image
receipts used OpenAI's separate background Responses pipeline. Releasing a
retirement must preserve status/readback and legacy finalization; operational
inspection/settlement of any abandoned production jobs is a separate release
step, not authorization to drop old rows or manufacture successful images.

## 6. Image quotas, readiness, and historical settlement

The latest audited image policy was monthly, superseding the September daily
image policy. Do not restore old public quota copy from `model-catalog-rollout.md`.

- Free: 30 Flare Low outputs per UTC calendar month; Google models were
  disallowed for Free in `imageConfiguration` and server policy.
- Boost: 250 shared monthly credits across eligible models, subject to the
  staged/fixed-expiry transition and active offers. Admins bypassed quantity
  limits. Unlimited quantity did not grant an unavailable model.
- Nano Banana 2 cost five credits per 1K output; Lite cost three. Flare cost
  one for Low/square, two for larger Medium; Sunburst High cost four for square,
  six for larger/source. Multiply by requested output count at reservation and
  settle only actual stored output. These are historical internal values.
- Tables included `arc_image_policy`, `arc_image_balances`,
  `arc_image_reservations_v2`, `arc_image_refill_claims`, and existing legacy
  reservations. The finalizer delegated to `finalize_arc_image_credits_v1`
  when a job had no v2 reservation. Keep that path for in-flight old jobs.
- Refund allocations retained balance ID, month and generation. Late failures
  could not replenish a later refill generation or a new month. Retirement is
  not permission to change balances, transition cohorts, offers or billing.
- Lite readiness was false by default, with both client hiding and backend
  blocking. `assertImageModelReady` checked the snapshot, and the reservation
  RPC checked readiness again, including stale clients.
- The readiness fields were `lite_available`, `lite_evidence`,
  `lite_checked_at` in the singleton `arc_image_policy` row. This was readiness
  for Arc's configured provider account, not a model entitlement flag for each
  individual Arc end user.
- `arc_image_set_lite_readiness` required service role and explicit confirmed
  configuration. Enabling required evidence for the exact Lite ID, method
  `account-model-lookup` or `owner-reported`, a reference and a recent
  `checkedAt` (within 24 hours and not more than five minutes ahead).
  Owner-reported access was not proof of a successful generation.
- Do not delete old readiness columns/RPCs/weights as cosmetic cleanup. First
  retire new admissions; leave reconciliation possible. Any later database
  retirement needs its own reviewed migration and outstanding-job evidence.

Builder image allowances were already GPT-only: a real owned running app/
project and Boost entitlement were verified server-side; Flare Low was the
default, and Sunburst required an explicit better-image request. Attempt caps
were separate from ordinary monthly credits. No Google model was required to
preserve this capability.

## 7. Surfaces audited with no active Gemini dependency

### Voice

`openai-realtime-proxy/index.ts` used `gpt-live-1` with Responses delegation to
`gpt-6-luna`, WebRTC session setup through OpenAI, and the existing voice
allowlist. Browser transport lived in `src/lib/realtimeBrowserTransport.ts`.
`voice-search` used Tavily, `whisper-transcribe` used OpenAI transcription,
and `test-voice` used OpenAI speech. `VoiceModeController` mentioned Nano in
product-capability prose, but it did not provide a Gemini Live transport.
Keep voice names, quotas, interruption/idle behavior and saved transcripts
unchanged unless separately requested. Removing stale image-menu prose in
voice instructions does not authorize replacing voice.

### Research and fallback

`perplexity-search/index.ts` selected Perplexity Search for opted-in deep
research when configured, with Tavily as the ordinary retrieval/fallback
provider. Standard answer synthesis and follow-up summarization used
`gpt-6-luna`. Ultra research used Perplexity's `/v1/agent` path, with its
configured `low` preset, explicit `perplexity/sonar` retry and historical
`sonar-pro` Chat Completions fallback. This audit did not revalidate the
current availability of those Perplexity fallback APIs.

The comment saying "use Gemini 2.5 Pro" contradicted the actual OpenAI URL and
Luna request immediately beneath it. It was stale text, not an active
research route. Preserve Perplexity/Tavily selection, citations, research
quota checks, and source-based synthesis while retiring Gemini. Ordinary
Chat's web search also used Tavily; it was not Google grounding.

### Work and App Builder

`cloudRunRuntime` already instantiated `cloudAgentsProvider`, never
`flynnCloudProvider`; Work normalization and resume used GPT. The unused
`geminiApiKey` option and `cloud-worker` environment pass-through were vestigial.
`cloudAppRuntime`/`durableModelRouting` used Luna for Fast and GPT-6.1 Sol for
Pro; the older `agent/index.ts` endpoint used Luna. Cloud image tools used
OpenAI background Responses and their own receipt/polling/storage contract.
Do not replace these flows with the synchronous historical Google adapter.

### Background summaries, helpers, vision, and scheduled work

`memory-summary`, `cloudMemoryProvider`, `generate-chat-title`, `enhance-prompt`,
`generate-fun-fact`, prompt-generation functions, `generate-file`,
`chat-subagents`, `analyze-image`, and `analyze-document` already used OpenAI/
Luna. `run-scheduled-tasks` explicitly called Luna regardless of old stored
task model strings. Historical migrations normalized imported Gemini profile/
task defaults. An old Gemini ID in history or a migration is not an active
background-provider path. Existing disabled video contracts are unrelated;
do not revive a video provider during this migration.

## 8. Environment variable inventory: names only

No environment values belong in this document, fixtures, logs, screenshots,
frontend bundles or public model responses.

| Variable name | Historical role |
| --- | --- |
| `GEMINI_API_KEY` | Only direct Google model credential. Server-side Chat/generate/edit; unused Work pass-through |
| `OPENAI_API_KEY` | GPT replacement and already-existing voice, helpers, summaries and synthesis |
| `SUPABASE_URL` | Backend/storage service location |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only ownership checks, reservations, jobs and storage |
| `SUPABASE_ANON_KEY` | Authenticated client/server auth composition where used |
| `PERPLEXITY_API_KEY` | Independent Deep/Ultra research integration; keep |
| `TAVILY_API_KEY` | Web retrieval, research fallback and voice search; keep |
| `SEARCH_IMAGES` | Research-image behavior; unrelated to generated Google images |
| `CHAT_AGENT_ANSWER_STREAM_ENABLED` | OpenAI Chat answer-stream rollout, not a Gemini capability flag |
| `CLOUD_WORKER_ENABLED` | Existing worker gate, not provider authorization |
| `CLOUD_APP_RUNS_ENABLED` | Existing Builder-run gate |
| `CLOUD_RUN_FAST_CONTINUATION_ENABLED` | Existing durable continuation behavior |

Other tool-specific credentials were owned by their respective integrations,
not by Gemini. Do not remove, rotate, print or copy any credential as part of
documentation or cosmetic retirement. Absence/presence of an environment
variable alone never proves provider account/model readiness.

## 9. Reusable reference patterns

These examples show how the old helpers fit together. **They are not wired
into the active lineup and must not be run against a paid API merely to read
this handoff.** Restore/test them only in an explicitly authorized isolated
integration, after checking the current official protocol/model availability.
Use injected fetch fixtures for offline tests. Do not put a real key in code.

### Authenticated, bounded Chat turn

```ts
import { reserveArcFlashSubmission } from './arcFlashAccess.ts';
import { flynnChatSession } from './flynnChatSession.ts';

// db is a server client; user comes from verified auth, never request.profile.
const key = Deno.env.get('GEMINI_API_KEY');
const reservation = await reserveArcFlashSubmission(db, user, key, submissionId);
if (!reservation.allowed) throw new Error('Flash quota exhausted');

const session = flynnChatSession({
  user,
  apiKey: key,
  accessGranted: reservation.allowed,
  tools: allowedTools,
  signal: executionSignal,
  tokenLimit: 65_536,
  deadline: Date.now() + 80_000,
  // In tests, supply a fetcher fixture; do not call the real provider.
});

const result = await session.complete(messages);
// Preserve the original message verbatim in PRIVATE execution history.
messages.push(result.message);
// Execute only validated/authorized tool calls, then append tool results.
// Feed that history to session.complete again while tools remain.
// Return only final prose and safe Arc metadata, not result.message wholesale.
```

The example deliberately does not implement a generic tool executor. Reusing
the transport must not bypass the existing action authorization, tool-name
allowlist, owner scope, idempotency, receipt, or cancellation rules. The
historical `getFlynnEntitlement` helper checked Boost and remains a separate
old helper; substituting it for the later Free quota path changes policy.

### Image generation or edit adapter

```ts
import {
  ARC_IMAGE_FLASH_MODEL,
  callImageFlash,
  imageFlashAspect,
  imageFlashInputs,
} from './arcImageFlash.ts';

// Authenticate, authorize sources, check readiness, create a job and reserve
// its quota BEFORE reaching this adapter. Keep source bytes off database rows.
const result = await callImageFlash({
  apiKey: Deno.env.get('GEMINI_API_KEY'),
  model: ARC_IMAGE_FLASH_MODEL,
  prompt: approvedPrompt,
  aspect: imageFlashAspect('source', sourceWidth, sourceHeight),
  count: 1,
  images: await imageFlashInputs(authorizedSourceBlobs), // Omit for generation.
  // In tests, supply fetchImpl with completed model_output JPEG fixtures.
});

// Parse the adapter's normalized data envelope, store every successful output
// privately with its real MIME, then finalize using successfully stored count.
// Never retry an accepted POST automatically or fall back to another provider.
```

For a future standalone port, keep the native Interactions image transport
separate from the OpenAI-compatible text transport. Do not infer support for
one from successful authentication or completion on the other.

## 10. GPT-only migration and compatibility checklist

- Remove Google choices from active chat/image pickers, model availability
  context and instructional/marketing copy. Preserve competitor references in
  SEO/referrer classification when they describe Gemini as another product,
  rather than claiming Arc uses it.
- Normalize retired future chat selections on both frontend and backend;
  enforce the intended GPT tier on queued requests, old clients and resumed
  Work. Do not infer tier entitlement from a client-supplied model string.
- Normalize saved Nano/Lite image preferences to a supported GPT choice;
  handle explicit stale server requests before job creation or reservation.
  An explicit unavailable-model result is safer than a silent paid-provider
  substitution. Any deliberate normalization must be visible and tested.
- Keep `modelUsed`/`model_used`, original image IDs/names, `preferred_model`,
  `fallback_model`, source categories and old image MIME display truthful for
  historical messages. A GPT-only future does not rewrite history.
- Preserve image ownership checks, private references, signed preview paths,
  JPEG playback/download, source edits, alpha behavior, partial batches,
  monthly reservation/refund accounting and legacy finalizer delegation.
- Preserve the ordinary persisted Chat contract, one accepted submission,
  Stop versus disconnect behavior, and private signed execution history. Do
  not replay an in-flight accepted provider action to create a new GPT answer.
- Prove active runtime dispatch has no path to the two Google endpoints.
  Dormant adapters/tests and historical migrations may still contain them;
  a grep hit is not activation. Trace actual entrypoint imports and callers.
- Keep Perplexity/Tavily research and OpenAI Builder/background work intact.
  Voice is explicitly frozen in the current migration. Do not edit its models,
  audio, tools, limits, telemetry, or even stale voice capability copy without
  separate owner authorization; shared legacy voice calls remain Luna-only.
- Do not delete quota tables, historical jobs, stored media or provider secrets
  during runtime cleanup. Database/secret retirement requires separate review.
- Verify multi-image forwarding and source-aspect behavior from section 1
  before claiming image capability parity.

## 11. Test inventory and verification limits

Historical tests useful for a future port or migration regression suite:

- `_shared/flynnProvider_test.ts`: verified identity/key gates, usage accounting,
  unique tool IDs, truncation/error rejection, cancellation and preservation
  of signed assistant tool metadata across rounds.
- `_shared/flynnChatSession_test.ts`: request-scoped budgets, forced-tool
  enforcement, tool-loop bounds, cancellation and deadlines.
- `_shared/flynnCloudProvider_test.ts`: signed history preservation, expanded
  media conversion without mutation, per-turn budgets and initial-tool mapping.
- `_shared/arcFlashAccess_test.ts`: admission failure modes, replay handling,
  and narrow Auto routing without tool/Work reroutes.
- `_shared/arcImageFlash_test.ts`: native endpoint/payload, `store: false`,
  bounded batches, partial successes, no POST retry, no secret/error leakage,
  output extraction, source aspects/bytes and private JPEG storage.
- `_shared/imagePolicy_test.ts`, `scripts/test-monthly-image-policy.mjs`:
  model/tier/readiness rules and isolated Postgres quota/settlement coverage.
- `_shared/ordinaryChatIntake_test.ts`: accepted ordinary Chat survives a
  disconnect and preserves the actual Flash reply without a second call.
- `_shared/cloudRunWorker_test.ts`, `cloud-run/index_test.ts`,
  `scripts/test-flynn-routing.mjs`: GPT-only Work admission/resume and captured
  frontend selection behavior.
- `scripts/test-image-modes-browser.mjs`,
  `scripts/test-message-queue.mjs`, `scripts/test-reply-actions-browser.mjs`:
  preference capture, queue behavior, image modes and reply metadata.

This documentation pass inspected these source contracts; it did not run
paid/provider E2E, database migrations, production queries or deployment.
There was no Deno executable on the audit shell PATH. Existing QA reports are
historical evidence, not a new successful run. `docs/qa/image-policy/HANDOFF.md`
explicitly distinguishes mocked adapter checks from live account readiness.

For any future reintroduction, verify current official API/model availability,
authenticated text/tools, signed multi-turn history, image/edit actual output,
private storage, account-specific access, error/cancellation behavior and
quota settlement in the intended environment before enabling a picker.
