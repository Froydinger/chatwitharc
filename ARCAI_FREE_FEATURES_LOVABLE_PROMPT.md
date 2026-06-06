# ArcAI — Free-Tier Feature Pack (Lovable build brief)

Free-tier selling points (things competitors paywall) that stay cheap to run.
Keep everything consistent with the existing glass/shadcn UI, Zustand stores, and
Supabase backend.

## Status
- ✅ **#2 Prompt enhancer** — DONE in the repo (frontend only; uses the existing
  `chat` edge function). Verify/polish only.
- ✅ **#3 Math + Mermaid rendering** — DONE in the repo (frontend only). Verify/polish.
- ⬜ **#1 Read-aloud** — needs a new `tts` edge function (do in Lovable).
- ⬜ **#4 Chat folders** — needs SQL (new table + column).
- ⬜ **#5 BYOK** — frontend-only, but deferred so it can be run-tested in Lovable preview.
- ⬜ **#6 Custom personas** — needs SQL (new table).
- ⬜ **#7 Edit-message version history** — frontend-only; deferred for run-testing.
- 🅿️ **Gmail / Drive connectors** — see "Parked" section; cannot be done client-only.

## Ground truth — existing architecture (don't reinvent these)
- Chat goes through the Supabase **`chat` edge function**. Models are selected by
  `getModelForTask(task)` in `src/store/useModelStore.ts`, which maps a `gemini`/`gpt`
  family to model strings. **Gemini 3 Flash already exists** as
  `google/gemini-3-flash-preview`.
- Conversations: `ChatSession` + flat `Message[]` in `src/store/useArcStore.ts`.
  `editMessage(messageId, newContent)` currently **truncates all messages after the
  edited one** and keeps no history.
- Sidebar history: `src/components/ChatHistoryPanel.tsx`, backed by the
  `chat_sessions` table. **`@dnd-kit/core` + `@dnd-kit/utilities` are already installed.**
- Dashboard: `src/pages/DashboardPage.tsx`. Settings: `src/components/SettingsPanel.tsx`.
- Image editing: `src/components/ImageEditModal.tsx`. Message rendering:
  `src/components/MessageBubble.tsx` (markdown via react-markdown + remark-gfm).
- Prompt presets today: `src/components/PromptLibrary.tsx` + `QuickPrompts.tsx`.
- Quotas/entitlement: `src/hooks/useSubscription.tsx` (Free vs Boost).

---

## 1. Read-aloud (OpenAI TTS) — free & unlimited
**Goal:** A speaker button on every assistant message that reads the answer aloud.
- Add a small "Listen" / speaker icon button in the assistant message action row in
  `MessageBubble.tsx` (next to Copy/Edit). Toggles play/stop; show a subtle animated
  state while playing.
- Synthesize with **OpenAI TTS** via a new edge function `tts` (input: text + optional
  voice; returns audio). Strip markdown/code fences before sending; chunk long answers.
- Stream/playback through an `<audio>` element or the existing audio playback hook
  (`src/hooks/useAudioPlayback.tsx`) if it fits.
- **Not** gated by the voice-conversation quota — this is free and unlimited (it's TTS,
  not the realtime voice mode). Pick one good default voice; no UI picker needed for v1.

## 2. Prompt enhancer ("✨ enhance?") — Gemini 3 Flash, preview popover
**Goal:** Help users write better prompts without disrupting the current flow.
- In `src/components/ChatInput.tsx`: when the input has a few words of text, show a
  small, dismissible **"✨ enhance?" chip floating just above the input**. Non-intrusive;
  never blocks normal typing/sending.
- On tap: call the `chat` edge function with **Gemini 3 Flash**
  (`google/gemini-3-flash-preview`) using a rewrite system prompt ("Rewrite this prompt
  to be clearer and more effective; keep the user's intent; return only the improved
  prompt"). Show the result in a **small popover with Accept / Dismiss** — only on
  Accept does it replace the input text. Show a tiny loading state on the chip.
- **Also add the same enhancer** to `ImageEditModal.tsx` (enhance the edit-instruction
  textarea) and ideally the main image-generation prompt input, same preview-popover UX.
- Make a reusable `enhancePrompt(text, kind: 'chat' | 'image')` helper so both call sites
  share logic. This is one cheap Flash call per tap — fine to leave ungated/free.

## 3. Math + diagram rendering (KaTeX + Mermaid)
**Goal:** Render LaTeX math and Mermaid diagrams in assistant messages.
- Add `remark-math` + `rehype-katex` (and KaTeX CSS) to the react-markdown pipeline used
  in `MessageBubble.tsx` so `$...$` / `$$...$$` render as formatted math.
- Add a **Mermaid** renderer: detect ```mermaid code blocks and render them as diagrams
  (lazy-load the `mermaid` package; render on the client only). Gracefully fall back to
  the raw code block if a diagram fails to parse. Respect light/dark theme.
- Pure client-side render cost, no extra API calls. Make sure it also works inside
  streaming/typewriter rendering without flicker.

## 4. Chat folders — flat, drag & drop
**Goal:** Let users organize chats into folders (single level, no nesting for v1).
- **SQL (Lovable):** new table `chat_folders` (`id`, `user_id`, `name`, `color?`,
  `sort_order`, `created_at`) with RLS scoped to the owner. Add nullable
  `folder_id uuid` (FK → `chat_folders`) to `chat_sessions`. Update the
  `list_chat_sessions_meta` / relevant RPCs to include `folder_id`.
- **Sidebar** (`ChatHistoryPanel.tsx`): render collapsible folder groups above the
  date-grouped list. Use the already-installed **@dnd-kit** to drag a chat onto a folder
  to assign it, and a right-click / "⋯" menu item **"Move to folder"** as the
  non-drag path. Create / rename / delete / reorder folders from the sidebar.
- **Dashboard** (`DashboardPage.tsx`): a folder-management section mirroring the same
  CRUD so users can manage folders there too.
- Add folder state/actions to a store (extend `useArcStore` or a small `useFoldersStore`).
  Chats with no folder stay in the normal date-grouped list.

## 5. Bring-Your-Own-Key (BYOK) — local-only, unlimited
**Goal:** Power users paste their own OpenAI or Gemini key and get unlimited usage; the
key **never leaves the browser**.
- Add a **"Your API keys (BYOK)"** section in `SettingsPanel.tsx`: inputs for an
  **OpenAI** key and a **Gemini** key, with show/hide, validate, save, and clear.
  Store **only in `localStorage`** (e.g. `arcai-byok-openai`, `arcai-byok-gemini`).
  Make it explicit in the UI: "Stored only on this device, never sent to our servers."
- When a key for the active provider is present:
  - Route **text chat completions directly from the client to the provider's API**
    (OpenAI / Google Generative Language) using that key, bypassing the `chat` edge
    function. Use a sensible current default model per provider (configurable).
  - **Bypass all Free quotas** in `useSubscription.tsx` (treat as unlimited chat;
    images still go through normal infra unless trivially supported).
  - Show a small **"Your key"** badge near the model/source badge so it's clear which
    path is active.
- v1 scope: text chat is the must-have. Keep it resilient — if a direct call fails,
  surface a clear error and let the user fall back to normal mode.

## 6. Custom personas ("Custom-GPT style") — Standard tier
**Goal:** Users build reusable AI assistants. Free (no paywall) as a differentiator.
- **SQL (Lovable):** new table `personas` (`id`, `user_id`, `name`, `emoji`/`avatar`,
  `system_prompt`, `default_model_family` ('gemini' | 'gpt'), `knowledge` text (pinned
  context injected into the system prompt), `starter_prompts` jsonb (2–3 strings),
  `created_at`, `updated_at`) with owner RLS.
- **Builder UI:** a "Personas" manager (new panel/page, reachable from settings or the
  right panel) to create/edit/delete personas: name, emoji/avatar, system prompt,
  optional pinned knowledge, default model family, and a few starter prompts. Build on
  the existing `PromptLibrary.tsx` patterns where it helps.
- **Use per chat:** a persona picker near the chat input / new-chat flow. When a persona
  is active: prepend its `system_prompt` (+ `knowledge`) to the conversation sent to the
  `chat` edge function, default the model family to the persona's choice, and surface its
  starter prompts as quick chips. Persist the active persona on the `ChatSession`
  (add `persona_id` to `chat_sessions`).
- Keep v1 to a single active persona per chat. (No public sharing / per-persona separate
  memory in v1 — that's a future "Full studio" upgrade.)

## 7. Edit-message version history (1/2 ◂ ▸ navigation)
**Goal:** Like ChatGPT — when a user edits a sent message, keep the previous version(s)
and let them page between them with a "1 / 2" stepper.
- Change `editMessage` in `useArcStore.ts` so editing a user message **does not discard**
  the prior version. Store versions per user message (e.g. add `versions: {content,
  timestamp}[]` + `activeVersion` to the `Message` shape, or a sibling structure) and
  keep the assistant responses that belong to each version.
- In `MessageBubble.tsx`, render a small **"‹ 1/2 ›" stepper** under edited user messages
  (and/or their responses), matching ChatGPT's behavior, so users can flip back to the
  pre-edit send and the answer it produced. Switching versions swaps the visible
  downstream messages.
- Persist enough to survive reload (extend the session persistence in `useArcStore` /
  `chat_sessions` accordingly).

---

## Notes / guardrails
- Match existing glass-card / shadcn styling, accent-color theming, and motion patterns.
- Keep new API usage cheap: enhancer = one Flash call on tap; TTS = on demand only.
- BYOK keys are **local-only** — never persist them server-side or log them.
- Where new tables/columns/edge functions are introduced (features 1, 4, 5, 6, 7),
  implement the SQL + edge-function pieces in Lovable.
## Parked — Gmail / Drive / Calendar connectors (Phase 2, needs backend)
This is the strongest differentiator but **cannot be done client-side-only**, and the
`GOOGLE_SEARCH_CONSOLE_API_KEY` secret in the project does **not** unlock it:
- **Wrong key type.** A Google *API key* only reads public or project-owned data. Gmail
  and Drive hold per-user private data, which Google **only** allows via **OAuth 2.0
  user consent** — never a static API key. You need an OAuth **Client ID**, not a key.
- **Wrong product.** Search Console's scope is `…/auth/webmasters`; it has nothing to do
  with mail or files.
- **Scopes required (OAuth):**
  - Gmail read: `https://www.googleapis.com/auth/gmail.readonly`
  - Gmail send/draft: `https://www.googleapis.com/auth/gmail.send` (or `gmail.compose`)
  - Drive (app-created files only, **non-restricted**, light review):
    `https://www.googleapis.com/auth/drive.file`
  - Drive (read everything, **restricted**, heavy review): `…/auth/drive.readonly`
  - Calendar: `…/auth/calendar.readonly` or `…/auth/calendar.events`
- **Why it needs an edge function:** Supabase only hands back the Google `provider_token`
  transiently at sign-in and won't refresh it; using it later/refreshing requires a
  server-side refresh-token exchange.
- **Process cost:** `gmail.readonly` / `drive.readonly` are *restricted* scopes that
  require Google's CASA security review before public launch (weeks). Prefer
  `drive.file` + `gmail.send` first to avoid that.
- **Privacy note:** `AuthPage.tsx` currently promises "no contacts, no calendar, no
  Drive, nothing else" — that copy must be updated before shipping any connector.
