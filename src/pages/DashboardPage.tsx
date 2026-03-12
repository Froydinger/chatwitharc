import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MessageSquare, Image, Rocket, Brain,
  Plus, Clock, Settings, Search,
  Trash2, Download, LayoutDashboard, ChevronLeft, ChevronRight,
  Globe, Code2, Eye, Sparkles, Zap, ArrowRight
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
  const { isSubscribed, subscriptionEnd, openCheckout } = useSubscription();
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
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const sessionId = currentSessionId;
      if (sessionId) navigate(`/chat/${sessionId}`);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, currentSessionId, navigate]);

  const switchTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setSearchParams(tab === "overview" ? {} : { tab });
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

  const tabs: { key: DashboardTab; label: string; icon: typeof MessageSquare }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "chats", label: "Chats", icon: MessageSquare },
    { key: "images", label: "Images", icon: Image },
    { key: "apps", label: "Apps", icon: Rocket },
    { key: "memories", label: "Memories", icon: Brain },
  ];

  const currentImage = viewingImageIndex !== null ? filteredImages[viewingImageIndex] : null;

  // Stats for overview
  const stats = [
    { label: "Chats", value: allChats.length, icon: MessageSquare },
    { label: "Images", value: allImages.length, icon: Image },
    { label: "Apps", value: recentApps.length, icon: Rocket },
    { label: "Memories", value: contextBlocks.length, icon: Brain },
  ];

  return (
    <div
      className="min-h-screen overflow-y-auto scrollbar-hide relative z-10"
      style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'})`,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px) + 15px)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">

        {/* ═══ HEADER with ambient glow ═══ */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.8, 0.25, 1] }}
          className="relative"
        >
          {/* Ambient glow behind greeting */}
          <div className="absolute -top-12 left-1/4 w-48 h-48 rounded-full bg-primary/8 blur-[80px] pointer-events-none" />
          <div className="absolute -top-8 right-1/3 w-32 h-32 rounded-full bg-primary/5 blur-[60px] pointer-events-none" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="relative h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 hover:border-primary/30 hover:shadow-[0_0_15px_hsl(var(--primary)/0.15)] transition-all active:scale-95"
                title="Back to chat"
              >
                <MessageSquare className="h-4.5 w-4.5 text-primary" />
              </button>
              <ThemedLogo className="h-9 w-9" />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  {greeting}{profile?.display_name ? `, ${profile.display_name}` : ""}.
                </h1>
              </div>
            </div>
            <button
              onClick={() => navigate("/dashboard/settings")}
              className="h-10 w-10 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center hover:bg-muted hover:border-border transition-all active:scale-95"
              title="Settings"
            >
              <Settings className="h-4.5 w-4.5 text-muted-foreground" />
            </button>
          </div>
        </motion.div>

        {/* ═══ CHAT INPUT ═══ */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.4 }}>
          <ChatInput />
        </motion.div>

        {/* ═══ SUBSCRIPTION BADGE / CTA ═══ */}
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.35 }}>
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
        </motion.div>

        {/* ═══ TAB CONTENT ═══ */}
        <AnimatePresence mode="wait">
          {/* ====== OVERVIEW ====== */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-6">

              {/* Stat cards with gradient fills */}
              <div className="grid grid-cols-4 gap-2">
                {stats.map(({ label, value, icon: Icon }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 14, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.12 + i * 0.06, type: "spring", stiffness: 300, damping: 20 }}
                    className="relative overflow-hidden rounded-2xl p-3 text-center group cursor-pointer transition-all hover:scale-[1.04] active:scale-[0.97]"
                    style={{
                      background: `linear-gradient(145deg, hsl(var(--primary) / 0.12) 0%, hsl(var(--muted) / 0.3) 100%)`,
                      border: '1px solid hsl(var(--primary) / 0.15)',
                      boxShadow: '0 2px 12px hsl(var(--primary) / 0.06), inset 0 1px 0 hsl(var(--foreground) / 0.04)',
                    }}
                    onClick={() => switchTab(tabs[i + 1]?.key || "overview")}
                  >
                    {/* Subtle inner glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-8 bg-primary/10 blur-xl rounded-full pointer-events-none" />
                    <Icon className="h-4 w-4 text-primary mx-auto mb-1 relative z-10 drop-shadow-[0_0_4px_hsl(var(--primary)/0.3)]" />
                    <p className="text-lg font-bold text-foreground leading-none relative z-10">{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider relative z-10">{label}</p>
                  </motion.div>
                ))}
              </div>

              {/* Recent Chats */}
              <Section title="Recent Chats" icon={MessageSquare} action={() => switchTab("chats")} actionLabel="See all">
                {!isLoaded ? <SkeletonGrid cols={3} /> : allChats.length === 0 ? (
                  <EmptyState icon={MessageSquare} text="No chats yet" sub="Start a conversation above!" />
                ) : (
                  <div className="space-y-1.5">
                    {allChats.slice(0, isMobile ? 3 : 5).map((session, i) => (
                      <ChatCard key={session.id} session={session} timeAgo={timeAgo} onClick={() => { loadSession(session.id); navigate(`/chat/${session.id}`); }} index={i} />
                    ))}
                  </div>
                )}
              </Section>

              {/* Recent Images */}
              <Section title="Recent Images" icon={Image} action={() => switchTab("images")} actionLabel="See all">
                {isImagesLoading ? <SkeletonGrid cols={4} square /> : allImages.length === 0 ? (
                  <EmptyState icon={Image} text="No images yet" sub="Ask Arc to generate one!" />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {allImages.slice(0, 8).map((img, i) => (
                      <ImageCard key={`${img.sessionId}-${i}`} img={img} onClick={() => { switchTab("images"); setViewingImageIndex(i); }} index={i} />
                    ))}
                  </div>
                )}
              </Section>

              {/* Apps + Memories side-by-side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Section title="Apps" icon={Rocket} action={() => switchTab("apps")} actionLabel="See all">
                  {loadingApps ? <SkeletonList count={2} /> : recentApps.length === 0 ? (
                    <EmptyState icon={Rocket} text="No apps yet" sub="Use /build to create one" />
                  ) : (
                    <div className="space-y-1.5">
                      {recentApps.slice(0, 3).map((app, i) => (
                        <AppListCard key={app.id} app={app} timeAgo={timeAgo} onClick={() => { switchTab("apps"); setSelectedAppId(app.id); }} index={i} />
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Memories" icon={Brain} action={() => switchTab("memories")} actionLabel="See all" count={contextBlocks.length}>
                  {blocksLoading ? <SkeletonList count={3} /> : contextBlocks.length === 0 ? (
                    <EmptyState icon={Brain} text="No memories yet" sub='Say "remember that..."' />
                  ) : (
                    <div className="space-y-1.5">
                      {contextBlocks.slice(0, 4).map((block, i) => (
                        <motion.div
                          key={block.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="group p-3 rounded-xl border border-border/30 bg-muted/20 hover:border-primary/20 hover:bg-primary/5 transition-all"
                        >
                          <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed">{block.content}</p>
                          <span className="text-[10px] text-muted-foreground mt-1.5 block uppercase tracking-wider">{timeAgo(block.created_at)}</span>
                        </motion.div>
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
                <button
                  onClick={() => { const id = createNewSession(); navigate(`/chat/${id}`); }}
                  className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition-all active:scale-95"
                  title="New chat"
                >
                  <Plus className="h-4.5 w-4.5 text-primary" />
                </button>
              </div>

              {!isLoaded ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="p-4 rounded-xl border border-border/30 bg-muted/20"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></div>)}</div>
              ) : filteredChats.length === 0 ? (
                <EmptyState icon={MessageSquare} text={chatSearch ? "No matching chats" : "No chats yet"} sub="Start a conversation to see history here" />
              ) : (
                <div className="space-y-1.5">
                  {filteredChats.map((session, i) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
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
                    </motion.div>
                  ))}
                </div>
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {filteredImages.map((img, i) => (
                          <ImageCard key={`${img.sessionId}-${i}`} img={img} onClick={() => setViewingImageIndex(i)} index={i} />
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ====== FULL APPS ====== */}
          {activeTab === "apps" && (
            <motion.div key="apps" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {selectedApp ? (
                  <motion.div key="app-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <button onClick={() => setSelectedAppId(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronLeft className="h-4 w-4" /> Back to apps
                    </button>
                    <div className="rounded-2xl overflow-hidden border border-border/30 bg-muted/10">
                      <div className="p-5 sm:p-6 space-y-4">
                        <div className="flex items-start gap-4">
                          <AppIcon app={selectedApp} size="lg" />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-foreground">{selectedApp.title}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <span className="px-1.5 py-0.5 rounded-md bg-muted/40 font-medium">v{selectedApp.version}</span>
                              <span>Updated {timeAgo(selectedApp.updated_at)}</span>
                              <span className="text-muted-foreground/40">·</span>
                              <span>Created {new Date(selectedApp.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        {selectedApp.prompt && (
                          <div className="rounded-xl p-3 border border-border/20 bg-muted/20">
                            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Original prompt</p>
                            <p className="text-sm text-foreground/90 line-clamp-4 leading-relaxed">{selectedApp.prompt}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => navigate(`/apps/${selectedApp.id}`)} className="rounded-xl glass-shimmer">
                            <Code2 className="h-3.5 w-3.5 mr-1.5" /> Open in Builder
                          </Button>
                          {selectedApp.netlify_url && (
                            <Button variant="outline" size="sm" onClick={() => window.open(selectedApp.netlify_url!, '_blank')} className="rounded-xl border-border/40 bg-muted/20">
                              <Globe className="h-3.5 w-3.5 mr-1.5" /> View Live
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => deleteApp(selectedApp.id)} className="rounded-xl hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40">
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                          </Button>
                        </div>
                      </div>
                      {selectedApp.netlify_url && (
                        <div className="border-t border-border/20">
                          <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <Eye className="h-3 w-3" />
                            <span>Live Preview</span>
                          </div>
                          <div className="relative w-full aspect-video bg-black/10">
                            <iframe src={selectedApp.netlify_url} className="w-full h-full border-0" title={selectedApp.title} sandbox="allow-scripts allow-same-origin" />
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="app-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={appSearch} onChange={e => setAppSearch(e.target.value)} placeholder="Search apps..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                      </div>
                      <button
                        onClick={() => navigate("/apps")}
                        className="h-10 px-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2 text-xs text-primary font-medium hover:bg-primary/20 transition-all active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" /> New
                      </button>
                    </div>

                    {loadingApps ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[1,2,3,4].map(i => <div key={i} className="p-4 rounded-xl border border-border/30 bg-muted/20"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></div>)}
                      </div>
                    ) : filteredApps.length === 0 ? (
                      <EmptyState icon={Rocket} text={appSearch ? "No matching apps" : "No apps yet"} sub="Use /build to create your first app" />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredApps.map((app, i) => (
                          <motion.div
                            key={app.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="p-4 rounded-xl cursor-pointer group border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all"
                            onClick={() => setSelectedAppId(app.id)}
                          >
                            <div className="flex items-center gap-3">
                              <AppIcon app={app} />
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-foreground truncate text-sm">{app.title}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                                  <span className="px-1 py-0.5 rounded bg-muted/40 font-medium">v{app.version}</span>
                                  <span>{timeAgo(app.updated_at)}</span>
                                  {app.netlify_url && <Globe className="h-3 w-3 text-primary/50 ml-1" />}
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0" onClick={(e) => { e.stopPropagation(); deleteApp(app.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            {app.prompt && <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-2 leading-relaxed">{app.prompt}</p>}
                          </motion.div>
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
            <motion.div key="memories" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={memorySearch} onChange={e => setMemorySearch(e.target.value)} placeholder="Search memories..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 font-medium">{filteredMemories.length} memor{filteredMemories.length !== 1 ? 'ies' : 'y'}</span>
              </div>

              {blocksLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="p-4 rounded-xl border border-border/30 bg-muted/20"><Skeleton className="h-4 w-full" /></div>)}</div>
              ) : filteredMemories.length === 0 ? (
                <EmptyState icon={Brain} text={memorySearch ? "No matching memories" : "No memories yet"} sub='Tell Arc "remember that..." and it will save facts about you' />
              ) : (
                <div className="space-y-1.5">
                  {filteredMemories.map((block, i) => (
                    <motion.div
                      key={block.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="p-4 rounded-xl group border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all"
                    >
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
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-xl opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0" onClick={() => deleteBlock(block.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-4" />
      </div>

      {/* ═══ BOTTOM TAB BAR ═══ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 backdrop-blur-2xl"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 15px)',
          background: 'hsl(var(--background) / 0.85)',
        }}
      >
        <div className="flex items-center justify-around max-w-lg mx-auto pt-2 pb-0 px-2">
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0 flex-1 relative",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute -top-2 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn("h-5 w-5 transition-all", isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]")} />
                <span className={cn("text-[10px] truncate transition-all", isActive ? "font-semibold" : "font-medium")}>{label}</span>
              </button>
            );
          })}
        </div>
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

function ChatCard({ session, timeAgo, onClick, index = 0 }: { session: any; timeAgo: (d: any) => string; onClick: () => void; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 250, damping: 20 }}
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
    </motion.div>
  );
}

function ImageCard({ img, onClick, index = 0 }: { img: GeneratedImage; onClick: () => void; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 200, damping: 18 }}
      whileHover={{ scale: 1.04, y: -2 }}
      className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group"
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
    </motion.div>
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

function AppListCard({ app, timeAgo, onClick, index = 0 }: { app: RecentApp; timeAgo: (d: any) => string; onClick: () => void; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="p-3 rounded-xl cursor-pointer flex items-center gap-3 border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all group"
      onClick={onClick}
    >
      <AppIcon app={app} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate text-sm">{app.title}</p>
        <span className="text-[11px] text-muted-foreground">{timeAgo(app.updated_at)}</span>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary/50 group-hover:translate-x-0.5 transition-all" />
    </motion.div>
  );
}

function EmptyState({ icon: Icon, text, sub }: { icon: typeof MessageSquare; text: string; sub: string }) {
  return (
    <div className="p-8 rounded-2xl text-center border border-dashed border-border/40 bg-muted/10">
      <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-3">
        <Icon className="h-5 w-5 text-primary/30" />
      </div>
      <p className="text-sm text-muted-foreground font-medium">{text}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>
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
