## Goal
Make **Nano Banana 2** (`google/gemini-3.1-flash-image-preview`) the only image model used anywhere in the app — for both generation and editing. No fallback chain, no user model picker.

## Changes

### 1. Edge functions — remove fallback chain
- `supabase/functions/generate-image/index.ts`
  - Delete `MODEL_FALLBACK_CHAIN` + `buildFallbackChain`.
  - Always call the gateway with `google/gemini-3.1-flash-image-preview`. If it fails, return the error directly (no fallback to Pro / NB1).
  - Ignore any `preferredModel` from the request body (still accept for backwards compat, just don't use).
- `supabase/functions/edit-image/index.ts`
  - Same: drop chain, lock to NB2, ignore `imageModel` param.

### 2. Client store — remove model choice
- `src/store/useImageGenStore.ts`
  - Hard-code `model: 'google/gemini-3.1-flash-image-preview'`.
  - Remove `IMAGE_MODEL_OPTIONS` (or trim to a single entry) and `setModel`.
  - Keep aspect ratio as-is.
- `src/store/useModelStore.ts`
  - Set `image-gen` and `image-edit` to NB2 in both `gemini` and `gpt` family maps (already true for gemini, change the gpt entries too so family swap can't sneak in another model).

### 3. UI — drop the model picker
- `src/components/ImageOptionsDock.tsx` (and any other component rendering `IMAGE_MODEL_OPTIONS`): remove the model selector dropdown/pills. Keep aspect ratio.
- Quick audit pass: `rg "IMAGE_MODEL_OPTIONS|setModel\(|useImageGenStore"` to catch every consumer.

### 4. Route label
- `src/utils/routeRequest.ts`
  - Remove `cloud-image-pro` from `RouteDestination` (or leave the type but stop routing to it). Update `getRouteLabel` so only the NB2 label is reachable from generate/edit paths.

### 5. Sanity sweep
- `rg "gemini-3-pro-image-preview|gemini-2\.5-flash-image"` across the repo and remove any remaining references in prompts, comments, or fallback logic so NB2 truly is the only image model in code.

## Out of scope
- GPT Image — skipping per your choice. The gateway doesn't support it today, so no OpenAI key needed.
- No DB migrations; the `preferred_model` column on `image_generation_jobs` stays (just always stores NB2).

## Risk
- If NB2 has an outage there's no automatic fallback — users get an error. Acceptable trade-off you've already signed off on.
