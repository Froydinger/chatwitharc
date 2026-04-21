

## Plan

Two unrelated cleanups in one pass.

---

### 1. Remove Smart suggestions from the Ideas modal

The "Smart" tab in `PromptLibrary` calls `generate-smart-prompts` (and is preloaded by `usePromptPreload` + `smartPrompts.ts`). The user reports it consistently fails. Rip out the AI-driven smart generation entirely; keep the four working static-AI tabs (Chat, Create, Write, Code).

**Edits**

- `src/components/PromptLibrary.tsx`
  - Drop `'smart'` from `TabType`; remove the Smart tab from the `tabs` array.
  - Default `activeTab` to `'chat'`.
  - Delete `smartPrompts`, `isLoadingSmartPrompts`, the smart-fetch `useEffect`, the cached-smart prefill, and the `smart` branch in `getCurrentPrompts` / `isCurrentTabLoading`.
  - Drop the `Brain` icon import.

- `src/hooks/usePromptPreload.tsx`
  - Delete `generateSmartPromptsBackground()` and remove it from the parallel preload `Promise.all`.

- `src/utils/smartPrompts.ts` — **delete the file** (no remaining imports after cleanup; only `selectSmartPrompts`/`fetchPersonalizedPrompts` lived here and they're unused).

- Verify no other imports of `smartPrompts.ts` or `'generate-smart-prompts'` remain in `src/` (already scanned: only the modal + preload reference it).

The edge functions `generate-smart-prompts` / `generate-personalized-prompts` stay deployed but become dormant — no client traffic. Not deleting them so we can revisit later without redeploy churn.

---

### 2. Make local model downloads stick across app close/reopen everywhere

The "model deleted on reopen" symptom is actually a **stale UI state**, not real eviction in most cases. Three converging problems:

**a. `getCachedLocalModels()` doesn't probe the iOS Lite model in some flows** — actually it does. ✅

**b. The store's `partialize` downgrades `status: 'loading'` → `'idle'` on every reload, but never restores to `'ready'` if reconciliation hasn't fired yet.** First paint of `LocalAIPanel` shows "no model" until the async `getCachedLocalModels()` resolves. On slow IndexedDB (cold app launch, especially Electron `.dmg`), that's a visible flash that looks like the model is gone.

**c. `useLocalModelPersistence` only runs once at App mount and races with the panel's own `refreshCache()`. If the persistence hook resets to `idle` because `selectedModelId` is empty (user never explicitly selected, just downloaded), we wipe the `ready` flag even though weights are present.** This is the actual bug: the reconciliation logic at line 58 does `if (status === "ready" && !selectedStillCached) → setStatus("idle")`, and `selectedStillCached` is false whenever `selectedModelId === ''`.

**d. Browser eviction is still possible (especially Safari/iOS PWAs and Electron without persistent storage granted).** `navigator.storage.persist()` in Electron returns false silently; we never retry or warn.

**Fixes**

- `src/services/localAI.ts`
  - `getCachedLocalModels()` already includes all four models — no change.
  - Add `getAnyCachedModelId()` helper that returns the first cached model id (or null), used as the canonical "we have a model" probe.

- `src/hooks/useLocalModelPersistence.tsx` — rewrite reconciliation:
  1. Run on mount **and** on `visibilitychange` → 'visible' (re-check when app is reopened from background, critical for PWAs/Electron).
  2. Always probe the cache first, ignore `selectedModelId` for the "is anything downloaded" check.
  3. If any model is cached: set `status='ready'`, `progress=1`, and if `selectedModelId` is empty or stale (not in cache), auto-select the first cached model.
  4. Only flip to `idle` if **zero** models are cached AND status was `ready` (truly evicted).
  5. Request `navigator.storage.persist()` and log/toast a one-time warning if it returns false on iOS/Electron so the user knows storage may be evicted.

- `src/store/useLocalAIStore.ts`
  - Change `partialize` to also persist `selectedModelId` and `progressText` so the panel doesn't visibly reset between paints. (selectedModelId is already persisted — confirmed.) Persist `progress` always when `status === 'ready'` (already done). Add `progressText: 'Ready'` when ready. Minor cosmetic.

- `src/components/LocalAIPanel.tsx`
  - In `refreshCache()`, also auto-mark `status='ready'` when any model is cached even if `selectedModelId` is empty (currently it does, but only if `status !== 'loading'`). Tighten so the panel never shows the "Download" button for a model that `cached[id] === true`, even mid-reconciliation.
  - Show a small "Verifying on-device model…" placeholder for the brief moment before the first `getCachedLocalModels()` resolves so users don't see a flash of "not downloaded" on a cold launch (especially in the `.dmg` build).

**Coverage by platform**

- **Desktop web (Chrome/Edge)** — `navigator.storage.persist()` works, IndexedDB sticks. Fix (c) eliminates the false "not downloaded" UI.
- **Desktop `.dmg` (Electron)** — `navigator.storage.persist()` may return false, but Electron never evicts IndexedDB on its own. Fix (c) + visibilitychange re-probe handles this.
- **PWA (mobile/desktop)** — persist() granted, plus visibilitychange re-probe handles app-resume case.
- **iOS Safari** — most aggressive eviction. We can't guarantee IndexedDB survives long pressure, but we (i) request persist, (ii) detect on resume, (iii) show real status instead of stale.

---

### Out of scope

- Not touching the chat default model (separate memory: gemini-3-flash-preview already correct).
- Not removing the personalized-prompts edge function — only the client wiring.
- Not touching `WelcomeSection` quick-idea chips (per user's "Modal only").

