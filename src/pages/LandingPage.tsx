import { useSubscription } from '@/hooks/useSubscription';
import { BoostIcon } from '@/components/BoostIcon';
import { InstalledWelcomePage } from '@/pages/InstalledWelcomePage';
import { isInstalledAppRuntime } from '@/lib/installedAppRuntime';
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  Sparkles,
  MessageSquare,
  Mic,
  Image as ImageIcon,
  Code2,
  Brain,
  Download,
  Search,
} from "lucide-react";
import { AppleLogo } from "@/components/icons/AppleLogo";
import { BLOG_POSTS } from "@/content/blog/posts";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ANDROID_APK_URL } from "@/lib/androidDownload";
import { BOOST_NEW_SUBSCRIBER_PRICE_COPY } from "@/lib/boostPricing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SITE = "https://askarc.chat";

const LANDING_FAQ = [
  {
    q: "What is ArcAI?",
    a: "ArcAI is your personal AI agent for Ask, Reflect, and Create, founded and created by Win The Night™ Foundation. Arc brings tools and living memory into chat, voice, research, images, and code. With Boost, Arc Work carries out longer tasks in the cloud and App Builder turns your ideas into working apps.",
  },
  {
    q: "Is ArcAI free?",
    a: "Yes. Free includes unlimited GPT 6 Luna, Auto, a GPT 6.1 Sol allowance, Canvas, living memory, 30 GPT 2.5 Flare image outputs per UTC calendar month, research, GitHub Normal, and 3 voice sessions per UTC day up to 10 minutes each. Boost adds a higher Sol allowance, a separate GPT 6 Astra allowance, unlimited research, 250 shared monthly image credits, Arc Work, App Builder, GitHub Pro, and unlimited voice sessions up to 2 hours each.",
  },
  {
    q: "Is there a paid tier?",
    a: `Yes. ${BOOST_NEW_SUBSCRIBER_PRICE_COPY} Boost starts with a 7-day free trial (card required). Luna is unlimited on Free and Boost; Boost adds a higher GPT 6.1 Sol allowance, a separate GPT 6 Astra allowance, Arc Work, App Builder, GitHub Pro, unlimited Deep Search and Ultra Deep Search, 250 shared monthly image credits for generation and editing, and unlimited voice sessions up to 2 hours each.`,
  },
  {
    q: "How does Arc's memory work?",
    a: "Arc keeps one detailed living memory summary that remembers important details, preferences, projects, and facts across conversations. Arc updates it when you tell it to remember, recalls it when relevant, and lets you edit, export, or clear it in one screen.",
  },
  {
    q: "Is ArcAI a free ChatGPT alternative?",
    a: "Yes. ArcAI is a powerful alternative to ChatGPT, Gemini and Claude, offering a robust free plan with Arc Matrix™ intelligence, search citations, canvases, and long-term memory.",
  },
  {
    q: "Do I need to sign up?",
    a: "Yes. A free account is required to chat so your history, memory, files, canvases and settings stay securely tied to you from your very first message.",
  },
  {
    q: "Which AI models power ArcAI?",
    a: "Auto uses GPT 6 Luna for chat and GPT 6.1 Sol for writing, canvas, code and quick web search. You can also choose Luna or Sol directly; reasoning adapts to the task. Boost also includes GPT 6 Astra with a separate usage allowance. App Builder Fast uses Luna; App Builder Pro and GitHub Pro use GPT-6.1 Sol with light reasoning. Images use GPT 2.5 Flare, GPT 2.5 Flare HQ, and GPT 2.5 Sunburst. Natural voice runs through Voxi; live research uses Deep Search.",
  },
  {
    q: "Is ArcAI private?",
    a: "Your chats sync to your private account. You can manage, export or clear your history and memory in Settings, and request account deletion there.",
  },
  {
    q: "Does Arc remember me across devices?",
    a: "Yes. With a secure unified profile, your custom memory, files, and preferred settings follow you everywhere, ensuring Arc reflects on your exact context no matter where you sign in.",
  },
  {
    q: "Can ArcAI generate images?",
    a: "Yes. Free accounts receive 30 GPT 2.5 Flare image outputs per UTC calendar month. Boost accounts receive 250 shared monthly image credits across GPT 2.5 Flare, GPT 2.5 Flare HQ, and GPT 2.5 Sunburst.",
  },
  {
    q: "Does ArcAI have voice mode?",
    a: "Yes. Voice mode provides low-latency, interruptible conversations with Arc using natural voices powered by our Voxi speech engine. Free accounts get 3 voice sessions per UTC day, up to 10 minutes each, while Boost includes unlimited voice sessions up to 2 hours each.",
  },
  {
    q: "Can ArcAI help with code?",
    a: "Yes. Canvas helps with code and prose. GitHub Normal is available on Free and Boost and prepares changes in a connected repository as a branch and pull request. GitHub Pro uses GPT-6.1 Sol with light reasoning and requires Boost.",
  },
];

export function LandingPage() {
  return isInstalledAppRuntime() ? <InstalledWelcomePage /> : <MarketingLandingPage />;
}

function MarketingLandingPage() {
  const { hasBoost, isAdmin } = useSubscription();
  const { user, isAnonymous } = useAuth();
  const navigate = useNavigate();
  const isAndroidBrowser = typeof navigator !== "undefined"
    && /Android/i.test(navigator.userAgent)
    && !window.matchMedia("(display-mode: standalone)").matches
    && !["android-play", "android-direct"].includes(new URLSearchParams(window.location.search).get("source") ?? "");
  const [sendDesktopOpen, setSendDesktopOpen] = useState(false);
  const [desktopEmail, setDesktopEmail] = useState("");
  const [desktopEmailBusy, setDesktopEmailBusy] = useState(false);
  const [desktopEmailSent, setDesktopEmailSent] = useState(false);
  const [desktopEmailError, setDesktopEmailError] = useState<string | null>(null);
  const [desktopDialogViewport, setDesktopDialogViewport] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!sendDesktopOpen) {
      setDesktopDialogViewport(null);
      return;
    }

    const viewport = window.visualViewport;
    const syncViewport = () => {
      if (!window.matchMedia("(max-width: 639px)").matches) {
        setDesktopDialogViewport(null);
        return;
      }

      const top = Math.max(8, viewport?.offsetTop ?? 0) + 8;
      const height = Math.max(180, (viewport?.height ?? window.innerHeight) - 16);
      setDesktopDialogViewport((current) => current?.top === top && current.height === height ? current : { top, height });
    };

    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [sendDesktopOpen]);

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

  const handleGetBoost = () => {
    if (user && !isAnonymous) {
      navigate("/upgrade");
    } else {
      const onAuthCompleted = () => {
        navigate("/upgrade");
        window.removeEventListener("arcai-auth-completed", onAuthCompleted);
      };
      window.addEventListener("arcai-auth-completed", onAuthCompleted);
      window.dispatchEvent(
        new CustomEvent("auth-gate-feature", {
          detail: { feature: "boost" },
        })
      );
    }
  };

  const openSendDesktop = () => {
    setDesktopEmail("");
    setDesktopEmailSent(false);
    setDesktopEmailError(null);
    setSendDesktopOpen(true);
  };

  const handleSendDesktopLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (desktopEmailBusy) return;

    const formData = new FormData(event.currentTarget);
    const company = String(formData.get("company") ?? "");
    setDesktopEmailBusy(true);
    setDesktopEmailError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !publishableKey) throw new Error("Email service is unavailable");

      const response = await fetch(`${supabaseUrl}/functions/v1/send-desktop-link`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: desktopEmail.trim(), company }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as { ok?: boolean } | null;
      if (!response.ok || result?.ok !== true) throw new Error("Email request failed");
      setDesktopEmailSent(true);
    } catch {
      setDesktopEmailError("We couldn't send the link right now. Please try again in a bit.");
    } finally {
      window.clearTimeout(timeout);
      setDesktopEmailBusy(false);
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
          paddingTop: `calc(var(--arcai-safe-area-top) + 1.25rem)`
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
          {isAndroidBrowser ? (
            <a href={ANDROID_APK_URL} download className="hidden items-center gap-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white sm:flex">
              <Download className="h-3.5 w-3.5" /> Download for Android
            </a>
          ) : (
            <Link to="/downloads" className="hidden items-center gap-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white sm:flex">
              <AppleLogo className="h-3.5 w-3.5" /> Download for Mac
            </Link>
          )}
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
          <Sparkles className="h-3.5 w-3.5" /> Powered by GPT 6 &amp; 6.1
        </div>
        <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl lg:text-8xl animate-in fade-in slide-in-from-bottom-3 duration-700">
          Ask. Reflect. Create.
        </h1>
        <p
          className="mx-auto mt-6 max-w-xl text-lg text-white/60 md:text-xl animate-in fade-in slide-in-from-bottom-3 duration-700"
          style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
        >
          Your personal AI agent. Arc remembers your context, researches your questions, and helps turn your ideas into finished work.
        </p>
        <div
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row animate-in fade-in slide-in-from-bottom-3 duration-700"
          style={{ animationDelay: "220ms", animationFillMode: "backwards" }}
        >
          {isAndroidBrowser && (
            <a
              href={ANDROID_APK_URL}
              download
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              <Download className="h-4 w-4" /> Download for Android
              <span className="rounded-full border border-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Beta</span>
            </a>
          )}
          <button
            onClick={handleTry}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium transition-transform hover:scale-[1.03] active:animate-jelly",
              isAndroidBrowser ? "border border-white/[0.15] bg-white/[0.03] text-white" : "bg-white text-black",
            )}
          >
            Try Arc free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={handleGetBoost}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/[0.03] px-6 py-3 text-base font-medium text-white/90 hover:bg-white/[0.07] transition-colors"
          >
            <BoostIcon hasBoost={hasBoost || isAdmin} className="h-4 w-4 text-primary" /> Get Boost
          </button>
          {!isAndroidBrowser && (
            <Link
              to="/downloads"
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/[0.03] px-6 py-3 text-base font-medium text-white/90 transition-colors hover:bg-white/[0.07]"
            >
              <AppleLogo className="h-4 w-4" /> Download for Mac
            </Link>
          )}
          <button
            type="button"
            onClick={openSendDesktop}
            className={cn(
              "items-center gap-2 text-base font-medium text-white/90 sm:hidden",
              isAndroidBrowser
                ? "inline-flex px-3 py-2 text-sm underline underline-offset-4 hover:text-white"
                : "inline-flex rounded-full border border-white/[0.15] bg-white/[0.03] px-6 py-3 transition-colors hover:bg-white/[0.07]",
            )}
          >
            <Mail className="h-4 w-4" /> Send to desktop
          </button>
        </div>
        {isAndroidBrowser && <p className="mt-4 text-xs text-white/50">Direct APK beta · Play beta coming soon</p>}
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          One agent. Room for every idea.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-white/50">
          Ask a question, think it through, or make something. Arc brings the right tools and your context into every step. Start free; unlock Work and App Builder with Boost.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {[
            { category: "Ask", icon: MessageSquare, title: "Arc Matrix™ Inside", body: "Choose Auto, GPT 6 Luna, or GPT 6.1 Sol. Luna is unlimited on Free and Boost. Sol uses your allowance, with more usage on Boost. Boost also includes GPT 6 Astra with a separate allowance." },
            { category: "Ask", icon: Sparkles, title: "Deep Search", body: "Research the live web and check the answer against its sources. Less usage on Free; unlimited Deep Search and Ultra Deep Search on Boost." },
            { category: "Reflect", icon: Brain, title: "Living Cross-Session Memory", body: "Arc keeps one detailed, evolving summary of the preferences, goals, facts, and boundaries you want it to remember, then recalls it when relevant." },
            { category: "Reflect", icon: Mic, title: "Spoken Voice & Music", body: "Talk naturally with the same Arc agent, with tools and memory close at hand. Keep ambient music in your workspace when you want to focus." },
            { category: "Create", icon: Code2, title: "Code Canvas", body: "Canvas and GitHub Normal are available on Free and Boost. Prepare repository changes as a branch and pull request; Boost unlocks GitHub Pro with GPT-6.1 Sol." },
            { category: "Ask", icon: Sparkles, title: "Arc Work · Boost", body: "Available with Boost. Hand Arc a longer task to run in the cloud, with progress in your chat and requests for input when needed." },
            { category: "Create", icon: Code2, title: "App Builder · Boost", body: "Available with Boost. Build, preview, refine, publish or export an app. Fast uses Luna by default; choose Pro for GPT-6.1 Sol with light reasoning." },
            { category: "Create", icon: ImageIcon, title: "Images", body: "Create and edit with GPT 2.5 Flare, Flare HQ, or Sunburst. Free includes 30 Flare image outputs per UTC calendar month; Boost includes 250 shared monthly image credits." },
          ].map((f, i) => (
            <div
              key={f.title}
              className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 transition-all hover:bg-white/[0.06] hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-500 sm:w-[calc(50%_-_6px)] lg:w-[calc(33.333333%_-_8px)]"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
            >
              <div className="flex items-center justify-between mb-4">
                <f.icon className="h-5 w-5 text-white/70" />
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border",
                  f.category === "Ask" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                  f.category === "Reflect" && "bg-neon-500/10 text-neon-400 border-neon-500/20",
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
              <BoostIcon hasBoost={hasBoost || isAdmin} className="h-3.5 w-3.5" /> Optional Boost Tier
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Free is powerful. <span className="text-white/70">Boost is optional.</span>
            </h2>
            <p className="mt-3 max-w-xl text-white/60">
              Free includes unlimited GPT 6 Luna, a GPT 6.1 Sol allowance, living memory, search, coding, and 3 voice sessions per UTC day up to 10 minutes each. Boost adds more Sol usage, a separate GPT 6 Astra allowance, Arc Work, App Builder, GitHub Pro, and unlimited voice sessions up to 2 hours each. Start with a 7-day free trial (card required). {BOOST_NEW_SUBSCRIBER_PRICE_COPY}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { icon: ImageIcon, title: "Create images for free", body: "Create images with less usage on Free, or upgrade to Boost for 250 shared monthly image credits and more models." },
                { icon: Mic, title: "Natural voice conversations", body: "Speak naturally with low-latency, interruptible audio. Free accounts get 3 voice sessions per UTC day, up to 10 minutes each, and Boost includes unlimited live voice sessions up to 2 hours each." },
                { icon: Search, title: "Research with live sources", body: "Deep Search cites live sources; Ultra Deep Search browses and cross-checks first. Less usage on Free; unlimited Deep Search and Ultra Deep Search on Boost." },
                { icon: Code2, title: "GitHub Mode", body: "Normal is available on Free and Boost. Connect a repository for branch-and-pull-request changes; Boost adds Pro with GPT-6.1 Sol." },
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
              <button
                onClick={handleGetBoost}
                className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
              >
                Get Boost upgrade →
              </button>
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
          Give your next idea to Arc.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-white/[0.55]">
          Start free with unlimited GPT 6 Luna, a GPT 6.1 Sol allowance, images, and 3 voice sessions per UTC day up to 10 minutes each. Boost adds more Sol usage, a separate GPT 6 Astra allowance, unlimited research, 250 shared monthly image credits, Arc Work, App Builder, GitHub Pro, and unlimited voice sessions up to 2 hours each.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            onClick={handleTry}
            className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-medium text-black transition-transform hover:scale-[1.03]"
          >
            Try Arc free
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={handleGetBoost}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.15] px-7 py-3.5 text-base font-medium text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <BoostIcon hasBoost={hasBoost || isAdmin} className="h-4 w-4 text-primary" /> Get Boost
          </button>
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
          <span>·</span>
          {isAndroidBrowser ? (
            <a href={ANDROID_APK_URL} download className="hidden hover:text-white sm:inline">Download for Android</a>
          ) : (
            <Link to="/downloads" className="hidden hover:text-white sm:inline">Download for Mac</Link>
          )}
          <span className="hidden sm:inline">·</span>
          <button type="button" onClick={openSendDesktop} className="hover:text-white sm:hidden">Send to desktop</button>
        </div>
        <div className="mt-3 opacity-60">© {new Date().getFullYear()} ArcAI by Win The Night™ Foundation</div>
      </footer>

      <Dialog open={sendDesktopOpen} onOpenChange={setSendDesktopOpen}>
        <DialogContent
          className="glass-card w-[calc(100vw-2rem)] max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain border border-white/10 bg-[#101012] text-white"
          style={desktopDialogViewport ? {
            top: `${desktopDialogViewport.top}px`,
            left: "50%",
            transform: "translateX(-50%)",
            maxHeight: `${desktopDialogViewport.height}px`,
          } : undefined}
        >
          <DialogHeader>
            <DialogTitle>Send ArcAI to your desktop</DialogTitle>
            <DialogDescription className="text-white/60">
              Enter an email you can open on your Mac or Windows computer. We’ll send a link to the desktop downloads.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendDesktopLink} className="space-y-4">
            <label htmlFor="desktop-link-email" className="block text-sm font-medium text-white/80">
              Email address
            </label>
            <Input
              id="desktop-link-email"
              type="email"
              name="email"
              value={desktopEmail}
              onChange={(event) => setDesktopEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={254}
              required
              disabled={desktopEmailBusy || desktopEmailSent}
              className="border-white/15 bg-white/5 text-white placeholder:text-white/35"
            />
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
            />
            <p className="text-xs leading-relaxed text-white/50">
              By requesting this one-time link, you agree to our{" "}
              <Link to="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
                Terms
              </Link>{" "}
              and acknowledge our{" "}
              <Link to="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
                Privacy Notice
              </Link>. This won’t subscribe you to marketing email.
            </p>
            <Button
              type="submit"
              disabled={desktopEmailBusy || desktopEmailSent}
              className="w-full rounded-full bg-white text-black hover:bg-white/90"
            >
              {desktopEmailBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              {desktopEmailBusy ? "Sending…" : desktopEmailSent ? "Link requested" : "Send desktop link"}
            </Button>
            {desktopEmailSent && (
              <p role="status" className="flex items-start gap-2 text-sm text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                If that address can receive ArcAI email, the link is on its way. Check your inbox.
              </p>
            )}
            {desktopEmailError && <p role="alert" className="text-sm text-red-300">{desktopEmailError}</p>}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LandingPage;
