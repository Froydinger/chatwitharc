
Goal: keep Llama 3.2 1B on mobile, but reduce crash risk by making mobile Arc Local use a rewritten, compact context block instead of passing/truncating the full desktop context. Desktop local remains unchanged.

## Updated implementation plan

1. Add a shared mobile-local detector
   - Create a small utility for “mobile/tablet local mode” detection covering iPhone, iPad, Android, and touch-tablet cases.
   - Reuse it across prompt building, routing, model loading, local tools, and the Arc Local settings UI.

2. Make mobile local available only through Corporate Mode
   - On desktop: keep current Arc Local behavior.
   - On mobile: normal chat stays cloud-backed so memory/search/main-chat flow remains intact.
   - Mobile local only routes when Corporate Mode is enabled, treating it as the explicit private/offline mode.
   - This prevents the main mobile chat from accidentally using a fragile local model path.

3. Replace mobile prompt truncation with a rewritten compact context block
   - In `buildLocalSystemPrompt`, add a mobile-specific context compressor instead of only `softTruncate`.
   - The compressor will transform the current full context into one succinct “Arc Mobile Local Brief” block:
     - Arc identity: ArcAI by Win The Night.
     - Core behavior: Ask, Reflect, Create; warm, concise, direct.
     - Critical crisis guidance.
     - Current date/time.
     - Offline/mobile limitations.
     - Any allowed Corporate Mode snapshot facts, rewritten into short bullets only if explicitly enabled.
   - It will not include raw admin prompt walls, raw memory blobs, raw context blocks, or long global context.
   - This is a deterministic rewrite/compression step in app code, not a cloud call, so Corporate Mode stays private/offline.

4. Strip mobile local memory/tools completely
   - For mobile local:
     - Do not fetch `profiles.memory_info`.
     - Do not fetch `context_blocks`.
     - Do not inject normal saved memories.
     - Do not include `<recall>` or `<remember>` instructions.
     - Hard-block `executeLocalToolCall` on mobile as a safety net.
   - Desktop local keeps recall/remember behavior.

5. Use a tiny mobile-local prompt profile
   - Mobile local prompt will target roughly 700–1200 characters instead of multi-section context.
   - It will contain only the rewritten brief plus a final brevity rule.
   - It will tell Llama to answer from the current conversation only and ask for clarification instead of pretending to remember missing details.

6. Further reduce Llama memory pressure
   - Keep `IOS_LITE_MODEL = Llama-3.2-1B-Instruct-q4f16_1-MLC`.
   - Lower `IOS_LITE_CONTEXT_WINDOW` from `2048` to a safer `1024`.
   - Reduce `max_tokens` only for the mobile Llama path, likely to `256` or `320`.
   - Keep “no fallback model” behavior on mobile so it never tries to load another model after Llama fails.

7. Update Arc Local settings copy
   - On mobile, explain that Llama 3.2 1B is for Corporate Mode/private offline chats only.
   - Hide or disable “Use local model when possible” on mobile.
   - Keep normal desktop Arc Local settings unchanged.
   - Update labels from “2K context window” to the new smaller mobile context window.

## Main files to update

- `src/services/localAI.ts`
  - Mobile context window cap.
  - Mobile `max_tokens` cap.
  - Keep no fallback for iOS/mobile Llama.

- `src/utils/localSystemPrompt.ts`
  - Add mobile-local compact context rewrite.
  - Bypass raw memories/context on mobile.
  - Keep full desktop prompt behavior.

- `src/utils/localToolProtocol.ts`
  - Disable local tool instructions on mobile.
  - Block local tool execution on mobile.

- `src/utils/routeRequest.ts`
  - Mobile local routes only in Corporate Mode.
  - Normal mobile chat remains cloud-backed.

- `src/hooks/useLocalModelPersistence.tsx`
  - Keep cached mobile model ready, but do not let it hijack normal mobile chat.

- `src/components/LocalAIPanel.tsx`
  - Mobile-specific copy and toggles.
  - Corporate Mode guidance.
  - Updated Llama memory/context wording.

## Out of scope

- No backend/database changes.
- No cloud memory changes.
- No desktop local behavior changes.
- No return to Qwen.
