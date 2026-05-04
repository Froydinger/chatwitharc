## Problem

When you upload an image with the mode toggle set to "Analyze 🔍" (the default), Arc still routes to the image **editing** flow instead of analyzing. This happens because of an OR fallback in the send handler:

```ts
// src/components/ChatInput.tsx line 1022
if (isEditMode || (userMessage && isImageEditRequest(userMessage))) {
  // → routes to edit-image (generates a new image)
}
```

`isImageEditRequest` returns `true` for very common words like `add`, `remove`, `change`, `update`, `make it`, `put`, `combine`, etc. So almost any caption you type alongside an uploaded image (e.g. "what's in this, and add any details you notice") incorrectly triggers the edit flow — producing a generated image instead of a chat analysis.

Since there is now an explicit user-facing toggle ("Mode: Analyze 🔍" / "Mode: Edit ✏️"), the keyword-sniffing fallback is both unnecessary and the source of the bug.

## Fix

Single-line change in `src/components/ChatInput.tsx`:

- Line 1022: change
  ```ts
  if (isEditMode || (userMessage && isImageEditRequest(userMessage))) {
  ```
  to
  ```ts
  if (isEditMode) {
  ```

This makes the toggle the sole source of truth:
- Default (Analyze) → uses `analyze-image` / vision flow → Arc chats about the image.
- User flips to Edit → uses `edit-image` flow → Nano Banana edits the image.

## What stays the same

- Image generation from text (no uploads) — unchanged.
- Auto-edit detection on follow-up messages **after** an AI-generated image — unchanged (that's a separate path via the `processImageEdit` event, not this branch).
- The Edit/Analyze toggle UI — unchanged.
- All other flows (canvas, code, search, voice, docs) — unchanged.

## Risk

Minimal. One conditional simplified; behavior now matches the visible toggle the user already controls.
