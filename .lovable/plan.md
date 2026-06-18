# Anonymous Chat Mode

Let unauthenticated visitors land directly in a stripped-down chat instead of the landing screen. Anon chats live in localStorage only, are wiped on "New chat", cap at **25 assistant replies/day** (enforced server-side by IP), and allow **text + web search only** — no memory, no images, no personas, no voice, no file uploads, no history, no sharing, no canvas, no Star/Slash menus beyond search.

If the daily cap is hit (or the user signs up mid-chat), the active chat is handed off to their new account on sign-up so it appears in history.

## Flow

```text
/ (unauth)
  └── MobileChatApp in anon mode  (no sidebar, no history, no upgrade nag spam)
        ├── send → /functions/v1/anon-chat  (IP-rate-limited, 25/day)
        ├── messages stored in localStorage key `arc_anon_chat`
        ├── "New chat" → wipe `arc_anon_chat`, start fresh
        ├── reply count surfaced as "X / 25 today"
        └── on cap reached OR user clicks Sign Up:
              ├── stash chat in localStorage key `arc_anon_chat_pending_migration`
              ├── show inline auth modal (Google / Apple)
              └── after auth: migrate stash → new chat_sessions row → clear stash → land in chat
```

## Frontend changes

- `**src/pages/Index.tsx**` — remove the `if (!user) return <LandingScreen />` branch. Unauth users render `<MobileChatApp anonMode />`.
- `**src/components/MobileChatApp.tsx**` — accept `anonMode` prop. When true:
  - Hide sidebar, RightPanel, dashboard nav, history, shared chats, music, canvas, IDE, personas, memory indicator.
  - Lock Star menu and Slash picker to **Web Search only** (or hide them entirely and add a single "Search" toggle pill in the input).
  - Hide attach button, voice button, image-gen prompts.
  - Show a small "Anonymous · X / 25 today · Sign up to save" header pill.
- `**src/store/useAnonChatStore.ts**` (new, Zustand + localStorage):
  - `messages: AnonMessage[]`, `repliesToday: number`, `lastResetDate: string`
  - `append(msg)`, `newChat()` (wipes), `markForMigration()`, `getPendingMigration()`, `clearMigration()`
  - Single key `arc_anon_chat`; migration stash key `arc_anon_chat_pending_migration`.
- `**src/services/ai.ts**` — add `sendAnonMessage(messages, { search })` that posts to the new edge function with no auth header, parses streaming response, and surfaces `429` (cap reached) and `402` (forbidden feature) cleanly.
- `**src/components/ChatInput.tsx**` — when `anonMode`, render compact version: textarea + send + optional Search toggle. No mic, no attach, no personas, no Star.
- `**src/components/AuthModal.tsx**` — on successful sign-up/sign-in, check `useAnonChatStore.getPendingMigration()`; if present, call a tiny client helper that inserts a new `chat_sessions` row with those messages and clears the stash, then routes to `/chat/<new id>`.
- `**src/components/LandingScreen.tsx**` — keep file but no longer rendered on `/`. Optionally repurpose `/welcome` for marketing later; out of scope here.

## Backend changes

- **New edge function `supabase/functions/anon-chat/index.ts**` (`verify_jwt = false`):
  - Accept `{ messages: UIMessage[], search?: boolean }`.
  - Reject if any message contains attachments, images, persona refs, or non-text parts.
  - Derive client IP from `x-forwarded-for` (first hop) + `cf-connecting-ip` fallback; hash with a server salt.
  - Read/increment a counter in a new `anon_usage` table for that IP-hash for today (UTC date). If `replies_today >= 25`, return `429` with `{ error: 'daily_limit', repliesToday, limit: 25 }`.
  - Route to Gemini 3 Flash via Lovable AI Gateway (text) or Perplexity sonar (when `search=true`), reusing the same model selection as the existing `chat` function.
  - On successful stream completion, `+1` the counter.
  - Strip system prompt of any memory/personalization; use a minimal anon system prompt ("You are Arc. The user is anonymous. Keep responses concise. No memory. Refuse requests for image generation, file analysis, or personalization — direct them to sign up.").
- **New migration**: table `public.anon_usage`
  - Columns: `ip_hash text primary key`, `usage_date date not null`, `replies_count int not null default 0`, `updated_at timestamptz default now()`. Composite PK on `(ip_hash, usage_date)`.
  - No RLS exposure to clients; only the edge function (service role) reads/writes. Still enable RLS with no policies for `authenticated`/`anon` to lock it down.
  - GRANT only to `service_role`.

## Migration on sign-up

- `**src/hooks/useAuth.tsx**` — after `onAuthStateChange` SIGNED_IN event, check `arc_anon_chat_pending_migration`. If present:
  - Insert into `chat_sessions` (`user_id`, generated title from first user message, `messages` JSONB).
  - Clear both `arc_anon_chat` and `arc_anon_chat_pending_migration`.
  - Trigger `useArcStore.syncFromSupabase()` so the new session shows in history.
  - Navigate to `/chat/<new id>`.

## Out of scope

- No fingerprinting library — IP hash only. Acknowledge bypass-by-VPN; matches user's "Server-side by IP" choice.
- Anon users still don't get voice/images/files/personas/memory ever — even after hitting the wall, they must sign up.
- Existing landing screen file is left in place but unused on `/`.

## Technical notes

- Streaming for anon uses the same AI SDK `toUIMessageStreamResponse` shape so `ChatInput` rendering is unchanged.
- The 25-cap is enforced **server-side only**; the client display is informational and refreshed from the edge function's response headers (`x-anon-replies-today`, `x-anon-limit`).
- Date rollover is UTC; refreshed by the edge function on each call, not a cron.
- The migration insert runs client-side using the freshly authenticated supabase session — no edge function needed for migration.  


ALSO MAKE INPUT BAR EVEN 10PX THINNER AS WE DID BEORE FIRST BEFORE EXECUTING REST OF PLAN!

&nbsp;