import { browserbaseChatTools } from './chatBrowserbaseTools.ts';
import type { BrowserbaseActionResult } from './browserbaseSessions.ts';

type Backend = Parameters<typeof browserbaseChatTools>[0]['backend'];

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}

const active: BrowserbaseActionResult = {
  available: true,
  sessionHandle: '11111111-1111-4111-8111-111111111111',
  status: 'agent_running',
  expiresAt: '2026-09-24T20:00:00Z',
  liveViewUrl: 'https://signed-debugger.browserbase.com/private-token',
  device: 'desktop',
  control: 'agent',
  pageSnapshot: { title: 'Example app', url: 'https://example.com/app', text: 'Welcome' },
};

Deno.test('Chat browser tools keep the signed live-view URL out of Luna and expose only an owner session event', async () => {
  const events: unknown[] = [];
  const calls: string[] = [];
  const backend: Backend = {
      create: async (userId, input) => {
        calls.push(`create:${userId}:${input.taskKind}:${input.device}`);
        return active;
      },
      view: async () => active,
      act: async (_userId, _sessionHandle, action) => ({ ...active, pageSnapshot: { title: 'Checked', url: 'https://example.com/app', text: `${action.type} done` } }),
      close: async () => ({ ...active, status: 'release_requested', control: 'view_only' }),
  };
  const tools = browserbaseChatTools({
    backend,
    userId: '22222222-2222-4222-8222-222222222222',
    device: 'desktop',
    taskKind: 'git',
    chatSessionId: '33333333-3333-4333-8333-333333333333',
    repo: 'owner/project',
    onEvent: event => events.push(event),
  });
  const output = await tools.execute('browserbase_open_live_site', JSON.stringify({ targetUrl: 'https://example.com/app' }));
  assert(!output.includes('signed-debugger.browserbase.com'));
  assert(output.includes('Welcome'));
  assert(calls[0].includes(':git:desktop'));
  assert(JSON.stringify(events).includes('11111111-1111-4111-8111-111111111111'));
  assert(!JSON.stringify(events).includes('signed-debugger.browserbase.com'));

  const rejected = await tools.execute('browserbase_act', JSON.stringify({
    sessionHandle: '44444444-4444-4444-8444-444444444444', operation: { type: 'read_snapshot' },
  }));
  assert(rejected.includes('not the active session'));
});

Deno.test('Chat browser tools fail over plainly when Browserbase is disabled and close only the active session', async () => {
  let actCalls = 0;
  let closeCalls = 0;
  const backend: Backend = {
      create: async () => ({ available: false, reason: 'disabled' }),
      view: async () => ({ available: false, reason: 'session_unavailable' }),
      act: async () => { actCalls += 1; return { available: false, reason: 'session_unavailable' }; },
      close: async () => { closeCalls += 1; return { ...active, status: 'release_requested', control: 'view_only' }; },
  };
  const tools = browserbaseChatTools({
    backend,
    userId: '22222222-2222-4222-8222-222222222222',
    device: 'mobile',
    taskKind: 'chat',
  });
  const unavailable = await tools.execute('browserbase_open_live_site', JSON.stringify({ targetUrl: 'https://example.com' }));
  assert(unavailable.includes('"reason":"disabled"'));
  const denied = await tools.execute('browserbase_act', JSON.stringify({ sessionHandle: active.sessionHandle, operation: { type: 'read_snapshot' } }));
  assert(denied.includes('not the active session'));
  assert(actCalls === 0);
  assert(closeCalls === 0);
});
