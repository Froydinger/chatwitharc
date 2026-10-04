import { workModelRoute, appModelRoute } from './durableModelRouting.ts';
function assert(ok: boolean) { if (!ok) throw new Error('Assertion failed'); }
Deno.test('Git Pro requires Boost and enabled remote Git on each reconstructed run', () => {
  assert(workModelRoute({ forceGit: true }, 'low', false, true).model === 'gpt-6-luna');
  const request = { forceGit: true, gitModelMode: 'pro' };
  assert(workModelRoute(request, 'none', true, true).model === 'gpt-6.1-sol');
  assert(workModelRoute(request, 'none', true, true).effort === 'low');
  for (const args of [[request, 'low', false, true], [request, 'low', true, false], [{gitModelMode:'pro'},'low',true,true]] as const) { let failed = false; try { workModelRoute(args[0], args[1], args[2], args[3]); } catch { failed = true; } assert(failed); }
});
Deno.test('App fast defaults to Luna and persisted Pro exclusively selects Sol', () => {
  assert(appModelRoute({}).model === 'gpt-6-luna');
  assert(appModelRoute({ appModelMode:'fast' }).model === 'gpt-6-luna');
  assert(appModelRoute(JSON.parse(JSON.stringify({ appModelMode:'pro' }))).model === 'gpt-6.1-sol');
  let failed = false; try { appModelRoute({ appModelMode:'invalid' }); } catch { failed = true; } assert(failed);
});
