

# Image Edit: Model + Aspect Ratio Controls

Bring the same model + aspect-ratio picker UX from `/image` generation into both image-editing entry points.

## Two entry points to update

1. **ImageEditModal** (opened from a generated/existing image's "Edit" action)
2. **Attached image with "Edit" mode selected** in the chat input (instead of Analyze)

Both currently hardcode the model and ignore aspect ratio.

## Behavior

- Both flows reuse `useImageGenStore` (`model`, `aspectRatio`) as the source of truth — same store the `/image` dock uses, so the user's last choice persists across generation and editing.
- The picker UI mirrors `ImageOptionsDock` (same labels, Pro lock, aspect list).
- Pro-locked model = Nano Banana Pro; gated by `useSubscription` exactly like in the dock.

## Changes

### 1. `src/components/ImageEditModal.tsx`
- Remove the hardcoded `selectedModel = 'google/gemini-3.1-flash-image-preview'`.
- Read `model` and `aspectRatio` from `useImageGenStore` (defaulting to whatever is already set; if `lastUsedModel` prop is passed and the store is on the default, prime the store with `lastUsedModel`).
- Add a compact two-button row above the textarea:
  - **Model** button → popover listing `IMAGE_MODEL_OPTIONS` with Pro crown + lock toast (same as dock).
  - **Aspect** button → popover listing `IMAGE_ASPECT_OPTIONS`.
- Include `imageModel` and `aspectRatio` in the `processImageEdit` CustomEvent detail.

### 2. `src/components/ChatInput.tsx`
- Extend the `processImageEdit` listener type and `handleExternalImageEditRef` signature to accept `aspectRatio?: string`.
- Update the call to `ai.editImage(...)` in both code paths (modal-driven edit at ~line 798 and attached-image edit at ~line 1033) to pass the current `aspectRatio` from `useImageGenStore`.
- When at least one attached image is in **Edit mode** (`allImagesEditMode` true, or any image flagged edit), render the existing `<ImageOptionsDock />` above the input — same trigger pattern already used for `/image` mode. This gives users the same model + aspect ratio dock when toggling an attached image to Edit.

### 3. `src/services/ai.ts`
- `editImage(prompt, baseImageUrls, imageModel?, aspectRatio?)` — add `aspectRatio` param and forward it to the `edit-image` edge function body (the function already accepts `aspectRatio`, so no edge changes needed).

### 4. `supabase/functions/edit-image/index.ts`
- No code change required; it already reads `aspectRatio` and passes it to the gateway. (Verified.)

## Out of scope
- No changes to generation flow, the `/image` dock itself, or Voice edit.
- No new persisted state — reuses `useImageGenStore`.

