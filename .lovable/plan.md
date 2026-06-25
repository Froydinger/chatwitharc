You're right — `OPENAI_API_KEY` is set, so `edit-image` is already hitting `https://api.openai.com/v1/images/edits` directly. The failure is somewhere else in that pipeline, not in the routing. Revised plan below.

## 1. Per-image Edit button (MessageBubble.tsx, lines ~373-405)

- Delete the centered grid-level "Edit All Images / Edit Image" button.
- Inside each `imageUrls.map(...)` cell, add a small Edit pill directly under the image. Each pill calls `setEditImageUrls([url])` — always a single-element array, never multi-select.
- Mirror the same per-image button under the legacy single `message.imageUrl` block.

## 2. Light-mode readability

The current `bg-foreground/85 text-background border-border/40` washes out on the light AI-bubble surface. Replace with accent-driven tokens that stay legible in both themes:

```
size="sm" rounded-full
bg-primary text-primary-foreground hover:bg-primary/90
border border-primary/30 shadow-sm
```

## 3. Real reasons GPT-Image-2 edits are failing (and fixes)

Edits are reaching OpenAI; they're dying further downstream. The likely culprits in `supabase/functions/edit-image/index.ts`:

a. **MIME / filename mismatch on the multipart upload.** `fetchImageAsBlob` trusts `Content-Type` from Supabase storage (often `application/octet-stream`) and derives the filename extension from that — OpenAI's `/v1/images/edits` rejects anything that isn't `image/png`, `image/jpeg`, or `image/webp`. Fix: sniff the magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WebP `52 49 46 46 .. .. .. .. 57 45 42 50`), normalize MIME to one of those three, and set the filename to `input-N.png|jpg|webp` accordingly. Drop anything else.

b. **`image[]` field for multi-source.** OpenAI's edits endpoint takes the `image` field repeated (`image`, `image`, `image`), not `image[]`. Send repeated `image` parts whenever count > 1; we're losing 2+ source uploads to a silent 400 today.

c. **`quality: 'low'` is producing low-fidelity edits**, which is why even when a request returns it doesn't look like the source. Switch the default to `quality: 'medium'` and pass `input_fidelity: 'high'` so identity/composition is preserved (this is GPT-Image-2's documented identity-preservation flag).

d. **Wrong storage bucket.** Results are being uploaded to the `avatars` bucket. If that bucket's policy rejects the upload (size or content-type), `uploadDataUrlsToStorage` silently swallows the error and returns the raw `data:` URL — which then exceeds row-size limits when written into `image_generation_jobs.result_image_urls`, so the job row update fails and the client poll never sees `completed`. Fix: upload to the existing `generated-images` (or whatever the generation pipeline uses — confirm by reading `generate-image/index.ts` upload path) bucket, log upload errors instead of swallowing, and if upload genuinely fails, surface the job as failed with `error_type: 'storage_error'` rather than returning a giant data URL.

e. **`n=count` is fine** on `/v1/images/edits` for gpt-image-2 (it returns N variants of the same edit). Keep the single-call pattern; do not parallel-fire.

f. **Error classification swallows the actual OpenAI message.** When OpenAI returns 400 with `{"error":{"message":"Invalid input image..."}}`, we currently return a generic message and fall through to Gemini. Surface the real `error.message` into `error_message` on the job row so the UI can show it; keep the Gemini fallback but only trigger it for 5xx / 408 / network errors, not deterministic 400s (a 400 from OpenAI almost always also fails on Gemini and just doubles latency).

## 4. YouTube 16:9 for edits, every count, every fallback

Today the YouTube letterbox+crop pipeline lives only in `generate-image`. Port it into `edit-image`:

- Duplicate the `cropTo16x9` helper inline in `edit-image/index.ts` (edge functions can't share modules).
- When `aspectRatio === '16:9'`, send `size: '1536x1024'` to OpenAI and prepend the same 16:9 letterbox instruction string `generate-image` uses (render at 1536x1024 with 80px solid-black bars top/bottom).
- After the model returns, `Promise.all` every URL through `cropTo16x9` before the storage upload, so all 1/2/3 outputs are cropped consistently.
- Apply the same wrap to the Gemini fallback path so YouTube edits don't escape uncropped when OpenAI errors out.

Confirm the client (`ImageEditModal` / `ChatInput` edit invocation) is forwarding the selected `aspectRatio` into `ai.editImage`. If it isn't passing `16:9` through for edits, wire it through — otherwise the edge function will never know it's a YouTube edit.

## Files touched

- `src/components/MessageBubble.tsx` — per-image Edit pill, remove grid-level button, accent-token styling.
- `supabase/functions/edit-image/index.ts` — MIME sniffing/normalization, repeated `image` parts, `quality: medium` + `input_fidelity: high`, correct storage bucket with real error reporting, OpenAI error pass-through, smarter fallback trigger, YouTube letterbox prompt + `cropTo16x9` post-processing.
- `src/components/ChatInput.tsx` (only if needed) — forward `aspectRatio` into the edit call.

## Out of scope

- No DB/schema changes, no migrations.
- No model swap — still `openai/gpt-image-2` primary, `google/gemini-3.1-flash-image` fallback.
- No changes to `generate-image` beyond reading it to confirm the storage bucket name.
