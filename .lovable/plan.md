

# Dynamic Model Routing: Flash Default + 3.1 Pro for Complex/Code

## Problem
`google/gemini-3.1-pro-preview` is in the allowed models list but never actually gets used because:
1. **Client** (`useModelStore.ts` line 10): `code` task maps to `gemini-3-flash-preview`
2. **Server** (`chat/index.ts` line 773): Code mode override forces `gemini-3-flash-preview`

## Available Models (from Lovable AI gateway)
These are confirmed available:
- `google/gemini-3-flash-preview` — fast, default chat
- `google/gemini-3.1-pro-preview` — complex reasoning, code
- `google/gemini-2.5-pro` — heavy reasoning fallback
- `google/gemini-2.5-flash` — balanced
- `openai/gpt-5`, `openai/gpt-5-mini`, `openai/gpt-5-nano`, `openai/gpt-5.2`

## Changes

### 1. `src/store/useModelStore.ts`
- Add `'deep-chat'` task type for dynamically upgraded conversations
- Map Gemini `code` → `google/gemini-3.1-pro-preview`
- Map Gemini `deep-chat` → `google/gemini-3.1-pro-preview`
- Keep Gemini `chat` → `google/gemini-3-flash-preview`

### 2. `src/services/ai.ts`
- Add `detectComplexQuery(lastUserMessage)` function that checks for:
  - Long messages (>400 chars)
  - Analysis/reasoning keywords ("explain", "analyze", "compare", "step by step", "in depth", "write me an essay", "break down", "pros and cons", "comprehensive")
  - Code keywords without explicit prefix ("debug", "refactor", "implement", "algorithm", "function that")
  - Multi-part questions (numbered lists, multiple "?")
- When complexity detected in regular chat, use `getModelForTask('code')` instead of `getModelForTask('chat')`
- Pass `useProModel: true` flag to edge function when upgrading
- Log model selection reason

### 3. `supabase/functions/chat/index.ts`
- **Line 773**: Change code mode Gemini override from `gemini-3-flash-preview` to `gemini-3.1-pro-preview`
- Accept `useProModel` flag from client — when true and Gemini family, use `google/gemini-3.1-pro-preview`
- Keep `google/gemini-3-flash-preview` as default fallback

### Flow
```text
User message
    │
    ├─ /code or /write prefix ──→ gemini-3.1-pro-preview
    │
    ├─ Complex query detected ──→ gemini-3.1-pro-preview  
    │   (long, analytical, code terms, multi-part)
    │
    └─ Regular chat ──→ gemini-3-flash-preview (fast)
```

### 4. Update model references in UI
- `src/components/SettingsPanel.tsx` and `src/components/AccountHub.tsx`: Ensure the "Wise & Thoughtful" Gemini option maps to `gemini-3.1-pro-preview` correctly (verify current state)

