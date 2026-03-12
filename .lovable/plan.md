

## Plan: Switch Image Model to `google/gemini-3.1-flash-image-preview`

Replace all occurrences of `google/gemini-3-pro-image-preview` with `google/gemini-3.1-flash-image-preview` across 5 files:

### Files to Update

1. **`src/store/useModelStore.ts`** — Update all 4 entries in `MODEL_MAP` (gemini image-gen, image-edit, gpt image-gen, image-edit)
2. **`src/services/ai.ts`** — Update fallback model string (line 508)
3. **`src/components/ImageEditModal.tsx`** — Update hardcoded model (line 44)
4. **`supabase/functions/generate-image/index.ts`** — Update `imageModel` constant (line 91)
5. **`supabase/functions/edit-image/index.ts`** — Update `selectedModel` constant (line 131)

This is a straightforward find-and-replace across all 5 files. No logic changes needed.

