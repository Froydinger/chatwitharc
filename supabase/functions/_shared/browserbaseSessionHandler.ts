import type { BrowserbasePageAction } from './browserbaseCdp.ts';
import type { BrowserbaseCreateInput } from './browserbaseSessions.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Pragma': 'no-cache',
};

type BrowserbaseActions = ReturnType<typeof import('./browserbaseSessions.ts')['createBrowserbaseSessionBackend']>;

export function browserbaseSessionHandler(deps: {
  authenticate: (authorization: string | null) => Promise<string | null>;
  actions: Pick<BrowserbaseActions, 'create' | 'view' | 'takeover' | 'control' | 'close' | 'act'>;
}) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let userId: string | null = null;
    try { userId = await deps.authenticate(request.headers.get('authorization')); }
    catch { userId = null; }
    if (!userId) return json({ error: 'Authentication required' }, 401);

    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > 8_192) return json({ error: 'Request too large' }, 413);
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'Invalid request' }, 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }

    try {
      let result;
      switch (body.action) {
        case 'create':
          result = await deps.actions.create(userId, body as unknown as BrowserbaseCreateInput);
          break;
        case 'view':
          result = await deps.actions.view(userId, sessionHandle(body.sessionHandle));
          break;
        case 'takeover':
          result = await deps.actions.takeover(userId, sessionHandle(body.sessionHandle));
          break;
        case 'handoff':
          result = await deps.actions.control(userId, sessionHandle(body.sessionHandle), 'handoff');
          break;
        case 'resume':
          result = await deps.actions.control(userId, sessionHandle(body.sessionHandle), 'resume');
          break;
        case 'close':
          result = await deps.actions.close(userId, sessionHandle(body.sessionHandle));
          break;
        case 'act':
          if (!body.operation || typeof body.operation !== 'object' || Array.isArray(body.operation)) {
            return json({ error: 'Invalid browser action' }, 400);
          }
          result = await deps.actions.act(
            userId,
            sessionHandle(body.sessionHandle),
            body.operation as BrowserbasePageAction,
          );
          break;
        default:
          return json({ error: 'Unsupported action' }, 400);
      }
      return json(result, 200);
    } catch {
      return json({ available: false, reason: 'session_unavailable' }, 200);
    }
  };
}

function sessionHandle(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64) throw new Error('Invalid session handle');
  return value;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}
