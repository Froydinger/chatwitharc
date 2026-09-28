import { equal, deepStrictEqual } from 'node:assert/strict';
import { browserPreflightIntent } from './chatBrowserbaseIntent.ts';
Deno.test('explicit browser requests open before reasoning; ambiguous/negative text does not', () => {
  const intent = browserPreflightIntent('hey head over to winthenight.org and tell me what i could improve visually.');
  equal(intent?.name, 'browserbase_open_live_site');
  deepStrictEqual(JSON.parse(intent!.arguments), { targetUrl: 'https://winthenight.org' });
  equal(browserPreflightIntent('Do not open https://example.com'), null);
  equal(browserPreflightIntent('My site is example.com'), null);
  equal(browserPreflightIntent('Review https://example.com and https://example.org'), null);
  equal(browserPreflightIntent('Open http://example.com'), null);
});
Deno.test('handoff reads the same current browser instead of opening its original URL', () => {
  const text = "I'm done controlling the browser. Please check the current page and continue.";
  const intent = browserPreflightIntent(text, 'owner-scoped-handle');
  equal(intent?.name, 'browserbase_act');
  deepStrictEqual(JSON.parse(intent!.arguments), { sessionHandle: 'owner-scoped-handle', operation: { type: 'read_snapshot' } });
  equal(browserPreflightIntent(text), null);
});
