/**
 * Post-build prerender for the marketing/blog routes.
 *
 * Why: the app is a client-rendered SPA behind Netlify's `/* -> /index.html`
 * rewrite, so every blog URL returns the same shell. Googlebot executes JS and
 * recovers the real page, but GPTBot / OAI-SearchBot / ClaudeBot / PerplexityBot
 * largely do not — they saw the generic title, the wrong canonical, and none of
 * the per-post Article/FAQPage/Breadcrumb schema.
 *
 * This writes a real static `dist/blog/<slug>/index.html` per post. Netlify
 * serves an existing file before applying the non-forced SPA rewrite, so these
 * take precedence for crawlers while the SPA keeps handling client navigation.
 *
 * Crawler copy goes in the existing offscreen `#aeo-static` block (the same
 * convention index.html already uses). React's createRoot replaces the whole
 * #root subtree on mount, so real users never see it and nothing changes
 * visually.
 */
import { build } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const SITE = "https://askarc.chat";
const OG_IMAGE = `${SITE}/og-image.png`;

/** Bundle the TS post data through Vite so this script needs no extra deps. */
async function loadPosts() {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "arc-prerender-"));
  await build({
    configFile: false,
    logLevel: "error",
    root: ROOT,
    resolve: { alias: { "@": path.resolve(ROOT, "src") } },
    build: {
      ssr: true,
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: {
        input: path.resolve(ROOT, "src/content/blog/posts.ts"),
        output: { entryFileNames: "posts.mjs", format: "es" },
      },
    },
  });
  const mod = await import(pathToFileURL(path.join(outDir, "posts.mjs")).href);
  await fs.rm(outDir, { recursive: true, force: true });
  return mod.BLOG_POSTS;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON-LD must not let a literal `</script>` in the data close the tag. */
const jsonLd = (obj) =>
  JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/**
 * Netlify discovers forms by parsing deployed HTML. The target lives inside
 * #aeo-static, which we overwrite, so carry it onto every prerendered page.
 */
function extractNetlifyForm(html, aeo) {
  const block = html.slice(aeo.start, aeo.end);
  const m = block.match(/<form[\s\S]*?<\/form>/);
  return m ? m[0] : "";
}

/** Find `<div id="aeo-static" ...>...</div>` by counting nested div tags. */
function findAeoBlock(html) {
  const start = html.indexOf('<div id="aeo-static"');
  if (start === -1) return null;
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tag.exec(html))) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return { start, end: m.index + m[0].length };
  }
  return null;
}

/** Replace a tag's attribute value, or return html unchanged if absent. */
function setMeta(html, matcher, replacement) {
  return matcher.test(html) ? html.replace(matcher, replacement) : html;
}

function buildHead(html, { title, description, keywords, url, type, ld }) {
  let out = html;
  out = setMeta(out, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  out = setMeta(
    out,
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(description)}">`
  );
  if (keywords) {
    out = setMeta(
      out,
      /<meta name="keywords" content="[^"]*"\s*\/?>/,
      `<meta name="keywords" content="${esc(keywords)}">`
    );
  }
  out = setMeta(
    out,
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${esc(url)}" />`
  );
  out = setMeta(
    out,
    /<meta property="og:type" content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${type}" />`
  );
  out = setMeta(
    out,
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${esc(description)}">`
  );

  const injected = [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    ...ld.map((d) => `<script type="application/ld+json">${jsonLd(d)}</script>`),
  ].join("\n    ");

  return out.replace("</head>", `  ${injected}\n</head>`);
}

function postSchema(post, url) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.updated,
      dateModified: post.updated,
      author: { "@type": "Organization", name: "ArcAI" },
      publisher: {
        "@type": "Organization",
        name: "ArcAI",
        logo: { "@type": "ImageObject", url: `${SITE}/arc-logo-ui.png` },
      },
      mainEntityOfPage: url,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: [f.a, ...(f.details ?? []), ...(f.bullets ?? [])].join(" "),
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
}

function postBody(post, url) {
  const faq = post.faq
    .map(
      (f) => `<section>
            <h3>${esc(f.q)}</h3>
            <p>${esc(f.a)}</p>
            ${(f.details ?? []).map((d) => `<p>${esc(d)}</p>`).join("\n            ")}
            ${
              (f.bullets ?? []).length
                ? `<ul>${(f.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
                : ""
            }
          </section>`
    )
    .join("\n          ");

  return `<article>
          <nav><a href="${SITE}/">ArcAI</a> &rsaquo; <a href="${SITE}/blog">Guides</a></nav>
          <h1>${esc(post.title)}</h1>
          <p>${esc(post.description)}</p>
          <p><time datetime="${esc(post.updated)}">Updated ${esc(post.updated)}</time></p>
          <p>${esc(post.intro)}</p>
          ${(post.body ?? []).map((p) => `<p>${esc(p)}</p>`).join("\n          ")}
          <h2>Frequently asked questions</h2>
          ${faq}
          <p>${esc(post.cta)}</p>
          <p><a href="${esc(url)}">${esc(post.title)}</a></p>
        </article>`;
}

function indexBody(posts) {
  return `<article>
          <h1>ArcAI Guides</h1>
          <p>Answers to the most common questions about ArcAI — features, comparisons, pricing, voice, memory, images and code.</p>
          <ul>
            ${posts
              .map(
                (p) =>
                  `<li><a href="${SITE}/blog/${esc(p.slug)}">${esc(p.title)}</a> — ${esc(p.description)}</li>`
              )
              .join("\n            ")}
          </ul>
        </article>`;
}

/**
 * Body first, then head: head injection shifts every later offset, so the
 * index-based swap of the #aeo-static block has to happen against the
 * untouched template.
 */
async function writePage(template, aeo, { route, body, ...head }) {
  const openTag = template.slice(aeo.start, template.indexOf(">", aeo.start) + 1);
  const withBody =
    template.slice(0, aeo.start) +
    openTag +
    "\n        " +
    extractNetlifyForm(template, aeo) +
    "\n        " +
    body +
    "\n      </div>" +
    template.slice(aeo.end);

  const html = buildHead(withBody, head);
  const dir = path.join(DIST, route);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
  return path.relative(DIST, path.join(dir, "index.html"));
}

const TOML = path.join(ROOT, "netlify.toml");
const BEGIN = "# BEGIN generated blog routes (scripts/prerender.mjs) — do not edit by hand";
const END = "# END generated blog routes";

/**
 * Extensionless URLs (the form used in sitemap.xml) do not reliably resolve to
 * a directory's index.html, so emit an explicit 200 rewrite per route. These
 * sit above the catch-all, and an unknown slug matches nothing here and still
 * falls through to the SPA, which soft-redirects it to /blog as before.
 *
 * netlify.toml is read before the build runs, so this block has to be
 * committed — the build fails loudly if it is stale.
 */
async function syncNetlifyRoutes(routes) {
  const block = [
    BEGIN,
    ...routes.map(
      (r) => `[[redirects]]\n  from = "/${r}"\n  to = "/${r}/index.html"\n  status = 200`
    ),
    END,
  ].join("\n\n");

  const toml = await fs.readFile(TOML, "utf8");
  const i = toml.indexOf(BEGIN);
  const j = toml.indexOf(END);

  let next;
  if (i !== -1 && j !== -1) {
    next = toml.slice(0, i) + block + toml.slice(j + END.length);
  } else {
    // Insert above the catch-all so the generated rules match first.
    const anchor = toml.indexOf('[[redirects]]\n  from = "/*"');
    if (anchor === -1) throw new Error("catch-all redirect not found in netlify.toml");
    next = toml.slice(0, anchor) + block + "\n\n" + toml.slice(anchor);
  }

  if (next === toml) return false;
  await fs.writeFile(TOML, next, "utf8");
  return true;
}

async function main() {
  const templatePath = path.join(DIST, "index.html");
  const template = await fs.readFile(templatePath, "utf8");
  const aeo = findAeoBlock(template);
  if (!aeo) {
    console.error("[prerender] #aeo-static block not found in dist/index.html — skipping.");
    process.exitCode = 1;
    return;
  }

  const posts = await loadPosts();
  const written = [];

  written.push(
    await writePage(template, aeo, {
      route: "blog",
      url: `${SITE}/blog`,
      title: "ArcAI Guides — answers about features, pricing and comparisons",
      description:
        "Guides and FAQs about ArcAI: what it is, how it compares to ChatGPT, Gemini and Claude, and how voice, memory, images and code work.",
      keywords: "ArcAI guides, ArcAI FAQ, AI assistant guides, ArcAI vs ChatGPT, ArcAI vs Gemini",
      type: "website",
      ld: [
        {
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "ArcAI Guides",
          url: `${SITE}/blog`,
          blogPost: posts.map((p) => ({
            "@type": "BlogPosting",
            headline: p.title,
            description: p.description,
            datePublished: p.updated,
            dateModified: p.updated,
            url: `${SITE}/blog/${p.slug}`,
          })),
        },
      ],
      body: indexBody(posts),
    })
  );

  for (const post of posts) {
    const url = `${SITE}/blog/${post.slug}`;
    written.push(
      await writePage(template, aeo, {
        route: path.join("blog", post.slug),
        url,
        title: `${post.title} | ArcAI`,
        description: post.description,
        keywords: post.keywords.join(", "),
        type: "article",
        ld: postSchema(post, url),
        body: postBody(post, url),
      })
    );
  }

  console.log(`[prerender] wrote ${written.length} static pages:`);
  for (const f of written) console.log(`  ${f}`);

  const routes = ["blog", ...posts.map((p) => `blog/${p.slug}`)];
  if (await syncNetlifyRoutes(routes)) {
    console.error(
      "\n[prerender] netlify.toml blog routes were stale and have been regenerated.\n" +
        "[prerender] Commit netlify.toml and rebuild — Netlify reads it before the build,\n" +
        "[prerender] so this deploy would serve the SPA shell for blog URLs."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[prerender] failed:", err);
  process.exit(1);
});
