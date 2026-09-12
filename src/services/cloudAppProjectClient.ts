import { supabase } from '@/integrations/supabase/client';
import { CloudAppProjectPersistence, cloudAppJournalKey, type AppProjectJournal } from './cloudAppProjects';
import type { CloudRun } from './cloudRuns';

export const CLOUD_APP_PROJECT_RELOADED = 'arc:cloud-app-project-reloaded';

const clients = new Map<string, CloudAppProjectPersistence>();
export function cloudAppProjectClient(ownerId: string, projectId: string, revision = 0) {
  const key = cloudAppJournalKey(ownerId, projectId);
  let client = clients.get(key);
  if (!client) {
    const raw = localStorage.getItem(key);
    const restored: AppProjectJournal | undefined = raw ? JSON.parse(raw) : undefined;
    client = new CloudAppProjectPersistence(ownerId, projectId, revision, {
      ownerId: async () => {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user?.id ?? null;
      },
      read: async (id, owner) => {
        const { data, error } = await supabase.from('ide_projects').select('*')
          .eq('id', id).eq('user_id', owner).single();
        if (error) throw error;
        return data;
      },
      save: args => supabase.rpc('save_cloud_app_project' as never, args as never),
      persist: journal => localStorage.setItem(key, JSON.stringify(journal)),
    }, restored);
    clients.set(key, client);
  }
  return client;
}

/** Completion/discovery callers can reconcile without a mounted/selected IDE.
 * Caller applies the returned project only if its own selection still matches.
 */
export async function reloadCloudAppProject(ownerId: string, projectId: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const client = cloudAppProjectClient(ownerId, projectId);
  const saved = await client.flush();
  signal?.throwIfAborted();
  if (saved.status !== 'saved') throw new Error(`App save ${saved.status}; local edits retained.`);
  const result = await client.reload(signal);
  signal?.throwIfAborted();
  if (result.status === 'reloaded') window.dispatchEvent(new CustomEvent(CLOUD_APP_PROJECT_RELOADED, {
    detail: { ownerId, projectId },
  }));
  return result;
}

/** App-only lifecycle terminal callback. Never derive the target from selection. */
export async function reconcileCloudAppRun(ownerId: string, run: CloudRun, signal?: AbortSignal) {
  if (run.status !== 'completed' || !run.projectId) return;
  return reloadCloudAppProject(ownerId, run.projectId, signal);
}
