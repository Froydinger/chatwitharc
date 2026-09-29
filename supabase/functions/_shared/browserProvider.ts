import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { createBrowserbaseSessionBackend } from './browserbaseSessions.ts';
import { browserbaseSessionStore } from './browserbaseStore.ts';

export function liveBrowserEnabled() {
  return Deno.env.get('ARC_BROWSER_PROVIDER') === 'modal'
    ? !!Deno.env.get('MODAL_BROWSER_API_URL') && !!Deno.env.get('MODAL_BROWSER_API_KEY')
    : Deno.env.get('BROWSERBASE_ENABLED') === 'true';
}

/** Persisted provider identity keeps old sessions on their original backend. */
export function createBrowserProvider(db: SupabaseClient) {
  const store = browserbaseSessionStore(db);
  const browserbase = createBrowserbaseSessionBackend({
    enabled: true, apiKey: Deno.env.get('BROWSERBASE_API_KEY'), projectId: Deno.env.get('BROWSERBASE_PROJECT_ID'),
  }, { store, dnsLookup: (host, type) => Deno.resolveDns(host, type) });
  const modalUrl = Deno.env.get('MODAL_BROWSER_API_URL');
  const modal = modalUrl ? createBrowserbaseSessionBackend({
    enabled: true, provider: 'modal', apiBase: modalUrl, apiKey: Deno.env.get('MODAL_BROWSER_API_KEY'),
  }, { store: browserbaseSessionStore(db, 'modal'), dnsLookup: (host, type) => Deno.resolveDns(host, type) }) : null;
  const existing = async (userId: string, handle: string) => {
    const record = await store.getOwned(handle, userId);
    return record?.provider === 'modal' ? modal : browserbase;
  };
  const unavailable = { available: false, reason: 'session_unavailable' } as const;
  return {
    create: ((userId, input) => {
      if (!liveBrowserEnabled()) return Promise.resolve({ available: false, reason: 'disabled' } as const);
      return (Deno.env.get('ARC_BROWSER_PROVIDER') === 'modal' ? modal : browserbase)?.create(userId, input) ?? Promise.resolve(unavailable);
    }) as typeof browserbase.create,
    view: (async (u, h) => (await existing(u,h))?.view(u,h) ?? unavailable) as typeof browserbase.view,
    takeover: (async (u, h) => (await existing(u,h))?.takeover(u,h) ?? unavailable) as typeof browserbase.takeover,
    control: (async (u, h, a) => (await existing(u,h))?.control(u,h,a) ?? unavailable) as typeof browserbase.control,
    close: (async (u, h) => (await existing(u,h))?.close(u,h) ?? unavailable) as typeof browserbase.close,
    act: (async (u, h, a) => (await existing(u,h))?.act(u,h,a) ?? unavailable) as typeof browserbase.act,
    getBrowserbaseConnectionUrl: (async (u,h) => (await existing(u,h))?.getBrowserbaseConnectionUrl(u,h) ?? null) as typeof browserbase.getBrowserbaseConnectionUrl,
  };
}
