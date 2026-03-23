

## Plan: Fix IDE / Build Flow + Build Error

### Problems Identified

1. **Build error in `process-email-queue/index.ts`** — `msg` and `id` parameters lack type annotations. This is unrelated to the IDE but blocks deployment.

2. **`/build` prompt never reaches the agent** — The flow is:
   - ChatInput detects `/build`, navigates to `/apps?prompt=...`
   - AppsPage creates a DB row, then navigates to `/apps/{id}?initialPrompt=...`
   - `loadAndOpenProject` fetches the project (which has no files yet), calls `reopenIDECanvas`
   - IDECanvasPanel mounts, the auto-run `useEffect` checks `ideAutoRunPrompt` — but `reopenIDECanvas` only sets `ideAutoRunPrompt: true` when `initialPrompt` is truthy AND the store field is `!!initialPrompt`. This part looks correct.
   - **The real issue**: `messages.length > 0` guard on line 346 — if `storedMessages` from the store is populated from a previous session, the auto-run is skipped. Also, `didAutoRunInitialPromptRef` persists across re-renders if the component doesn't fully unmount between projects.

3. **Agent only sends the latest message, not conversation history** — `sendAgentMessage` hardcodes `messages: [{ role: 'user', content: userMessage }]` instead of forwarding the full chat history. Multi-turn conversations are broken; the agent has no context of prior exchanges.

4. **"Done!" with no file changes** — When the agent edge function gets a request but the AI returns no tool calls (possibly due to missing context or model confusion), it falls through to `summary: "Done!"`. The client-side `sendAgentMessage` also has a fallback `summary || 'Done!'`. Combined with issue #3, the model likely gets confused with no context.

### Fix Plan

**Step 1: Fix build error in `process-email-queue/index.ts`**
- Add explicit types to the `.map((msg)` and `.filter((id)` callbacks (lines 125 and 130). Type `msg` as `any` and `id` as `string | null`.

**Step 2: Fix `sendAgentMessage` to send full conversation history**
- Change `src/services/agent.ts` to accept and forward the full message history instead of wrapping just the latest message.
- Update the function signature to accept `chatHistory` array.
- Send `messages: [...chatHistory, { role: 'user', content: userMessage }]` in the request body.

**Step 3: Fix `runAgent` in `IDECanvasPanel.tsx` to pass chat history**
- Convert the `chatHistory` parameter (which is already passed but unused by `sendAgentMessage`) into the format the agent expects (`{ role, content }[]`).
- Pass it through to `sendAgentMessage`.

**Step 4: Fix auto-run guard for `/build` prompts**
- Reset `didAutoRunInitialPromptRef` when `ideProjectId` changes (new project).
- Adjust the `messages.length > 0` check: only skip if messages contain actual user content (not just the empty assistant placeholder from a previous mount).

**Step 5: Fix `ChatInput.tsx` navigation for `/build`**
- Use `navigate()` from react-router instead of `window.location.href` to avoid a full page reload that could lose state.

### Files to Edit
1. `su