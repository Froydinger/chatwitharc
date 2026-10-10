// Offline preservation checks for the GPT/pricing copy migration. This never
// starts a browser, contacts a service, or spends model credits.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild-wasm';

const base = 'e562f1fdc5f1a729d083b3b95d5a190c9efc4f63';
const dist = process.argv.find(value => value.startsWith('--dist-dir='))?.slice('--dist-dir='.length) || 'dist';
const read = path => readFileSync(path, 'utf8');
const before = path => execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
const scripts = html => [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(match => JSON.parse(match[1]));
const nodes = html => scripts(html).flatMap(value => Array.isArray(value) ? value : value['@graph'] ?? [value]);
const clean = text => text.replace(/\s+/g, ' ').trim();
const escaped = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function aeo(html) {
  const start = html.indexOf('<div id="aeo-static"');
  assert.ok(start >= 0, 'Crawler-visible aeo-static block remains present');
  const tags = /<div\b|<\/div>/g; tags.lastIndex = start;
  let depth = 0, match;
  while ((match = tags.exec(html))) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (!depth) return html.slice(start, tags.lastIndex);
  }
  assert.fail('The hidden AEO block must remain structurally balanced');
}
function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, shape(entry)]));
  return typeof value;
}
async function loadPosts(source) {
  const result = await build({ stdin: { contents: source, resolveDir: resolve('src/content/blog'), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).BLOG_POSTS;
}

for (const path of ['scripts/prerender.mjs', 'public/robots.txt', 'public/sitemap.xml',
  'src/components/SEO.tsx', 'src/pages/BlogIndexPage.tsx', 'src/pages/BlogPostPage.tsx', 'netlify.toml']) {
  assert.equal(read(path), before(path), `${path}: existing SEO/prerender machinery is unchanged`);
}
const oldHtml = before('index.html'), html = read('index.html');
const oldAeo = aeo(oldHtml), currentAeo = aeo(html);
assert.equal(currentAeo.match(/^<div[^>]+>/)[0], oldAeo.match(/^<div[^>]+>/)[0], 'AEO visibility strategy is preserved');
for (const heading of [...oldAeo.matchAll(/<h[12]>[\s\S]*?<\/h[12]>/g)].map(match => clean(match[0]))) {
  assert.ok(clean(currentAeo).includes(heading), `Existing semantic heading remains: ${heading}`);
}
for (const question of [...oldAeo.matchAll(/<dt>[\s\S]*?<\/dt>/g)].map(match => clean(match[0]))) {
  assert.ok(clean(currentAeo).includes(question), `Existing FAQ question remains: ${question}`);
}
assert.deepEqual(currentAeo.match(/<form[\s\S]*?<\/form>/g), oldAeo.match(/<form[\s\S]*?<\/form>/g), 'Netlify form discovery remains intact');
const oldLd = scripts(oldHtml), currentLd = scripts(html);
assert.deepEqual(shape(currentLd), shape(oldLd), 'Existing structured-data types/fields are preserved');
for (let index = 0; index < oldLd.length; index++) {
  for (const key of ['@context', '@type', 'name', 'url', 'applicationCategory', 'operatingSystem', 'creator', 'publisher']) {
    assert.deepEqual(currentLd[index][key], oldLd[index][key], `Existing schema ${key} is preserved`);
  }
  assert.deepEqual(currentLd[index].offers?.map(({ description, ...offer }) => offer),
    oldLd[index].offers?.map(({ description, ...offer }) => offer), 'Existing Free Offer price/currency remain accurate');
}
const headMetadata = source => source.slice(0, source.indexOf('</head>')).match(/<(?:title|meta|link)\b[^>]*>(?:[^<]*<\/title>)?/g);
assert.deepEqual(headMetadata(html), headMetadata(oldHtml), 'Existing title, meta and link attributes remain intact');

const [oldPosts, posts] = await Promise.all([loadPosts(before('src/content/blog/posts.ts')), loadPosts(read('src/content/blog/posts.ts'))]);
assert.equal(posts.length, 15);
assert.deepEqual(posts.map(post => ({ slug: post.slug, title: post.title })), oldPosts.map(post => ({ slug: post.slug, title: post.title })), 'Published routes and titles do not drift');
for (const post of posts) {
  assert.ok(post.description && post.intro && post.faq.length, `${post.slug}: semantic content is present`);
  const pricing = post.faq.find(faq => /how much.*boost.*cost/i.test(faq.q));
  assert.ok(pricing, `${post.slug}: new pricing FAQ exists`);
  assert.match(pricing.a, /\$15\/month/); assert.match(pricing.a, /\$115\/year/);
  assert.match(pricing.a, /Existing subscribers keep their current price, including renewals/);
  assert.ok(read('public/sitemap.xml').includes(`https://askarc.chat/blog/${post.slug}`));
}
for (const source of [currentAeo, read('public/llms.txt')]) {
  assert.match(source, /\$15\/month/); assert.match(source, /\$115\/year/);
  assert.match(source, /GPT 6 Luna/); assert.match(source, /GPT 6\.1 Sol/); assert.match(source, /GPT 6 Astra/);
  assert.ok(!/Arc Think|Arc Flash|Nano Banana/.test(source), 'Retired active-model claims are removed');
  assert.ok(!/no paid plan|no.*checkout.*paywall|unlimited generation on Boost/i.test(source));
}
console.log('PASS AEO source: hidden semantic block, schema, metadata, form discovery, unchanged routes/robots/sitemap/prerender, 15 blog titles and consistent pricing/model copy.');

if (!process.argv.includes('--source-only')) {
  const pages = readdirSync(`${dist}/_prerender`, { recursive: true }).filter(name => name.endsWith('.html'));
  assert.equal(pages.length, 16, 'All 16 prerendered pages exist in the final build');
  for (const post of posts) {
    const page = read(`${dist}/_prerender/blog/${post.slug}.html`);
    const url = `https://askarc.chat/blog/${post.slug}`, ld = nodes(page), block = aeo(page);
    assert.ok(page.includes(`rel="canonical" href="${url}"`));
    assert.ok(page.includes(`property="og:url" content="${url}"`));
    assert.ok(page.includes(`<title>${escaped(post.title)}`));
    assert.ok(block.includes(`<h1>${escaped(post.title)}</h1>`));
    assert.ok(block.includes('<form name="support"'));
    assert.equal(ld.find(node => node['@type'] === 'Article')?.mainEntityOfPage, url);
    const faq = ld.find(node => node['@type'] === 'FAQPage');
    assert.equal(faq?.mainEntity.length, post.faq.length);
    for (let index = 0; index < post.faq.length; index++) {
      assert.equal(faq.mainEntity[index].name, post.faq[index].q);
      assert.ok(faq.mainEntity[index].acceptedAnswer.text.startsWith(post.faq[index].a));
    }
    assert.equal(ld.find(node => node['@type'] === 'BreadcrumbList')?.itemListElement[2]?.item, url);
  }
  const index = read(`${dist}/_prerender/blog.html`);
  assert.ok(index.includes('rel="canonical" href="https://askarc.chat/blog"'));
  for (const post of posts) assert.ok(aeo(index).includes(`href="https://askarc.chat/blog/${post.slug}"`));
  console.log('PASS AEO prerender artifact: all 16 crawler pages, canonicals, article/FAQ/breadcrumb JSON-LD, visible-to-crawler content and preserved form discovery.');
}
