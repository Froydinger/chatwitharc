## Goal

Rank ArcAI for "ArcAI", "Ask Arc", "free AI assistant", "free ChatGPT alternative", "free Gemini alternative", "free GPT alternative" — via a real landing page + blog with heavy AEO markup, without regressing the current auto-anon chat UX.

## 1. Anon routing

- `/` route: if user is signed-out AND not yet anonymous → show new `LandingPage`. If signed-in OR already anonymous with any chat activity → existing chat (`Index`).
- Auto-anon sign-in still fires in the background on lander mount, so the "Try Arc free" CTA drops them straight into `/chat` with zero wait.
- Explicit `/welcome` route also renders `LandingPage` (for direct links / SEO fallback).

## 2. Landing page facelift

Rebuild the retired `LandingScreen` as `src/pages/LandingPage.tsx`:

- Pure dark theme (bg `hsl(0 0% 4%)`, no starfield, no blue wash). Force `.dark` class on this route regardless of themeMode.
- Sections (in order): Hero (headline + subhead + "Try Arc free" + "Sign in"), Feature grid (Chat / Voice / Images / Code / Memory), "Free alternative to…" comparison strip (ChatGPT / Gemini / Claude), FAQ accordion (12 Q&As), Blog teaser grid (latest 6 posts), Footer.
- Copy is keyword-dense but human: H1 "ArcAI — the free AI assistant that actually remembers you", H2s using target phrases naturally.
- Reuses existing glass tokens; no new design system.

## 3. Blog (15 FAQ-style posts)

- Content lives in `src/content/blog/posts.ts` as typed data (title, slug, description, question, answer sections, faq[], updated date, keywords). No CMS.
- Routes: `/blog` (index grid) and `/blog/:slug` (post).
- Every post is structured as: intro → 4-6 H2 questions → each answers with a short paragraph + concise bullet answer for AI extraction → "Try ArcAI free" CTA button (the "glorified CTA" you called for).
- Seed slugs: `what-is-arcai`, `free-chatgpt-alternative`, `free-gemini-alternative`, `free-gpt-4-alternative`, `free-claude-alternative`, `best-free-ai-assistant-2026`, `free-ai-with-voice`, `free-ai-image-generator`, `ai-that-remembers-conversations`, `ask-arc-what-is-it`, `arcai-vs-chatgpt`, `arcai-vs-gemini`, `free-ai-for-coding`, `free-ai-for-writing`, `how-to-use-arcai-free`.

## 4. Hidden AEO for crawlers

Two mechanisms, both invisible to sighted users but readable by Googlebot/GPTBot/etc:

- `<div className="sr-only">` blocks (already screen-reader friendly, indexed by crawlers) containing: definitional paragraphs ("ArcAI is a free AI assistant…"), the full FAQ text on the landing page, and a hidden internal-link block linking every blog post from the landing footer. This is the "clever way to link to each post from lander" you asked for.
- Rich JSON-LD in `<Helmet>` on each page: `Organization` + `WebSite` + `SoftwareApplication` on lander, `FAQPage` on lander & posts, `Article` + `BreadcrumbList` on posts, `ItemList` on blog index.

## 5. Head metadata

- Add `RouteSEO` entries for `/blog`, `/blog/:slug`, `/welcome`.
- Each blog post owns its own `<Helmet>` with title, description, canonical, og:*, and JSON-LD.
- Sitewide `SoftwareApplication` JSON-LD added to `index.html`.

## 6. Sitemap + robots

- Extend `public/sitemap.xml` with `/welcome`, `/blog`, and all 15 blog URLs.
- `robots.txt` already permissive — leave as-is.

## 7. In-app blog links

- Settings panel footer: new "Resources" row with "Guides & FAQs" → `/blog`.
- Dashboard: small subtle "Guides" link in the dashboard footer strip.

## 8. Files

**New:**
- `src/pages/LandingPage.tsx`
- `src/pages/BlogIndexPage.tsx`
- `src/pages/BlogPostPage.tsx`
- `src/content/blog/posts.ts` (data + types)
- `src/components/landing/*` (Hero, FeatureGrid, ComparisonStrip, FaqAccordion, HiddenAEO, BlogTeaser, LandingFooter)

**Edited:**
- `src/App.tsx` — add routes, force-dark wrapper for lander/blog
- `src/pages/Index.tsx` — redirect logic: anon-with-no-history → `/welcome` gate handled at route level, so this stays lean
- `src/components/RouteSEO.tsx` — new entries
- `src/components/SettingsPanel.tsx` — Resources row
- `src/pages/DashboardPage.tsx` — Guides link
- `public/sitemap.xml` — add 17 URLs
- `index.html` — add SoftwareApplication JSON-LD

## Out of scope

- No new backend tables (blog is static data — faster, zero-cost, perfect for AEO).
- No changes to auth, chat, edge functions, or the SQL schema.
- No new fonts, no design-system overhaul.
- Signed-in users' current `/` behavior is unchanged.
