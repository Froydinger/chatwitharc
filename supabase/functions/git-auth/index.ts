import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { encryptToken, decryptToken, githubRepositories, githubUser, randomState, sha256Base64 } from '../_shared/github.ts';
import { gitEnabledForEmail, gitStaticTokenForUser } from '../_shared/gitFeature.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function currentUser(req: Request) {
  const bearer = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) return null;
  const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await auth.auth.getUser(bearer);
  return result.data.user || null;
}

const INVALID_GITHUB_AUTH = 'GitHub authorization is invalid. Reconnect GitHub.';
type GithubAuthProbe = { token: string; user: Record<string, unknown> | null };

async function probeStaticAuth(db: ReturnType<typeof serviceClient>, userId: string): Promise<GithubAuthProbe | null> {
  const token = await gitStaticTokenForUser(db, userId);
  if (!token) return null;
  try {
    return { token, user: await githubUser(token) };
  } catch {
    return { token, user: null };
  }
}

async function probeStoredAuth(db: ReturnType<typeof serviceClient>, userId: string): Promise<GithubAuthProbe | null> {
  const result = await db.from('git_connections').select('access_token_ciphertext').eq('user_id', userId).eq('provider', 'github').maybeSingle();
  if (result.error || !result.data?.access_token_ciphertext) return null;
  const key = Deno.env.get('GIT_TOKEN_ENCRYPTION_KEY');
  if (!key) return { token: '', user: null };
  try {
    const token = await decryptToken(result.data.access_token_ciphertext, key);
    return { token, user: await githubUser(token) };
  } catch {
    return { token: '', user: null };
  }
}

async function tokenFor(db: ReturnType<typeof serviceClient>, userId: string): Promise<string> {
  const staticAuth = await probeStaticAuth(db, userId);
  if (staticAuth?.user) return staticAuth.token;
  const storedAuth = await probeStoredAuth(db, userId);
  if (storedAuth?.user) return storedAuth.token;
  if (staticAuth || storedAuth) throw new Error(INVALID_GITHUB_AUTH);
  throw new Error('Connect GitHub before using repository tools.');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const user = await currentUser(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (!user?.id || !user.email) {
      if (action === 'status') {
        return json({ enabled: false, connected: false, providerLogin: null, selectedRepo: null, selectedBranch: null });
      }
      return json({ error: 'Sign in before connecting GitHub.' }, 401);
    }
    const db = serviceClient();
    const enabled = await gitEnabledForEmail(db, user.email);
    if (!enabled) {
      if (action === 'status') {
        return json({ enabled: false, connected: false, providerLogin: null, selectedRepo: null, selectedBranch: null });
      }
      return json({ enabled: false, error: 'Git integration is not enabled for this account.' }, 403);
    }

    const staticAuth = await probeStaticAuth(db, user.id);
    const storedAuth = staticAuth?.user ? null : await probeStoredAuth(db, user.id);
    const activeAuth = staticAuth?.user ? staticAuth : storedAuth?.user ? storedAuth : null;
    const configuredAuth = !!staticAuth || !!storedAuth;

    // A current static token is authoritative for the beta owner. Refresh the
    // encrypted row even when an older OAuth token already exists, otherwise
    // repository actions keep selecting the revoked token.
    if (staticAuth?.user) {
      const key = Deno.env.get('GIT_TOKEN_ENCRYPTION_KEY');
      if (key) {
        await db.from('git_connections').upsert({
          user_id: user.id, provider: 'github',
          provider_user_id: typeof staticAuth.user.id === 'number' ? staticAuth.user.id : null,
          provider_login: typeof staticAuth.user.login === 'string' ? staticAuth.user.login : null,
          access_token_ciphertext: await encryptToken(staticAuth.token, key), scopes: 'repo (beta static token)',
        }, { onConflict: 'user_id,provider' });
      }
    }

    if (action === 'status') {
      const result = await db.from('git_connections').select('provider_login,selected_repo,selected_branch,repo_access_mode,allowed_repos,updated_at')
        .eq('user_id', user.id).eq('provider', 'github').maybeSingle();
      if (result.error) throw new Error('Unable to read Git connection.');
      if (!activeAuth && configuredAuth) {
        return json({ enabled: true, connected: false, providerLogin: null, selectedRepo: null, selectedBranch: null, error: INVALID_GITHUB_AUTH });
      }
      return json({
        enabled: true,
        connected: !!activeAuth,
        providerLogin: result.data?.provider_login || (typeof activeAuth?.user?.login === 'string' ? activeAuth.user.login : null),
        selectedRepo: result.data?.selected_repo || null,
        selectedBranch: result.data?.selected_branch || null,
        repoAccessMode: (result.data?.repo_access_mode as 'all' | 'selected') || 'all',
        allowedRepos: Array.isArray(result.data?.allowed_repos) ? result.data.allowed_repos : [],
      });
    }
    if (action === 'start') {
      const clientId = Deno.env.get('GITHUB_CLIENT_ID');
      const redirectUri = Deno.env.get('GITHUB_OAUTH_REDIRECT_URI');
      if (!clientId || !redirectUri) {
        if (activeAuth) {
          const result = await db.from('git_connections').select('provider_login,selected_repo,selected_branch,repo_access_mode,allowed_repos')
            .eq('user_id', user.id).eq('provider', 'github').maybeSingle();
          return json({
            enabled: true,
            connected: true,
            providerLogin: result.data?.provider_login || (typeof activeAuth.user?.login === 'string' ? activeAuth.user.login : 'beta token'),
            selectedRepo: result.data?.selected_repo || null,
            selectedBranch: result.data?.selected_branch || null,
            repoAccessMode: (result.data?.repo_access_mode as 'all' | 'selected') || 'all',
            allowedRepos: Array.isArray(result.data?.allowed_repos) ? result.data.allowed_repos : [],
          });
        }
        if (configuredAuth) return json({ enabled: true, connected: false, error: INVALID_GITHUB_AUTH });
        return json({ error: 'GitHub authorization is not configured yet.' }, 503);
      }
      const state = randomState();
      const stateHash = await sha256Base64(state);
      const returnPath = typeof body.returnPath === 'string' && body.returnPath.startsWith('/') ? body.returnPath.slice(0, 200) : '/dashboard';
      const inserted = await db.from('git_oauth_states').insert({
        state_hash: stateHash, user_id: user.id, return_path: returnPath,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (inserted.error) throw new Error('Unable to start GitHub authorization.');
      const url = new URL('https://github.com/login/oauth/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', 'repo');
      url.searchParams.set('state', state);
      return json({ enabled: true, authorizationUrl: url.href });
    }
    if (action === 'list_repositories') {
      return json({ enabled: true, repositories: await githubRepositories(await tokenFor(db, user.id)) });
    }
    if (action === 'update_repo_settings') {
      const repoAccessMode = body?.repoAccessMode === 'selected' ? 'selected' : 'all';
      const allowedRepos = Array.isArray(body?.allowedRepos)
        ? body.allowedRepos.filter((r: unknown): r is string => typeof r === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r))
        : [];
      const updated = await db.from('git_connections').update({
        repo_access_mode: repoAccessMode,
        allowed_repos: allowedRepos,
      }).eq('user_id', user.id).eq('provider', 'github');
      if (updated.error) throw new Error('Unable to save repository settings.');
      return json({ enabled: true, repoAccessMode, allowedRepos });
    }
    if (action === 'select_repository') {
      const repo = typeof body.repo === 'string' ? body.repo : '';
      const branch = typeof body.branch === 'string' ? body.branch : '';
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !branch || branch.length > 200) return json({ error: 'Invalid repository selection.' }, 400);
      const conn = await db.from('git_connections').select('repo_access_mode,allowed_repos').eq('user_id', user.id).eq('provider', 'github').maybeSingle();
      if (conn.data?.repo_access_mode === 'selected') {
        const allowed = Array.isArray(conn.data?.allowed_repos) ? conn.data.allowed_repos : [];
        if (!allowed.includes(repo)) {
          return json({
            error: `Repository "${repo}" is not selected in your GitHub settings. You can add it in Settings > GitHub Integration or enable all repositories.`,
            notAllowed: true,
          }, 403);
        }
      }
      const token = await tokenFor(db, user.id);
      const repos = await githubRepositories(token);
      const selected = repos.find(item => item.full_name === repo);
      if (!selected) return json({ error: 'That repository is not available to this GitHub connection.' }, 403);
      const updated = await db.from('git_connections').update({ selected_repo: repo, selected_branch: branch }).eq('user_id', user.id).eq('provider', 'github');
      if (updated.error) throw new Error('Unable to save repository selection.');
      const current = await db.from('git_connections').select('provider_login,repo_access_mode,allowed_repos').eq('user_id', user.id).eq('provider', 'github').maybeSingle();
      return json({
        enabled: true,
        connected: true,
        providerLogin: current.data?.provider_login || null,
        selectedRepo: repo,
        selectedBranch: branch,
        repoAccessMode: (current.data?.repo_access_mode as 'all' | 'selected') || 'all',
        allowedRepos: Array.isArray(current.data?.allowed_repos) ? current.data.allowed_repos : [],
      });
    }
    if (action === 'disconnect') {
      const deleted = await db.from('git_connections').delete().eq('user_id', user.id).eq('provider', 'github');
      if (deleted.error) throw new Error('Unable to disconnect GitHub.');
      return json({ enabled: true, connected: false });
    }
    return json({ error: 'Unsupported Git action.' }, 400);
  } catch (error) {
    console.error('[git-auth]', error instanceof Error ? error.message : 'unknown error');
    return json({ error: error instanceof Error ? error.message : 'Git authorization failed.' }, 500);
  }
});
