import { deepStrictEqual, equal, ok } from 'node:assert/strict';
import { browserbaseSessionHandler } from './browserbaseSessionHandler.ts';

Deno.test('handler rejects anonymous users before calling any session operation', async () => {
  let called = false;
  const handler = browserbaseSessionHandler({
    authenticate: async () => null,
    actions: {
      create: async () => { called = true; return { available: false, reason: 'disabled' }; },
      view: async () => { called = true; return { available: false, reason: 'disabled' }; },
      takeover: async () => { called = true; return { available: false, reason: 'disabled' }; },
      control: async () => { called = true; return { available: false, reason: 'disabled' }; },
      close: async () => { called = true; return { available: false, reason: 'disabled' }; },
      act: async () => { called = true; return { available: false, reason: 'disabled' }; },
    },
  });
  const response = await handler(new Request('https://arc.test/functions/v1/browserbase-session', {
    method: 'POST',
    headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', targetUrl: 'https://example.com' }),
  }));
  equal(response.status, 401);
  equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  equal(called, false);
});

Deno.test('handler authenticates, dispatches the action, and disables URL caching', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const handler = browserbaseSessionHandler({
    authenticate: async authorization => authorization === 'Bearer valid' ? userId : null,
    actions: {
      create: async (owner, input) => ({
        available: true,
        sessionHandle: '33333333-3333-4333-8333-333333333333',
        status: 'agent_running',
        expiresAt: '2026-09-24T12:05:00.000Z',
        liveViewUrl: 'https://browserbase.com/live/fresh-only',
        device: input.device ?? 'desktop',
        control: input.device === 'mobile' ? 'view_only' : 'agent',
        pageSnapshot: { title: owner, url: input.targetUrl, text: 'mock only' },
      }),
      view: async () => ({ available: false, reason: 'session_unavailable' }),
      takeover: async () => ({ available: false, reason: 'session_unavailable' }),
      control: async () => ({ available: false, reason: 'session_unavailable' }),
      close: async () => ({ available: false, reason: 'session_unavailable' }),
      act: async () => ({ available: false, reason: 'session_unavailable' }),
    },
  });
  const response = await handler(new Request('https://arc.test/functions/v1/browserbase-session', {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'create', targetUrl: 'https://example.com', device: 'mobile' }),
  }));
  const body = await response.json();
  equal(response.status, 200);
  equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  deepStrictEqual(body, {
    available: true,
    sessionHandle: '33333333-3333-4333-8333-333333333333',
    status: 'agent_running',
    expiresAt: '2026-09-24T12:05:00.000Z',
    liveViewUrl: 'https://browserbase.com/live/fresh-only',
    device: 'mobile',
    control: 'view_only',
    pageSnapshot: { title: userId, url: 'https://example.com', text: 'mock only' },
  });
  ok(!response.headers.has('set-cookie'));
});
