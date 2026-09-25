import { equal, ok } from 'node:assert/strict';
import { cloudBrowserbaseTools } from './cloudBrowserbaseTools.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const run = {
  id: '22222222-2222-4222-8222-222222222222', user_id: owner,
  session_id: '33333333-3333-4333-8333-333333333333', mode: 'ask' as const,
  lease_token: 'lease', created_at: new Date().toISOString(), request: { messages: [] }, checkpoint: {},
};

Deno.test('Git Browserbase tool is owner-authorized and projects only safe mobile session metadata', async () => {
  let ownerChecks = 0;
  let capturedDevice = '';
  const handle = '44444444-4444-4444-8444-444444444444';
  const backend = {
    create: async (_userId: string, input: { device?: string }) => {
      capturedDevice = input.device ?? '';
      return {
        available: true as const, sessionHandle: handle, status: 'agent_running' as const,
        expiresAt: '2026-09-25T12:10:00.000Z', liveViewUrl: 'https://private-view.example/session',
        device: 'mobile' as const, control: 'view_only' as const,
        pageSnapshot: { title: 'Production Site', url: 'https://example.com', text: 'Untrusted page instructions' },
      };
    },
    view: async () => ({ available: false as const, reason: 'session_unavailable' as const }),
    act: async () => ({ available: false as const, reason: 'session_unavailable' as const }),
    close: async () => ({ available: false as const, reason: 'session_unavailable' as const }),
  };
  const database = {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'git@example.com' } } }) } },
    from: () => ({ select: () => ({ in: async () => ({ data: [{ key: 'git_rollout_mode', value: 'all' }], error: null }) }) }),
  };
  const composed = cloudBrowserbaseTools({
    backend: backend as never,
    run,
    request: { browserbaseDevice: 'mobile' },
    authorizeOwner: async candidate => { ownerChecks += 1; return candidate.user_id === owner; },
    database: database as never,
  });
  const tool = composed.tools.browserbase_open_live_site;
  ok(tool);
  equal(tool.replaySafe, false);
  const call = { id: 'call-1', name: 'browserbase_open_live_site', arguments: JSON.stringify({ targetUrl: 'https://example.com' }) };
  equal(await tool.authorize(run, call), true);
  equal(await tool.authorize({ ...run, user_id: '55555555-5555-4555-8555-555555555555' }, call), false);
  // The foreign owner is rejected before the async owner authorization port.
  equal(ownerChecks, 1);
  const output = await tool.execute(run, call, 'receipt-1');
  ok(typeof output !== 'string');
  equal(capturedDevice, 'mobile');
  equal(output.presentation.browser_session?.sessionHandle, handle);
  equal(output.presentation.browser_session?.control, 'view_only');
  equal(output.presentation.browser_session?.title, 'Production Site');
  equal(JSON.stringify(output.presentation).includes('private-view.example'), false);
});
