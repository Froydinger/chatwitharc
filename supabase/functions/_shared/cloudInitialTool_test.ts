import { cloudInitialTool } from './cloudInitialTool.ts';

Deno.test('explicit composer modes retain code, writing, search priority', () => {
  for (const [request, expected] of [
    [{}, undefined],
    [{ forceWebSearch: true }, 'web_search'],
    [{ forceCanvas: true, forceWebSearch: true }, 'update_canvas'],
    [{ forceCode: true, forceCanvas: true, forceWebSearch: true }, 'update_code'],
    [{ forceCode: 'true', forceCanvas: 1, forceWebSearch: false }, undefined],
  ] as const) {
    if (cloudInitialTool(request) !== expected) throw new Error('Incorrect initial tool');
  }
});
