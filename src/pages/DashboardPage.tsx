import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MessageSquare, Image, Rocket, Brain,
  Plus, Clock, Settings, Search,
  Trash2, Download, LayoutDashboard, ChevronLeft, ChevronRight,
  Globe, Code2, Eye, Sparkles, Zap, ArrowRight, Music, Edit2, Check, X,
  Layers, PenLine, FileCode
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";
import { useArcStore } from "@/store/useArcStore";
import { useProfile } from "@/hooks/useProfile";
import { useChatSync } from "@/hooks/useChatSync";
import { useContextBlocks } from "@/hooks/useContextBlocks";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SmoothImage } from "@/components/ui/smooth-image";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";
import { getFaviconByLabel } from "@/constants/faviconOptions";
import { useAdminBanner } from "@/components/AdminBanner";
import { useAccentColor } from "@/hooks/useAccentColor";
import { useToast } from "@/hooks/use-toast";
import { ChatInput } from "@/components/ChatInput";
import { MusicPopup } from "@/components/MusicPopup";
import { useMusicStore } from "@/store/useMusicStore";
import { PaymentFailureBanner } from "@/components/PaymentFailureBanner";
import { CodePreview } from "@/components/CodePreview";
import { canPreview, getLanguageDisplay, getLanguageColor } from "@/utils/codeUtils";
import { useCanvasStore } from "@/store/useCanvasStore";
import { DeploysPanel } from "@/components/DeploysPanel";

type DashboardTab = "overview" | "chats" | "images" | "canvases" | "memories" | "deploys";

interface GeneratedImage {
  url: string;
  prompt: string;
  sessionId: string;
  messageId: string;
  timestamp: Date;
}

interface RecentApp {
  id: string;
  title: string;
  prompt: string;
  favicon_label: string | null;
  netlify_url: string | null;
  netlify_subdomain: string | null;
  updated_at: string;
  created_at: string;
  version: number;
}

function toDate(ts: unknown): Date | null {
  if (ts instanceof Date) return ts;
  if (typeof ts === "number" || typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

interface CanvasItem {
  id: string;
  type: 'code' | 'writing';
  content: string;
  language?: string;
  sessionId: string;
  sessionTitle: string;
  timestamp: Date;
  label?: string;
}

function extractCodeBlocks(content: string): Array<{ code: string; language: string }> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: Array<{ code: string; language: string }> = [];
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({ language: match[1] || "text", code: match[2].trim() });
  }
  return blocks;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as DashboardTab) || "overview";
  const { user, loading: authLoading } = useAuth();
  const { isSubscribed, subscriptionEnd, openCheckout } = useSubscription();
  const { profile } = useProfile();
  const { isLoaded } = useChatSync();
  const {
    chatSessions, createNewSession, loadSession, deleteSession,
    hydrateAllSessions, allSessionsHydrated, isHydratingAll,
    syncFromSupabase, currentSessionId, messages
  } = useArcStore();
  const { blocks: contextBlocks, loading: blocksLoading, deleteBlock, updateBlock, addBlock } = useContextBlocks();
  const isAdminBannerActive = useAdminBanner();

// Detect desktop standalone (PWA/Electron) for traffic light safe area
const [isDesktopStandalone, setIsDesktopStandalone] = useState(false);
useEffect(() => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  const isElectron = /electron/i.test(navigator.userAgent);
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  setIsDesktopStandalone((isStandalone || isElectron) && !isMobileDevice);
}, []);
  const { accentColor } = useAccentColor();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 12;
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [isMusicPopupOpen, setIsMusicPopupOpen] = useState(false);
  const { isPlaying: isMusicPlaying } = useMusicStore();
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [chatSearch, setChatSearch] = useState("");
  const [imageSearch, setImageSearch] = useState("");
  const [appSearch, setAppSearch] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemoryContent, setEditMemoryContent] = useState("");
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [chatPage, setChatPage] = useState(1);
  const [imagePage, setImagePage] = useState(1);
  // Lazy DB-driven image state (replaces full-hydration approach)
  const [dbImages, setDbImages] = useState<GeneratedImage[]>([]);
  const [dbImagesLoading, setDbImagesLoading] = useState(false);
  const [dbSessionOffset, setDbSessionOffset] = useState(0);
  const [dbHasMoreSessions, setDbHasMoreSessions] = useState(true);
  const DB_SESSION_BATCH = 30;
  const [totalImageCount, setTotalImageCount] = useState<number | null>(null);
  const [appPage, setAppPage] = useState(1);
  const [memoryPage, setMemoryPage] = useState(1);
  const [canvasSearch, setCanvasSearch] = useState("");
  const [canvasPage, setCanvasPage] = useState(1);
  const [selectedCanvas, setSelectedCanvas] = useState<CanvasItem | null>(null);
  const { openWithContent } = useCanvasStore();

  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const sessionId = currentSessionId;
      if (sessionId) navigate(`/chat/${sessionId}`);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, currentSessionId, navigate]);

  // Reset pages on search changes
  useEffect(() => { setChatPage(1); }, [chatSearch]);
  useEffect(() => { setImagePage(1); }, [imageSearch]);
  useEffect(() => { setAppPage(1); }, [appSearch]);
  useEffect(() => { setMemoryPage(1); }, [memorySearch]);
  useEffect(() => { setCanvasPage(1); }, [canvasSearch]);

  const switchTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setSearchParams(tab === "overview" ? {} : { tab });
    setViewingImageIndex(null);
    setSelectedAppId(null);
    setSelectedCanvas(null);
    setChatPage(1); setImagePage(1); setAppPage(1); setMemoryPage(1); setCanvasPage(1);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) hydrateAllSessions();
  }, [user, hydrateAllSessions]);

  // Fetch a batch of sessions from DB and extract images from them
  const fetchMoreImages = async (reset = false) => {
    if (dbImagesLoading) return;
    if (!reset && !dbHasMoreSessions) return;
    setDbImagesLoading(true);
    const offset = reset ? 0 : dbSessionOffset;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id, messages, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .range(offset, offset + DB_SESSION_BATCH - 1);
      if (error) throw error;
      const newImages: GeneratedImage[] = [];
      (data || []).forEach(s => {
        ((s.messages as any[]) || []).forEach(msg => {
          if (msg?.type === 'image' && msg?.imageUrl && msg?.role === 'assistant') {
            const ts = toDate(msg?.timestamp);
            if (!ts) return;
            newImages.push({
              url: msg.imageUrl,
              prompt: typeof msg?.content === 'string' ? msg.content.replace('Generated image: ', '') : '',
              sessionId: s.id,
              messageId: msg.id,
              timestamp: ts,
            });
          }
        });
      });
      newImages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setDbImages(prev => reset ? newImages : [...prev, ...newImages]);
      setDbSessionOffset(offset + DB_SESSION_BATCH);
      setDbHasMoreSessions((data || []).length === DB_SESSION_BATCH);
    } catch (e) {
      console.error('Failed to load images from DB:', e);
    } finally {
      setDbImagesLoading(false);
    }
  };

  // Load images when images tab becomes active; auto-fetch all batches in background
  useEffect(() => {
    if (activeTab === 'images' && !dbImagesLoading) {
      if (dbImages.length === 0) {
        fetchMoreImages(true);
      } else if (dbHasMoreSessions) {
        fetchMoreImages();
      }
    }
  }, [activeTab, dbImages.length, dbHasMoreSessions, dbImagesLoading]);

  useEffect(() => {
    if (!user) return;
    supabase.rpc('count_user_images').then(({ data }) => {
      if (typeof data === 'number') setTotalImageCount(data);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingApps(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase
          .from('ide_projects')
          .select('id, title, prompt, favicon_label, netlify_url, netlify_subdomain, updated_at, created_at, version')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false });
        setRecentApps((data || []) as RecentApp[]);
      } catch { /* ignore */ } finally { setLoadingApps(false); }
    })();
  }, [user]);

  const allChats = useMemo(() => {
    return chatSessions
      .filter(s => (s.messageCount ?? s.messages.length) > 0)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [chatSessions]);

  const filteredChats = useMemo(() => {
    if (!chatSearch.trim()) return allChats;
    const q = chatSearch.toLowerCase();
    return allChats.filter(s => s.title.toLowerCase().includes(q));
  }, [allChats, chatSearch]);

  // filteredImages now uses dbImages (lazy DB-loaded) instead of allImages (full hydration)
  const filteredImages = useMemo(() => {
    if (!imageSearch.trim()) return dbImages;
    const q = imageSearch.toLowerCase();
    return dbImages.filter(img => img.prompt.toLowerCase().includes(q));
  }, [dbImages, imageSearch]);

  const filteredApps = useMemo(() => {
    if (!appSearch.trim()) return recentApps;
    const q = appSearch.toLowerCase();
    return recentApps.filter(a => a.title.toLowerCase().includes(q) || a.prompt?.toLowerCase().includes(q));
  }, [recentApps, appSearch]);

  const filteredMemories = useMemo(() => {
    if (!memorySearch.trim()) return contextBlocks;
    const q = memorySearch.toLowerCase();
    return contextBlocks.filter(b => b.content.toLowerCase().includes(q));
  }, [contextBlocks, memorySearch]);

  const canvasItems = useMemo((): CanvasItem[] => {
    const items: CanvasItem[] = [];
    chatSessions.forEach((session) => {
      session.messages.forEach((message) => {
        if (!message) return;
        const coerced = toDate(message?.timestamp);
        if (!coerced) return;
        if (message.type === 'canvas') {
          const canvasContent = (message as any).canvasContent;
          if (typeof canvasContent === 'string' && canvasContent.length > 0) {
            items.push({ id: `canvas-${message.id}`, type: 'writing', content: canvasContent, sessionId: session.id, sessionTitle: session.title ?? "Untitled chat", timestamp: coerced, label: (message as any).canvasLabel || 'Writing Canvas' });
          }
        }
        if (message.type === 'code') {
          const codeContent = (message as any).codeContent;
          if (typeof codeContent === 'string' && codeContent.length > 0) {
            items.push({ id: `code-${message.id}`, type: 'code', content: codeContent, language: (message as any).codeLanguage || 'text', sessionId: session.id, sessionTitle: session.title ?? "Untitled chat", timestamp: coerced, label: (message as any).codeLabel || 'Code Canvas' });
          }
        }
        if (message.role === 'assistant' && typeof message.content === 'string') {
          extractCodeBlocks(message.content).forEach((block, index) => {
            items.push({ id: `block-${message.id}-${index}`, type: 'code', content: block.code, language: block.language, sessionId: session.id, sessionTitle: session.title ?? "Untitled chat", timestamp: coerced, label: `${getLanguageDisplay(block.language)} snippet` });
          });
        }
      });
    });
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items;
  }, [chatSessions]);

  const filteredCanvases = useMemo(() => {
    if (!canvasSearch.trim()) return canvasItems;
    const q = canvasSearch.toLowerCase();
    return canvasItems.filter(item =>
      item.content.toLowerCase().includes(q) ||
      item.sessionTitle.toLowerCase().includes(q) ||
      (item.language && item.language.toLowerCase().includes(q)) ||
      (item.label && item.label.toLowerCase().includes(q))
    );
  }, [canvasItems, canvasSearch]);

  const isImagesLoading = dbImagesLoading && dbImages.length === 0;
  const selectedApp = selectedAppId ? recentApps.find(a => a.id === selectedAppId) : null;

  const handleDeleteChat = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { deleteSession(sessionId); } catch { /* ignore */ }
  };

  const downloadImage = async (img: GeneratedImage) => {
    try {
      const response = await fetch(img.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arcai-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Image downloaded" });
    } catch { toast({ title: "Download failed", variant: "destructive" }); }
  };

  const deleteApp = async (appId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from('ide_projects').delete().eq('id', appId).eq('user_id', session.user.id);
      setRecentApps(prev => prev.filter(a => a.id !== appId));
      if (selectedAppId === appId) setSelectedAppId(null);
      toast({ title: "App deleted" });
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const timeAgo = (dateStr: string | Date) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  useEffect(() => {
    if (viewingImageIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewingImageIndex(null);
      if (e.key === 'ArrowRight' && viewingImageIndex < filteredImages.length - 1) setViewingImageIndex(viewingImageIndex + 1);
      if (e.key === 'ArrowLeft' && viewingImageIndex > 0) setViewingImageIndex(viewingImageIndex - 1);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [viewingImageIndex, filteredImages.length]);

  const insightTip = useMemo(() => {
    const tips = [
      allChats.length > 0 ? `You've had ${allChats.length} chat${allChats.length === 1 ? '' : 's'} — keep the streak going!` : null,
      totalImageCount != null && totalImageCount > 0 ? `You've generated ${totalImageCount} image${totalImageCount === 1 ? '' : 's'} with Arc so far.` : null,
      contextBlocks.length > 0 ? `Arc remembers ${contextBlocks.length} thing${contextBlocks.length === 1 ? '' : 's'} about you.` : null,
      "Try asking Arc to generate an image of your next project idea.",
      "Start a new chat to brainstorm your next big idea.",
      "Use /build to create a web app from a single prompt.",
    ].filter(Boolean) as string[];
    return tips[Math.floor(Math.random() * tips.length)];
  }, [allChats.length, totalImageCount, contextBlocks.length]);

  if (authLoading) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const tabs: { key: DashboardTab; label: string; icon: typeof MessageSquare }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "chats", label: "Chats", icon: MessageSquare },
    { key: "images", label: "Images", icon: Image },
    { key: "canvases", label: "Canvases", icon: Layers },
    { key: "deploys", label: "Deploys", icon: Globe },
    { key: "memories", label: "Memories", icon: Brain },
  ];

  const currentImage = viewingImageIndex !== null ? filteredImages[viewingImageIndex] : null;

  // Stats for overview
  const stats = [
    { label: "Chats", value: allChats.length, icon: MessageSquare, color: "210 100% 66%", tw: "text-blue-400" },
    { label: "Images", value: totalImageCount, loading: totalImageCount === null, icon: Image, color: "270 80% 65%", tw: "text-purple-400" },
    { label: "Memories", value: contextBlocks.length, icon: Brain, color: "155 70% 50%", tw: "text-emerald-400" },
  ];

  return (
    <div
      className="min-h-screen overflow-y-auto scrollbar-hide relative z-10"
      style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'} + ${isDesktopStandalone ? '30px' : '0px'})`,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px) + 15px)',
      }}
    >
      <PaymentFailureBanner />
      <div className="w-full px-4 sm:px-6 pt-3 sm:pt-4 pb-8 sm:pb-12 space-y-6 sm:space-y-8">

        {/* ═══ HEADER with ambient glow ═══ */}
        <div className="relative">
          {/* Ambient glow behind greeting */}
          <div className="absolute -top-12 left-1/4 w-48 h-48 rounded-full bg-primary/8 blur-[80px] pointer-events-none" />
          <div className="absolute -top-8 right-1/3 w-32 h-32 rounded-full bg-primary/5 blur-[60px] pointer-events-none" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate("/")}
                className="rounded-full glass-shimmer"
                title="Back to chat"
              >
                <MessageSquare className="h-4.5 w-4.5 text-primary" />
              </Button>
              <ThemedLogo className="h-9 w-9" />
              <div>
                <h1 className="text-base sm:text-2xl font-light text-foreground tracking-tight">
                  {greeting}{profile?.display_name ? `, ${profile.display_name}` : ""}.
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsMusicPopupOpen(!isMusicPopupOpen)}
                className={cn(
                  "rounded-full glass-shimmer",
                  isMusicPlaying && "border-primary/30 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
                )}
                title="Music Player"
              >
                <Music className="h-4.5 w-4.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate("/dashboard/settings")}
                className="rounded-full glass-shimmer"
                title="Settings"
              >
                <Settings className="h-4.5 w-4.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>

        {/* ═══ CHAT INPUT ═══ */}
        <div className="glass-dock" data-has-images={false}>
          <ChatInput inline />
        </div>
        {/* Portal target for inline image preview — outside glass-dock */}
        <div id="dashboard-image-preview-target" />

        {/* ═══ SUBSCRIPTION BADGE / CTA ═══ */}
        <div>
          {isSubscribed ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/25 bg-primary/8 text-primary text-xs font-medium">
              <Zap className="h-3.5 w-3.5" />
              <span>Pro Plan{subscriptionEnd ? ` · renews ${new Date(subscriptionEnd).toLocaleDateString()}` : ''}</span>
            </div>
          ) : (
            <button
              onClick={() => openCheckout()}
              className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent hover:from-primary/18 hover:via-primary/10 hover:to-primary/5 text-primary text-xs font-medium transition-all hover:border-primary/35 hover:shadow-[0_0_20px_hsl(var(--primary)/0.1)] active:scale-[0.98]"
            >
              <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span>Upgrade to Pro — $8/mo for unlimited everything</span>
              <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>
          )}
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <AnimatePresence mode="wait" initial={false}>
          {/* ====== OVERVIEW ====== */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-6">

              {/* Stat cards — code-block style */}
              <div className="grid grid-cols-3 gap-2">
                {stats.map(({ label, value, loading, icon: Icon, color, tw }, i) => (
                  <div
                    key={label}
                    className="relative overflow-hidden rounded-xl cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.97] group"
                    style={{ border: `1px solid hsl(${color} / 0.25)`, background: `linear-gradient(160deg, hsl(${color} / 0.08) 0%, hsl(var(--background) / 0.9) 100%)` }}
                    onClick={() => {
                      const targetTab = label === "Chats" ? "chats" : label === "Images" ? "images" : label === "Memories" ? "memories" : "overview";
                      switchTab(targetTab);
                    }}
                  >
                    {/* top bar mimicking a code editor tab */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b" style={{ borderColor: `hsl(${color} / 0.2)`, background: `hsl(${color} / 0.06)` }}>
                      <div className="h-1.5 w-1.5 rounded-full opacity-70" style={{ background: `hsl(${color})` }} />
                      <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">{label}.arc</span>
                    </div>
                    <div className="p-3 font-mono flex flex-col h-full">
                      <p className="text-[10px] text-muted-foreground/60 mb-0.5">const {label.toLowerCase()} =</p>
                      <div className="flex-1 flex flex-col justify-center">
                        {loading ? (
                          <div className="h-6 w-12 rounded bg-muted/20 animate-pulse" />
                        ) : (
                          <p className={cn("text-2xl font-bold leading-none flex items-center gap-1.5", tw)}>
                            {value ?? 0}
                          </p>
                        )}
                        {label === "Images" && (
                          <div className="mt-3">
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-[10px] text-primary font-medium hover:bg-primary/20 transition-colors">
                              View all images
                              <ArrowRight className="h-2.5 w-2.5" />
                            </div>
                          </div>
                        )}
                      </div>
                      <Icon className={cn("h-3.5 w-3.5 mt-2 opacity-50 self-end", tw)} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Insight tip */}
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-primary/15 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-foreground/80">{insightTip}</p>
              </div>

              {/* Recent Chats */}
              <Section title="Recent Chats" icon={MessageSquare} action={() => switchTab("chats")} actionLabel="See all">
                {!isLoaded ? <SkeletonGrid cols={3} /> : allChats.length === 0 ? (
                  <EmptyState icon={MessageSquare} text="No chats yet" sub="Start a conversation above!" />
                ) : (
                  <div className="space-y-1.5">
                    {allChats.slice(0, 3).map((session, i) => (
                      <ChatCard key={session.id} session={session} timeAgo={timeAgo} onClick={() => { loadSession(session.id); navigate(`/chat/${session.id}`); }} index={i} />
                    ))}
                  </div>
                )}
              </Section>


              {/* Memories */}
              <div className="grid grid-cols-1 gap-4">
                <Section title="Memories" icon={Brain} action={() => switchTab("memories")} actionLabel="See all" count={contextBlocks.length}>
                  {blocksLoading ? <SkeletonList count={3} /> : contextBlocks.length === 0 ? (
                    <EmptyState icon={Brain} text="No memories yet" sub='Say "remember that..."' />
                  ) : (
                    <div className="space-y-1.5">
                      {contextBlocks.slice(0, 3).map((block, i) => (
                        <div
                          key={block.id}
                          className="group p-3 rounded-xl border border-border/30 bg-muted/20 hover:border-primary/20 hover:bg-primary/5 transition-all"
                        >
                          <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed">{block.content}</p>
                          <span className="text-[10px] text-muted-foreground mt-1.5 block uppercase tracking-wider">{timeAgo(block.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </motion.div>
          )}

          {/* ====== FULL CHATS ====== */}
          {activeTab === "chats" && (
            <motion.div key="chats" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search chats..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { const id = createNewSession(); navigate(`/chat/${id}`); }}
                  className="rounded-full glass-shimmer"
                  title="New chat"
                >
                  <Plus className="h-4.5 w-4.5 text-primary" />
                </Button>
              </div>

              {!isLoaded ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="p-4 rounded-xl border border-border/30 bg-muted/20"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></div>)}</div>
              ) : filteredChats.length === 0 ? (
                <EmptyState icon={MessageSquare} text={chatSearch ? "No matching chats" : "No chats yet"} sub="Start a conversation to see history here" />
              ) : (
                <>
                <div className="space-y-1.5">
                  {filteredChats.slice((chatPage - 1) * ITEMS_PER_PAGE, chatPage * ITEMS_PER_PAGE).map((session, i) => (
                    <div
                      key={session.id}
                      className={cn(
                        "p-4 cursor-pointer group transition-all rounded-xl border",
                        currentSessionId === session.id
                          ? "border-primary/40 bg-primary/8 shadow-[0_0_15px_hsl(var(--primary)/0.08)]"
                          : "border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5"
                      )}
                      onClick={() => { loadSession(session.id); navigate(`/chat/${session.id}`); }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={cn(
                            "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                            currentSessionId === session.id ? "bg-primary/15" : "bg-muted/40"
                          )}>
                            <MessageSquare className={cn("h-3.5 w-3.5", currentSessionId === session.id ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={cn("font-semibold truncate text-sm", currentSessionId === session.id ? "text-primary" : "text-foreground")}>
                              {session.title}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>{timeAgo(session.lastMessageAt)}</span>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{session.messageCount ?? session.messages.length} msgs</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0" onClick={(e) => handleDeleteChat(session.id, e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationBar current={chatPage} total={Math.ceil(filteredChats.length / ITEMS_PER_PAGE)} onChange={setChatPage} />
                </>
              )}
            </motion.div>
          )}

          {/* ====== FULL IMAGES ====== */}
          {activeTab === "images" && (
            <motion.div key="images" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {viewingImageIndex !== null && currentImage ? (
                  <motion.div key="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setViewingImageIndex(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft className="h-4 w-4" /> Back to gallery
                      </button>
                      <span className="text-xs text-muted-foreground font-medium">{viewingImageIndex + 1} / {filteredImages.length}</span>
                    </div>

                    <div className="rounded-2xl overflow-hidden border border-border/30 bg-muted/10">
                      <div className="relative flex items-center justify-center bg-black/20 min-h-[300px] sm:min-h-[400px] max-h-[70vh] group">
                        <SmoothImage src={currentImage.url} alt={currentImage.prompt} className="w-full h-full max-h-[70vh] object-contain" />
                        {viewingImageIndex > 0 && (
                          <button onClick={() => setViewingImageIndex(viewingImageIndex - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100">
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                        )}
                        {viewingImageIndex < filteredImages.length - 1 && (
                          <button onClick={() => setViewingImageIndex(viewingImageIndex + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100">
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      <div className="p-4 sm:p-5 space-y-3 border-t border-border/20">
                        <p className="text-sm text-foreground leading-relaxed">{currentImage.prompt || "Generated image"}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{currentImage.timestamp.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => downloadImage(currentImage)} className="rounded-xl border-border/40 bg-muted/20 hover:bg-muted/40">
                            <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { loadSession(currentImage.sessionId); navigate(`/chat/${currentImage.sessionId}`); }} className="rounded-xl border-border/40 bg-muted/20 hover:bg-muted/40">
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Go to chat
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
                      {filteredImages.map((img, i) => (
                        <button
                          key={`thumb-${i}`}
                          onClick={() => setViewingImageIndex(i)}
                          className={cn(
                            "shrink-0 h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden border-2 transition-all",
                            i === viewingImageIndex ? "border-primary ring-1 ring-primary/40 scale-105" : "border-transparent opacity-50 hover:opacity-100"
                          )}
                        >
                          <SmoothImage src={img.url} alt="" className="w-full h-full object-cover" thumbnail />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={imageSearch} onChange={e => setImageSearch(e.target.value)} placeholder="Search images by prompt..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                    </div>

                    {isImagesLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
                      </div>
                    ) : filteredImages.length === 0 ? (
                      <EmptyState icon={Image} text={imageSearch ? "No matching images" : "No images yet"} sub="Ask Arc to generate an image" />
                    ) : (
                      <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {filteredImages.slice((imagePage - 1) * ITEMS_PER_PAGE, imagePage * ITEMS_PER_PAGE).map((img, i) => {
                          const globalIndex = (imagePage - 1) * ITEMS_PER_PAGE + i;
                          return <ImageCard key={`${img.sessionId}-${globalIndex}`} img={img} onClick={() => setViewingImageIndex(globalIndex)} index={i} />;
                        })}
                      </div>
                      <PaginationBar current={imagePage} total={Math.ceil(filteredImages.length / ITEMS_PER_PAGE)} onChange={setImagePage} />
                      {dbHasMoreSessions && dbImagesLoading && (
                        <div className="flex justify-center pt-2">
                          <span className="text-xs text-muted-foreground animate-pulse">Loading more images…</span>
                        </div>
                      )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}


          {/* ====== FULL CANVASES ====== */}
          {activeTab === "canvases" && (
            <motion.div key="canvases" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {selectedCanvas ? (
                  <motion.div key="canvas-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setSelectedCanvas(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft className="h-4 w-4" /> Back to canvases
                      </button>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-border/30 bg-muted/10">
                      <div className="p-4 border-b border-border/20 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {selectedCanvas.type === 'code' ? <FileCode className="h-4 w-4 text-primary shrink-0" /> : <PenLine className="h-4 w-4 text-primary shrink-0" />}
                          <p className="font-semibold text-foreground truncate text-sm">{selectedCanvas.label}</p>
                          {selectedCanvas.language && selectedCanvas.language !== 'text' && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", getLanguageColor(selectedCanvas.language))}>{getLanguageDisplay(selectedCanvas.language)}</span>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="outline" size="sm" className="rounded-xl border-border/40 bg-muted/20" onClick={() => { loadSession(selectedCanvas.sessionId); navigate(`/chat/${selectedCanvas.sessionId}`); openWithContent(selectedCanvas.content, selectedCanvas.type, selectedCanvas.language || 'text'); }}>
                            <Eye className="h-3.5 w-3.5 mr-1.5" /> Open
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-xl border-border/40 bg-muted/20" onClick={() => { loadSession(selectedCanvas.sessionId); navigate(`/chat/${selectedCanvas.sessionId}`); }}>
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Chat
                          </Button>
                        </div>
                      </div>
                      {selectedCanvas.type === 'code' && selectedCanvas.language && canPreview(selectedCanvas.language) ? (
                        <div className="relative w-full" style={{ height: '420px' }}>
                          <CodePreview code={selectedCanvas.content} language={selectedCanvas.language} />
                        </div>
                      ) : (
                        <pre className="p-4 text-xs font-mono text-foreground/80 overflow-auto max-h-[420px] whitespace-pre-wrap leading-relaxed">
                          {selectedCanvas.content.slice(0, 3000)}{selectedCanvas.content.length > 3000 ? '\n…' : ''}
                        </pre>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="canvas-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={canvasSearch} onChange={e => setCanvasSearch(e.target.value)} placeholder="Search canvases…" className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                    </div>
                    {!allSessionsHydrated && isHydratingAll ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[1,2,3,4].map(i => <div key={i} className="rounded-xl border border-border/30 bg-muted/20 overflow-hidden"><Skeleton className="h-32 w-full" /><div className="p-3"><Skeleton className="h-4 w-3/4 mb-1.5" /><Skeleton className="h-3 w-1/2" /></div></div>)}
                      </div>
                    ) : filteredCanvases.length === 0 ? (
                      <EmptyState icon={Layers} text={canvasSearch ? "No matching canvases" : "No canvases yet"} sub="Ask Arc to write code or use /write" />
                    ) : (
                      <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredCanvases.slice((canvasPage - 1) * ITEMS_PER_PAGE, canvasPage * ITEMS_PER_PAGE).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-border/30 bg-muted/15 overflow-hidden cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all group"
                            onClick={() => setSelectedCanvas(item)}
                          >
                            {/* Preview area */}
                            <div className="relative bg-black/20 overflow-hidden" style={{ height: '130px' }}>
                              {item.type === 'code' && item.language && canPreview(item.language) ? (
                                <div className="w-full h-full pointer-events-none scale-[0.6] origin-top-left" style={{ width: '167%', height: '167%' }}>
                                  <CodePreview code={item.content} language={item.language} />
                                </div>
                              ) : (
                                <div className="p-3 h-full overflow-hidden">
                                  {item.type === 'writing' ? (
                                    <p className="text-xs text-foreground/60 leading-relaxed line-clamp-6 font-serif">{item.content}</p>
                                  ) : (
                                    <pre className="text-[10px] font-mono text-foreground/50 leading-relaxed overflow-hidden whitespace-pre-wrap line-clamp-8">{item.content}</pre>
                                  )}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40 pointer-events-none" />
                            </div>
                            {/* Card info */}
                            <div className="p-3 flex items-center gap-2">
                              {item.type === 'code' ? <FileCode className="h-3.5 w-3.5 text-primary/60 shrink-0" /> : <PenLine className="h-3.5 w-3.5 text-primary/60 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{item.sessionTitle} · {item.timestamp.toLocaleDateString()}</p>
                              </div>
                              {item.language && item.language !== 'text' && (
                                <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium shrink-0", getLanguageColor(item.language))}>{getLanguageDisplay(item.language)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <PaginationBar current={canvasPage} total={Math.ceil(filteredCanvases.length / ITEMS_PER_PAGE)} onChange={setCanvasPage} />
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ====== FULL MEMORIES ====== */}
          {activeTab === "memories" && (
            <motion.div key="memories" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={memorySearch} onChange={e => setMemorySearch(e.target.value)} placeholder="Search memories..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                </div>
                <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={() => { setIsAddingMemory(true); setNewMemoryContent(""); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
                <span className="text-[11px] text-muted-foreground shrink-0 font-medium">{filteredMemories.length} memor{filteredMemories.length !== 1 ? 'ies' : 'y'}</span>
              </div>

              {/* Add new memory form */}
              {isAddingMemory && (
                <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                  <Textarea
                    value={newMemoryContent}
                    onChange={e => setNewMemoryContent(e.target.value)}
                    placeholder="Add something Arc should remember..."
                    className="bg-muted/30 border-border/40 rounded-xl min-h-[70px] resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="rounded-xl" onClick={async () => { if (newMemoryContent.trim()) { await addBlock(newMemoryContent.trim(), 'manual'); setNewMemoryContent(""); setIsAddingMemory(false); } }} disabled={!newMemoryContent.trim()}>
                      <Check className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setIsAddingMemory(false); setNewMemoryContent(""); }}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {blocksLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="p-4 rounded-xl border border-border/30 bg-muted/20"><Skeleton className="h-4 w-full" /></div>)}</div>
              ) : filteredMemories.length === 0 ? (
                <EmptyState icon={Brain} text={memorySearch ? "No matching memories" : "No memories yet"} sub='Tell Arc "remember that..." and it will save facts about you' />
              ) : (
                <>
                <div className="space-y-1.5">
                  {filteredMemories.slice((memoryPage - 1) * ITEMS_PER_PAGE, memoryPage * ITEMS_PER_PAGE).map((block, i) => (
                    <div
                      key={block.id}
                      className="p-4 rounded-xl group border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all"
                    >
                      {editingMemoryId === block.id ? (
                        <div className="space-y-3">
                          <Textarea
                            value={editMemoryContent}
                            onChange={e => setEditMemoryContent(e.target.value)}
                            className="bg-muted/30 border-border/40 rounded-xl min-h-[60px] resize-none text-sm"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="rounded-xl" onClick={async () => { if (editMemoryContent.trim()) { await updateBlock(editingMemoryId, editMemoryContent.trim()); setEditingMemoryId(null); setEditMemoryContent(""); } }} disabled={!editMemoryContent.trim()}>
                              <Check className="h-3 w-3 mr-1" /> Save
                            </Button>
                            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setEditingMemoryId(null); setEditMemoryContent(""); }}>
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                              <Brain className="h-3.5 w-3.5 text-primary/60" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground/90 leading-relaxed">{block.content}</p>
                              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                                <span>{block.source}</span>
                                <span className="text-muted-foreground/30">·</span>
                                <span>{timeAgo(block.created_at)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-xl hover:bg-primary/10 hover:text-primary" onClick={() => { setEditingMemoryId(block.id); setEditMemoryContent(block.content); }}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-xl hover:bg-destructive/10 hover:text-destructive" onClick={() => deleteBlock(block.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <PaginationBar current={memoryPage} total={Math.ceil(filteredMemories.length / ITEMS_PER_PAGE)} onChange={setMemoryPage} />
                </>
              )}
            </motion.div>
          )}

          {/* ====== DEPLOYS ====== */}
          {activeTab === "deploys" && (
            <motion.div key="deploys" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
              <DeploysPanel />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-4" />
      </div>

      {/* ═══ BOTTOM TAB BAR ═══ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 backdrop-blur-2xl"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5px)',
          background: 'hsl(var(--background) / 0.85)',
        }}
      >
        <div className="relative flex items-center justify-around max-w-lg mx-auto pt-1.5 pb-0 px-2">
          {/* Deterministic indicator — no layoutId */}
          <motion.div
            className="absolute -top-0 h-0.5 w-6 rounded-full bg-primary pointer-events-none"
            animate={{
              left: `calc(${tabs.findIndex(t => t.key === activeTab)} * (100% / ${tabs.length}) + (100% / ${tabs.length} / 2) - 12px)`,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-0 flex-1 relative min-h-[44px] touch-manipulation active:scale-[0.98]",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 transition-all", isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]")} />
                <span className={cn("text-[10px] truncate transition-all", isActive ? "font-semibold" : "font-medium")}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Music Popup */}
      <MusicPopup
        isOpen={isMusicPopupOpen}
        onClose={() => setIsMusicPopupOpen(false)}
      />
    </div>
  );
}

/* ====== Sub-components ====== */

function Section({ title, icon: Icon, action, actionLabel, count, children }: {
  title: string; icon: typeof MessageSquare; action?: () => void; actionLabel?: string; count?: number; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          {title}
          {count !== undefined && <span className="text-[10px] text-muted-foreground font-normal px-1.5 py-0.5 rounded-md bg-muted/40">{count}</span>}
        </h2>
        {action && (
          <button onClick={action} className="text-[11px] text-muted-foreground hover:text-primary font-medium transition-colors flex items-center gap-1">
            {actionLabel || "View all"}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ChatCard({ session, timeAgo, onClick }: { session: any; timeAgo: (d: any) => string; onClick: () => void; index?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl cursor-pointer border border-border/30 hover:border-primary/25 transition-all group"
      style={{ background: 'linear-gradient(135deg, hsl(var(--muted) / 0.25) 0%, hsl(var(--primary) / 0.04) 100%)' }}
      onClick={onClick}
    >
      {/* Left accent strip */}
      <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary/40 group-hover:bg-primary/70 transition-colors" />
      <div className="flex items-center gap-3 p-3.5 pl-4">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' }}
        >
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate text-sm">{session.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-[11px] text-muted-foreground">{timeAgo(session.lastMessageAt)}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[11px] text-muted-foreground">{session.messageCount ?? session.messages.length} msgs</span>
          </div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  );
}

function ImageCard({ img, onClick }: { img: GeneratedImage; onClick: () => void; index?: number }) {
  return (
    <div
      className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group hover:scale-[1.04] hover:-translate-y-0.5 transition-transform"
      style={{
        border: '1px solid hsl(var(--primary) / 0.12)',
        boxShadow: '0 4px 20px hsl(var(--primary) / 0.06)',
      }}
      onClick={onClick}
    >
      <SmoothImage src={img.url} alt={img.prompt} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" thumbnail />
      {/* Shimmer overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2.5">
        <p className="text-white text-xs line-clamp-2 font-medium leading-snug drop-shadow-lg">{img.prompt}</p>
      </div>
      {/* Corner glow */}
      <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-primary/15 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}

function AppIcon({ app, size }: { app: RecentApp; size?: "lg" }) {
  const fav = app.favicon_label ? getFaviconByLabel(app.favicon_label) : null;
  const FavIcon = fav?.icon;
  const s = size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const iconS = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  const radius = size === "lg" ? "rounded-2xl" : "rounded-xl";
  return (
    <div className={cn(s, radius, "bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0")}>
      {FavIcon ? <FavIcon className={iconS} style={{ color: fav?.color }} /> : <Rocket className={cn(iconS, "text-primary/70")} />}
    </div>
  );
}

function AppListCard({ app, timeAgo, onClick }: { app: RecentApp; timeAgo: (d: any) => string; onClick: () => void; index?: number }) {
  return (
    <div
      className="p-3 rounded-xl cursor-pointer flex items-center gap-3 border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all group"
      onClick={onClick}
    >
      <AppIcon app={app} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate text-sm">{app.title}</p>
        <span className="text-[11px] text-muted-foreground">{timeAgo(app.updated_at)}</span>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary/50 group-hover:translate-x-0.5 transition-all" />
    </div>
  );
}

function EmptyState({ icon: Icon, text, sub }: { icon: typeof MessageSquare; text: string; sub: string }) {
  return (
    <div className="relative p-8 rounded-2xl text-center border border-dashed border-border/30 overflow-hidden"
      style={{ background: 'linear-gradient(145deg, hsl(var(--muted) / 0.15) 0%, hsl(var(--primary) / 0.03) 100%)' }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary/5 rounded-full blur-[50px] pointer-events-none" />
      <div className="relative z-10">
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--primary) / 0.04))' }}
        >
          <Icon className="h-5 w-5 text-primary/40" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">{text}</p>
        <p className="text-xs text-muted-foreground/50 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function SkeletonGrid({ cols, square }: { cols: number; square?: boolean }) {
  return (
    <div className={cn("grid gap-2.5", cols === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
      {Array.from({ length: cols }).map((_, i) => square ? <Skeleton key={i} className="aspect-square rounded-xl" /> : (
        <div key={i} className="p-3.5 rounded-xl border border-border/30 bg-muted/10"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
      ))}
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="space-y-1.5">{Array.from({ length: count }).map((_, i) => <div key={i} className="p-3 rounded-xl border border-border/30 bg-muted/10"><Skeleton className="h-4 w-3/4" /></div>)}</div>
  );
}

function PaginationBar({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;

  const goTo = (p: number) => {
    onChange(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Show max 5 page buttons with ellipsis
  const pages: (number | '...')[] = [];
  if (total <= 5) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
  }

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <button
        onClick={() => goTo(current - 1)}
        disabled={current === 1}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-all"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground/50">…</span>
        ) : (
          <button
            key={p}
            onClick={() => goTo(p)}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all",
              p === current
                ? "bg-primary/15 text-primary border border-primary/25"
                : "text-muted-foreground hover:bg-muted/40"
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => goTo(current + 1)}
        disabled={current === total}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-all"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <span className="ml-2 text-[10px] text-muted-foreground/50">{current}/{total}</span>
    </div>
  );
}
