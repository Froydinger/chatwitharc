# Handoff Guide: Git Mode Platform & Third-Party Connectors

## Vision: Git Mode as the Full-Stack App Platform
In ArcAI, Git Mode allows users to connect their real GitHub repositories and pair-program with Luna in a persistent 20-minute cloud Linux sandbox (E2B VM).
Because Git mode has a real Linux sandbox with Node, Python, and shell access, **Git mode is designed to supersede client-only App Builder environments**. Users have true fullstack capabilities: Next.js, FastAPI, Node/Express, PostgreSQL migrations, Docker, and full Git commit/branch/PR control.

---

## Third-Party Connectors (Roadmap & Implementation Architecture)

Users should be able to connect external services directly from chat or Settings with a 1-click OAuth / API connector. Once connected, Arc can automatically provision resources, generate schemas, pull keys, and inject `.env` secrets into the cloud sandbox.

### 1. Supabase Connector (Highest Priority)
- **Authentication**: Supabase Management API OAuth (`https://api.supabase.com/v1/oauth`).
- **Token Handling**:
  - Encrypted in `user_secrets` or `supabase_connections` table with Supabase Vault / service-role encryption.
  - Never leaked to the frontend bundle.
- **Agent Capabilities**:
  - List user's Supabase projects or prompt to select/create one.
  - Pull `SUPABASE_URL` and `SUPABASE_ANON_KEY` / `SERVICE_ROLE_KEY`.
  - Automatically write `.env.local` / `.env` in the sandbox.
  - Execute PostgreSQL migrations and generate TypeScript database types (`supabase gen types typescript`).
  - Configure Row Level Security (RLS) policies and authentication providers.

### 2. Stripe Connector
- **Authentication**: Stripe Connect or Restricted API Key flow.
- **Agent Capabilities**:
  - Pull test publishable and secret keys.
  - Auto-configure webhook handlers in the repository (`api/webhook/stripe.ts` or edge functions).
  - Scaffold checkout sessions, customer portal links, and subscription tiers.

### 3. Resend Connector
- **Authentication**: Resend API key connector via modal or OAuth.
- **Agent Capabilities**:
  - Scaffold transactional email routes with React Email.
  - Verify sending domains and test delivery directly in the sandbox.

### 4. Vercel / Netlify (Production Hosting)
- **Authentication**: Vercel/Netlify OAuth.
- **Agent Capabilities**:
  - When Arc opens a Pull Request on GitHub, trigger ephemeral branch previews (`pr-123.askarc.chat` or `*.vercel.app`).
  - Provide users with permanent live production and staging URLs alongside the temporary 20-minute E2B sandbox.

### 5. PostHog / Product Analytics
- **Authentication**: PostHog project API key.
- **Agent Capabilities**:
  - Automatic injection of analytics tracking, feature flags, and session recording into React/Next.js codebases.

---

## Security & Architecture Rules
1. **Never leak tokens**: Third-party OAuth tokens and secrets must stay encrypted in the database and only be decrypted inside service-role Supabase Edge Functions.
2. **Sandbox isolation**: Secrets injected into `.env` stay inside `/home/user/repo/.env` in the ephemeral sandbox VM.
3. **Remote Git boundary**: All changes must still be pushed to an Arc branch and pull request. Never commit plaintext secrets to the remote GitHub repository (ensure `.gitignore` contains `.env*`).
