import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Sparkles,
  MessageSquare,
  Mic,
  Image as ImageIcon,
  Code2,
  Brain,
  Coffee,
} from "lucide-react";
import { BLOG_POSTS } from "@/content/blog/posts";
import { SUPPORT_URL } from "@/lib/support";
import { useAuth } from "@/hooks/useAuth";

const SITE = "https://askarc.chat";

const LANDING_FAQ = [
  {
    q: "What is ArcAI?",
    a: "ArcAI is a multimodal AI assistant built on the three pillars of productivity: Ask, Reflect, and Create (ARC). It features reasoning chat, voice mode, image generation, a code canvas, and long-term memory, all in your browser.",
  },
  {
    q: "Is ArcAI free?",
    a: "Yes. Our free tier includes unlimited chats with GPT-5.4 Nano, 20 chats/day with GPT-5.4 Mini, Deep Search, canvases, memory, and basic image generation. Upgrade to Boost for unlimited advanced reasoning models (GPT-5.4 Thinking & GPT-5.5 Deep Think), unlimited voice, higher image quotas, and custom web publishing.",
  },
  {
    q: "Is there a paid tier?",
    a: "Yes. We offer a Boost upgrade for $10/month (or $65/year) that unlocks unlimited premium reasoning chats, unlimited voice, full image editing, higher image quotas (20 GPT-Image-2 outputs/day), and live web app publishing.",
  },
  {
    q: "Is ArcAI a free ChatGPT alternative?",
    a: "Yes. ArcAI is a powerful alternative to ChatGPT, Gemini and Claude, offering a robust free plan with reasoning models, search citations, canvases, and long-term memory.",
  },
  {
    q: "Do I need to sign up?",
    a: "Yes. A free account is required to chat so your history, memory, files, canvases and settings stay securely tied to you from your very first message.",
  },
  {
    q: "Which AI models power ArcAI?",
    a: "We route requests to best-in-class models: GPT-5.4 (Thinking) and GPT-5.5 (Deep Think) for advanced reasoning, GPT-5.4 Nano and Mini for everyday chats, GPT-Image-2 for images, OpenAI Realtime for voice, and Perplexity Sonar for web search.",
  },
  {
    q: "Is ArcAI private?",
    a: "Yes. Your chats sync to your private account and you can completely wipe your chat history and memory from settings in a single click.",
  },
  {
    q: "Does Arc remember me across devices?",
    a: "Yes. With a secure unified profile, your custom memory, files, and preferred settings follow you everywhere, ensuring Arc reflects on your exact context no matter where you sign in.",
  },
  {
    q: "Can ArcAI generate images?",
    a: "Yes. Free accounts receive GPT-Image-1 Mini (40 outputs/day), GPT-Image-1 (10 outputs/day), and 3 free premium GPT-Image-2 outputs. Boost accounts unlock 20 premium GPT-Image-2 outputs per day and full editing features.",
  },
  {
    q: "Does ArcAI have voice mode?",
    a: "Yes. Voice mode is available, providing low-latency spoken conversations with multiple natural voices. Unlimited voice mode is included on the Boost tier.",
  },
  {
    q: "Can ArcAI write code?",
    a: "Yes. The code canvas generates functional web apps with a live preview. Boost users can also publish their creations online to a public custom link.",
  },
];

export function LandingPage() {
  const { user, isAnonymous } = useAuth();
  const navigate = useNavigate();

  // Force pure-dark theme regardless of user preference on the lander.
  useEffect(() => {
    const root = document.documentElement;
    const hadLight = root.classList.contains("light");
    if (hadLight) {
      root.classList.remove("light");
      root.classList.add("dark");
    }
    return () => {
      // Revert if user had light mode
      if (hadLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      }
    };
  }, []);

  const handleTry = () => {
    if (user && !isAnonymous) {
      navigate("/");
    } else {
      window.dispatchEvent(
        new CustomEvent("auth-gate-feature", {
          detail: { feature: "generic" },
        })
      );
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-x-hidden relative selection:bg-white/20 selection:text-white">
      {/* Structural visual grid / blobs */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[40%] left-[-20%] w-[80%] h-[80%] rounded-full bg-white/[0.02] blur-[140px] animate-float" style={{ animationDuration: "12s" }} />
        <div className="absolute top-[20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-white/[0.015] blur-[120px] animate-float" style={{ animationDuration: "16s", animationDelay: "2s" }} />
        <div className="absolute bottom-[-20%] left-[10%] w-[50%] h-[50%] rounded-full bg-white/[0.01] blur-[100px] animate-float" style={{ animationDuration: "10s", animationDelay: "1s" }} />
      </div>

      <header 
        className="relative z-10 flex items-center justify-between px-6 pb-5 mx-auto max-w-6xl border-b border-white/[0.06]"
        style={{
          paddingTop: `calc(env(safe-area-inset-top, 0px) + 1.25rem)`
        }}
      >
        <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <span className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <img src="/arc-logo-ui.png" alt="ArcAI" className="w-10 h-10 object-contain" />
            ArcAI
          </span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link to="/blog" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Blog
          </Link>
          <Link to="/pricing" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Pricing
          </Link>
          <Link to="/support" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Help
          </Link>
          <button
            onClick={handleTry}
            className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Try free
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-20 pb-24 text-center md:pt-32 md:pb-32">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 animate-in fade-in zoom-in-95 duration-500">
          <Sparkles className="h-3.5 w-3.5" /> Ask, Reflect, Create
        </div>
        <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl lg:text-8xl animate-in fade-in slide-in-from-bottom-3 duration-700">
          Ask. Reflect. Create.
        </h1>
        <p
          className="mx-auto mt-6 max-w-xl text-lg text-white/60 md:text-xl animate-in fade-in slide-in-from-bottom-3 duration-700"
          style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
        >
          Your new favorite personal assistant, that actually knows who you are.
        </p>
        <div
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row animate-in fade-in slide-in-from-bottom-3 duration-700"
          style={{ animationDelay: "220ms", animationFillMode: "backwards" }}
        >
          <button
            onClick={handleTry}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-black transition-transform hover:scale-[1.03] active:animate-jelly"
          >
            Try Arc free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/[0.03] px-6 py-3 text-base font-medium text-white/90 hover:bg-white/[0.07] transition-colors"
          >
            <Coffee className="h-4 w-4" /> Support ArcAI
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          A Sanctuary for Your Thoughts and Creations
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/50">
          Simple on the outside, deeply capable on the inside, and completely free.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { category: "Ask", icon: MessageSquare, title: "Advanced Reasoning", body: "Choose between GPT-5.4 (Thinking) and GPT-5.5 (Deep Think) models to solve your most complex problems with ultimate depth." },
            { category: "Ask", icon: Sparkles, title: "Deep Search", body: "Scan the live web instantly, gathering real-time summaries and citations to find the truth behind any query." },
            { category: "Reflect", icon: Brain, title: "Deep Cross-Session Memory", body: "Arc is built to reflect and remember. It automatically builds a persistent Memory Bank of your preferences, goals, and facts across sessions, recalling context so it genuinely knows who you are." },
            { category: "Reflect", icon: Mic, title: "Spoken Voice & Music", body: "Speak out loud with zero-latency audio or focus with custom ambient music tracks built directly into your workspace." },
            { category: "Create", icon: Code2, title: "Code Canvas", body: "Turn thoughts into running web apps instantly, with a visual canvas to preview, build, and publish your creations." },
            { category: "Create", icon: ImageIcon, title: "Image Studio", body: "Create custom images and art with state-of-the-art vision models, bringing visual ideas to life in seconds." },
          ].map((f, i) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-all hover:bg-white/[0.06] hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
            >
              <div className="flex items-center justify-between mb-4">
                <f.icon className="h-5 w-5 text-white/70" />
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border",
                  f.category === "Ask" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                  f.category === "Reflect" && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                  f.category === "Create" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                )}>
                  {f.category}
                </span>
              </div>
              <div className="text-base font-medium">{f.title}</div>
              <div className="mt-1 text-sm text-white/[0.55]">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Optional Upgrade */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.12] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-8 md:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/[0.06] blur-3xl animate-float"
            style={{ animationDuration: "9s" }}
          />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/[0.05] px-3 py-1 text-xs text-white/80">
              <Sparkles className="h-3.5 w-3.5" /> Optional Boost Tier
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Free is powerful. <span className="text-white/70">Boost is optional.</span>
            </h2>
            <p className="mt-3 max-w-xl text-white/60">
              Arc is built to be a safe, helpful hub for everyone. The free plan has no catch, you get memory, real-time voice, search, and coding out of the box. Upgrade to Boost for $10/month only if you want to publish creations to public custom links or need higher quotas.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { icon: ImageIcon, title: "10 free images a day", body: "Generate and edit up to 10 images daily for free, or 30 with Boost." },
                { icon: Mic, title: "Unlimited voice & audio", body: "Speak naturally with instant spoken audio, free and open to everyone." },
                { icon: Sparkles, title: "20 Smarter chats a day", body: "Get 20 complex reasoning chats per day on free, or go unlimited with Boost." },
                { icon: Code2, title: "Publish code online", body: "Share your canvases and running web creations with custom Arc links on Boost." },
              ].map((b) => (
                <div
                  key={b.title}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="mt-0.5 rounded-lg bg-white/10 p-2">
                    <b.icon className="h-4 w-4 text-white/[0.85]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{b.title}</div>
                    <div className="text-xs text-white/[0.55]">{b.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:scale-[1.02] transition-transform"
              >
                View pricing plans
              </Link>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
              >
                Support Win The Night voluntarily →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          A companion, not just a chatbot.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/[0.55]">
          Arc gives you the premium features other platforms hide behind paywalls, in a space that feels like home.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { name: "vs ChatGPT", link: "/blog/free-chatgpt-alternative" },
            { name: "vs Gemini", link: "/blog/free-gemini-alternative" },
            { name: "vs Claude", link: "/blog/free-claude-alternative" },
          ].map((c, i) => (
            <Link
              key={c.name}
              to={c.link}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center transition-all hover:bg-white/[0.06] hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}
            >
              <div className="text-lg font-medium">ArcAI {c.name}</div>
              <div className="mt-1 text-sm text-white/50">Read the comparison →</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Visible FAQ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Common questions
        </h2>
        <div className="mt-10 divide-y divide-white/[0.08] rounded-2xl border border-white/10 bg-white/[0.02]">
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
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="flex items-end justify-between">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Guides & FAQs</h2>
          <Link to="/blog" className="text-sm text-white/60 hover:text-white transition-colors">
            All guides →
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {BLOG_POSTS.slice(0, 6).map((p, i) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:bg-white/[0.06] hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-500"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
            >
              <div className="text-base font-medium leading-tight">{p.title}</div>
              <div className="mt-2 text-sm text-white/[0.55] line-clamp-2">{p.description}</div>
              <div className="mt-4 text-xs text-white/40 transition-colors group-hover:text-white/70">
                Read →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-16 pb-24 text-center">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Find your creative center.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-white/[0.55]">
          Enjoy 20 daily reasoning chats, 10 images, and unlimited voice conversations forever. Your safe hub for thinking is just one click away.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={handleTry}
            className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-medium text-black transition-transform hover:scale-[1.03]"
          >
            Try Arc free
            <ArrowRight className="h-4 w-4" />
          </button>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] px-7 py-3.5 text-base font-medium text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <Coffee className="h-4 w-4" /> Support Win The Night
          </a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.08] px-6 py-10 text-center text-xs text-white/40">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/blog" className="hover:text-white">Guides</Link>
          <span>·</span>
          <Link to="/pricing" className="hover:text-white">Pricing</Link>
          <span>·</span>
          <Link to="/support" className="hover:text-white">Help</Link>
          <span>·</span>
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-white">Terms</Link>
        </div>
        <div className="mt-3 opacity-60">© {new Date().getFullYear()} ArcAI by Win The Night™ Foundation</div>
      </footer>
    </div>
  );
}

export default LandingPage;
