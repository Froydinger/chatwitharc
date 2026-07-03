import { useEffect } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BLOG_POSTS, getPostBySlug } from "@/content/blog/posts";

const SITE = "https://askarc.chat";

export function BlogPostPage() {
  const { slug = "" } = useParams();
  const post = getPostBySlug(slug);

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

  if (!post) return <Navigate to="/blog" replace />;

  const handleTry = () => {
    window.dispatchEvent(new CustomEvent("auth-gate-feature", { detail: { feature: "generic" } }));
  };

  const url = `${SITE}/blog/${post.slug}`;

  const jsonLd = [
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

  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 4);

  return (
    <div className="min-h-screen w-full bg-[hsl(0_0%_4%)] text-white">
      <Helmet>
        <title>{post.title} | ArcAI</title>
        <meta name="description" content={post.description} />
        <meta name="keywords" content={post.keywords.join(", ")} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="article" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.description} />
        {jsonLd.map((ld, i) => (
          <script key={i} type="application/ld+json">
            {JSON.stringify(ld)}
          </script>
        ))}
      </Helmet>

      <header className="flex items-center justify-between px-6 pb-5 safe-area-top-nav md:px-12">
        <Link to="/blog" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">All guides</span>
        </Link>
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/arc-logo-ui.png" alt="ArcAI logo" className="h-7 w-7" />
          <span className="text-base font-semibold">ArcAI</span>
        </Link>
      </header>

      <article className="mx-auto max-w-3xl px-6 pb-16 pt-8">
        <div className="text-xs uppercase tracking-widest text-white/40">Guide</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">{post.title}</h1>
        <p className="mt-5 text-lg text-white/60">{post.intro}</p>

        {post.body && (
          <div className="mt-6 space-y-4 text-base leading-relaxed text-white/68">
            {post.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            onClick={handleTry}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-transform hover:scale-[1.02]"
          >
            {post.cta}
            <ArrowRight className="h-4 w-4" />
          </button>
          <span className="text-xs text-white/40">Free account · No credit card</span>
        </div>

        <div className="mt-14 space-y-10">
          {post.faq.map((f) => (
            <section key={f.q}>
              <h2 className="text-2xl font-semibold tracking-tight">{f.q}</h2>
              <p className="mt-3 leading-relaxed text-white/70">{f.a}</p>
              {f.details?.map((detail) => (
                <p key={detail} className="mt-3 leading-relaxed text-white/62">
                  {detail}
                </p>
              ))}
              {f.bullets && (
                <ul className="mt-4 space-y-2 text-sm text-white/62">
                  {f.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/[0.45]" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Mid-post glorified CTA */}
        <div className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <div className="text-2xl font-semibold tracking-tight">Ready to try Arc?</div>
          <p className="mt-2 text-sm text-white/[0.55]">
            Free forever. Voice, images, code and memory included.
          </p>
          <button
            onClick={handleTry}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-transform hover:scale-[1.02]"
          >
            {post.cta}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-16">
          <h3 className="text-sm uppercase tracking-widest text-white/40">Related guides</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/blog/${r.slug}`}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06]"
              >
                <div className="text-sm font-medium leading-snug">{r.title}</div>
              </Link>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}

export default BlogPostPage;
