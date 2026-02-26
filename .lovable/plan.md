

# Fix Image Error Messaging + Auto-Detect Follow-Up Edits

## Problem 1: Generic Error Messages
All image generation/editing errors show the same unhelpful message ("Sorry, I couldn't generate the image.") regardless of whether it was a content violation, timeout, rate limit, or provider error. There's no way to tell what went wrong.

## Problem 2: Follow-Up Messages After Image Gen Should Auto-Edit
When a user sends a message like "make the sign a white sign..." right after an image was generated, it falls through to the regular text chat flow instead of being recognized as an image edit request against the most recent generated image.

---

## Changes

### 1. Backend: Detailed Error Mapping

**`supabase/functions/generate-image/index.ts`**
- Parse provider error JSON more thoroughly -- extract `error.code`, `error.message`, and `error.details` fields.
- Map to specific error types with clear user-facing messages:
  - `content_violation` -- "Blocked by content safety filters. Try rephrasing your prompt."
  - `rate_limit` -- "Too many image requests. Please wait a moment and try again."
  - `payment_required` -- "Image generation credits exhausted. Please add credits."
  - `timeout` -- "Image generation timed out. Try a simpler prompt or try again."
  - `invalid_request` -- "Invalid request: [actual provider detail]"
  - `provider_error` -- "Image model error: [actual provider detail]"
  - `no_image_returned` -- "The model responded but produced no image. Please try again."
- Add `AbortController` with 55-second timeout so timeouts are caught explicitly instead of silently hanging.
- Include a `debugDetail` field in the error response with the raw provider message (for console debugging).

**`supabase/functions/edit-image/index.ts`**
- Same error parsing and mapping improvements.
- Additionally detect `INVALID_ARGUMENT` errors and map to `invalid_input_image` -- "The source image couldn't be processed. Try a different image or re-upload."
- Validate that input image URLs are not `blob:` scheme (unusable server-side) and return `invalid_input_image` immediately.
- Add same `AbortController` 55-second timeout.

### 2. Client: Preserve Error Detail

**`src/services/ai.ts`**
- In `generateImage()` and `editImage()`, when backend returns an error, attach `errorType` and `debugDetail` to the thrown error.
- Log `debugDetail` to console for developer debugging.
- No change to the model -- stays `google/gemini-3-pro-image-preview`.

### 3. UI: Show Specific Error Messages

**`src/components/ChatInput.tsx`** (3 error catch blocks: generate, inline edit, modal edit)
- Replace generic "Sorry, I couldn't generate/edit the image" with the actual backend error message.
- Use `errorType` to pick a contextual prefix:
  - `content_violation` -- "Content policy: [message]"
  - `rate_limit` / `timeout` -- "Timed out: [message]"
  - `invalid_input_image` -- "Image input error: [message]"
  - Default -- "[message]"

### 4. Auto-Detect Follow-Up Image Edits

**`src/components/ChatInput.tsx`** -- in the plain text flow (around line 891), before sending as regular chat:
- Check if the most recent assistant message in the current session is of type `image` (has an `imageUrl`).
- If it is, and the user's new message looks like an edit directive (using the existing `isImageEditRequest()` function), automatically route it as an image edit against that last generated/edited image.
- This means: grab the `imageUrl` from the last assistant image message, call `ai.editImage(userMessage, [imageUrl])`, and display the result as an edited image -- same as the existing edit flow.
- If the message does NOT look like an edit (e.g., a question, new topic), let it fall through to normal chat as before.

---

## Technical Details

### Error type mapping in edge functions

```text
Provider Signal                    -> errorType             -> User Message
------------------------------------  --------------------    ----------------------------------------
"safety"/"blocked"/"content policy"   content_violation       Blocked by content safety. Try rephrasing.
HTTP 429                              rate_limit              Too many requests. Wait and try again.
HTTP 402                              payment_required        Credits exhausted. Please add credits.
AbortError (55s timeout)              timeout                 Timed out. Try a simpler prompt.
"INVALID_ARGUMENT" + input image      invalid_input_image     Source image couldn't be read.
HTTP 400 (other)                      invalid_request         Invalid request: [detail]
No image in response                  no_image_returned       No image produced. Try again.
Other 5xx                             provider_error          Image model error: [detail]
```

### Follow-up edit detection logic (pseudo-code)

```text
if (no images attached AND not in image/canvas/code/search mode):
  lastMsg = messages[messages.length - 1]  // most recent message
  if lastMsg.role === 'assistant' AND lastMsg.type === 'image' AND lastMsg.imageUrl:
    if isImageEditRequest(userMessage):
      -> route to editImage(userMessage, [lastMsg.imageUrl])
      -> return
  // else: fall through to normal text chat
```

### Files changed summary

| File | Change |
|------|--------|
| `supabase/functions/generate-image/index.ts` | Better error parsing, AbortController timeout, debugDetail field |
| `supabase/functions/edit-image/index.ts` | Better error parsing, blob: validation, AbortController timeout, debugDetail |
| `src/services/ai.ts` | Attach errorType + debugDetail to thrown errors, console.log debugDetail |
| `src/components/ChatInput.tsx` | Show specific error messages in 3 catch blocks; add follow-up edit auto-detection before plain text flow |

