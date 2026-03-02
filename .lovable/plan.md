

## Model Selector, Pricing Reorder, and Canvas Click Simplification

### Overview
Three changes: (1) Add a GPT vs Gemini model selector for Pro users, (2) reorder the pricing comparison table, and (3) simplify canvas panel clicks to go straight to the source chat.

---

### 1. Model Selector (GPT vs Gemini)

**Concept**: Pro users can toggle between "Gemini" (default) and "GPT" model families. Free users stay on Gemini. The toggle is stored in the user's profile (`preferred_model` column -- already exists in the database).

**Model mapping by family and task:**

| Task | Gemini (default) | GPT |
|------|-------------------|-----|
| Chat | `google/gemini-3-flash-preview` | `openai/gpt-5-mini` |
| Code/Canvas | `google/gemini-3-pro-preview` | `openai/gpt-5.2` |
| Image Generation | `google/gemini-3-pro-image-preview` | `google/gemini-3-pro-image-preview` (same -- GPT has no image gen model in the gateway) |
| Image Analysis | `google/gemini-2.5-flash` | `openai/gpt-5-mini` |
| Image Editing | `google/gemini-3-pro-image-preview` | `google/gemini-3-pro-image-preview` (same) |

Note: Image generation and editing will always use Gemini's image model regardless of selection since there's no equivalent GPT image generation model available through the gateway. This is transparent to the user.

**Files changed:**

**`src/store/useArcStore.ts`** (or a new lightweight store)
- Add a `modelFamily: 'gemini' | 'gpt'` state (persisted)
- Add `setModelFamily` action
- Helper function `getModelForTask(task: 'chat' | 'code' | 'image-gen' | 'image-analysis' | 'image-edit'): string` that returns the right model string

**`src/services/ai.ts`** -- Central model routing changes:
- `sendMessage()`: Instead of hardcoded `google/gemini-3-flash-preview` / `google/gemini-3-pro-preview`, read the model family from `sessionStorage` or profile and use the mapping table above
- `sendMessageStreaming()`: Same -- replace hardcoded models with family-aware selection
- `sendMessageWithImage()`: Use `gpt-5-mini` or `gemini-2.5-flash` based on family
- `generateImage()`: Always use `google/gemini-3-pro-image-preview` (no change)
- `editImage()`: Always use `google/gemini-3-pro-image-preview` (update to remove `arc_session_model` sessionStorage reference)
- `generateFile()`: Use code model from family mapping

**`src/components/MobileChatApp.tsx`**:
- Remove the hardcoded `sessionStorage.setItem('arc_session_model', ...)` calls
- Read model family from the store instead

**`src/components/SettingsPanel.tsx`** -- Add Model Selector UI:
- New card in the Profile tab (below Voice Mode or above it), visible only to Pro subscribers
- Two-option toggle: "Gemini" and "GPT" with icons/logos
- Shows current selection with a check mark
- Free users see this card grayed out with "Pro only" badge
- On change, update profile `preferred_model` field and the local store

**`src/components/ChatInput.tsx`** or wherever the mode buttons are:
- Optionally show a small model family indicator (e.g., "Gemini" or "GPT" chip) so users know which family is active

**`src/components/PromptLibrary.tsx`** and **`src/utils/smartPrompts.ts`**:
- Replace `sessionStorage.getItem('arc_session_model')` with store-based model selection

---

### 2. Pricing Comparison Reorder

**File: `src/pages/PricingPage.tsx`**

Replace the `features` array. Remove "AI Model Selection" and "File Generation" rows. Add "Choose Your Model (GPT or Gemini)" as Pro-only. Reorder so all checkmark-checkmark rows come first:

```text
1. Image Analysis          (check / check)
2. Memory & Context        (check / check)
3. Code Generation         (check / check)
4. Web Search              (check / check)
5. AI Chat                 (30/day / Unlimited)
6. Voice Mode              (3/day / Unlimited)
7. Unlimited Image Gen     (5/day / Unlimited)
8. Choose Your Model       (-- / check)
```

Also remove unused `Zap` import, add `Sparkles` if not already imported.

---

### 3. Canvas Panel -- Click Goes to Chat

**File: `src/components/CanvasesPanel.tsx`**

Line 345: Change `onClick={() => setSelectedItem(item)}` to `onClick={() => goToChat(item.sessionId)}`.

This makes clicking a canvas tile navigate directly to the chat session it came from, skipping the preview modal entirely.

---

### Summary of all files

| File | Change |
|------|--------|
| `src/store/useArcStore.ts` | Add `modelFamily` state + `setModelFamily` + `getModelForTask` helper |
| `src/services/ai.ts` | Replace all hardcoded model strings with family-aware routing |
| `src/components/SettingsPanel.tsx` | Add GPT/Gemini toggle card (Pro only) |
| `src/components/MobileChatApp.tsx` | Remove hardcoded sessionStorage model sets, read from store |
| `src/components/PromptLibrary.tsx` | Use store model instead of sessionStorage |
| `src/utils/smartPrompts.ts` | Use store model instead of sessionStorage |
| `src/pages/PricingPage.tsx` | Reorder features, replace File Gen with Model Selection |
| `src/components/CanvasesPanel.tsx` | Canvas click goes straight to chat |

