import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Mic, Image as ImageIcon, Code2, Brain, MessageSquare, Sparkles } from "lucide-react";
import { ensureAnonSession } from "@/hooks/useAuth";
import { BLOG_POSTS } from "@/content/blog/posts";

const SITE = "https://askarc.chat";

// FAQ that also lives inside <FAQPage> JSON-LD and .sr-only text.
const LANDING_FAQ = [
  {
    q: "What is ArcAI?",
    a: "ArcAI is a free multimodal AI assistant with chat, real-time voice, image generation, a code canvas, and long-term memory — all in your browser at askarc.chat.",
  },
  {
    q: "Is ArcAI free?",
    a: "Yes, ArcAI is free forever. Unlimited chat, 10 image generations per day, 10 voice conversations per month, web search, document analysis, memory and code generation are included. ArcAI Boost ($7/month) unlocks unlimited images, unlimited voice, and one-tap publishing.",
  },
  {
    q: "Is ArcAI a free ChatGPT alternative?",
    a: "Yes. ArcAI is a free alternative to ChatGPT, Gemini and Claude that adds voice, image generation and true persistent memory on the free tier.",
  },
  {
    q: "Do I need to sign up?",
    a: "No signup required to chat. Sign in to save history and unlock voice, memory, and canvases.",
  },
  {
    q: "Which AI models power ArcAI?",
    a: "GPT-5.4 Mini and Nano for chat and code, GPT-Image-2 for images, OpenAI Realtime for voice, and Perplexity Sonar for web search.",
  },
  {
    q: "Is ArcAI private?",
    a: "Yes. Your chats sync to your private account and you can wipe everything from settings in one click.",
  },
  {
    q: "Does ArcAI remember conversations?",
    a: "Yes. Signed-in users get a persistent Memory Bank that Arc reads before every reply.",
  },
  {
    q: "Can ArcAI generate images?",
    a: "Yes — 10 free images per day using GPT-Image-2, unlimited on Boost.",
  },
  {
    q: "Does ArcAI have voice mode?",
    a: "Yes. Real-time voice conversations powered by OpenAI Realtime, free for 10 conversations per month.",
  },
  {
    q: "Can ArcAI write code?",
    a: "Yes. The code canvas generates functional web apps with a live preview, and Boost adds one-tap publishing to a live URL.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();

  // Force pure-dark theme regardless of user preference on the lander.
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

  // Warm the anon session in the background so "Try Arc free" is instant.
  useEffect(() => {
    ensureAnonSession().catch(() => {});
  }, []);

  const handleTry = async () => {
    // Fire and forget — session usually already warmed by mount effect.
    ensureAnonSession().catch(() => {});
    navigate("/");
    // Force reload into chat: Index re-renders once user is set.
    setTimeout(() => {
      if (window.location.pathname === "/welcome") {
        navigate("/");
      }
    }, 50);
  };

  const faqJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: LANDING_FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    }),
    [],
  );

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ArcAI",
    alternateName: ["Ask Arc", "Arc AI"],
    url: SITE,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS, Android, macOS, Windows",
    description:
      "Free multimodal AI assistant with real-time voice, image generation, code canvas and persistent memory.",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "ArcAI Boost", price: "7", priceCurrency: "USD" },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
      bestRating: "5",
    },
  };

  return (
    <div className="min-h-screen w-full bg-[hsl(0_0%_4%)] text-white">
      <Helmet>
        <title>ArcAI — Free AI Assistant with Voice, Images & Memory | Ask Arc</title>
        <meta
          name="description"
          content="ArcAI is a free AI assistant with real-time voice, image generation, code canvas and long-term memory. A free ChatGPT, Gemini and Claude alternative — no signup required."
        />
        <link rel="canonical" href={`${SITE}/`} />
        <meta property="og:title" content="ArcAI — Free AI Assistant with Voice, Images & Memory" />
        <meta
          property="og:description"
          content="Free multimodal AI assistant. Voice, images, code, memory. Try Arc free at askarc.chat."
        />
        <meta property="og:url" content={`${SITE}/`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(softwareJsonLd)}</script>
      </Helmet>

      {/* Hidden AEO block — crawlers see this, sighted users don't */}
      <div className="sr-only" aria-hidden="false">
        <h1>ArcAI — the free AI assistant that remembers you</h1>
        <p>
          ArcAI (also known as Ask Arc) is a free multimodal AI assistant available at askarc.chat.
          It combines chat with GPT-class models, real-time voice conversations, AI image generation
          with GPT-Image-2, a code canvas, document analysis, web search with citations, and
          persistent long-term memory. ArcAI is a free alternative to ChatGPT, Google Gemini,
          Anthropic Claude, Microsoft Copilot and Perplexity. No credit card, no signup required to
          start chatting. Optional ArcAI Boost upgrade is $7 per month for unlimited images,
          unlimited voice, and one-tap web publishing.
        </p>
        <h2>Frequently asked questions about ArcAI</h2>
        <dl>
          {LANDING_FAQ.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
        <h2>ArcAI guides and articles</h2>
        <ul>
          {BLOG_POSTS.map((p) => (
            <li key={p.slug}>
              <Link to={`/blog/${p.slug}`}>{p.title}</Link> — {p.description}
            </li>
          ))}
        </ul>
      </div>

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2.5">
          <img src="/arc-logo-ui.png" alt="ArcAI logo" className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">ArcAI</span>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/blog" className="rounded-full px-3 py-1.5 text-white/70 hover:text-white transition-colors">
            Guides
          </Link>
          <Link to="/pricing" className="rounded-full px-3 py-1.5 text-white/70 hover:text-white transition-colors">
            Pricing
          </Link>
          <button
            onClick={handleTry}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-white/90 transition-colors"
          >
            Try free
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pt-20 pb-24 text-center md:pt-32 md:pb-32">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <Sparkles className="h-3.5 w-3.5" /> Free forever · No credit card
        </div>
        <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight md:text-7xl">
          The free AI assistant that actually remembers you.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60 md:text-xl">
          Chat, real-time voice, image generation, code and long-term memory — all in one browser
          app. A free alternative to ChatGPT, Gemini and Claude.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={handleTry}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-black transition-transform hover:scale-[1.02]"
          >
            Try Arc free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-base font-medium text-white/90 hover:bg-white/5 transition-colors"
          >
            Read the guides
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Everything paid AI has. Free.
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: MessageSquare, title: "Unlimited chat", body: "Ask anything. GPT-class models, no message wall." },
            { icon: Mic, title: "Real-time voice", body: "Natural spoken conversations with interruptions." },
            { icon: ImageIcon, title: "AI image generation", body: "10 free images a day with GPT-Image-2." },
            { icon: Code2, title: "Code canvas", body: "Generate and preview working web apps in-browser." },
            { icon: Brain, title: "Long-term memory", body: "Arc actually remembers what you told it." },
            { icon: Sparkles, title: "Web search with sources", body: "Live answers with citations, powered by Perplexity." },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.05]"
            >
              <f.icon className="mb-4 h-5 w-5 text-white/70" />
              <div className="text-base font-medium">{f.title}</div>
              <div className="mt-1 text-sm text-white/55">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          A free alternative to the big ones.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/55">
          Free access to features ChatGPT, Gemini and Claude gate behind subscriptions.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { name: "vs ChatGPT", link: "/blog/free-chatgpt-alternative" },
            { name: "vs Gemini", link: "/blog/free-gemini-alternative" },
            { name: "vs Claude", link: "/blog/free-claude-alternative" },
          ].map((c) => (
            <Link
              key={c.name}
              to={c.link}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center transition-colors hover:bg-white/[0.06]"
            >
              <div className="text-lg font-medium">ArcAI {c.name}</div>
              <div className="mt-1 text-sm text-white/50">Read the comparison →</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Visible FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Common questions
        </h2>
        <div className="mt-10 divide-y divide-white/8 rounded-2xl border border-white/10 bg-white/[0.02]">
          {LANDING_FAQ.map((f) => (
            <details key={f.q} className="group px-6 py-5">
              <summary className="cursor-pointer list-none text-base font-medium text-white/90 marker:hidden">
                {f.q}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Blog teaser */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex items-end justify-between">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Guides & FAQs</h2>
          <Link to="/blog" className="text-sm text-white/60 hover:text-white transition-colors">
            All guides →
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {BLOG_POSTS.slice(0, 6).map((p) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.06]"
            >
              <div className="text-base font-medium leading-tight">{p.title}</div>
              <div className="mt-2 text-sm text-white/55 line-clamp-2">{p.description}</div>
              <div className="mt-4 text-xs text-white/40 transition-colors group-hover:text-white/70">
                Read →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-24 text-center">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Try it. It's really free.
        </h2>
        <button
          onClick={handleTry}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-medium text-black transition-transform hover:scale-[1.02]"
        >
          Try Arc free
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      <footer className="border-t border-white/8 px-6 py-10 text-center text-xs text-white/40">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/blog" className="hover:text-white">Guides</Link>
          <span>·</span>
          <Link to="/pricing" className="hover:text-white">Pricing</Link>
          <span>·</span>
          <Link to="/support" className="hover:text-white">Support</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-white">Terms</Link>
        </div>
        <div className="mt-3 opacity-60">© {new Date().getFullYear()} ArcAI by Win The Night Productions</div>
      </footer>
    </div>
  );
}

export default LandingPage;
