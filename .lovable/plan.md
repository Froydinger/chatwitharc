

## Cascading Model Fallback for Image Generation & Editing

### Problem
The current default model (`gemini-3.1-flash-image-preview`) is intermittently failing with error 1102. No fallback exists — if it fails, the user gets an error.

### Solution
Add a cascading fallback chain in both edge functions: try the preferred model first, then automatically retry with the next model in the chain until one succeeds.

**Fallback chain:** `gemini-3.1-flash-image-preview` → `gemini-3-pro-image-preview` → `gemini-2.5-flash-image`

### Changes

**1. `supabase/functions/generate-image/index.ts`**
- Extract the gateway call into a loop over the fallback chain
- If the first model fails (5xx, 408, or error 1102), retry with the next model
- Only return failure after all three models have been tried
- Log which model ultimately succeeded

**2. `supabase/functions/edit-image/index.ts`**
- Same cascading fallback logic: try preferred model → pro → 2.5 flash
- Same retry-on-failure behavior across the chain

**3. `src/store/useModelStore.ts`**
- No changes needed — the client still sends the preferred model, but the server now handles fallback automatically

### Technical Detail

```text
Client sends preferred model (e.g. gemini-3.1-flash-image-preview)
  ↓
Edge Function tries preferred model
  ↓ fails (5xx / 408 / known error codes)
Tries gemini-3-pro-image-preview
  ↓ fails
Tries gemini-2.5-flash-image
  ↓ fails
Returns error to client (all 3 exhausted)
```

Rate limit (429) retries stay within each model attempt. Content violations and invalid input errors skip the chain (no point retrying with a different model).

