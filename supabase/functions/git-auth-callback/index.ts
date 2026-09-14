import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { encryptToken, githubUser, sha256Base64 } from '../_shared/github.ts';

function redirect(path: string, status = 303): Response {
  const base = Deno.env.get('ARC_PUBLIC_URL') || 'https://askarc.chat';
  const url = new URL(path, base);
  return Response.redirect(url.href, status);
}

function db() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return redirect('/dashboard?git=error');
  try {
    const service = db();
    const stateHash = await sha256Base64(state);
    const stateResult = await service.from('git_oauth_states').select('state_hash,user_id,return_path,expires_at,used_at')
      .eq('state_hash', stateHash).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (stateResult.error || !stateResult.data) return redirect('/dashboard?git=expired');
    const clientId = Deno.env.get('GITHUB_CLIENT_ID');
    const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET');
    const redirectUri = Deno.env.get('GITHUB_OAUTH_REDIRECT_URI');
    const encryptionKey = Deno.env.get('GIT_TOKEN_ENCRYPTION_KEY');
    if (!clientId || !clientSecret || !redirectUri || !encryptionKey) return redirect('/dashboard?git=unconfigured');

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    });
    const tokenBody = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokenBody.access_token !== 'string') return redirect('/dashboard?git=denied');
    const githubToken = tokenBody.access_token as string;
    const github = await githubUser(githubToken);
    const encrypted = await encryptToken(githubToken, encryptionKey);
    const saved = await service.from('git_connections').upsert({
      user_id: stateResult.data.user_id,
      provider: 'github',
      provider_user_id: typeof github.id === 'number' ? github.id : null,
      provider_login: typeof github.login === 'string' ? github.login : null,
      access_token_ciphertext: encrypted,
      scopes: typeof tokenBody.scope === 'string' ? tokenBody.scope : null,
    }, { onConflict: 'user_id,provider' });
    if (saved.error) throw new Error('Unable to save GitHub connection.');
    await service.from('git_oauth_states').update({ used_at: new Date().toISOString() }).eq('state_hash', stateHash).is('used_at', null);
    const returnPath = typeof stateResult.data.return_path === 'string' && stateResult.data.return_path.startsWith('/') ? stateResult.data.return_path : '/dashboard';
    return redirect(`${returnPath}?git=connected`);
  } catch (error) {
    console.error('[git-auth-callback]', error instanceof Error ? error.message : 'unknown error');
    return redirect('/dashboard?git=error');
  }
});
