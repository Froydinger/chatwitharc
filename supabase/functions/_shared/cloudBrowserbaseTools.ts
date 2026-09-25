import type { CloudPresentation, CloudToolOutput } from './cloudRunArtifacts.ts';
import type { CloudToolDefinition } from './cloudRunProvider.ts';
import type { ClaimedCloudRun, RegisteredCloudTool } from './cloudRunWorker.ts';
import { browserbaseChatTools } from './chatBrowserbaseTools.ts';
import { gitEnabledForUser } from './gitFeature.ts';

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_STATUSES = new Set([
  'provisioning', 'agent_running', 'user_control', 'handed_back',
  'release_requested', 'closed', 'expired', 'failed',
]);

type BrowserbaseBackend = Parameters<typeof browserbaseChatTools>[0]['backend'];

function priorSession(run: ClaimedCloudRun): string | undefined {
  const engine = run.checkpoint.engine as unknown as { receipts?: Record<string, unknown> } | undefined;
  const receipts = engine?.receipts;
  if (!receipts || typeof receipts !== 'object') return undefined;
  let latest: string | undefined;
  for (const receipt of Object.values(receipts)) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) continue;
    const presentation = (receipt as Record<string, unknown>).presentation;
    if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) continue;
    const artifact = presentation as Record<string, unknown>;
    const session = artifact.browser_session;
    if (session && typeof session === 'object' && !Array.isArray(session)) {
      const handle = (session as Record<string, unknown>).sessionHandle;
      if (typeof handle === 'string' && SESSION_ID.test(handle)) latest = handle;
    }
    const closed = artifact.browser_session_closed;
    if (closed && typeof closed === 'object' && !Array.isArray(closed)) {
      const handle = (closed as Record<string, unknown>).sessionHandle;
      if (typeof handle === 'string' && handle === latest) latest = undefined;
    }
  }
  return latest;
}

function presentationFrom(raw: string, toolName: string): CloudPresentation | undefined {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return undefined; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = value as Record<string, unknown>;
  if (result.available !== true || typeof result.sessionHandle !== 'string' || !SESSION_ID.test(result.sessionHandle)) return undefined;
  if (typeof result.status !== 'string' || !SESSION_STATUSES.has(result.status)
    || typeof result.expiresAt !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))
    || (result.device !== 'mobile' && result.device !== 'desktop')
    || (result.control !== 'agent' && result.control !== 'user' && result.control !== 'view_only')) return undefined;
  if (toolName === 'browserbase_close_session' && result.status === 'closed') {
    return { browser_session_closed: { sessionHandle: result.sessionHandle } };
  }
  const snapshot = result.pageSnapshot && typeof result.pageSnapshot === 'object' && !Array.isArray(result.pageSnapshot)
    ? result.pageSnapshot as Record<string, unknown> : {};
  const title = typeof snapshot.title === 'string' && snapshot.title.trim()
    ? snapshot.title.trim().slice(0, 120) : 'Live site';
  return { browser_session: {
    sessionHandle: result.sessionHandle,
    status: result.status as NonNullable<CloudPresentation['browser_session']>['status'],
    expiresAt: result.expiresAt,
    device: result.device,
    control: result.control,
    title,
    taskKind: 'git',
  } };
}

export function cloudBrowserbaseTools(options: {
  backend: BrowserbaseBackend;
  run: ClaimedCloudRun;
  request: Record<string, unknown>;
  authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
  database: Parameters<typeof gitEnabledForUser>[0];
}) {
  const requestHandle = typeof options.request.browserbaseSessionHandle === 'string'
    && SESSION_ID.test(options.request.browserbaseSessionHandle)
    ? options.request.browserbaseSessionHandle : undefined;
  const helper = browserbaseChatTools({
    backend: options.backend,
    userId: options.run.user_id,
    device: options.request.browserbaseDevice === 'mobile' ? 'mobile' : 'desktop',
    taskKind: 'git',
    chatSessionId: options.run.session_id,
    ...(priorSession(options.run) ?? requestHandle
      ? { activeSessionHandle: priorSession(options.run) ?? requestHandle }
      : {}),
  });
  const definitions = helper.definitions.map((definition): CloudToolDefinition => ({
    type: 'function',
    name: definition.function.name,
    description: definition.function.description,
    parameters: definition.function.parameters as unknown as Record<string, unknown>,
    strict: true,
  }));
  const tools: Record<string, RegisteredCloudTool> = {};
  for (const definition of definitions) {
    tools[definition.name] = {
      approval: 'never',
      // A browser action with an uncertain provider response must be inspected
      // by the user before it is retried; never click/type twice automatically.
      replaySafe: false,
      authorize: async run => {
        if (run.id !== options.run.id || run.user_id !== options.run.user_id
          || !await options.authorizeOwner(run)) return false;
        try { return (await gitEnabledForUser(options.database, run.user_id)).enabled; }
        catch { return false; }
      },
      execute: async (run, call): Promise<CloudToolOutput> => {
        if (run.id !== options.run.id || run.user_id !== options.run.user_id) throw new Error('Browser session owner changed.');
        const output = await helper.execute(call.name, call.arguments);
        const presentation = presentationFrom(output, call.name);
        return presentation ? { output, presentation } : output;
      },
    };
  }
  return { definitions, tools };
}
