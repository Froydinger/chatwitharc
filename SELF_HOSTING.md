# ArcAI self-hosting notes

ArcAI's active stack is now:

- Netlify-compatible Vite/React frontend
- Supabase Auth, Postgres, scheduled jobs, and Edge Functions
- Cloudflare R2 for generated and edited image files
- OpenAI for chat, voice, files, and image generation/editing
- Tavily for live web search

## Local frontend

Copy `.env.example` to `.env.local`, fill in the public Supabase values, then run:

```sh
npm install
npm run dev
```

The browser must only receive the Supabase URL and publishable key. OpenAI,
Tavily, VAPID, cron, and future payment/email secrets belong in Supabase Edge
Function secrets, never in a `VITE_*` variable.

Generated and edited images require these Supabase Edge Function secrets:

```text
R2_WORKER_URL
R2_WORKER_SECRET
```

The Worker in `cloudflare/r2-images-worker` is bound directly to the bucket, so
it needs no S3 access keys. Store the same random secret as the Worker's
`ARC_IMAGE_SECRET` and the Supabase `R2_WORKER_SECRET`; never expose it to the
frontend. Public reads use the Worker URL. A custom domain can replace that URL
later without changing the bucket.

## Netlify

The repository includes `netlify.toml`. Add these environment variables to the
Netlify site:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

Build command: `npm run build`. Publish directory: `dist`.

Add the final Netlify URL to Supabase Auth's allowed redirect URLs before testing
Google sign-in in production. Keep `http://localhost:5173/**` allowed for local
development.

## Temporarily unavailable

- Optional transactional/notification email (the UI labels these controls as coming soon)
- No billing integration is required; ArcAI has no paid tier

Supabase's built-in account verification and password-reset emails are separate
and remain available.

## Migrating existing users later

A full migration requires administrative access to the old Auth database and
Storage, or a full Supabase backup. Preserve `auth.users.id` values, then import
public tables and Storage objects so their existing foreign keys and ownership
paths remain valid. Do not shut down the old backend until row counts, login,
Storage URLs, and a sample of user chat histories have been verified.
