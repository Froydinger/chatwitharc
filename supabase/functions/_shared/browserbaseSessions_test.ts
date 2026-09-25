import { deepStrictEqual, equal, match, ok } from 'node:assert/strict';
import {
  createBrowserbaseSessionBackend,
  validateBrowserbaseTargetUrl,
  type BrowserbaseSessionRecord,
  type BrowserbaseSessionStore,
} from './browserbaseSessions.ts';
import type { BrowserbaseCdpConnection, BrowserbaseCdpConnector } from './browserbaseCdp.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_HANDLE = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-09-24T12:00:00.000Z');

function makeRecord(overrides: Partial<BrowserbaseSessionRecord> = {}): BrowserbaseSessionRecord {
  return {
    sessionHandle: SESSION_HANDLE,
    userId: USER_ID,
    providerSessionId: 'bb-session-1',
    targetOrigin: 'https://example.com',
    allowedDomains: ['example.com'],
    taskKind: 'chat',
    device: 'desktop',
    status: 'agent_running',
    durationSeconds: 300,
    reservedMinutes: 5,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 360_000).toISOString(),
    ...overrides,
  };
}

function makeStore(options: { reservation?: 'ok' | 'quota_exhausted' | 'concurrency_limit'; record?: BrowserbaseSessionRecord } = {}) {
  let record = options.record ?? makeRecord({ status: 'provisioning', providerSessionId: null });
  let reserveCount = 0;
  const store: BrowserbaseSessionStore = {
    async reserve(input) {
      reserveCount += 1;
      if (options.reservation === 'quota_exhausted' || options.reservation === 'concurrency_limit') {
        return { ok: false, reason: options.reservation };
      }
      record = { ...record, sessionHandle: input.sessionHandle, userId: input.userId, targetOrigin: input.targetOrigin,
        allowedDomains: input.allowedDomains, taskKind: input.taskKind, device: input.device,
        durationSeconds: input.durationSeconds, status: 'provisioning' };
      return { ok: true, reservedMinutes: 5, expiresAt: new Date(NOW + 360_000).toISOString() };
    },
    async getOwned(handle, userId) {
      return handle === record.sessionHandle && userId === record.userId ? structuredClone(record) : null;
    },
    async attachProviderSession(handle, userId, providerSessionId) {
      if (handle !== record.sessionHandle || userId !== record.userId || record.status !== 'provisioning') return false;
      record = { ...record, providerSessionId, status: 'agent_running' };
      return true;
    },
    async setControl(handle, userId, action) {
      if (handle !== record.sessionHandle || userId !== record.userId) return { ok: false, reason: 'not_found' };
      const next = action === 'takeover' ? 'user_control' : action === 'handoff' ? 'handed_back' : 'agent_running';
      record = { ...record, status: next };
      return { ok: true, status: next };
    },
    async markReleaseRequested() { record = { ...record, status: 'release_requested' }; },
    async settle(_handle, _userId, status) { record = { ...record, status }; },
  };
  return { store, get record() { return record; }, get reserveCount() { return reserveCount; } };
}

function dns(address = '93.184.216.34') {
  return async (_hostname: string, type: 'A' | 'AAAA') => type === 'A' ? [address] : [];
}

function fakeCdp(snapshotUrl = 'https://example.com/') {
  const commands: Array<{ method: string; params?: Record<string, unknown>; sessionId?: string }> = [];
  const connection: BrowserbaseCdpConnection = {
    async send(method, params, sessionId) {
      commands.push({ method, params, sessionId });
      if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 'page-1', type: 'page' }] };
      if (method === 'Target.attachToTarget') return { sessionId: 'page-session' };
      if (method === 'Runtime.evaluate') return {
        result: { value: JSON.stringify({ title: 'Example page', url: snapshotUrl, text: 'A visible page body' }) },
      };
      return {};
    },
    on() { return () => {}; },
    close() {},
  };
  const connector: BrowserbaseCdpConnector = async () => connection;
  return { connector, commands };
}

function providerMocks(options: { createStatus?: number; getStatus?: string; externalUrl?: string } = {}) {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    let body: Record<string, unknown> | undefined;
    if (typeof init.body === 'string') body = JSON.parse(init.body);
    calls.push({ url, method, body });
    if (url.endsWith('/sessions') && method === 'POST') {
      return Response.json({
        id: 'bb-session-1',
        connectUrl: 'wss://connect.browserbase.com/session/server-secret',
        expiresAt: new Date(NOW + 300_000).toISOString(),
      }, { status: options.createStatus ?? 201 });
    }
    if (url.endsWith('/sessions/bb-session-1/debug')) {
      return Response.json({ debuggerFullscreenUrl: 'https://browserbase.com/live/fresh-secret' });
    }
    if (url.endsWith('/sessions/bb-session-1') && method === 'GET') {
      return Response.json({
        id: 'bb-session-1',
        status: options.getStatus ?? 'RUNNING',
        connectUrl: 'wss://connect.browserbase.com/session/server-secret',
        endedAt: options.getStatus === 'COMPLETED' ? new Date(NOW + 60_000).toISOString() : undefined,
      });
    }
    if (url.endsWith('/sessions/bb-session-1') && method === 'POST') {
      return Response.json({ status: 'RUNNING' });
    }
    return Response.json({}, { status: 404 });
  };
  return { fetcher, calls };
}

Deno.test('disabled Browserbase gate makes no DNS lookup, database reservation, or provider call', async () => {
  const fakeStore = makeStore();
  const provider = providerMocks();
  let dnsCalls = 0;
  const backend = createBrowserbaseSessionBackend({ enabled: 'true', apiKey: '' }, {
    store: fakeStore.store,
    fetcher: provider.fetcher,
    dnsLookup: async () => { dnsCalls += 1; return ['93.184.216.34']; },
    now: () => NOW,
  });
  const response = await backend.create(USER_ID, { targetUrl: 'https://example.com' });
  deepStrictEqual(response, { available: false, reason: 'disabled' });
  equal(dnsCalls, 0);
  equal(fakeStore.reserveCount, 0);
  equal(provider.calls.length, 0);
});

Deno.test('session target validation rejects private hosts and secret query parameters', async () => {
  await assertRejects(() => validateBrowserbaseTargetUrl('https://127.0.0.1', dns()));
  await assertRejects(() => validateBrowserbaseTargetUrl('https://10.0.0.5/private', dns()));
  await assertRejects(() => validateBrowserbaseTargetUrl('https://example.com/?access_token=secret', dns()));
  await assertRejects(() => validateBrowserbaseTargetUrl('https://example.com/#session=secret', dns()));
  await assertRejects(() => validateBrowserbaseTargetUrl('http://example.com', dns()));
  await assertRejects(() => validateBrowserbaseTargetUrl('https://example.com', dns('10.1.2.3')));
  const valid = await validateBrowserbaseTargetUrl('https://example.com/products?sort=top', dns());
  equal(valid.origin, 'https://example.com');
  equal((await validateBrowserbaseTargetUrl('https://example.com/#/dashboard', dns())).url.hash, '#/dashboard');
});

Deno.test('invalid session device values cannot silently receive desktop takeover controls', async () => {
  const fakeStore = makeStore();
  const provider = providerMocks();
  const backend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: fakeStore.store, fetcher: provider.fetcher, dnsLookup: dns(), now: () => NOW,
  });
  deepStrictEqual(await backend.create(USER_ID, { targetUrl: 'https://example.com', device: 'tablet' as never }), {
    available: false, reason: 'session_unavailable',
  });
  equal(fakeStore.reserveCount, 0);
  equal(provider.calls.length, 0);
});

Deno.test('create reserves first, limits the provider payload, navigates with CDP, and returns an ephemeral live view', async () => {
  const fakeStore = makeStore();
  const provider = providerMocks();
  const cdp = fakeCdp();
  const backend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: fakeStore.store,
    fetcher: provider.fetcher,
    dnsLookup: dns(),
    cdpConnector: cdp.connector,
    now: () => NOW,
  });

  const response = await backend.create(USER_ID, {
    targetUrl: 'https://example.com/products',
    durationSeconds: 300,
    device: 'desktop',
    taskKind: 'chat',
  });

  ok(response.available);
  equal(response.status, 'agent_running');
  equal(response.device, 'desktop');
  equal(response.control, 'agent');
  equal(response.pageSnapshot?.title, 'Example page');
  equal(response.pageSnapshot?.url, 'https://example.com/');
  equal(response.liveViewUrl, 'https://browserbase.com/live/fresh-secret');
  equal(fakeStore.record.providerSessionId, 'bb-session-1');
  ok(cdp.commands.some(command => command.method === 'Page.navigate' && command.params?.url === 'https://example.com/products'));

  const createCall = provider.calls.find(call => call.method === 'POST' && call.url.endsWith('/sessions'));
  ok(createCall?.body);
  equal(createCall.body.timeout, 300);
  equal(createCall.body.keepAlive, false);
  const settings = createCall.body.browserSettings as Record<string, unknown>;
  equal(settings.recordSession, false);
  equal(settings.logSession, false);
  deepStrictEqual(settings.allowedDomains, ['example.com']);
  ok(provider.calls[0].url.startsWith('https://api.browserbase.com/v1/'));
});

Deno.test('quota exhaustion and provider 429 fall back without leaving active reservations', async () => {
  const quotaStore = makeStore({ reservation: 'quota_exhausted' });
  const quotaProvider = providerMocks();
  const quotaBackend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: quotaStore.store, fetcher: quotaProvider.fetcher, dnsLookup: dns(), now: () => NOW,
  });
  deepStrictEqual(await quotaBackend.create(USER_ID, { targetUrl: 'https://example.com' }), {
    available: false, reason: 'quota_exhausted',
  });
  equal(quotaProvider.calls.length, 0);

  const providerStore = makeStore();
  const provider429: typeof fetch = async () => new Response('{}', { status: 429 });
  const cappedBackend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: providerStore.store, fetcher: provider429, dnsLookup: dns(), now: () => NOW,
  });
  const capped = await cappedBackend.create(USER_ID, { targetUrl: 'https://example.com' });
  deepStrictEqual(capped, { available: false, reason: 'quota_exhausted' });
});

Deno.test('provider rate limits become quota fallback and forged provider origins are rejected', async () => {
  const fakeStore = makeStore();
  const rateLimited: typeof fetch = async () => new Response('{}', { status: 429 });
  const rateLimitedBackend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: fakeStore.store, fetcher: rateLimited, dnsLookup: dns(), now: () => NOW,
  });
  deepStrictEqual(await rateLimitedBackend.create(USER_ID, { targetUrl: 'https://example.com' }), {
    available: false, reason: 'quota_exhausted',
  });

  const provider = providerMocks();
  const cdp = fakeCdp();
  const createWithFakeConnect: typeof fetch = async (input, init = {}) => {
    if (String(input).endsWith('/sessions') && init.method === 'POST') {
      return Response.json({ id: 'bb-session-1', connectUrl: 'wss://evilbrowserbase.com/session/secret' }, { status: 201 });
    }
    return provider.fetcher(input, init);
  };
  const forgedBackend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: makeStore().store, fetcher: createWithFakeConnect, dnsLookup: dns(), cdpConnector: cdp.connector, now: () => NOW,
  });
  deepStrictEqual(await forgedBackend.create(USER_ID, { targetUrl: 'https://example.com' }), {
    available: false, reason: 'session_unavailable',
  });
  equal(cdp.commands.length, 0);
});

Deno.test('owner scope, user takeover, handoff event, and mobile view-only are enforced server-side', async () => {
  const fakeStore = makeStore({ record: makeRecord() });
  const provider = providerMocks();
  const cdp = fakeCdp();
  const backend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: fakeStore.store, fetcher: provider.fetcher, dnsLookup: dns(), cdpConnector: cdp.connector, now: () => NOW,
  });

  deepStrictEqual(await backend.view(OTHER_USER_ID, SESSION_HANDLE), { available: false, reason: 'session_unavailable' });
  equal(provider.calls.length, 0);
  const takeover = await backend.takeover(USER_ID, SESSION_HANDLE);
  ok(takeover.available);
  equal(takeover.control, 'user');
  deepStrictEqual(await backend.act(USER_ID, SESSION_HANDLE, { type: 'read_snapshot' }), {
    available: false, reason: 'session_unavailable',
  });

  const handoff = await backend.control(USER_ID, SESSION_HANDLE, 'handoff');
  ok(handoff.available);
  deepStrictEqual(handoff.handoffEvent, { type: 'browser_session_handoff', sessionHandle: SESSION_HANDLE });
  const action = await backend.act(USER_ID, SESSION_HANDLE, { type: 'expect', text: 'visible page' });
  ok(action.available);
  equal(action.pageCheckPassed, true);
  match(action.pageSnapshot?.text ?? '', /visible page/);

  const mobileStore = makeStore({ record: makeRecord({ device: 'mobile' }) });
  const mobileBackend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: mobileStore.store, fetcher: provider.fetcher, dnsLookup: dns(), now: () => NOW,
  });
  deepStrictEqual(await mobileBackend.takeover(USER_ID, SESSION_HANDLE), { available: false, reason: 'session_unavailable' });
});

Deno.test('server connection helper returns the CDP URL only to the owner and never while the user controls it', async () => {
  const fakeStore = makeStore({ record: makeRecord() });
  const provider = providerMocks();
  const backend = createBrowserbaseSessionBackend({ enabled: true, apiKey: 'mock-key' }, {
    store: fakeStore.store, fetcher: provider.fetcher, dnsLookup: dns(), now: () => NOW,
  });
  equal(await backend.getBrowserbaseConnectionUrl(OTHER_USER_ID, SESSION_HANDLE), null);
  equal(await backend.getBrowserbaseConnectionUrl(USER_ID, SESSION_HANDLE),
    'wss://connect.browserbase.com/session/server-secret');
  await backend.takeover(USER_ID, SESSION_HANDLE);
  equal(await backend.getBrowserbaseConnectionUrl(USER_ID, SESSION_HANDLE), null);
});

async function assertRejects(promise: () => Promise<unknown>) {
  let rejected = false;
  try { await promise(); } catch { rejected = true; }
  ok(rejected, 'Expected validation to reject the value');
}
