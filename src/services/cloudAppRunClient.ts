import { supabase } from '@/integrations/supabase/client';
import { createCloudRunLifecycle } from './cloudRunLifecycle';
import { cloudAppProjectClient, reconcileCloudAppRun } from './cloudAppProjectClient';
import { normalizeAppProjectSnapshot, type AppProjectSnapshot } from './cloudAppProjects';
import { CloudAppRuns, type CloudAppRunView } from './cloudAppRuns';

/** Dedicated app session: never read or switch the globally selected chat. */
export function createCloudAppRuns(ownerId: string, projectId: string, enabled: boolean, onChange: (view: CloudAppRunView) => void) {
  const key = `arc-app-session-v1:${ownerId}:${projectId}`;
  const currentOwner = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user?.id ?? null;
  };
  const guard = async (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (await currentOwner() !== ownerId) throw new Error('App owner changed.');
    signal.throwIfAborted();
  };
  return new CloudAppRuns(ownerId, projectId, enabled, {
    ownerId: currentOwner,
    lifecycle: onChange => createCloudRunLifecycle({ onChange }, ownerId),
    prepareProject: async (snapshot, signal) => {
      await guard(signal);
      const normalized = normalizeAppProjectSnapshot(snapshot);
      const { data: row, error } = await supabase.from('ide_projects').select('*')
        .eq('id', projectId).eq('user_id', ownerId).abortSignal(signal).maybeSingle();
      if (error) throw error;
      await guard(signal);
      let revision = (row as unknown as { cloud_revision: number } | null)?.cloud_revision ?? 0;
      if (!row) {
        const { error: insertError } = await supabase.from('ide_projects').insert({
          id: projectId, user_id: ownerId, title: 'Arc App', files: normalized.files as never,
          messages: normalized.messages as never,
        }).abortSignal(signal);
        if (insertError) throw insertError; // Never upsert on an uncertain creation.
      }
      const client = cloudAppProjectClient(ownerId, projectId, revision);
      if (!client.snapshot().saved && !client.pendingSnapshot()) {
        const remote = await client.reload(signal);
        if (remote.status !== 'reloaded' || JSON.stringify(normalizeAppProjectSnapshot(remote.project)) !== JSON.stringify(normalized)) {
          throw new Error('Saved app differs from this editor. Reload before building; server files were not overwritten.');
        }
      }
      await guard(signal);
      client.capture(normalized);
      const saved = await client.flush();
      if (saved.status !== 'saved') throw new Error(`App save ${saved.status}; local edits retained.`);
      await guard(signal);
    },
    prepareSession: async (snapshot: AppProjectSnapshot, signal, discoveredId) => {
      await guard(signal);
      let id = discoveredId || localStorage.getItem(key);
      if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid app chat association.');
      const { data: existing, error } = await supabase.from('chat_sessions').select('id,user_id,revision')
        .eq('id', id).eq('user_id', ownerId).abortSignal(signal).maybeSingle();
      if (error) throw error;
      await guard(signal);
      if (existing) {
        const revision = (existing as unknown as { revision: number }).revision;
        if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Cloud session migration is not enabled.');
        return { id, revision };
      }
      if (discoveredId) throw new Error('The app run chat no longer exists.');
      const { error: insertError } = await supabase.from('chat_sessions').insert({
        id, user_id: ownerId, title: 'App Builder',
        messages: snapshot.messages.map(message => ({ ...message, type: 'text', timestamp: new Date(message.timestamp).toISOString() })) as never,
      }).abortSignal(signal);
      if (insertError) throw insertError;
      await guard(signal);
      return { id, revision: 0 };
    },
    reconcile: async (run, signal) => {
      const result = await reconcileCloudAppRun(ownerId, run, signal);
      if (result?.status !== 'reloaded') throw new Error('Cloud app finished; reconcile pending local edits before reloading.');
      return result;
    },
    remember: (runId, sessionId) => {
      localStorage.setItem(key, sessionId);
      localStorage.setItem(`arc-app-run-v1:${ownerId}:${projectId}`, runId);
    },
  }, onChange);
}
