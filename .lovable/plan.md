## Part 1 — Fix push on iOS PWA and Mac PWA (works on desktop browser today)

### Why it's failing
Desktop browsers work because Chrome/Edge/Firefox can subscribe to push from any installed origin with a service worker. Installed PWAs on iOS, iPadOS, and macOS Safari are stricter:

1. **Manifest is too thin.** `public/manifest.webmanifest` is missing `id`, has no maskable icon, no 192/512 PNGs, and `theme_color` is white. iOS and macOS Safari refuse to grant push to PWAs whose manifest fails the install-quality checks.
2. **Permission requested before the SW is fully active.** Inside an installed PWA, `Notification.requestPermission()` must be called after `navigator.serviceWorker.ready` resolves, not before. We currently call it after `getRegistration()` only.
3. **No detection of "installed but push API still warming up".** On a fresh install, `pushManager.subscribe` can throw `AbortError: Push service not available` for ~1 second after the SW activates — we surface that as a hard failure instead of retrying.
4. **macOS PWA (Add to Dock) is treated like desktop Safari.** The hook only special-cases iOS; macOS standalone needs the same "must be installed first" handling on Safari < 17 and the same retry logic on Safari ≥ 17.

### What to change
- Rewrite `public/manifest.webmanifest` with `id`, `scope`, `display`, `display_override: ["standalone"]`, `theme_color` matching the dark UI, and a full icon set: 192/512 `any` + 512 `maskable`. Generate the missing icons.
- Update `usePushNotifications`:
  - await `navigator.serviceWorker.ready` before both subscribe and status checks
  - retry `pushManager.subscribe` up to 3 times with 500ms backoff on `AbortError`/`NotAllowedError: push service`
  - detect macOS standalone (`display-mode: standalone` + macOS UA) and apply the same install-first guard as iOS for Safari versions that need it
  - return a typed `availabilityReason` so the card can show a specific message
- Update `PushNotificationsCard` to show: "Install ArcAI to your Dock/Home Screen first" for macOS/iOS non-standalone, retry hint for transient subscribe failures, and a "Send test notification" button for already-subscribed users.

### Welcome push
- After a successful subscribe, the client calls `send-push-notification` with a welcome payload ("Welcome to ArcAI 🎉 — we'll ping you when scheduled tasks finish or someone @mentions you in a shared chat."). Uses the existing send function, no new infra.

---

## Part 2 — Full Boost roadmap (Custom Agents, Shared Chats, Scheduled Tasks)

Push is the delivery layer; these three features are the things that ping it.

### Feature A — Custom Agents
User-defined personas with their own system prompt, model preference, avatar, default tools, and starter prompts. Boost-only.

Data:
- `agents` table: `id, owner_id, name, slug, avatar_url, description, system_prompt, model, tools jsonb, starter_prompts text[], is_public bool, created_at, updated_at`
- `agent_uses` (optional analytics) for popularity

UI:
- New `/agents` dashboard tab (Boost-gated): grid of user's agents + a "Discover" row of public ones
- "New Agent" wizard: name → avatar (generated or uploaded) → system prompt (with templates) → model picker → starter prompts
- Chat header gets an "Agent" pill; selecting an agent injects its system prompt as primary identity (uses the existing admin-priority pattern) and locks the model
- `@agentname` mention inside any chat spawns a reply from that agent (works inside shared chats too)

### Feature B — Shared Chats (group chats with Arc)
Multiple humans + Arc in one conversation. Everything is shared: messages, canvas, attachments, memory blocks scoped to the chat.

Data:
- `shared_chats` table: `id, owner_id, title, created_at, updated_at, canvas_content, agent_id nullable`
- `shared_chat_members`: `chat_id, user_id, role ('owner'|'editor'|'viewer'), joined_at, last_read_at`
- `shared_chat_messages`: `id, chat_id, author_user_id nullable (null = Arc/agent), role, content, attachments jsonb, created_at`
- Realtime via `ALTER PUBLICATION supabase_realtime ADD TABLE shared_chat_messages`
- Mentions: regex parse `@username` and `@agentname` on insert → row in `shared_chat_mentions` → trigger → `send-push-notification` to the mentioned user

UI:
- Sidebar "Shared" tab with all chats the user is a member of, unread badge
- Invite by email or username; pending invites table + accept flow
- Member avatars in the chat header
- Safe-guarded delete/leave: owner deleting shows "X people will lose access permanently" confirm; non-owner leave shows "you'll lose access; messages remain for others"
- Per-message author label + avatar bubble; Arc/agent messages keep current styling

### Feature C — Scheduled Tasks
"Every morning at 8, summarize my unread emails." "In 2 hours, remind me to call mom." "Every Sunday, draft a weekly review."

Data:
- `scheduled_tasks` table: `id, user_id, agent_id nullable, title, prompt, schedule_type ('once'|'cron'), run_at timestamptz nullable, cron_expr text nullable, timezone text, last_run_at, next_run_at, status ('active'|'paused'|'completed'|'failed'), result_chat_id nullable, push_on_complete bool default true, created_at, updated_at`
- `scheduled_task_runs`: `id, task_id, started_at, finished_at, status, output_message_id, error`

Infra:
- Enable `pg_cron` + `pg_net`
- One `run-scheduled-tasks` edge function called every minute that:
  1. selects tasks where `next_run_at <= now()` and `status = 'active'`
  2. runs each task's prompt through the chosen agent/model
  3. writes the result into a new chat session (or appends to `result_chat_id`)
  4. updates `next_run_at` from the cron expression
  5. fires `send-push-notification` if `push_on_complete`
- Cron schedule registered via `supabase--insert` (not migration) since it carries the anon key

UI:
- `/tasks` dashboard tab: list of tasks with next-run time, pause/resume, edit, history
- "Schedule this" button on any chat message turns the prompt into a recurring task
- Natural-language scheduler: "every Monday 9am" → parsed to cron with confirmation chip

### Build order
1. Push fixes + welcome notification (this turn)
2. Scheduled Tasks (simplest, uses push immediately)
3. Custom Agents (foundation for Shared Chats agent-as-member)
4. Shared Chats (most surface area, depends on agents for @mentions)

### Technical notes
- All three features are Boost-gated via existing `user_has_boost()`
- Edge functions follow the 55s timeout + 200 JSON fallback rule
- Realtime is only enabled on `shared_chat_messages`
- Scheduled task execution reuses the existing chat edge function so model routing, memory, and tool calls all work for free
- `send-push-notification` is already deployed and admin-restricted; we add a service-role bypass path for system events (welcome / mentions / task completion)