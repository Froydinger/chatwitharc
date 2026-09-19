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

Deno.test('multi-page site requests use App Builder when available', () => {
  const request = {
    forceCode: true,
    forceWebSearch: false,
    messages: [{ role: 'user', content: 'Do some research and make the best website lander for BearCraft Woodworks. Make it a full website with multi pages and policies.' }],
  };
  if (cloudInitialTool(request, { appBuilderAllowed: true }) !== 'web_search') throw new Error('Expected natural research before build_app');
  if (cloudInitialTool(request, { appBuilderAllowed: false }) !== undefined) throw new Error('Unavailable App Builder must not silently fall back to code canvas');
});

Deno.test('multi-page research keeps web search as the first tool', () => {
  const request = {
    forceCode: true,
    forceWebSearch: true,
    messages: [{ role: 'user', content: 'Research current trends and build a complete multi-page website for my woodworking business.' }],
  };
  if (cloudInitialTool(request, { appBuilderAllowed: true }) !== 'web_search') throw new Error('Expected web_search first');
});

Deno.test('single-file code remains on the code canvas', () => {
  const request = { forceCode: true, messages: [{ role: 'user', content: 'Build a single page HTML countdown timer.' }] };
  if (cloudInitialTool(request, { appBuilderAllowed: true }) !== 'update_code') throw new Error('Expected update_code');
});

Deno.test('instructional multi-page questions stay conversational', () => {
  const request = { forceCode: true, messages: [{ role: 'user', content: 'Can you explain how to build a multi-page website?' }] };
  if (cloudInitialTool(request, { appBuilderAllowed: true }) !== 'update_code') throw new Error('Expected explicit code mode to remain unchanged');
});

Deno.test('multi-page build without research begins with the saved app tool', () => {
  const request = { forceCode: true, messages: [{ role: 'user', content: 'Make a full website with multiple pages for my business.' }] };
  if (cloudInitialTool(request, { appBuilderAllowed: true }) !== 'build_app') throw new Error('Expected saved app');
});
