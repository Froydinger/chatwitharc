# Web Push Notifications Setup

You're thinking of **VAPID keys** (Voluntary Application Server Identification) — the public/private keypair that authenticates your server to push services (FCM, Apple, Mozilla). I'll generate them and wire up the full push stack.

## What gets built

### 1. VAPID keys
- Generate VAPID public + private key pair using `web-push` library
- Store `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto: contact) as Lovable Cloud secrets
- Public key also exposed to frontend (it's safe to be public — that's the point)

### 2. Database
New table `push_subscriptions`:
- `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at`, `last_used_at`
- RLS: users can only see/manage their own subscriptions
- GRANT to authenticated + service_role

### 3. Service Worker updates
- Extend existing PWA service worker to handle `push` and `notificationclick` events
- Show notification with title, body, icon, badge, deep-link URL
- Click → focus existing tab or open URL

### 4. Edge functions
- **`register-push-subscription`** — saves subscription to DB (called from client after user grants permission)
- **`unregister-push-subscription`** — removes subscription
- **`send-push-notification`** — server-side sender using `web-push` Deno port; takes `user_id` (or array) + payload, looks up subscriptions, sends, prunes 410/404 dead endpoints

### 5. Frontend
- New `usePushNotifications` hook: check support, request permission, subscribe, register with backend, unsubscribe
- New "Notifications" section in Settings:
  - Toggle to enable/disable push
  - Shows current permission state with helpful copy if blocked
  - Lists active devices with last-used date + remove button
- Wire it into the existing Settings panel structure

### 6. iOS PWA caveat (informational)
- iOS only supports web push when app is **installed to home screen** (iOS 16.4+)
- Settings panel will detect this and show install hint when needed

## Out of scope for this step
- Actually *triggering* notifications from features (scheduled tasks, group chat mentions, etc.) — those come next when we build agents / group chats / scheduled tasks
- Native iOS/Android push via Capacitor (sticking with web push for now since this is a PWA)

## Order of operations
1. Add `web-push` package (frontend uses public key only; edge functions use full lib for signing)
2. I'll trigger the secrets prompt for `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — **I'll generate the keys for you and tell you exactly what to paste into each field** so you're not hunting down a generator
3. Migration for `push_subscriptions` table
4. Edge functions (register / unregister / send)
5. Service worker push handler
6. `usePushNotifications` hook + Settings UI

Confirm and I'll start with key generation so we can get the painful part out of the way first.
