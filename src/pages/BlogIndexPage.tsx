import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Search,
  X,
  Sparkles,
  Compass,
  Scale,
  Code2,
  Volume2,
  Clock,
  BookOpen,
  Rocket,
  Flame,
  Layers,
  ChevronRight,
  Filter,
} from "lucide-react";
import { BLOG_POSTS, BlogPost } from "@/content/blog/posts";
import { GlassCard } from "@/components/ui/glass-card";

const SITE = "https://askarc.chat";

export interface PostCategory {
  id: string;
  label: string;
  badgeClass: string;
  textClass: string;
  icon: React.ElementType;
}

const CATEGORIES: Record<string, PostCategory> = {
  "getting-started": {
    id: "getting-started",
    label: "Getting Started",
    badgeClass: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    textClass: "text-emerald-400",
    icon: Compass,
  },
  comparisons: {
    id: "comparisons",
    label: "Comparisons",
    badgeClass: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
    textClass: "text-cyan-400",
    icon: Scale,
  },
  features: {
    id: "features",
    label: "Features & Voice",
    badgeClass: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    textClass: "text-purple-400",
    icon: Volume2,
  },
  coding: {
    id: "coding",
    label: "Canvas & Code",
    badgeClass: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    textClass: "text-amber-400",
    icon: Code2,
  },
};

function getCategoryForPost(post: BlogPost): PostCategory {
  const slug = post.slug;
  if (slug.includes("alternative") || slug.includes("-vs-")) {
    return CATEGORIES.comparisons;
  }
  if (slug.includes("voice") || slug.includes("image") || slug.includes("remembers")) {
    return CATEGORIES.features;
  }
  if (slug.includes("coding") || slug.includes("writing")) {
    return CATEGORIES.coding;
  }
  return CATEGORIES["getting-started"];
}

function getReadTime(post: BlogPost): string {
  const totalText = [
    post.intro,
    ...(post.body || []),
    ...post.faq.map((f) => `${f.q} ${f.a}`),
  ].join(" ");
  const wordCount = totalText.split(/\s+/).length;
  const minutes = Math.max(2, Math.ceil(wordCount / 200));
  return `${minutes} min read`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "Recently Updated";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BlogIndexPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

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

  const handleTryArc = () => {
    window.dispatchEvent(
      new CustomEvent("auth-gate-feature", { detail: { feature: "generic" } })
    );
  };

  const categoryList = useMemo(() => {
    return [
      { id: "all", label: "All Guides", icon: BookOpen, count: BLOG_POSTS.length },
      {
        id: "getting-started",
        label: "Getting Started",
        icon: Compass,
        count: BLOG_POSTS.filter((p) => getCategoryForPost(p).id === "getting-started").length,
      },
      {
        id: "comparisons",
        label: "Model Comparisons",
        icon: Scale,
        count: BLOG_POSTS.filter((p) => getCategoryForPost(p).id === "comparisons").length,
      },
      {
        id: "features",
        label: "Voice & Tools",
        icon: Volume2,
        count: BLOG_POSTS.filter((p) => getCategoryForPost(p).id === "features").length,
      },
      {
        id: "coding",
        label: "Canvas & Code",
        icon: Code2,
        count: BLOG_POSTS.filter((p) => getCategoryForPost(p).id === "coding").length,
      },
    ];
  }, []);

  const featuredPost = useMemo(() => {
    return BLOG_POSTS.find((p) => p.slug === "what-is-arcai") || BLOG_POSTS[0];
  }, []);

  const trendingPosts = useMemo(() => {
    const picks = ["how-to-use-arcai-free", "free-chatgpt-alternative", "free-ai-with-voice"];
    return BLOG_POSTS.filter((p) => picks.includes(p.slug));
  }, []);

  const filteredPosts = useMemo(() => {
    return BLOG_POSTS.filter((post) => {
      const cat = getCategoryForPost(post);
      const matchesCategory =
        selectedCategory === "all" || cat.id === selectedCategory;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        post.description.toLowerCase().includes(q) ||
        post.keywords.some((k) => k.toLowerCase().includes(q)) ||
        post.intro.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

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

  const isDefaultView = !searchQuery && selectedCategory === "all";

  return (
    <div className="min-h-screen w-full bg-[hsl(0_0%_3.5%)] text-white selection:bg-primary/30 selection:text-primary-glow">
      <Helmet>
        <title>ArcAI Guides, Blog & FAQs — Free AI Assistant Hub</title>
        <meta
          name="description"
          content="Explore tutorials, side-by-side model comparisons, and deep dives into ArcAI — free AI with real-time voice, code canvas, image generation, and memory."
        />
        <link rel="canonical" href={`${SITE}/blog`} />
        <meta property="og:title" content="ArcAI Guides & Blog" />
        <meta property="og:url" content={`${SITE}/blog`} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(listJsonLd)}</script>
      </Helmet>

      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[hsl(0_0%_3.5%)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back to App</span>
          </Link>

          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-primary/20 blur-sm group-hover:bg-primary/40 transition-colors" />
              <img
                src="/arc-logo-ui.png"
                alt="ArcAI logo"
                className="relative h-7 w-7 transition-transform group-hover:scale-105"
              />
            </div>
            <span className="text-base font-semibold tracking-tight">ArcAI Hub</span>
          </Link>

          <button
            onClick={handleTryArc}
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition-all hover:bg-white/90 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95"
          >
            <span>Try Arc Free</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Hero Banner Section */}
      <section className="relative overflow-hidden px-6 pt-12 pb-10 md:px-10 md:pt-16 md:pb-14">
        {/* Background glow graphics */}
        <div className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 h-[350px] w-[800px] rounded-full bg-gradient-to-tr from-primary/20 via-purple-600/10 to-transparent blur-[120px] opacity-70" />

        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary-glow backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-primary-glow animate-pulse" />
            <span>ARC AI GUIDES & INSIGHTS</span>
          </div>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Master your <span className="bg-gradient-to-r from-white via-white/90 to-primary-glow bg-clip-text text-transparent">AI Workspace</span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base text-white/65 md:text-lg leading-relaxed">
            Tutorials, model benchmarks, and comprehensive guides to unlock voice mode, reasoning, code canvas, and persistent memory.
          </p>

          {/* Search & Filter Control Panel */}
          <div className="mt-10 mx-auto max-w-2xl">
            <div className="relative flex items-center rounded-2xl border border-white/12 bg-white/[0.04] p-1.5 backdrop-blur-xl shadow-2xl transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
              <Search className="ml-3.5 h-5 w-5 shrink-0 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guides, comparison models, keywords..."
                className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mr-2 rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Chips Bar */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {categoryList.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all duration-200 ${
                    isSelected
                      ? "bg-white text-black font-semibold shadow-lg shadow-white/10 scale-[1.02]"
                      : "border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{cat.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      isSelected
                        ? "bg-black/10 text-black font-bold"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-6 pb-28 md:px-10">
        {/* Spotlight Featured Article (Only in default view with no active search) */}
        {isDefaultView && featuredPost && (
          <section className="mb-16">
            <div className="flex items-center gap-2 mb-6">
              <Flame className="h-4 w-4 text-amber-400" />
              <h2 className="text-xs uppercase tracking-widest font-semibold text-white/50">
                Featured Spotlight
              </h2>
            </div>

            <Link
              to={`/blog/${featuredPost.slug}`}
              className="group relative block overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent p-8 md:p-12 backdrop-blur-2xl transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_40px_rgba(56,189,248,0.12)]"
            >
              <div className="absolute right-0 top-0 -z-10 h-full w-1/2 bg-gradient-to-l from-primary/10 via-purple-500/5 to-transparent blur-2xl opacity-60" />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary-glow">
                      FEATURED ARTICLE
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        getCategoryForPost(featuredPost).badgeClass
                      }`}
                    >
                      {getCategoryForPost(featuredPost).label}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-white/40">
                      <Clock className="h-3 w-3" />
                      {getReadTime(featuredPost)}
                    </span>
                  </div>

                  <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl group-hover:text-primary-glow transition-colors leading-tight">
                    {featuredPost.title}
                  </h3>

                  <p className="text-base text-white/65 leading-relaxed line-clamp-3">
                    {featuredPost.description}
                  </p>

                  <div className="pt-4 flex items-center gap-3 text-sm font-semibold text-white group-hover:text-primary-glow transition-colors">
                    <span>Read Full Guide</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>

                <div className="lg:col-span-4 hidden lg:flex justify-end">
                  <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-xl shadow-2xl space-y-3">
                    <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                      <img src="/arc-logo-ui.png" alt="Arc" className="h-6 w-6" />
                      <span className="text-xs font-medium text-white/70">ArcAI Features</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between rounded-lg bg-white/5 p-2 text-white/80">
                        <span>Voice Mode (OpenAI Realtime)</span>
                        <span className="text-emerald-400 text-[10px] font-mono">Active</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-white/5 p-2 text-white/80">
                        <span>Memory Bank (Cross-session)</span>
                        <span className="text-cyan-400 text-[10px] font-mono">Synced</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-white/5 p-2 text-white/80">
                        <span>GPT-5.6 Sol Frontier</span>
                        <span className="text-purple-400 text-[10px] font-mono">Ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Trending Picks Row (Only in default view) */}
        {isDefaultView && trendingPosts.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-cyan-400" />
                <h2 className="text-xs uppercase tracking-widest font-semibold text-white/50">
                  Popular Reads
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {trendingPosts.map((post) => {
                const category = getCategoryForPost(post);
                const CategoryIcon = category.icon;
                return (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}`}
                    className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-white/[0.06] hover:-translate-y-1 shadow-lg"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${category.badgeClass}`}
                        >
                          <CategoryIcon className="h-3 w-3" />
                          {category.label}
                        </span>
                        <span className="text-[11px] text-white/40">
                          {getReadTime(post)}
                        </span>
                      </div>

                      <h3 className="mt-4 text-lg font-bold tracking-tight text-white leading-snug group-hover:text-primary-glow transition-colors">
                        {post.title}
                      </h3>

                      <p className="mt-2.5 text-xs text-white/60 line-clamp-3 leading-relaxed">
                        {post.description}
                      </p>
                    </div>

                    <div className="mt-6 flex items-center justify-between pt-4 border-t border-white/5 text-xs text-white/50 group-hover:text-white transition-colors">
                      <span>Updated {formatDate(post.updated)}</span>
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* All Articles Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary-glow" />
              <span>
                {selectedCategory === "all"
                  ? "All Articles & Guides"
                  : categoryList.find((c) => c.id === selectedCategory)?.label}
              </span>
            </h2>
            <p className="mt-1 text-xs text-white/50">
              Showing {filteredPosts.length} article{filteredPosts.length === 1 ? "" : "s"}
              {searchQuery ? ` matching "${searchQuery}"` : ""}
            </p>
          </div>

          {(searchQuery || selectedCategory !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="self-start sm:self-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Articles Grid */}
        {filteredPosts.length > 0 ? (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <AnimatePresence>
              {filteredPosts.map((post) => {
                const category = getCategoryForPost(post);
                const CategoryIcon = category.icon;
                return (
                  <motion.div
                    key={post.slug}
                    layout
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Link
                      to={`/blog/${post.slug}`}
                      className="group flex flex-col justify-between h-full rounded-2xl border border-white/10 bg-white/[0.025] p-6 backdrop-blur-lg transition-all duration-300 hover:border-primary/40 hover:bg-white/[0.05] hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${category.badgeClass}`}
                          >
                            <CategoryIcon className="h-3 w-3" />
                            {category.label}
                          </span>
                          <span className="text-[11px] text-white/40">
                            {getReadTime(post)}
                          </span>
                        </div>

                        <h3 className="mt-4 text-base font-semibold tracking-tight text-white leading-snug group-hover:text-primary-glow transition-colors">
                          {post.title}
                        </h3>

                        <p className="mt-2.5 text-xs text-white/55 line-clamp-3 leading-relaxed">
                          {post.description}
                        </p>
                      </div>

                      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[11px] text-white/40">
                          {post.faq.length} FAQs included
                        </span>
                        <div className="flex items-center gap-1 text-xs font-medium text-white/70 group-hover:text-white transition-colors">
                          <span>Read</span>
                          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center my-12">
            <Search className="mx-auto h-8 w-8 text-white/30" />
            <h3 className="mt-4 text-lg font-semibold text-white">No guides found</h3>
            <p className="mt-2 text-xs text-white/50 max-w-sm mx-auto">
              We couldn't find any articles matching your search query. Try searching for broader terms like "voice", "ChatGPT", or "coding".
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
            >
              Clear Search Filters
            </button>
          </div>
        )}

        {/* Footer CTA Banner */}
        <section className="mt-20 relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-r from-primary/20 via-purple-600/15 to-blue-600/15 p-8 sm:p-12 text-center backdrop-blur-2xl">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_70%)]" />
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Experience ArcAI Free Today
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 leading-relaxed">
            Unlimited fast chat, real-time voice, code canvas, and cross-session memory — right in your browser.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={handleTryArc}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-white/90 hover:scale-105 active:scale-95 shadow-xl shadow-white/10"
            >
              <span>Get Started Free</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default BlogIndexPage;

