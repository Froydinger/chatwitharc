import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MessageSquare, Image, Rocket, Brain, ArrowLeft, ArrowRight,
  Plus, Clock, Sparkles, ExternalLink, Settings, Search,
  Trash2, Download, LayoutDashboard, ChevronLeft, ChevronRight,
  X, Globe, Code2, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
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
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";
import { getFaviconByLabel } from "@/constants/faviconOptions";
import { useAdminBanner } from "@/components/AdminBanner";
import { useAccentColor } from "@/hooks/useAccentColor";
import { useToast } from "@/hooks/use-toast";
import { ChatInput } from "@/components/ChatInput";

type DashboardTab = "overview" | "chats" | "images" | "apps" | "memories";

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

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as DashboardTab) || "overview";
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const { isLoaded } = useChatSync();
  const {
    chatSessions, createNewSession, loadSession, deleteSession,
    hydrateAllSessions, allSessionsHydrated, isHydratingAll,
    syncFromSupabase, currentSessionId, messages
  } = useArcStore();
  const { blocks: contextBlocks, loading: blocksLoading, deleteBlock } = useContextBlocks();
  const isAdminBannerActive = useAdminBanner();
  const { accentColor } = useAccentColor();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [chatSearch, setChatSearch] = useState("");
  const [imageSearch, setImageSearch] = useState("");
  const [appSearch, setAppSearch] = useState("");
  const [memorySearch, setMemorySearch] = useState("");

  // Image viewer state
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);

  // App detail state
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  // Track message count to detect when ChatInput sends a message and navigate to chat
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      // A message was added — navigate to the current chat
      const sessionId = currentSessionId;
      if (sessionId) {
        navigate(`/chat/${sessionId}`);
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, currentSessionId, navigate]);

  const switchTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setSearchParams(tab === "overview" ? {} : { tab });
    // Reset sub-views when switching tabs
    setViewingImageIndex(null);
    setSelectedAppId(null);
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) hydrateAllSessions();
  }, [user, hydrateAllSessions]);

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

  const allImages = useMemo(() => {
    const images: GeneratedImage[] = [];
    chatSessions.forEach(session => {
      session.messages.forEach(msg => {
        if (msg?.type === 'image' && msg?.imageUrl && msg?.role === 'assistant') {
          const ts = toDate(msg?.timestamp);
          if (!ts) return;
          images.push({
            url: msg.imageUrl,
            prompt: typeof msg?.content === 'string' ? msg.content.replace('Generated image: ', '') : '',
            sessionId: session.id,
            messageId: msg.id,
            timestamp: ts,
          });
        }
      });
    });
    images.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return images;
  }, [chatSessions]);

  const filteredImages = useMemo(() => {
    if (!imageSearch.trim()) return allImages;
    const q = imageSearch.toLowerCase();
    return allImages.filter(img => img.prompt.toLowerCase().includes(q));
  }, [allImages, imageSearch]);

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

  const isImagesLoading = isHydratingAll && !allSessionsHydrated;
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

  // Keyboard navigation for image viewer
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

  if (authLoading) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const tabs: { key: DashboardTab; label: string; icon: typeof MessageSquare; count?: number }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "chats", label: "Chats", icon: MessageSquare, count: allChats.length },
    { key: "images", label: "Images", icon: Image, count: allImages.length },
    { key: "apps", label: "Apps", icon: Rocket, count: recentApps.length },
    { key: "memories", label: "Memories", icon: Brain, count: contextBlocks.length },
  ];

  const currentImage = viewingImageIndex !== null ? filteredImages[viewingImageIndex] : null;

  return (
    <div
      className="min-h-screen overflow-y-auto scrollbar-hide relative z-10"
      style={{ paddingTop: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ThemedLogo className="h-8 w-8" />
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-foreground">
                {greeting}{profile?.display_name ? `, ${profile.display_name}` : ""}.
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Your Arc Dashboard</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/settings")} className="rounded-full h-9 w-9" title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </motion.div>

        {/* Chat Input — real ChatInput with full functionality */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <ChatInput />
        </motion.div>

        {/* Tab Navigation */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {tabs.map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0",
                  activeTab === key
                    ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {count !== undefined && count > 0 && (
                  <span className={cn(
                    "text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1",
                    activeTab === key ? "bg-primary/30 text-primary" : "bg-muted/50 text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {/* ====== OVERVIEW ====== */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <Section title="Recent Chats" icon={MessageSquare} action={() => switchTab("chats")} actionLabel="See all">
                {!isLoaded ? <SkeletonGrid cols={3} /> : allChats.length === 0 ? (
                  <EmptyState icon={MessageSquare} text="No chats yet" sub="Start a conversation above!" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {allChats.slice(0, isMobile ? 3 : 6).map(session => (
                      <ChatCard key={session.id} session={session} timeAgo={timeAgo} onClick={() => { loadSession(session.id); navigate(`/chat/${session.id}`); }} />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Recent Images" icon={Image} action={() => switchTab("images")} actionLabel="See all">
                {isImagesLoading ? <SkeletonGrid cols={4} square /> : allImages.length === 0 ? (
                  <EmptyState icon={Image} text="No images yet" sub="Ask Arc to generate one!" />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {allImages.slice(0, 8).map((img, i) => (
                      <ImageCard key={`${img.sessionId}-${i}`} img={img} onClick={() => { switchTab("images"); setViewingImageIndex(i); }} />
                    ))}
                  </div>
                )}
              </Section>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Section title="Apps" icon={Rocket} action={() => switchTab("apps")} actionLabel="See all">
                  {loadingApps ? <SkeletonList count={2} /> : recentApps.length === 0 ? (
                    <EmptyState icon={Rocket} text="No apps yet" sub="Use /build to create one" />
                  ) : (
                    <div className="space-y-2">
                      {recentApps.slice(0, 3).map(app => (
                        <AppListCard key={app.id} app={app} timeAgo={timeAgo} onClick={() => { switchTab("apps"); setSelectedAppId(app.id); }} />
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Memories" icon={Brain} action={() => switchTab("memories")} actionLabel="See all" count={contextBlocks.length}>
                  {blocksLoading ? <SkeletonList count={3} /> : contextBlocks.length === 0 ? (
                    <EmptyState icon={Brain} text="No memories yet" sub='Say "remember that..."' />
                  ) : (
                    <div className="space-y-2">
                      {contextBlocks.slice(0, 4).map(block => (
                        <GlassCard key={block.id} className="p-3 rounded-xl">
                          <p className="text-sm text-foreground line-clamp-2">{block.content}</p>
                          <span className="text-xs text-muted-foreground mt-1 block">{timeAgo(block.created_at)}</span>
                        </GlassCard>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </motion.div>
          )}

          {/* ====== FULL CHATS ====== */}
          {activeTab === "chats" && (
            <motion.div key="chats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search chats..." className="pl-9" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => { const id = createNewSession(); navigate(`/chat/${id}`); }} title="New chat" className="rounded-full h-10 w-10">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {!isLoaded ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <GlassCard key={i} className="p-4 rounded-xl"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></GlassCard>)}</div>
              ) : filteredChats.length === 0 ? (
                <EmptyState icon={MessageSquare} text={chatSearch ? "No matching chats" : "No chats yet"} sub="Start a conversation to see history here" />
              ) : (
                <div className="space-y-2">
                  {filteredChats.map(session => (
                    <div
                      key={session.id}
                      className={cn(
                        "p-4 cursor-pointer group transition-all rounded-xl border",
                        currentSessionId === session.id ? "border-primary/50 bg-primary/10 glass" : "border-border/40 hover:border-primary/30 glass"
                      )}
                      onClick={() => { loadSession(session.id); navigate(`/chat/${session.id}`); }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h4 className={cn("font-medium truncate text-sm", currentSessionId === session.id ? "text-primary" : "text-foreground")}>
                              {session.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{session.messageCount ?? session.messages.length} messages</span>
                              <span>·</span>
                              <span>{timeAgo(session.lastMessageAt)}</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0" onClick={(e) => handleDeleteChat(session.id, e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ====== FULL IMAGES (with inline viewer) ====== */}
          {activeTab === "images" && (
            <motion.div key="images" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {viewingImageIndex !== null && currentImage ? (
                  /* ---- IMAGE VIEWER ---- */
                  <motion.div key="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    {/* Back + counter */}
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="sm" onClick={() => setViewingImageIndex(null)} className="text-muted-foreground">
                        <ChevronLeft className="h-4 w-4 mr-1" /> Back to gallery
                      </Button>
                      <span className="text-xs text-muted-foreground">{viewingImageIndex + 1} of {filteredImages.length}</span>
                    </div>

                    {/* Main image */}
                    <GlassCard className="rounded-2xl overflow-hidden relative group">
                      <div className="relative flex items-center justify-center bg-black/20 min-h-[300px] sm:min-h-[400px] max-h-[70vh]">
                        <SmoothImage src={currentImage.url} alt={currentImage.prompt} className="w-full h-full max-h-[70vh] object-contain" />

                        {/* Prev/Next arrows */}
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

                      {/* Image info bar */}
                      <div className="p-4 sm:p-5 space-y-3">
                        <p className="text-sm text-foreground leading-relaxed">{currentImage.prompt || "Generated image"}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{currentImage.timestamp.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => downloadImage(currentImage)} className="glass">
                            <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { loadSession(currentImage.sessionId); navigate(`/chat/${currentImage.sessionId}`); }} className="glass">
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Go to chat
                          </Button>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Thumbnail strip */}
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
                      {filteredImages.map((img, i) => (
                        <button
                          key={`thumb-${i}`}
                          onClick={() => setViewingImageIndex(i)}
                          className={cn(
                            "shrink-0 h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden border-2 transition-all",
                            i === viewingImageIndex ? "border-primary ring-1 ring-primary/40 scale-105" : "border-transparent opacity-60 hover:opacity-100"
                          )}
                        >
                          <SmoothImage src={img.url} alt="" className="w-full h-full object-cover" thumbnail />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  /* ---- IMAGE GRID ---- */
                  <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={imageSearch} onChange={e => setImageSearch(e.target.value)} placeholder="Search images by prompt..." className="pl-9" />
                    </div>

                    {isImagesLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="aspect-square rounded-xl" />)}
                      </div>
                    ) : filteredImages.length === 0 ? (
                      <EmptyState icon={Image} text={imageSearch ? "No matching images" : "No images yet"} sub="Ask Arc to generate an image" />
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {filteredImages.map((img, i) => (
                          <ImageCard key={`${img.sessionId}-${i}`} img={img} onClick={() => setViewingImageIndex(i)} />
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ====== FULL APPS (with detail view) ====== */}
          {activeTab === "apps" && (
            <motion.div key="apps" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {selectedApp ? (
                  /* ---- APP DETAIL ---- */
                  <motion.div key="app-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedAppId(null)} className="text-muted-foreground">
                      <ChevronLeft className="h-4 w-4 mr-1" /> Back to apps
                    </Button>

                    <GlassCard className="rounded-2xl overflow-hidden">
                      {/* App header */}
                      <div className="p-5 sm:p-6 space-y-4">
                        <div className="flex items-start gap-4">
                          <AppIcon app={selectedApp} size="lg" />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-foreground">{selectedApp.title}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <span>v{selectedApp.version}</span>
                              <span>·</span>
                              <span>Updated {timeAgo(selectedApp.updated_at)}</span>
                              <span>·</span>
                              <span>Created {new Date(selectedApp.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        {selectedApp.prompt && (
                          <div className="glass rounded-xl p-3">
                            <p className="text-xs text-muted-foreground mb-1">Original prompt</p>
                            <p className="text-sm text-foreground line-clamp-4">{selectedApp.prompt}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => navigate(`/apps/${selectedApp.id}`)} className="glass-shimmer">
                            <Code2 className="h-3.5 w-3.5 mr-1.5" /> Open in Builder
                          </Button>
                          {selectedApp.netlify_url && (
                            <Button variant="outline" size="sm" onClick={() => window.open(selectedApp.netlify_url!, '_blank')} className="glass">
                              <Globe className="h-3.5 w-3.5 mr-1.5" /> View Live
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => deleteApp(selectedApp.id)} className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40">
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                          </Button>
                        </div>
                      </div>

                      {/* Live preview iframe */}
                      {selectedApp.netlify_url && (
                        <div className="border-t border-border/40">
                          <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <Eye className="h-3 w-3" />
                            <span>Live Preview</span>
                          </div>
                          <div className="relative w-full aspect-video bg-black/10">
                            <iframe
                              src={selectedApp.netlify_url}
                              className="w-full h-full border-0"
                              title={selectedApp.title}
                              sandbox="allow-scripts allow-same-origin"
                            />
                          </div>
                        </div>
                      )}
                    </GlassCard>
                  </motion.div>
                ) : (
                  /* ---- APP LIST ---- */
                  <motion.div key="app-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={appSearch} onChange={e => setAppSearch(e.target.value)} placeholder="Search apps..." className="pl-9" />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => navigate("/apps")} className="text-xs text-muted-foreground shrink-0">
                        New App
                      </Button>
                    </div>

                    {loadingApps ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[1,2,3,4].map(i => <GlassCard key={i} className="p-4 rounded-xl"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></GlassCard>)}
                      </div>
                    ) : filteredApps.length === 0 ? (
                      <EmptyState icon={Rocket} text={appSearch ? "No matching apps" : "No apps yet"} sub="Use /build to create your first app" />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredApps.map(app => (
                          <GlassCard key={app.id} className="p-4 rounded-xl cursor-pointer hover:scale-[1.01] transition-transform group" onClick={() => setSelectedAppId(app.id)}>
                            <div className="flex items-center gap-3">
                              <AppIcon app={app} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground truncate text-sm">{app.title}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                                  <span>v{app.version}</span>
                                  <span>·</span>
                                  <span>{timeAgo(app.updated_at)}</span>
                                  {app.netlify_url && <Globe className="h-3 w-3 text-primary/60 ml-1" />}
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0" onClick={(e) => { e.stopPropagation(); deleteApp(app.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            {app.prompt && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{app.prompt}</p>}
                          </GlassCard>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ====== FULL MEMORIES ====== */}
          {activeTab === "memories" && (
            <motion.div key="memories" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={memorySearch} onChange={e => setMemorySearch(e.target.value)} placeholder="Search memories..." className="pl-9" />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{filteredMemories.length} memor{filteredMemories.length !== 1 ? 'ies' : 'y'}</span>
              </div>

              {blocksLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <GlassCard key={i} className="p-4 rounded-xl"><Skeleton className="h-4 w-full" /></GlassCard>)}</div>
              ) : filteredMemories.length === 0 ? (
                <EmptyState icon={Brain} text={memorySearch ? "No matching memories" : "No memories yet"} sub='Tell Arc "remember that..." and it will save facts about you' />
              ) : (
                <div className="space-y-2">
                  {filteredMemories.map(block => (
                    <GlassCard key={block.id} className="p-4 rounded-xl group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">{block.content}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            <span className="capitalize">{block.source}</span>
                            <span>·</span>
                            <span>{timeAgo(block.created_at)}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0" onClick={() => deleteBlock(block.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-8" />
      </div>
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
          <Icon className="h-4 w-4 text-primary" />
          {title}
          {count !== undefined && <span className="text-xs text-muted-foreground font-normal">({count})</span>}
        </h2>
        {action && (
          <Button variant="ghost" size="sm" onClick={action} className="text-xs text-muted-foreground h-7 px-2">
            {actionLabel || "View all"}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

function ChatCard({ session, timeAgo, onClick }: { session: any; timeAgo: (d: any) => string; onClick: () => void }) {
  return (
    <GlassCard className="p-3.5 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform" onClick={onClick}>
      <p className="font-medium text-foreground truncate text-sm">{session.title}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{timeAgo(session.lastMessageAt)}</span>
        <span className="text-xs text-muted-foreground">· {session.messageCount ?? session.messages.length} msgs</span>
      </div>
    </GlassCard>
  );
}

function ImageCard({ img, onClick }: { img: GeneratedImage; onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      className="relative aspect-square rounded-xl overflow-hidden cursor-pointer glass group"
      onClick={onClick}
    >
      <SmoothImage src={img.url} alt={img.prompt} className="w-full h-full object-cover" thumbnail />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
        <p className="text-white text-xs line-clamp-2">{img.prompt}</p>
      </div>
    </motion.div>
  );
}

function AppIcon({ app, size }: { app: RecentApp; size?: "lg" }) {
  const fav = app.favicon_label ? getFaviconByLabel(app.favicon_label) : null;
  const FavIcon = fav?.icon;
  const s = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  const iconS = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  return (
    <div className={cn(s, "rounded-xl bg-muted/50 flex items-center justify-center shrink-0")}>
      {FavIcon ? <FavIcon className={iconS} style={{ color: fav?.color }} /> : <Rocket className={cn(iconS, "text-primary")} />}
    </div>
  );
}

function AppListCard({ app, timeAgo, onClick }: { app: RecentApp; timeAgo: (d: any) => string; onClick: () => void }) {
  return (
    <GlassCard className="p-3 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform flex items-center gap-3" onClick={onClick}>
      <AppIcon app={app} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate text-sm">{app.title}</p>
        <span className="text-xs text-muted-foreground">{timeAgo(app.updated_at)}</span>
      </div>
    </GlassCard>
  );
}

function EmptyState({ icon: Icon, text, sub }: { icon: typeof MessageSquare; text: string; sub: string }) {
  return (
    <GlassCard className="p-6 rounded-xl text-center">
      <Icon className="h-8 w-8 text-primary/30 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </GlassCard>
  );
}

function SkeletonGrid({ cols, square }: { cols: number; square?: boolean }) {
  return (
    <div className={cn("grid gap-2.5", cols === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
      {Array.from({ length: cols }).map((_, i) => square ? <Skeleton key={i} className="aspect-square rounded-xl" /> : (
        <GlassCard key={i} className="p-3.5 rounded-xl"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></GlassCard>
      ))}
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="space-y-2">{Array.from({ length: count }).map((_, i) => <GlassCard key={i} className="p-3 rounded-xl"><Skeleton className="h-4 w-3/4" /></GlassCard>)}</div>
  );
}
