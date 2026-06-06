## Goal

Purge every Gemini 2 / 2.5 reference. Standardize on:
- **Gemini 3 Flash** (`google/gemini-3-flash-preview`) — regular chat, shared chats, scheduled tasks, vision, docs, fun facts, prompts.
- **Gemini 3.5 Flash** (`google/gemini-3.5-flash`) — Pro work: code, canvas, deep-chat, file gen, App Builder.
- **Nano Banana 2** (`google/gemini-3.1-flash-image-preview`) — only image model.
- **Voice Mode** — OpenAI **`gpt-realtime-2`** (already wired correctly, verified — no change).

## Voice Mode verification (looked up GA Realtime spec)

Current code is already fully spec-compliant for `gpt-realtime-2`. No glitches / cutouts / streaming regressions expected from this change set because **we're not actually touching realtime behavior** — it's already on realtime-2:

- GA endpoint `/v1/realtime/client_secrets` in `openai-realtime-proxy`
- GA session shape: `type: 'realtime'`, `output_modalities`, structured `audio.input.format` / `audio.output.format`, `server_vad` with `create_response` + `interrupt_response`, `audio.output.voice`
- WebSocket subprotocol auth (`openai-insecure-api-key.${client_secret}`)
- 20s keepalive `session.update`, 35s zombie watchdog, 13-min proactive refresh, clean reconnect on close — all model-agnostic
- Input transcription stays on `gpt-4o-transcribe` — it's a separate model from the realtime voice model; OpenAI does not ship a "gpt-realtime-2-transcribe". GA options are `gpt-4o-transcribe` (current, best quality) or `gpt-4o-mini-transcribe` (cheaper). Keeping current. Say the word if you'd rather flip to mini.

## Edge function changes

1. `supabase/functions/shared-chat-respond/index.ts:74` — `google/gemini-2.5-flash` → `google/gemini-3-flash-preview`.
2. `supabase/functions/run-scheduled-tasks/index.ts:230` — default `google/gemini-2.5-flash` → `google/gemini-3-flash-preview`.
3. `supabase/functions/chat/index.ts:513-515` — remove legacy block (`gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gpt-5-mini`) from `allowedModels`. Stale values fall through to Gemini 3 Flash default.
4. `supabase/functions/analyze-image/index.ts` — drop `gemini-2.5-flash` + `gemini-2.5-flash-lite` from vision fallback. Final chain: `gemini-3-flash-preview` → `gemini-3.5-flash` → `gpt-5.5` → `gpt-5-mini`.
5. `supabase/functions/generate-file/index.ts` — drop `gemini-2.5-flash` + `gemini-2.5-flash-lite`. Final chain: `gemini-3-flash-preview` → `gemini-3.5-flash` → `gpt-5.5-pro` → `gpt-5.2`.
6. `supabase/functions/generate-image/index.ts:20` — remove `gemini-2.5-flash-image` from allowed list / fallback.
7. `supabase/functions/edit-image/index.ts:20` — same removal.

## Frontend changes

8. `src/store/useImageGenStore.ts` — remove `'google/gemini-2.5-flash-image'`, narrow `ImageModelId` to only `'google/gemini-3.1-flash-image-preview'`, drop second `IMAGE_MODELS` entry.

(Source-badge labels in `routeRequest.ts` and default-model strings in `AccountHub.tsx`/`SettingsPanel.tsx`/`MobileChatApp.tsx`/`useModelStore.ts` are already correct — no change.)

## Database migration

```sql
-- 1. Reset default for new users
ALTER TABLE public.profiles
  ALTER COLUMN preferred_model SET DEFAULT 'google/gemini-3-flash-preview';

-- 2. Migrate existing profile rows off 2.x
UPDATE public.profiles
   SET preferred_model = 'google/gemini-3-flash-preview'
 WHERE preferred_model LIKE 'google/gemini-2%';

-- 3. Migrate scheduled tasks pinned to 2.5
UPDATE public.scheduled_tasks
   SET model = 'google/gemini-3-flash-preview'
 WHERE model LIKE 'google/gemini-2%';
```

## Verification after build

1. `rg "gemini-2\." supabase src` returns zero hits.
2. Normal chat → source badge reads "Gemini 3 Flash".
3. Shared chat → reply uses 3 Flash (check `shared-chat-respond` logs).
4. Voice Mode → `openai-realtime-proxy` returns `"model":"gpt-realtime-2"`, audio streams cleanly.
5. Image generation → only Nano Banana 2 offered/used.

## Out of scope

GPT model mapping, model-selector UX, any design/UI changes, any voice behavior changes.
