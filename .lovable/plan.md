

## Arc Context API — Plan

### What We're Building
A new edge function (`arc-context-api`) that serves as a public API for external apps to tap into Arc's "brain" — the system prompt, user memories, context blocks, and behavioral guidelines — so any bot on any platform can respond with Arc's personality and knowledge for a given user.

### How It Works

1. **New edge function: `supabase/functions/arc-context-api/index.ts`**
   - Authenticated endpoint (user passes their Arc auth token)
   - Accepts an optional `mode` parameter:
     - `"context-only"` (default) — returns the assembled system prompt + memories + context blocks as a JSON payload. The external bot injects this as its system prompt.
     - `"chat"` — accepts messages array, runs them through the Lovable AI gateway with Arc's full brain, returns the AI response (proxied chat). This lets external apps use Arc as a drop-in AI backend.
   - Fetches: admin system prompt, global context, user profile (name, memories, context_info), and user's context blocks
   - Assembles the same enhanced system prompt the chat function builds (lines 444-497 of chat/index.ts)
   - Returns structured JSON

2. **Response shape for `context-only` mode:**
   ```json
   {
     "system_prompt": "Full assembled system prompt with personality, memories, context...",
     "user": { "display_name": "...", "memories": "...", "context_info": "..." },
     "context_blocks": [{ "content": "...", "source": "manual|memory" }],
     "metadata": { "generated_at": "ISO timestamp" }
   }
   ```

3. **Response shape for `chat` mode:**
   - Streams or returns the AI completion directly (same as current chat function but simplified — no tools like web_search, just pure conversation with Arc's brain)

4. **Config update:** Add `arc-context-api` to `supabase/config.toml` with `verify_jwt = false` (auth validated in code)

5. **Integration instructions document:** Create a markdown file or return instructions via a `GET` request to the endpoint, covering:
   - How to obtain a user auth token (login via Arc, extract JWT)
   - How to call the context-only endpoint and inject the system prompt into any LLM
   - How to call the chat proxy endpoint for a turnkey solution
   - Example code snippets for Lovable apps, generic fetch, Python, etc.

### Integration Pattern for Other Bots

External apps would do one of:

**Option A — Context injection (any model):**
```js
// 1. Fetch Arc's brain
const ctx = await fetch("https://jxywhodnndagbsmnbnnw.supabase.co/functions/v1/arc-context-api", {
  headers: { Authorization: `Bearer ${userArcToken}`, "Content-Type": "application/json" },
  method: "POST",
  body: JSON.stringify({ mode: "context-only" })
}).then(r => r.json());

// 2. Use as system prompt with ANY model
const messages = [
  { role: "system", content: ctx.system_prompt },
  { role: "user", content: userMessage }
];
```

**Option B — Proxied chat (Arc handles everything):**
```js
const response = await fetch(".../arc-context-api", {
  headers: { Authorization: `Bearer ${userArcToken}`, "Content-Type": "application/json" },
  method: "POST",
  body: JSON.stringify({ mode: "chat", messages: [...] })
});
```

### Files Changed
- **Create** `supabase/functions/arc-context-api/index.ts` — the new API
- **Edit** `supabase/config.toml` — register the function
- No database changes needed (reads existing tables)

