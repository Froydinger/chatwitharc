# Model catalog rollout — September 30, 2026

Requested end state; implementation is in progress. This is not a claim that these changes are live.

- User-facing chat choices are **Arc Think** and **Arc Flash**, replacing the superseded raw-model/family picker request.
- Arc Think is Auto orchestration. Free Think can use GPT 6 Luna and Gemini Flash within the free Flash allowance; Boost Think can use the supported GPT 6 / 6.1 models and Gemini Flash.
- Arc Flash explicitly requests Gemini Flash through Google's OpenAI-compatible endpoint. Free accounts receive 20 user messages sent to Flash per UTC day (assistant responses and tool rounds do not count); every Auto-routed Flash request consumes that same allowance. When free Flash allowance is exhausted, Auto must use Luna; explicit Flash must offer the quota/upgrade message.
- Boost removes these free chat quotas. Free Think remains unlimited. Never expose paid GPT models to free accounts or silently turn ordinary Chat into Work.
- Secondary copy: Think “Powered by GPT 6 & 6.1”; Flash “Powered by Gemini Flash”. Actual response metadata must still record the provider used accurately, including when Auto chooses Flash.
- Image choices are **Arc Image** (OpenAI) and **Arc Image Flash** (Nano Banana 2). Both are available through a shared free allowance of **8 credits per UTC day**, replacing both the old three-total-images quota and the superseded Nano Banana Boost-only rule. GPT outputs cost 1 credit per image; Nano Banana outputs cost 2 credits per image. Multiply by batch output count. Boost retains its current unlimited image access. Failed generation reservations refund credits. Preserve edits, private-image references, saved images, cancellation and refunds.
- Voice model, voice quota, voice behavior and all other existing limits are unchanged. Do not implement the superseded voice rename/provider request.
- Update app copy, pricing screens, pages, docs, FAQ, blog and model system context to the latest two-mode structure and access rules. Public limits advertising uses “Less usage” for Free and “Unlimited usage” for Boost, without numeric chat-message caps. Dashboard content shows percentages used, not message counts; do not change the dashboard navigation bar. Backend/internal technical docs retain exact enforcement values.
- Retain compatibility for saved selections and recorded historical model IDs. Never relabel a historical response as a model it did not use.
- Model instructions must derive the selected model and access limits from the same catalog used by the picker and authorization. Do not advertise a pending provider path to the model or to users.
- Keep the dashboard navigation bar unchanged. Continue the input-bar extraction and native CSS animation migration, with recordings and browser/emulator checks. The owner took the physical Pixel away and explicitly replaced remaining device testing with Mac browser/emulator testing.

Release gates: verify official provider IDs, transport/tool compatibility, authenticated server gates, atomic quota enforcement, captured queued selection, Stop/error recovery, private media persistence, representative browser layout/interaction, build and deployment provenance. Do not release partially wired selectable models or replace an unavailable selected model silently.

## Verification ledger

- Shared catalog/context helpers: saved selection migration, free/Boost policy, two-mode names, actual provider availability, mixed image credit costs and private/public usage wording tested locally. Not wired into released quota/provider paths yet.
- Flash database admission: isolated real Postgres checks passed for concurrent duplicate submissions (one charge), 20-message cap under concurrency, account isolation, Boost bypass, private percentage RPC, grants and UTC rollover. The additive migration is installed in production; presence and grants verified (client cannot reserve directly, authenticated client can read only its own percentage). Chat integration is local and not released yet. Repeated migration application preserves recorded usage.

- Image credits: real isolated Postgres concurrency, mixed-provider batch cost, partial/storage-failure refunds, duplicate finalize, owner checks, grants, UTC rollover and replay checks pass. The additive ledger is installed in production and confirmed private; authenticated clients can call only their own usage getter. The legacy ledger remains intact.
- Nano Banana adapter: native Interactions API, PNG/1K output, completed model output only, no thought images, no provider request storage, no automatic POST retry, timeout bounds and partial-batch results checked. Generation/edit handlers retain private storage and owned source downloads. Real authenticated provider generation is still unverified.
- Client: two image modes, immutable queued image provider, percent usage meters, compact Think/Flash picker, signed-out handling, native image modal, reduced-motion cleanup and 412/1280px geometry pass local browser tests. Model context and public marketing now use the two-mode contract. Provider/client activation has not yet been released.
- Production build and prerender pass. Targeted lint has no errors in the new image/mode components. Whole-project typecheck remains blocked by pre-existing JSX syntax in unused AdminSettingsPanel; excluding that file still exposes legacy schema/type errors. Changed-file error inspection found only existing Subscription/Dashboard schema/type failures, not new image/mode type failures.

## Work provider boundary

Arc Work uses GPT only: Luna for ordinary work and GPT 6.1 Sol for harder Boost requests; image tools stay OpenAI Flare/Sunburst. The client omits Flash provider selection, submission strips stale provider overrides, and worker resume always constructs the GPT provider. Regular Chat Flash is unchanged.
