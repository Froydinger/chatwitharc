

## Make Arc Local fast on M4 Pro

Three real problems are stacking up to make local mode feel broken on your M4 Pro. I'll fix all three.

### 1. Switch default to a faster, better-suited model

`gemma-2-9b-it-q4f16_1` is ~5GB and prefill-heavy. On M4 Pro via WebGPU it's usable but punishing on first-token latency. I'll switch the **preferred** model to `Llama-3.2-3B-Instruct-q4f16_1-MLC` (≈1.9GB, 3-4× faster TTFT, excellent quality for chat) and keep Gemma 2 9B as an **opt-in** "Quality" tier. Fallback chain becomes:

```text
Llama 3.2 3B  →  Gemma 2 2B  →  (optional) Gemma 2 9B if user picks "Quality"
```

Already-cached Gemma users keep working — `findCachedLocalModel` will detect and reattach whatever is on disk.

### 2. Stream tokens into the UI live (biggest perceived win)

Right now `streamLocalChat` collects every delta into a string and only adds the message after the full response finishes. That's why it feels like "nothing's happening." I'll:

- Add a placeholder assistant message the instant streaming starts.
- Update its content on every delta (throttled to ~30ms via `requestAnimationFrame` to avoid React thrash).
- Finalize on completion.

This alone makes it feel 10× faster even if total time is identical.

### 3. Trim the per-turn prefill (kills the real latency)

We currently re-send the full system prompt + every message every turn, which forces WebLLM to re-prefill thousands of tokens on each reply.

- **Shrink `buildLocalSystemPrompt`**: cap `memory_info` to ~800 chars, cap `context_blocks` to the 10 most recent (not 50), drop the long admin prompt for local mode (use a tight 2-sentence ArcAI persona instead — admin prompt is tuned for tool-using cloud model anyway).
- **Cap message history** sent to local model to last 8 messages (was unbounded). Keeps the conversation coherent without forcing a 4k-token re-prefill every turn.
- **Stop `JSON.stringify`-ing message content**. If a message has non-string content (image), skip it for local mode (local can't see images anyway) instead of injecting `[{"type":"image_url",...}]` garbage into the prompt.
- Lower `max_tokens` from 1024 → 512 (plenty for chat; user can always say "continue").

### 4. Surface real generation speed

Add a tiny `tok/s` indicator under the streamed reply (computed from delta count + elapsed time) so you can see when something's actually wrong vs. just normal local speed.

### Files touched

- `src/services/localAI.ts` — new model id, fallback chain, expose `tokens/sec` callback, lower max_tokens.
- `src/components/ChatInput.tsx` — placeholder message + live streaming updates, history cap, drop image messages for local path.
- `src/utils/localSystemPrompt.ts` — trim memory/context, replace admin prompt with tight ArcAI persona for local.
- `src/components/LocalAIPanel.tsx` — update copy from "Gemma 2 9B" → "Llama 3.2 3B (fast)" with optional quality toggle, update label helper.

### Expected result on M4 Pro

- First token: **~1-2s** (was 15-30s).
- Streaming feels live (was: blank → wall of text).
- Sustained ~25-40 tok/s with Llama 3.2 3B; ~10-15 tok/s if you opt into Gemma 9B.

