import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { decryptToken, githubCommitPullRequest, githubRepositories } from '../_shared/github.ts';
import { gitEnabledForEmail } from '../_shared/gitFeature.ts';
import { createAppBuilderGitHandoffHandler } from '../_shared/appBuilderGitHandoff.ts';

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const handler = createAppBuilderGitHandoffHandler({
  authenticate: async request => {
    const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!bearer) return null;
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await auth.auth.getUser(bearer);
    const user = result.data.user;
    return user?.id && user.email
      ? { id: user.id, email: user.email, is_anonymous: user.is_anonymous }
      : null;
  },
  gitEnabled: email => gitEnabledForEmail(serviceClient(), email),
  hasBoost: async userId => {
    const { data, error } = await serviceClient().rpc('user_has_boost', { check_user_id: userId });
    if (error) throw new Error('Could not verify ArcAI Boost access.');
    return data === true;
  },
  loadProject: async (projectId, userId) => {
    const { data, error } = await serviceClient().from('ide_projects')
      .select('id,user_id,title,files')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error('Could not load the saved app project.');
    return data;
  },
  loadConnection: async userId => {
    const { data, error } = await serviceClient().from('git_connections')
      .select('access_token_ciphertext,repo_access_mode,allowed_repos')
      .eq('user_id', userId)
      .eq('provider', 'github')
      .maybeSingle();
    if (error) throw new Error('Could not verify the GitHub connection.');
    return data;
  },
  decryptToken: ciphertext => {
    const key = Deno.env.get('GIT_TOKEN_ENCRYPTION_KEY');
    if (!key) throw new Error('GitHub token encryption is not configured.');
    return decryptToken(ciphertext, key);
  },
  listRepositories: githubRepositories,
  createDraftPullRequest: (token, input) => githubCommitPullRequest(token, input),
});

serve(handler);
