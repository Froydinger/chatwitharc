import { hasConflictingSearchAmounts, searchDateContext, searchWithVerification } from './searchFreshness.ts';

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}
const now = new Date('2026-10-01T12:00:00Z');

Deno.test('date context is selective and respects historical questions', () => {
  assert(searchDateContext('Illinois cannabis limits', 'What are the new laws?', now).query.includes('2026-10-01'));
  assert(searchDateContext('latest phones', '', now).current);
  assert(searchDateContext('photosynthesis', '', now).query === 'photosynthesis');
  assert(searchDateContext('Illinois laws in 2020', '', now).query === 'Illinois laws in 2020');
  assert(!searchDateContext('latest historical research in 2020', '', now).current);
});

Deno.test('amount conflict checks different pages, not ranges on a page', () => {
  assert(hasConflictingSearchAmounts([{content: 'limit is 30 grams'}, {content: 'limit is 60 grams'}]));
  assert(!hasConflictingSearchAmounts([{content: '30 grams formerly, 60 grams now'}, {content: '60 grams'}]));
  assert(!hasConflictingSearchAmounts([{content: '30 grams'}, {content: '30 grams'}]));
});

Deno.test('current law gets one official-text verification pass and deduplicates sources', async () => {
  const queries: string[] = [];
  const result = await searchWithVerification('Illinois cannabis law', 'latest law', async (query) => {
    queries.push(query);
    return { summary: query, sources: [{title: 'Official source', url: 'https://example.gov/law', content: '60 grams'}], images: [] };
  }, now);
  assert(queries.length === 2);
  assert(queries[1].includes('official enacted statute text effective date'));
  assert(result.sources.length === 1);
  assert(result.summary.includes('not automatically more authoritative'));
});

Deno.test('conflicting amounts trigger follow-up even without freshness words', async () => {
  let calls = 0;
  await searchWithVerification('possession limit', '', async () => {
    calls++;
    return {summary: 'Evidence', sources: [{title: 'A', url: 'https://a.test', content: '30 grams'}, {title: 'B', url: 'https://b.test', content: '60 grams'}]};
  }, now);
  assert(calls === 2);
});

Deno.test('general and empty-result searches do not spend an extra call', async () => {
  let calls = 0;
  await searchWithVerification('photosynthesis', '', async () => {
    calls++;
    return {summary: 'Evidence', sources: [{title: 'A', url: 'https://a.test', content: 'Plants'}]};
  }, now);
  await searchWithVerification('latest laws', '', async () => {
    calls++;
    return {summary: 'Search unavailable', sources: []};
  }, now);
  assert(calls === 2);
});
