

## Problem

Arc AI sometimes outputs tool calls as plain text in chat responses instead of actually executing them via the function calling API. For example, instead of invoking `web_search` or `save_memory` through the tool calling mechanism, the model writes out something like `{"name": "web_search", "arguments": {"query": "..."}}` as visible text to the user.

## Root Causes

1. **System prompt describes tools in plain text** (lines 453-462 of `chat/index.ts`). The system prompt has a `--- TOOLS ---` section that describes all tools textually. This can confuse models (especially Gemini) into thinking they should output tool calls as text rather than using the actual `tools` parameter in the API.

2. **Bug in second synthesis call token parameter** (line 1328): `[tokenParam]: 65536` where `tokenParam` is an object like `{ max_tokens: 65536 }`. JavaScript evaluates `[tokenParam]` as `"[object Object]"`, so the second call sends no valid token limit. This could cause unexpected behavior.

3. **No post-processing to detect/strip leaked tool call text** — if a model does output tool-call-like JSON in its response text, there's nothing catching it.

## Plan

### 1. Remove tool descriptions from system prompt
Remove the `--- TOOLS ---` section (lines 453-462) from `enhancedSystemPrompt`. The tools are already properly defined in the `tools` array (lines 541-666) which is what the API uses. Duplicate descriptions in the system prompt are what cause models to output them as text. Replace with a brief behavioral note like: "You have access to tools. Use them when appropriate. Do not describe tool usage in your response text."

### 2. Fix token parameter bug in second synthesis call
Line 1328: Change `[tokenParam]: 65536` to use the spread operator: `...tokenParam` — this correctly passes either `{ max_tokens: 65536 }` or `{ max_completion_tokens: 65536 }`.

### 3. Add response sanitizer for leaked tool call text
After the AI response is received (both first and second calls), add a sanitizer that:
- Detects JSON-like tool call patterns in the response text (e.g., `{"name": "web_search"`, `{"type": "function"`)
- Strips them from the visible response
- Optionally logs a warning so we can track how often this happens

### 4. Keep save_memory instruction minimal
The `save_memory` usage instruction is critical for the model to know *when* to save memories. Move just the behavioral trigger instruction ("save when user shares personal info") into a one-line addition to the system prompt, without describing the tool's API shape.

### Files to modify
- `supabase/functions/chat/index.ts` — all changes above

