import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { voiceSearchHandler } from './handler.ts';

Deno.serve(voiceSearchHandler({
  authenticate: async (authorization) => {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await client.auth.getUser();
    return !error && !!data.user && !data.user.is_anonymous;
  },
  apiKey: () => Deno.env.get('TAVILY_API_KEY'),
}));
