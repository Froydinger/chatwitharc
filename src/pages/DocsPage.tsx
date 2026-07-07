import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Search, Sparkles, Cpu, BookOpen, 
  Settings, User, HelpCircle, ChevronRight, ChevronDown,
  Layers, Volume2, Palette, ShieldAlert, BadgeInfo,
  Calendar, Key, Music, Users, FileCode, CheckCircle
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DocArticle {
  id: string;
  category: "models" | "local" | "canvas" | "memory" | "settings" | "media" | "sharing";
  title: string;
  question: string;
  answer: JSX.Element;
  keywords: string[];
}

export function DocsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);

  const categories = [
    { id: "all", label: "All Topics", icon: BookOpen },
    { id: "models", label: "AI Models", icon: Sparkles },
    { id: "local", label: "Local AI", icon: Cpu },
    { id: "canvas", label: "Canvas", icon: Layers },
    { id: "memory", label: "Memory", icon: BadgeInfo },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "media", label: "Voice & Music", icon: Music },
    { id: "sharing", label: "Collab & Share", icon: Users }
  ];

  const articles: DocArticle[] = [
    {
      id: "switch-model",
      category: "models",
      title: "How to switch models in ArcAI",
      question: "How do I switch the active AI model?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            You can switch models using the <strong>Model Picker dropdown</strong> located at the 
            <strong> top left of the chat window</strong> (above the chat input).
          </p>
          <p>Click the picker to select from the following tiers:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Auto</strong>: Best model is selected automatically based on the complexity of your task (routes code to GPT-5.5, simple prompts to Fast, complex reasoning to Deep Think).</li>
            <li><strong className="text-foreground">Fast (GPT-5.4 Nano)</strong>: High-speed, lightweight model optimized for simple, quick chat tasks.</li>
            <li><strong className="text-foreground">Smarter (GPT-5.4 Mini)</strong>: Balanced model for complex conversations and multi-turn logic.</li>
            <li><strong className="text-foreground">Reasoning (GPT-5.4 Thinking)</strong>: Deep logic model for coding, math, and long explanation generation (Requires <a href="/pricing" className="text-primary hover:underline font-semibold">Boost</a>).</li>
            <li><strong className="text-foreground">Deep Reason (GPT-5.5 Deep Think)</strong>: Advanced logical deduction and debugging model (Requires <a href="/pricing" className="text-primary hover:underline font-semibold">Boost</a>).</li>
          </ul>
        </div>
      ),
      keywords: ["switch model", "change model", "select model", "reasoning", "deep think", "picker", "dropdown", "gpt-5.5", "gpt-5.4", "nano", "mini"]
    },
    {
      id: "model-quotas",
      category: "models",
      title: "Model Quotas and Usage Limits",
      question: "What are the daily message limits and quotas?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Usage quotas depend on your plan:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Free Tier</strong>: Limited daily image generations and chat limits on standard models. Reasoning models (GPT-5.4 Thinking and GPT-5.5 Deep Think) are paywalled.</li>
            <li><strong className="text-foreground">Boost Plan ($10/mo or $96/yr)</strong>: Removes daily chat caps, unlocks advanced reasoning models (GPT-5.4 Thinking, GPT-5.5 Deep Think), provides offline local model support, and upgrades image generation quality.</li>
          </ul>
          <p>You can check your current daily usage and remaining limit at <a href="/settings?tab=plan" className="text-primary hover:underline font-semibold">Settings &gt; Plan &amp; Usage</a>.</p>
        </div>
      ),
      keywords: ["limit", "quota", "usage", "cost", "free tier", "message limit", "credits", "boost plan"]
    },
    {
      id: "local-ai-setup",
      category: "local",
      title: "Running local on-device AI",
      question: "How do I configure and run Local AI models?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            ArcAI features a state-of-the-art <strong>Local AI mode</strong> that allows you to run language models directly on your hardware (browser WebGPU). This ensures private, offline communication that never hits the network.
          </p>
          <p>To configure and download local models:</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Go to the <a href="/settings?tab=ai" className="text-primary hover:underline font-semibold">Settings &gt; AI &amp; Models tab</a>.</li>
            <li>Scroll down to the <strong>Local AI Models</strong> section.</li>
            <li>Select and download a model:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li><em>Llama 3.2 3B</em>: Best balanced offline model.</li>
                <li><em>Gemma 2 9B</em>: High-quality reasoning offline model (requires decent GPU).</li>
                <li><em>Gemma 2 2B</em>: Low memory footprint for standard laptops.</li>
                <li><em>Llama 3.2 1B (iOS)</em>: Optimized light model for iPhones/Safari.</li>
              </ul>
            </li>
          </ol>
        </div>
      ),
      keywords: ["local ai", "on-device", "webgpu", "download model", "llama", "gemma", "offline", "corporate mode"]
    },
    {
      id: "webgpu-errors",
      category: "local",
      title: "Troubleshooting WebGPU / Local AI Errors",
      question: "What should I do if WebGPU fails or local AI doesn't load?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Local AI requires WebGPU support. If you see errors:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Ensure you are using a modern browser (Google Chrome, Microsoft Edge, or Arc Browser version 113+; or Safari 18+).</li>
            <li>Check Chrome flags: Open <code>chrome://flags</code>, search for <strong>WebGPU</strong>, and set it to <strong>Enabled</strong>.</li>
            <li>Verify your graphics driver is updated.</li>
            <li>If your machine has integrated graphics and low RAM (under 8GB), try using the lighter <strong>Gemma 2 2B</strong> or <strong>Llama 3.2 1B</strong> models to prevent browser crashes.</li>
          </ol>
        </div>
      ),
      keywords: ["webgpu error", "local ai fails", "browser crash", "chrome flags", "webgpu support", "integrated graphics"]
    },
    {
      id: "corporate-mode",
      category: "local",
      title: "Corporate Mode Privacy Settings",
      question: "What is Corporate Mode and how do I enable it?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong>Corporate Mode</strong> is a privacy setting that locks all chat activities to your local browser. When active, it disables cloud connections, preventing your data, chat logs, or document content from leaving your machine.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>To enable Corporate Mode, go to <a href="/settings?tab=privacy" className="text-primary hover:underline font-semibold">Settings &gt; Privacy</a>.</li>
            <li>Toggle <strong>Corporate Mode</strong> to ON.</li>
            <li>Once enabled, all cloud routing is disabled, and you must select a downloaded Local AI Model to continue chatting.</li>
          </ul>
        </div>
      ),
      keywords: ["corporate mode", "privacy", "no network", "offline lock", "local lock", "gdpr", "private chat"]
    },
    {
      id: "canvas-mode",
      category: "canvas",
      title: "Using the Canvas Editor",
      question: "How does Canvas Mode work and how do I open it?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong>Canvas Mode</strong> is a split-screen workspace featuring an interactive panel on the right side of the screen. It is automatically triggered when you generate code or ask for long-form prose/document writing.
          </p>
          <p>Inside the Canvas, you can:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Edit documents or code blocks directly in the side panel.</li>
            <li>Trigger automatic code execution or styling updates.</li>
            <li>Export documents as raw text, HTML, or code files.</li>
          </ul>
          <p>You can also force Canvas or Coding mode by using the toggles in the bottom chat bar before sending your prompt.</p>
        </div>
      ),
      keywords: ["canvas", "editor", "split screen", "split-screen", "side panel", "code editor", "document editor", "prose"]
    },
    {
      id: "canvas-languages",
      category: "canvas",
      title: "Supported Languages in Canvas",
      question: "What file types and programming languages are supported in Canvas?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            The Canvas code runner and markdown parser supports a wide variety of formats:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Web Frontends</strong>: Full preview support for HTML, CSS, JavaScript, and Tailwind CSS.</li>
            <li><strong className="text-foreground">Vector Graphics</strong>: Interactive renderer for SVG markup.</li>
            <li><strong className="text-foreground">Documents</strong>: Rich formatting for Markdown (.md) and text files.</li>
            <li><strong className="text-foreground">Source Code</strong>: Syntax highlighting for Python, Go, Rust, C++, Java, and SQL.</li>
          </ul>
        </div>
      ),
      keywords: ["canvas language", "html", "javascript", "svg", "tailwind", "python", "syntax highlighting", "markdown"]
    },
    {
      id: "app-builder",
      category: "canvas",
      title: "Using the React App Builder (/build)",
      question: "What is the App Builder and how do I use it?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            The <strong>App Builder</strong> (located at <a href="/build" className="text-primary hover:underline font-semibold">/build</a>) is a dedicated coding workspace that lets you create, compile, preview, and host entire React applications from a single prompt.
          </p>
          <p>Key Features:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Full Sandbox</strong>: Compiles JSX/TSX React components, styling, animations, and icons in real-time.</li>
            <li><strong className="text-foreground">Official Routing Support</strong>: Integrates the full <code>react-router-dom</code> library, allowing you to design dynamic multi-page user journeys (e.g. nested routes, layouts). All routing is securely containerized via Hash-routing under the hood.</li>
            <li><strong className="text-foreground">Instant Hosting</strong>: Deploy your prototype to a live Netlify URL with a custom subdomain in one click.</li>
          </ul>
          <p><strong>App Builder Limitations & Constraints:</strong></p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Frontend/Client-side Only</strong>: There is no server backend support (no Node.js/Python server scripts or custom SQL databases).</li>
            <li><strong className="text-foreground">Persistence</strong>: Prototyped data persistence must use local React state or <code>localStorage</code> (which is shared under the askarc.chat origin unless keys are custom-prefixed).</li>
            <li><strong className="text-foreground">Custom Packages</strong>: Standard frontend styling (Tailwind CSS, Lucide React, Framer Motion, and React Icons) are pre-loaded and highly optimized. Third-party NPM modules are loaded dynamically via ESM.</li>
          </ul>
        </div>
      ),
      keywords: ["app builder", "react", "build app", "routing", "deploy", "host", "netlify", "multi-page", "limitations", "database"]
    },
    {
      id: "memory-bank",
      category: "memory",
      title: "Managing saved memories",
      question: "How do I manage what the AI remembers about me?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            ArcAI saves key facts, preferences, and details about you in your secure <strong>Memory Bank</strong> to customize future chat sessions.
          </p>
          <p>To inspect, edit, or delete these memories:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Go directly to the <a href="/settings?tab=memory" className="text-primary hover:underline font-semibold">Settings &gt; Memory Bank tab</a> (or go to <a href="/memory" className="text-primary hover:underline font-semibold">/memory</a>).</li>
            <li>Here you will see a list of all remembered statements.</li>
            <li>Click the trash icon next to any memory to delete it, or clear all memory context blocks completely.</li>
          </ul>
        </div>
      ),
      keywords: ["memory", "memories", "remember", "saved facts", "custom instructions", "memory bank", "profile memory"]
    },
    {
      id: "custom-instructions",
      category: "memory",
      title: "Custom System Instructions",
      question: "How do I add custom system instructions?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Custom instructions allow you to shape how the AI responds across all conversations.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Go to <a href="/settings?tab=account" className="text-primary hover:underline font-semibold">Settings &gt; Account tab</a>.</li>
            <li>Find the <strong>Custom Instructions</strong> text area.</li>
            <li>Input your preferences (e.g. <em>"Explain concepts as if I am a beginner"</em>, <em>"Keep code concise and avoid verbose commentary"</em>).</li>
            <li>Click Save. These will be appended to the AI's system prompt for every message.</li>
          </ul>
        </div>
      ),
      keywords: ["custom instructions", "system instructions", "personality", "custom prompt", "profile config"]
    },
    {
      id: "appearance-colors",
      category: "settings",
      title: "Changing Theme & Accent Colors",
      question: "How do I change the look, theme, or color accent of Arc?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            ArcAI features a beautiful glass-morphism interface with highly customizable theme options.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Go to <a href="/settings?tab=appearance" className="text-primary hover:underline font-semibold">Settings &gt; Appearance tab</a>.</li>
            <li>Choose your base theme (<strong>Dark</strong>, <strong>Light</strong>, or <strong>System Default</strong>).</li>
            <li>Select an accent tint: <span className="text-red-400">Red</span>, <span className="text-blue-400">Blue</span>, <span className="text-green-400">Green</span>, <span className="text-yellow-400">Yellow</span>, <span className="text-purple-400">Purple</span>, <span className="text-orange-400">Orange</span>, or <strong className="text-foreground">Noir</strong>.</li>
            <li>You can also click the quick-accent palette in the sidebar/right-panel menu to switch colors immediately.</li>
          </ul>
        </div>
      ),
      keywords: ["appearance", "theme", "colors", "accent color", "dark mode", "light mode", "change color", "glass theme"]
    },
    {
      id: "voice-mode",
      category: "media",
      title: "Hands-free Voice Mode",
      question: "How do I use Voice Mode?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Voice Mode lets you converse with Arc naturally using OpenAI Realtime.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Click the <strong>microphone</strong> or <strong>headphone</strong> icon next to the chat input to start the connection.</li>
            <li>Grant microphone permissions in your browser when prompted.</li>
            <li>Choose your preferred voice character inside <a href="/settings?tab=voice" className="text-primary hover:underline font-semibold">Settings &gt; Voice Settings</a>.</li>
            <li>Speak naturally—Arc will listen and reply in real-time. Click the red mute or hangup buttons to terminate the session.</li>
          </ul>
        </div>
      ),
      keywords: ["voice mode", "microphone", "headphones", "openai realtime", "real-time voice", "voice chat", "talk to ai"]
    },
    {
      id: "music-spotify",
      category: "media",
      title: "Spotify Music Player Integration",
      question: "How do I connect and control Spotify music inside Arc?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            ArcAI features a floating Spotify mini player built into the sidebar layout.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Ensure you have a Spotify Premium account and are logged in to Spotify on the same browser.</li>
            <li>Click the Music Player controller in the sidebar/dock.</li>
            <li>Start playing any song on Spotify desktop or mobile—the playback status, album art, and seek controls will sync automatically inside Arc's glass player widget.</li>
          </ul>
        </div>
      ),
      keywords: ["spotify", "music player", "sidebar music", "play songs", "music player", "sync audio"]
    },
    {
      id: "shared-chatrooms",
      category: "sharing",
      title: "Shared Team Chat Rooms",
      question: "How do shared collaborative chat rooms work?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            ArcAI lets you invite other users to collaborative chat rooms under the <a href="/shared" className="text-primary hover:underline font-semibold">Shared chats page (/shared)</a>.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Create a new chat room and share the public URL with team members.</li>
            <li>Messages sync in real-time across all connected clients.</li>
            <li>Mention other users or personas directly in your message by typing <code>@username</code> or <code>@persona</code>.</li>
            <li>Attach and upload images (up to 10MB per file) directly to the collaborative stream.</li>
          </ul>
        </div>
      ),
      keywords: ["shared chats", "collab", "team chat", "mentions", "attachments", "shared room", "real-time"]
    },
    {
      id: "sharing-transcripts",
      category: "sharing",
      title: "Sharing Chat Transcripts",
      question: "How do I generate a public link to share a chat history?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            If you want to share a particular AI conversation with friends or colleagues:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Click the <strong>Share</strong> button located at the top right of the chat header panel.</li>
            <li>Confirm public sharing—Arc will generate a unique static link (e.g. <code>/share/your-session-id</code>).</li>
            <li>Copy and send the URL. Anyone with the link will be able to read the formatted conversation (including code blocks and canvas states) without needing an account.</li>
          </ul>
        </div>
      ),
      keywords: ["share chat", "public link", "generate url", "transcript share", "send chat"]
    }
  ];

  const handleToggleArticle = (id: string) => {
    setExpandedArticleId(expandedArticleId === id ? null : id);
  };

  const filteredArticles = articles.filter((art) => {
    const matchesCategory = selectedCategory === "all" || art.category === selectedCategory;
    const matchesSearch = searchQuery.trim() === "" || 
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.keywords.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4 md:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-xl border-glass-border glass hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                Documentation &amp; Help Center
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detailed user guide and troubleshooting manual for ArcAI features
              </p>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search documentation, keywords, or features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 bg-muted/20 border-glass-border glass rounded-xl focus-visible:ring-primary focus-visible:border-primary"
          />
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.id;
            return (
              <Button
                key={cat.id}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-lg flex flex-col items-center justify-center gap-1.5 py-3 h-auto ${
                  active 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]" 
                    : "glass border-glass-border hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium leading-none">{cat.label}</span>
              </Button>
            );
          })}
        </div>

        {/* Articles List */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredArticles.length > 0 ? (
              filteredArticles.map((art) => {
                const isExpanded = expandedArticleId === art.id;
                return (
                  <motion.div
                    key={art.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <GlassCard 
                      className={`border-glass-border overflow-hidden transition-all duration-200 ${
                        isExpanded ? "border-primary/40 bg-primary/5" : "hover:bg-white/5"
                      }`}
                    >
                      <button
                        onClick={() => handleToggleArticle(art.id)}
                        className="w-full px-6 py-4 flex items-center justify-between text-left gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <span className="p-1.5 rounded-lg bg-primary/10 text-primary text-xs shrink-0 font-mono">
                            {art.category.toUpperCase()}
                          </span>
                          <h3 className="font-semibold text-sm md:text-base text-foreground leading-tight">
                            {art.question}
                          </h3>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                      
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: "auto" }}
                            exit={{ height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-border/20"
                          >
                            <div className="px-6 py-5 bg-background/25">
                              {art.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </GlassCard>
                  </motion.div>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12 text-muted-foreground space-y-2"
              >
                <BookOpen className="h-10 w-10 mx-auto opacity-30 text-primary" />
                <p className="text-sm">No documentation found matching your search query.</p>
                <p className="text-xs opacity-60">Try searching broad terms like "model", "local", "memory", or "canvas".</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
