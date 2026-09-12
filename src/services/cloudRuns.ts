import { isSupabaseConfigured, supabase } from '@/integrations/supabase/client';
import type { CloudMediaReference } from './cloudMediaCapture';

export type CloudRunKind = 'chat' | 'app';
export type CloudRunMode = 'ask' | 'auto';
export type CloudWorkspaceContext = {
  kind: 'code' | 'canvas';
  content: string;
  language?: string;
  label?: string;
};
export type CloudTextRequest = {
  messages: Array<{role: 'user' | 'assistant'; content: string}>;
  attachments?: CloudMediaReference[];
  workspace_context?: CloudWorkspaceContext;
  forceWebSearch?: boolean;
  forceCanvas?: boolean;
  forceCode?: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high';
  clientTimezone?: string;
};

/** Closed, bounded snapshot. Empty content is meaningful (a cleared editor).
 * Never truncate or infer workspace data from augmented conversation prose. */
export function captureCloudWorkspaceContext(value: unknown): CloudWorkspaceContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid workspace snapshot.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['kind','content','language','label'].includes(key))
    || !Object.prototype.hasOwnProperty.call(input,'kind') || !Object.prototype.hasOwnProperty.call(input,'content')
    || !['code','canvas'].includes(input.kind as string)
    || typeof input.content !== 'string' || input.content.length > 400_000) {
    throw new Error('Workspace snapshot must contain code or canvas text, up to 400,000 characters.');
  }
  const snapshot: CloudWorkspaceContext = {kind: input.kind as CloudWorkspaceContext['kind'], content: input.content};
  for (const key of ['language','label'] as const) {
    if (Object.prototype.hasOwnProperty.call(input,key)) {
      if (typeof input[key] !== 'string' || input[key].length > 200) throw new Error('Invalid workspace metadata.');
      snapshot[key] = input[key];
    }
  }
  return snapshot;
}

function validateWorkspaceRequest(request: unknown): void {
  if (request && typeof request === 'object' && Object.prototype.hasOwnProperty.call(request,'workspace_context')) {
    captureCloudWorkspaceContext((request as Record<string, unknown>).workspace_context);
  }
}
function validProjectAssociation(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'projectId')) return true;
  const id = (value as {projectId?: unknown}).projectId;
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
export type CloudRunStatus =
  | 'queued' | 'running' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled';

export type CloudRunApproval = { decision: 'approve' | 'deny'; callId: string; argumentsHash: string };
export type CloudRunActivityItem = {
  tool: string;
  outcome: 'completed' | 'blocked' | 'denied';
};
export type CloudRunAuditItem = {
  kind: 'model' | 'tool';
  label: string;
  status: 'working' | 'completed' | 'blocked' | 'denied';
};
export type CloudRunCheckpoint = {
  progress: { phase: 'model' | 'tools' | 'done' | null; turns: number | null; tokens: number | null };
  pendingApproval: { callId: string; argumentsHash: string; name?: string; arguments?: string } | null;
  activity?: CloudRunActivityItem[];
  audit?: CloudRunAuditItem[];
  reasoningSummary?: string;
  aiSummary?: string;
};
export type CloudRunListOptions = { sessionId?: string; cursor?: string; limit?: number; includeTerminal?: boolean };
export type DiscoveredCloudRun = CloudRun<unknown, CloudRunCheckpoint> & { sessionId: string; kind: CloudRunKind; mode: CloudRunMode };
export type CloudRunList = { runs: DiscoveredCloudRun[]; nextCursor: string | null };

/** Result and checkpoint shapes belong to the chat/app integration. */
export type CloudRun<TResult = unknown, TCheckpoint = unknown> = {
  id: string;
  /** Server timestamps used for honest live elapsed-time display. */
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  /** Explicit owner-scoped App Builder association, never the full request. */
  projectId?: string;
  /** Revision acknowledged by atomic submit; retries may acknowledge a newer revision. */
  sessionRevision?: number;
  replayed?: boolean;
  result?: TResult | null;
  checkpoint?: TCheckpoint | null;
  error?: unknown;
} & { [S in CloudRunStatus]: { status: S } }[CloudRunStatus];

export type CloudRunSubmission<TRequest = unknown> = {
  id: string;
  sessionId: string;
  kind: CloudRunKind;
  mode: CloudRunMode;
  request: TRequest;
  expectedRevision: number;
  userMessage: {
    id: string;
    role: 'user';
    type: 'text';
    content: string;
    /** Stable ISO UTC timestamp captured once, never regenerated on retry. */
    timestamp: string;
    personaId?: string;
  };
};

export interface CloudRunRequestOptions {
  /** Detaches this HTTP request only. Use cancelCloudRun to stop server work. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CloudRunPollOptions<TResult = unknown, TCheckpoint = unknown>
  extends CloudRunRequestOptions {
  intervalMs?: number;
  onUpdate?: (run: CloudRun<TResult, TCheckpoint>) => void;
}

export class CloudRunError extends Error {
  constructor(
    message: string,
    public readonly id: string,
    public readonly code: 'auth' | 'configuration' | 'http' | 'protocol' | 'timeout' | 'network',
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'CloudRunError';
  }
}

/** Create once per user submission; retain this object/id across retries. */
export function createCloudRunSubmission<TRequest>(
  input: Omit<CloudRunSubmission<TRequest>, 'id'>,
): CloudRunSubmission<TRequest> {
  validateWorkspaceRequest(input.request);
  return structuredClone({ ...input, id: crypto.randomUUID() });
}

type CloudRunAction =
  | ({ action: 'list' } & CloudRunListOptions)
  | ({ action: 'submit' } & CloudRunSubmission)
  | { action: 'status' | 'cancel'; id: string }
  | { action: 'respond'; id: string; response: unknown };

const statuses: readonly string[] = [
  'queued', 'running', 'awaiting_input', 'completed', 'failed', 'cancelled',
];

function positiveDuration(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647) {
    throw new RangeError(`${name} must be a positive timer duration.`);
  }
  return value;
}

/** One HTTP attempt only: uncertain outcomes are recovered by status, never replayed. */
function requestCloudRun(body: Extract<CloudRunAction, { action: 'list' }>, options?: CloudRunRequestOptions): Promise<CloudRunList>;
function requestCloudRun<TResult, TCheckpoint>(body: Exclude<CloudRunAction, { action: 'list' }>, options?: CloudRunRequestOptions): Promise<CloudRun<TResult, TCheckpoint>>;
async function requestCloudRun<TResult, TCheckpoint>(
  body: CloudRunAction,
  options: CloudRunRequestOptions = {},
): Promise<CloudRun<TResult, TCheckpoint> | CloudRunList> {
  const id = 'id' in body ? body.id : 'list';
  options.signal?.throwIfAborted();
  const timeoutMs = positiveDuration(options.timeoutMs ?? 30_000, 'timeoutMs');
  if (!isSupabaseConfigured) {
    throw new CloudRunError('Cloud runs require Supabase configuration.', id, 'configuration');
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  options.signal?.throwIfAborted();
  if (error || !session?.access_token) {
    throw new CloudRunError('Sign in before using cloud runs.', id, 'auth');
  }

  const controller = new AbortController();
  const detach = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', detach, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    // Submission is the durable hand-off boundary. Keep that one small HTTP
    // request alive through a tab/app teardown so a user can leave immediately
    // after sending without cancelling the server-side run. Do not opt large
    // transcripts into keepalive: browsers cap unload-safe request bodies.
    const serializedBody = JSON.stringify(body);
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloud-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: serializedBody,
      signal: controller.signal,
      keepalive: body.action === 'submit' && serializedBody.length <= 60_000,
    });
    if (!response.ok) {
      throw new CloudRunError(`Cloud run request failed (${response.status}).`, id, 'http', response.status);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new CloudRunError('Cloud run returned invalid JSON.', id, 'protocol');
    }
    if (body.action === 'list') {
      const page = payload as CloudRunList | null;
      if (!page || !Array.isArray(page.runs) || page.runs.length > (body.limit ?? 25)
        || !(page.nextCursor === null || typeof page.nextCursor === 'string')
        || page.runs.some(run => !run || typeof run.id !== 'string' || typeof run.sessionId !== 'string'
          || !statuses.includes(run.status) || !['chat', 'app'].includes(run.kind) || !['ask', 'auto'].includes(run.mode)
          || !validProjectAssociation(run) || (run.kind !== 'app' && run.projectId !== undefined)
          || (body.sessionId !== undefined && run.sessionId !== body.sessionId))) {
        throw new CloudRunError('Cloud run returned an invalid discovery page.', id, 'protocol');
      }
      return page;
    }
    if (!payload || typeof payload !== 'object' || !('id' in payload)
      || payload.id !== body.id || !('status' in payload)
      || typeof payload.status !== 'string' || !statuses.includes(payload.status) || !validProjectAssociation(payload)) {
      throw new CloudRunError('Cloud run returned an invalid id or status.', id, 'protocol');
    }
    if (body.action === 'submit' && (!('sessionRevision' in payload) || typeof payload.sessionRevision !== 'number'
      || !Number.isSafeInteger(payload.sessionRevision) || payload.sessionRevision < 0
      || !('replayed' in payload) || typeof payload.replayed !== 'boolean')) {
      throw new CloudRunError('Cloud submission receipt is missing its revision or replay flag. Check status with the same id.', id, 'protocol');
    }
    return payload as CloudRun<TResult, TCheckpoint>;
  } catch (error) {
    options.signal?.throwIfAborted();
    if (timedOut) {
      throw new CloudRunError('Cloud run request timed out. Check status with the same id; server work may still be running.', id, 'timeout');
    }
    if (error instanceof CloudRunError) throw error;
    throw new CloudRunError('Cloud run connection failed. Check status with the same id; the outcome is unknown.', id, 'network');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', detach);
  }
}

export function submitCloudRun<TResult = unknown, TCheckpoint = unknown>(
  submission: CloudRunSubmission,
  options?: CloudRunRequestOptions,
): Promise<CloudRun<TResult, TCheckpoint>> {
  validateWorkspaceRequest(submission.request);
  return requestCloudRun({ ...submission, action: 'submit' }, options);
}

export function getCloudRunStatus<TResult = unknown, TCheckpoint = unknown>(
  id: string,
  options?: CloudRunRequestOptions,
): Promise<CloudRun<TResult, TCheckpoint>> {
  return requestCloudRun({ action: 'status', id }, options);
}

/** One bounded owner-scoped page; callers explicitly request subsequent pages. */
export function listCloudRuns(query: CloudRunListOptions = {}, options?: CloudRunRequestOptions): Promise<CloudRunList> {
  return requestCloudRun({ ...query, action: 'list' }, options);
}

/** Explicit user cancellation; never called by polling, timeouts or detach. */
export function cancelCloudRun<TResult = unknown, TCheckpoint = unknown>(
  id: string,
  options?: CloudRunRequestOptions,
): Promise<CloudRun<TResult, TCheckpoint>> {
  return requestCloudRun({ action: 'cancel', id }, options);
}

export function respondToCloudRun<TResult = unknown, TCheckpoint = unknown>(
  id: string,
  response: unknown,
  options?: CloudRunRequestOptions,
): Promise<CloudRun<TResult, TCheckpoint>> {
  return requestCloudRun({ action: 'respond', id, response }, options);
}

function waitForPoll(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const detach = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', detach);
      reject(signal?.reason ?? new DOMException('Polling detached.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', detach);
      resolve();
    }, ms);
    signal?.addEventListener('abort', detach, { once: true });
  });
}

/** Stops at awaiting_input as well as terminal states. Errors never resubmit work.
 * timeoutMs bounds each status request; signal controls the polling lifetime.
 */
export async function pollCloudRun<TResult = unknown, TCheckpoint = unknown>(
  id: string,
  options: CloudRunPollOptions<TResult, TCheckpoint> = {},
): Promise<CloudRun<TResult, TCheckpoint>> {
  const intervalMs = positiveDuration(options.intervalMs ?? 1500, 'intervalMs');
  while (true) {
    const run = await getCloudRunStatus<TResult, TCheckpoint>(id, options);
    options.onUpdate?.(run);
    if (run.status !== 'queued' && run.status !== 'running') return run;
    await waitForPoll(intervalMs, options.signal);
  }
}
