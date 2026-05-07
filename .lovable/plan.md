## Voice Model Upgrade — Options

OpenAI just shipped **GPT-Realtime-2** (the post in your screenshot). Per their docs, here's what it actually brings vs. our current `gpt-realtime-1.5`:

### What's new in gpt-realtime-2
- **GPT-5-class reasoning** with **configurable `reasoning_effort`** (`minimal` / `low` / `medium` / `high`) — model can "think before it speaks"
- **Stronger instruction following** + more reliable **tool/function calling** (big win for our `generate_image`, `web_search`, `search_past_chats` tools)
- **Image input** in the same realtime session (text + audio + image in, text + audio out) — pairs perfectly with our existing camera/attachment flow in `useVoiceModeStore`
- **128k context window**, **32k max output tokens** (up from 1.5)
- Same voices (cedar, marin, etc.) — no breaking changes to our voice picker
- Same session shape, same WebSocket protocol — drop-in compatible
- Pricing identical to 1.5 on text input ($4/M); audio in/out same tier

### Companion models also released
- `gpt-realtime-translate` — live speech translation
- `gpt-realtime-whisper` — new streaming transcription model

We don't need these right now (our voice mode is conversational, not translation/dictation), so I'll **skip them** unless you say otherwise.

### Proposed changes

1. **Bump the model id** in both spots:
   - `supabase/functions/openai-realtime-proxy/index.ts` → `OPENAI_REALTIME_MODEL = 'gpt-realtime-2'`
   - `src/hooks/useOpenAIRealtime.tsx` → same constant

2. **Enable reasoning at `low` effort** in the proxy session creation. `low` keeps latency snappy for conversational use while still unlocking the GPT-5 reasoning gains for tool calls. (Higher = smarter but slower; we can crank it later if you want.)

3. **No UI changes needed.** Voice picker, camera/attachment, tool-call plumbing, transcript ordering — all stay as-is. Image-input via realtime can be a follow-up if you want to push attached images directly into the realtime session instead of the current side-channel.

### Want any of these as well? (just say the word)
- **Expose reasoning effort as a setting** (low/medium/high toggle in voice settings)
- **Wire image attachments directly into the realtime session** instead of the separate analyze flow
- **Add `gpt-realtime-translate`** as a "Translate Mode" toggle in voice
