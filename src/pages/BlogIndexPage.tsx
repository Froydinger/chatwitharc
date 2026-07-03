import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import { BLOG_POSTS } from "@/content/blog/posts";

const SITE = "https://askarc.chat";

export function BlogIndexPage() {
  // Force dark for the marketing surface.
  useEffect(() => {
    const root = document.documentElement;
    const hadLight = root.classList.contains("light");
    root.classList.remove("light");
    root.classList.add("dark");
    return () => {
      if (hadLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      }
    };
  }, []);

  const listJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: BLOG_POSTS.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE}/blog/${p.slug}`,
      name: p.title,
    })),
  };

  return (
    <div className="min-h-screen w-full bg-[hsl(0_0%_4%)] text-white">
      <Helmet>
        <title>ArcAI Guides & FAQs — Free AI Assistant</title>
        <meta
          name="description"
          content="Guides and FAQs about ArcAI, the free AI assistant with voice, image generation, code and memory."
        />
        <link rel="canonical" href={`${SITE}/blog`} />
        <meta property="og:title" content="ArcAI Guides & FAQs" />
        <meta property="og:url" content={`${SITE}/blog`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(listJsonLd)}</script>
      </Helmet>

      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back</span>
        </Link>
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/arc-logo-ui.png" alt="ArcAI logo" className="h-7 w-7" />
          <span className="text-base font-semibold">ArcAI</span>
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-8">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Guides & FAQs</h1>
        <p className="mt-4 max-w-2xl text-white/60">
          Everything you might want to know about ArcAI — the free AI assistant with voice, image
          generation, code and memory.
        </p>

        <div className="mt-12 space-y-3">
          {BLOG_POSTS.map((p) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              className="group block rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.06]"
            >
              <div className="text-lg font-medium leading-snug">{p.title}</div>
              <div className="mt-2 text-sm text-white/55">{p.description}</div>
              <div className="mt-3 text-xs text-white/40 transition-colors group-hover:text-white/70">
                Read →
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

export default BlogIndexPage;
