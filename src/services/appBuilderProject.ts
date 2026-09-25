import { supabase } from '@/integrations/supabase/client';
import { cloudAppProjectClient } from './cloudAppProjectClient';
import { normalizeAppProjectSnapshot, type CloudAppProjectPersistence } from './cloudAppProjects';
import { DEFAULT_FILES, type VirtualFileSystem } from '@/types/ide';

export interface AppBuilderMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: string[];
  agentActions?: unknown[];
}

export interface AppBuilderProjectRecord {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  files: VirtualFileSystem;
  messages: AppBuilderMessage[];
  cloud_revision: number;
  cloud_managed: boolean;
  netlify_url: string | null;
  netlify_site_id: string | null;
  netlify_subdomain: string | null;
  favicon_label: string | null;
  versions: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LoadedAppBuilderProject {
  ownerId: string;
  row: AppBuilderProjectRecord | null;
  files: VirtualFileSystem;
  messages: AppBuilderMessage[];
  persistence: CloudAppProjectPersistence | null;
  pending: boolean;
}

export interface AppBuilderProjectMetadata {
  title: string;
  prompt: string;
  netlify_url?: string | null;
  netlify_site_id?: string | null;
  netlify_subdomain?: string | null;
  favicon_label?: string | null;
  seo_description?: string;
  hide_badge?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function ensureAppBuilderSystemFiles(source: VirtualFileSystem): VirtualFileSystem {
  let changed = false;
  const next = { ...source };
  if (!next['src/lib/netlifyDb.ts']?.content?.includes('syncCloud') || !next['src/lib/netlifyDb.ts']?.content?.includes('getAllStoredUsers')) {
    next['src/lib/netlifyDb.ts'] = DEFAULT_FILES['src/lib/netlifyDb.ts'];
    changed = true;
  }
  if (!next['src/components/NetlifyAuthModal.tsx']?.content?.includes('export function NetlifyAuthModal')) {
    next['src/components/NetlifyAuthModal.tsx'] = DEFAULT_FILES['src/components/NetlifyAuthModal.tsx'];
    changed = true;
  }
  return changed ? next : source;
}

function readAppDatabase(projectId: string, existing: Record<string, unknown>) {
  const db = { ...asRecord(existing.app_db) };
  const prefix = `netlify_db:${projectId}:`;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const recordKey = key.slice(prefix.length);
    try { db[recordKey] = JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { /* Preserve the raw value if legacy storage is not valid JSON. */ db[recordKey] = localStorage.getItem(key); }
  }
  let appUsers = existing.app_users;
  try {
    const stored = JSON.parse(localStorage.getItem(`netlify_mock_users:${projectId}`) || 'null');
    if (Array.isArray(stored)) appUsers = stored;
  } catch { /* Ignore malformed local auth snapshots and keep server data. */ }
  return { ...existing, app_db: db, ...(Array.isArray(appUsers) ? { app_users: appUsers } : {}) };
}

function restoreAppDatabase(projectId: string, versions: Record<string, unknown>) {
  const db = asRecord(versions.app_db);
  for (const [key, value] of Object.entries(db)) {
    try { localStorage.setItem(`netlify_db:${projectId}:${key}`, JSON.stringify(value)); } catch { /* Browser storage may be unavailable. */ }
  }
  if (Array.isArray(versions.app_users)) {
    try { localStorage.setItem(`netlify_mock_users:${projectId}`, JSON.stringify(versions.app_users)); } catch { /* Browser storage may be unavailable. */ }
  }
  window.dispatchEvent(new CustomEvent('netlify-db-change', { detail: { appId: projectId } }));
  window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: projectId, users: versions.app_users ?? [] } }));
}

export async function loadAppBuilderProject(projectId: string, signal?: AbortSignal): Promise<LoadedAppBuilderProject> {
  if (!UUID.test(projectId)) throw new Error('Invalid app project link.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  signal?.throwIfAborted();
  if (authError || !user) throw new Error('Sign in to open App Builder.');
  const { data: row, error } = await supabase.from('ide_projects').select('*').eq('id', projectId).eq('user_id', user.id).maybeSingle();
  signal?.throwIfAborted();
  if (error) throw error;
  if (!row) return { ownerId: user.id, row: null, files: ensureAppBuilderSystemFiles(DEFAULT_FILES), messages: [], persistence: null, pending: false };

  const record = row as unknown as AppBuilderProjectRecord;
  if (!Number.isSafeInteger(record.cloud_revision) || record.cloud_revision < 0) throw new Error('This saved app needs its project revision restored before it can be edited safely.');
  const persistence = cloudAppProjectClient(user.id, projectId, record.cloud_revision);
  const result = await persistence.reload(signal);
  signal?.throwIfAborted();
  if (result.status === 'stale') throw new Error('This app has a newer saved revision. Reopen it before editing so no work is overwritten.');
  const source = result.status === 'reloaded' ? result.project : { ...record, ...result.snapshot };
  const files = ensureAppBuilderSystemFiles(source.files || DEFAULT_FILES);
  const messages = normalizeAppProjectSnapshot({ files, messages: source.messages ?? [] }).messages as AppBuilderMessage[];
  restoreAppDatabase(projectId, asRecord(source.versions));
  return { ownerId: user.id, row: source as AppBuilderProjectRecord, files, messages, persistence, pending: result.status === 'pending' };
}

export async function saveAppBuilderProject(
  projectId: string,
  ownerId: string,
  files: VirtualFileSystem,
  messages: AppBuilderMessage[],
  metadata: AppBuilderProjectMetadata,
  existingPersistence?: CloudAppProjectPersistence | null,
): Promise<{ persistence: CloudAppProjectPersistence; row: AppBuilderProjectRecord }> {
  if (!UUID.test(projectId) || !UUID.test(ownerId)) throw new Error('Invalid app owner or project.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || user?.id !== ownerId) throw new Error('App owner changed. Sign in again before saving.');

  const existing = await supabase.from('ide_projects').select('*').eq('id', projectId).eq('user_id', ownerId).maybeSingle();
  if (existing.error) throw existing.error;
  let row = existing.data;
  if (!row) {
    const clean = normalizeAppProjectSnapshot({ files, messages });
    const inserted = await supabase.from('ide_projects').insert({
      id: projectId,
      user_id: ownerId,
      title: metadata.title || 'Arc App',
      prompt: metadata.prompt || 'Arc App',
      files: clean.files as never,
      messages: clean.messages as never,
    }).select('*').single();
    if (inserted.error) throw inserted.error;
    row = inserted.data;
  }

  const record = row as unknown as AppBuilderProjectRecord;
  if (!Number.isSafeInteger(record.cloud_revision) || record.cloud_revision < 0) throw new Error('This project cannot be saved safely because its revision is missing.');
  const persistence = existingPersistence ?? cloudAppProjectClient(ownerId, projectId, record.cloud_revision);
  const latest = await persistence.reload();
  if (latest.status === 'stale') throw new Error('A newer app revision exists. Your local changes are preserved; reopen the project to reconcile.');
  persistence.capture({ files, messages });
  const saved = await persistence.flush();
  if (saved.status !== 'saved') throw new Error(`App save ${saved.status}; your local edits are retained and the saved project was not overwritten.`);

  const currentVersions = asRecord(record.versions);
  const versions = readAppDatabase(projectId, currentVersions);
  if (metadata.seo_description !== undefined) versions.seo_description = metadata.seo_description;
  if (metadata.hide_badge !== undefined) versions.hide_badge = metadata.hide_badge;
  const update = await supabase.from('ide_projects').update({
    title: metadata.title,
    prompt: metadata.prompt,
    netlify_url: 'netlify_url' in metadata ? metadata.netlify_url : record.netlify_url,
    netlify_site_id: 'netlify_site_id' in metadata ? metadata.netlify_site_id : record.netlify_site_id,
    netlify_subdomain: 'netlify_subdomain' in metadata ? metadata.netlify_subdomain : record.netlify_subdomain,
    favicon_label: 'favicon_label' in metadata ? metadata.favicon_label : record.favicon_label,
    versions: versions as never,
  }).eq('id', projectId).eq('user_id', ownerId);
  if (update.error) throw update.error;
  const { data: fresh, error: reloadError } = await supabase.from('ide_projects').select('*').eq('id', projectId).eq('user_id', ownerId).single();
  if (reloadError) throw reloadError;
  return { persistence, row: fresh as unknown as AppBuilderProjectRecord };
}
