## Problem

GPT-Image-2 edits routinely take 50–90s. The edge function abort is 150s, but logs show timeouts firing at ~55s — the platform/runtime is killing long-running edit responses before OpenAI returns. Generations have the same risk profile. We need image edits/gens to stop depending on holding a single HTTP connection open for ~60s+.

```text
12:56:06  start edit  ──►  OpenAI /images/edits  (60–90s typical)
12:57:01  408 timeout  (≈55s)  ◄── runtime kills the call
```

## Fix

Move all image edits (and risky multi-count generations) onto the **async job pattern already half-built** via `image_generation_jobs`, and add a Gemini fast-path fallback so a single OpenAI hiccup doesn't dead-end the user.

### 1. Edge function: `edit-image` becomes enqueue-only

- Insert the job row (status `pending`), kick off the actual OpenAI call inside `EdgeRuntime.waitUntil(...)`, and return `{ jobId, status: "pending" }` in <1s.
- The background task does what the function does today (OpenAI `/v1/images/edits`, classify errors, upload, update job row). Free of the request/response timeout.
- On OpenAI timeout/5xx, the background task automatically retries once on `google/gemini-3.1-flash-image` via the Lovable Gateway chat-completions image shape (already supported), and marks the job `completed` with a `fallback_model` flag, or `failed` with a clear reason.

### 2. New edge function: `image-job-status`

- `GET ?jobId=...` returns `{ status, imageUrl, imageUrls, errorType, errorMessage }` from `image_generation_jobs`.
- RLS-checked against `user_id = auth.uid()`.

### 3. Generation path: same treatment for `n > 1`

- `generate-image` already handles single images fine. For Boost users requesting 2–3 images (the new multi-count path), route through the same async + poll flow so a slow batch doesn't time out either. Single `n=1` calls keep the existing synchronous path.

### 4. Client: polling helper + UI integration

- New `src/lib/pollImageJob.ts` — invokes `image-job-status` every 2s (max 180s), resolves with `imageUrls[]` or rejects with the classified error.
- `src/services/ai.ts` `editImage` and (for `count > 1`) `generateImage` switch to: invoke → receive `jobId` → `pollImageJob(jobId)` → return URLs. Existing call sites in `ChatInput.tsx` and `ImageEditModal.tsx` need no signature change.
- Replace the current "Image editing timed out" toast with the actual `errorMessage` from the job row when the poll resolves to `failed`.

### 5. Verify

After deploying the two edge functions, run an edit (single source) and a 3-up generation through Playwright headless against localhost, screenshot the result, and confirm `image_generation_jobs` ends in `completed` with populated `result_image_url`. Inspect `edge_function_logs` to confirm the foreground response returns in <2s.

## Out of scope

- No change to voice, chat text, or Nano Banana / Gemini routing for plain `/v1/chat/completions`.
- No change to the agent-side `imagegen` tools (those live outside this app).
- No SQL schema changes — `image_generation_jobs` already has every column we need (`status`, `result_image_url`, `error_message`, `error_type`).

## Technical notes

- `EdgeRuntime.waitUntil` is the Supabase/Deno mechanism that keeps the worker alive after `Response` returns; this is what unblocks the 55s cap.
- Gemini fallback body shape is `{ model: "google/gemini-3.1-flash-image", messages: [{ role: "user", content: [{type:"text",text:prompt},{type:"image_url",image_url:{url}}]}], modalities:["image","text"] }` — already used by the older Nano Banana edit path before the GPT migration, easy to reinstate as a fallback-only branch.
- Polling cadence: 2s interval, 90 attempts (3 min ceiling). Boost-friendly without hammering the DB.
- All grants on `image_generation_jobs` are already in place; only the new status function needs its own deploy.  

- if it falls back to gemini, image chip/tag in chat should reflect that to user so they know.