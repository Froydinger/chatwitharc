import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { browserbaseSessionHandler } from '../_shared/browserbaseSessionHandler.ts';
import { browserbaseSessionStore } from '../_shared/browserbaseStore.ts';
import { createBrowserbaseSessionBackend } from '../_shared/browserbaseSessions.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const authClient = supabaseUrl && anonKey ? createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;
const adminClient = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) : null;

const backend = adminClient ? createBrowserbaseSessionBackend({
  enabled: Deno.env.get('BROWSERBASE_ENABLED'),
  apiKey: Deno.env.get('BROWSERBASE_API_KEY'),
  projectId: Deno.env.get('BROWSERBASE_PROJECT_ID'),
}, {
  store: browserbaseSessionStore(adminClient),
  dnsLookup: (hostname, recordType) => Deno.resolveDns(hostname, recordType),
}) : null;

Deno.serve(browserbaseSessionHandler({
  authenticate: async (authorization) => {
    if (!authClient || !authorization) return null;
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return null;
    return data.user.id;
  },
  actions: backend ?? {
    create: async () => ({ available: false, reason: 'disabled' }),
    view: async () => ({ available: false, reason: 'disabled' }),
    takeover: async () => ({ available: false, reason: 'disabled' }),
    control: async () => ({ available: false, reason: 'disabled' }),
    close: async () => ({ available: false, reason: 'disabled' }),
    act: async () => ({ available: false, reason: 'disabled' }),
  },
}));
