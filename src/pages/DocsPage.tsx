import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, Search, Sparkles, Cpu, BookOpen, 
  Settings, User, HelpCircle, ChevronRight, ChevronDown,
  Layers, Volume2, Palette, ShieldAlert, BadgeInfo
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fadeInVariants, staggerContainerVariants, staggerItemVariants } from "@/utils/animations";

interface DocArticle {
  id: string;
  category: "models" | "local" | "canvas" | "memory" | "settings" | "features";
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
    { id: "models", label: "AI & Models", icon: Sparkles },
    { id: "local", label: "Local AI (Offline)", icon: Cpu },
    { id: "canvas", label: "Canvas Mode", icon: Layers },
    { id: "memory", label: "Memory Bank", icon: BadgeInfo },
    { id: "settings", label: "Settings Guide", icon: Settings },
    { id: "features", label: "Advanced Features", icon: HelpCircle }
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
            <strong> top left of the chat window</strong>.
          </p>
          <p>Click the picker to select from the following tiers:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-foreground">Auto</strong>: Best model is selected automatically based on the complexity of your task.</li>
            <li><strong className="text-foreground">Fast (GPT-5.4 Nano)</strong>: High-speed, lightweight model optimized for simple, quick chat tasks.</li>
            <li><strong className="text-foreground">Smarter (GPT-5.4 Mini)</strong>: Balanced model for complex conversations and multi-turn logic.</li>
            <li><strong className="text-foreground">Reasoning (GPT-5.4 Thinking)</strong>: Deep logic model for coding, math, and long explanation generation (Requires <a href="/pricing" className="text-primary hover:underline font-semibold">Boost</a>).</li>
            <li><strong className="text-foreground">Deep Reason (GPT-5.5 Deep Think)</strong>: Advanced logical deduction and debugging model (Requires <a href="/pricing" className="text-primary hover:underline font-semibold">Boost</a>).</li>
          </ul>
        </div>
      ),
      keywords: ["switch model", "change model", "select model", "reasoning", "deep think", "picker", "dropdown", "gpt-5.5", "gpt-5.4"]
    },
    {
      id: "local-ai",
      category: "local",
      title: "Running local on-device AI",
      question: "What is Local AI and how does it work?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            ArcAI features a state-of-the-art <strong>Local AI mode</strong> that allows you to run language models directly on your hardware (browser, WebGPU/WASM). 
            This enables private, offline communication that never hits the cloud.
          </p>
          <p>To configure and download local models:</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Go to the <a href="/settings?tab=ai" className="text-primary hover:underline font-semibold">Settings &gt; AI &amp; Models tab</a>.</li>
            <li>Scroll down to the <strong>Local AI Models</strong> section.</li>
            <li>Select and download a model (e.g. <em>Llama 3.2 3B</em>, <em>Gemma 2 9B</em>, <em>Gemma 2 2B</em>, or <em>Llama 3.2 1B</em> for iOS/Safari Mobile).</li>
            <li>Toggle <strong>Corporate Mode</strong> in <a href="/settings?tab=privacy" className="text-primary hover:underline font-semibold">Settings &gt; Privacy</a> to lock all traffic to local processing.</li>
          </ol>
        </div>
      ),
      keywords: ["local ai", "offline mode", "on-device", "webgpu", "wasm", "download model", "llama", "gemma", "corporate mode"]
    },
    {
      id: "canvas-mode",
      category: "canvas",
      title: "Using the Canvas Editor",
      question: "How does Canvas Mode work and how do I open it?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong>Canvas Mode</strong> is a split-screen workspace featuring an interactive panel on the right side of the screen. 
            It is automatically triggered when you generate code or ask for long-form prose/document writing.
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
      category: "features",
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
      id: "personas-custom",
      category: "features",
      title: "Creating custom Personas",
      question: "How do I use or create custom AI personas?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Personas allow you to chat with tailored AI characters (e.g. Life Coach, Counselor, Noir Detective, Scholar, Pirate, Tutor, Chef).
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Select Persona</strong>: Use the avatar selector next to the text input or type <strong className="text-foreground">@persona_name</strong> (e.g., <code>@counselor</code>) inside the chat input.</li>
            <li><strong>Create Persona</strong>: Go to <a href="/settings?tab=personas" className="text-primary hover:underline font-semibold">Settings &gt; Personas Manager tab</a> to write custom system instructions and define your own AI character.</li>
          </ul>
        </div>
      ),
      keywords: ["personas", "persona", "custom persona", "coach", "counselor", "detective", "tutor", "mentions", "@persona"]
    },
    {
      id: "boost-subscription",
      category: "plan",
      title: "Boost subscription and Pricing",
      question: "What features are included in the Boost plan?",
      answer: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            The <strong>Boost plan</strong> provides unlimited access to premium models and removes daily usage caps.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Free tier</strong>: Limited daily image generations and chat limits on standard models.</li>
            <li><strong>Boost tier ($10/month or $96/year)</strong>: Access to reasoning models (GPT-5.4 Thinking, GPT-5.5 Deep Think), unlimited web search queries, expanded file analysis sizes, and on-device offline models.</li>
            <li>Manage billing or subscribe at <a href="/pricing" className="text-primary hover:underline font-semibold">Pricing &amp; Subscription Page</a>.</li>
          </ul>
        </div>
      ),
      keywords: ["boost", "subscription", "price", "billing", "pricing", "plan", "limit", "quota", "premium"]
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
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
                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
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
                          <span className="p-1.5 rounded-lg bg-primary/10 text-primary text-xs shrink-0">
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
