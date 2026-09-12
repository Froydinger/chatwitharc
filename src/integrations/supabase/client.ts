import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const IS_DEV_PREVIEW = import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY);

if ((!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) && !IS_DEV_PREVIEW) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// Keep the module importable for UI-only local previews. Auth and data hooks
// check isSupabaseConfigured before doing any real work, while production
// still fails fast if its required configuration is missing.
const clientUrl = SUPABASE_URL || 'http://127.0.0.1:54321';
const clientKey = SUPABASE_PUBLISHABLE_KEY || 'dev-preview-anon-key';

export const supabase: SupabaseClient<Database> = createClient<Database>(clientUrl, clientKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
