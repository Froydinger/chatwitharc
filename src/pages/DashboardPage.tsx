import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MessageSquare, Image, Rocket, Brain, ArrowLeft, ArrowRight,
  Plus, Clock, Sparkles, ExternalLink, Settings, Search,
  Trash2, Download, RefreshCw, LayoutDashboard
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

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
  favicon_label: string | null;
  netlify_url: string | null;
  updated_at: string;
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
    syncFromSupabase, currentSessionId
  } = useArcStore();
  const { blocks: contextBlocks, loading: blocksLoading, deleteBlock } = useContextBlocks();
  const isAdminBannerActive = useAdminBanner();
  const { accentColor } = useAccentColor();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [imageSearch, setImageSearch] = useState("");
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync tab with URL
  const switchTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setSearchParams(tab === "overview" ? {} : { tab });
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
          .select('id, title, favicon_label, netlify_url, updated_at')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false });
        setRecentApps((data || []) as RecentApp[]);
      } catch { /* ignore */ } finally { setLoadingApps(false); }
    })();
  }, [user]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 144) + 'px';
  }, []);

  // ALL chats sorted
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

  // ALL images
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

  const isImagesLoading = isHydratingAll && !allSessionsHydrated;

  const handleSendMessage = () => {
    const msg = inputValue.trim();
    if (!msg) return;
    sessionStorage.setItem('pending-prompt', msg);
    navigate('/');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDeleteChat = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try { deleteSession(sessionId); } catch { /* ignore */ }
    finally { setDeletingId(null); }
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
    } catch { /* ignore */ }
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

  return (
    <div
      className="min-h-screen overflow-y-auto scrollbar-hide relative z-10"
      style={{ paddingTop: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px' }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full h-9 w-9">
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

        {/* Chat Input */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="chat-input-halo flex items-center gap-3 rounded-full glass-shimmer">
            <button type="button" className="ci-menu-btn h-10 w-10 rounded-full flex items-center justify-center glass-shimmer text-muted-foreground hover:text-foreground shrink-0" onClick={() => textareaRef.current?.focus()}>
              <Sparkles className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask Arc anything..."
                className="border-none !bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[24px] max-h-[144px] leading-5 py-1.5 px-4 focus:outline-none focus:ring-0 text-[16px]"
                rows={1}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              className={cn(
                "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
                inputValue.trim()
                  ? accentColor === "noir"
                    ? "!bg-white/90 text-black ring-2 ring-white/60 hover:!bg-white !shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                    : "!bg-primary/80 text-primary-foreground ring-2 ring-primary !shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
                  : "text-muted-foreground cursor-not-allowed"
              )}
              aria-label="Send"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
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
              {/* Recent Chats Preview */}
              <Section title="Recent Chats" icon={MessageSquare} action={() => switchTab("chats")} actionLabel="See all">
                {!isLoaded ? <SkeletonGrid cols={3} /> : allChats.length === 0 ? (
                  <EmptyState icon={MessageSquare} text="No chats yet" sub="Start a conversation above!" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {allChats.slice(0, 6).map(session => (
                      <ChatCard key={session.id} session={session} timeAgo={timeAgo} onClick={() => navigate(`/chat/${session.id}`)} />
                    ))}
                  </div>
                )}
              </Section>

              {/* Images Preview */}
              <Section title="Recent Images" icon={Image} action={() => switchTab("images")} actionLabel="See all">
                {isImagesLoading ? <SkeletonGrid cols={4} square /> : allImages.length === 0 ? (
                  <EmptyState icon={Image} text="No images yet" sub="Ask Arc to generate one!" />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {allImages.slice(0, 8).map((img, i) => (
                      <ImageCard key={`${img.sessionId}-${i}`} img={img} onClick={() => setSelectedImage(img)} />
                    ))}
                  </div>
                )}
              </Section>

              {/* Apps & Memories side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Section title="Apps" icon={Rocket} action={() => switchTab("apps")} actionLabel="See all">
                  {loadingApps ? <SkeletonList count={2} /> : recentApps.length === 0 ? (
                    <EmptyState icon={Rocket} text="No apps yet" sub="Use /build to create one" />
                  ) : (
                    <div className="space-y-2">
                      {recentApps.slice(0, 3).map(app => (
                        <AppCard key={app.id} app={app} timeAgo={timeAgo} onClick={() => navigate(`/apps/${app.id}`)} />
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
                  <Input
                    value={chatSearch}
                    onChange={e => setChatSearch(e.target.value)}
                    placeholder="Search chats..."
                    className="pl-9"
                  />
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
                        currentSessionId === session.id
                          ? "border-primary/50 bg-primary/10 glass"
                          : "border-border/40 hover:border-primary/30 glass"
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
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                          onClick={(e) => handleDeleteChat(session.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ====== FULL IMAGES ====== */}
          {activeTab === "images" && (
            <motion.div key="images" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={imageSearch}
                  onChange={e => setImageSearch(e.target.value)}
                  placeholder="Search images by prompt..."
                  className="pl-9"
                />
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
                    <ImageCard key={`${img.sessionId}-${i}`} img={img} onClick={() => setSelectedImage(img)} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ====== FULL APPS ====== */}
          {activeTab === "apps" && (
            <motion.div key="apps" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{recentApps.length} app{recentApps.length !== 1 ? 's' : ''}</p>
                <Button variant="ghost" size="sm" onClick={() => navigate("/apps")} className="text-xs text-muted-foreground h-7 px-2">
                  Open App Builder
                </Button>
              </div>
              {loadingApps ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[1,2,3,4].map(i => <GlassCard key={i} className="p-4 rounded-xl"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></GlassCard>)}
                </div>
              ) : recentApps.length === 0 ? (
                <EmptyState icon={Rocket} text="No apps yet" sub="Use /build to create your first app" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {recentApps.map(app => (
                    <AppCard key={app.id} app={app} timeAgo={timeAgo} onClick={() => navigate(`/apps/${app.id}`)} full />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ====== FULL MEMORIES ====== */}
          {activeTab === "memories" && (
            <motion.div key="memories" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{contextBlocks.length} memor{contextBlocks.length !== 1 ? 'ies' : 'y'}</p>
              </div>
              {blocksLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <GlassCard key={i} className="p-4 rounded-xl"><Skeleton className="h-4 w-full" /></GlassCard>)}</div>
              ) : contextBlocks.length === 0 ? (
                <EmptyState icon={Brain} text="No memories yet" sub='Tell Arc "remember that..." and it will save facts about you' />
              ) : (
                <div className="space-y-2">
                  {contextBlocks.map(block => (
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
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                          onClick={() => deleteBlock(block.id)}
                        >
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

        {/* Bottom spacing */}
        <div className="h-8" />
      </div>

      {/* Image Preview Modal */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => { if (!open) setSelectedImage(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden glass border-border/40">
          {selectedImage && (
            <div>
              <div className="relative">
                <SmoothImage src={selectedImage.url} alt={selectedImage.prompt} className="w-full max-h-[70vh] object-contain" />
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-foreground">{selectedImage.prompt || "Generated image"}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => downloadImage(selectedImage)} className="glass">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { navigate(`/chat/${selectedImage.sessionId}`); setSelectedImage(null); }}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                    Go to chat
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ====== Shared sub-components ====== */

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
      <SmoothImage src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
        <p className="text-white text-xs line-clamp-2">{img.prompt}</p>
      </div>
    </motion.div>
  );
}

function AppCard({ app, timeAgo, onClick, full }: { app: RecentApp; timeAgo: (d: any) => string; onClick: () => void; full?: boolean }) {
  const fav = app.favicon_label ? getFaviconByLabel(app.favicon_label) : null;
  const FavIcon = fav?.icon;
  return (
    <GlassCard className={cn("p-3 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform flex items-center gap-3", full && "p-4")} onClick={onClick}>
      <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
        {FavIcon ? <FavIcon className="h-4 w-4" style={{ color: fav?.color }} /> : <Rocket className="h-4 w-4 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate text-sm">{app.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-muted-foreground">{timeAgo(app.updated_at)}</span>
          {app.netlify_url && <ExternalLink className="h-3 w-3 text-primary/60" />}
        </div>
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
