import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare, Image, Rocket, Brain, ArrowLeft, ArrowRight,
  Plus, Clock, Sparkles, ExternalLink, Settings, Search
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
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";
import { getFaviconByLabel } from "@/constants/faviconOptions";
import { useAdminBanner } from "@/components/AdminBanner";
import { useAccentColor } from "@/hooks/useAccentColor";
import { Textarea } from "@/components/ui/textarea";

interface GeneratedImage {
  url: string;
  prompt: string;
  sessionId: string;
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
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const { isLoaded } = useChatSync();
  const { chatSessions, createNewSession, hydrateAllSessions, allSessionsHydrated, isHydratingAll } = useArcStore();
  const { blocks: contextBlocks, loading: blocksLoading } = useContextBlocks();
  const isAdminBannerActive = useAdminBanner();
  const { accentColor } = useAccentColor();

  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  // Hydrate sessions so images are available
  useEffect(() => {
    if (user) hydrateAllSessions();
  }, [user, hydrateAllSessions]);

  // Load apps
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
          .order('updated_at', { ascending: false })
          .limit(4);
        setRecentApps((data || []) as RecentApp[]);
      } catch { /* ignore */ } finally { setLoadingApps(false); }
    })();
  }, [user]);

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 144) + 'px';
  }, []);

  // Recent chats
  const recentChats = useMemo(() => {
    return chatSessions
      .filter(s => (s.messageCount ?? s.messages.length) > 0)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 6);
  }, [chatSessions]);

  // Extract images from hydrated sessions
  const recentImages = useMemo(() => {
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
            timestamp: ts,
          });
        }
      });
    });
    images.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return images.slice(0, 8);
  }, [chatSessions]);

  const isImagesLoading = isHydratingAll && !allSessionsHydrated;

  const handleSendMessage = () => {
    const msg = inputValue.trim();
    if (!msg) return;
    const newId = createNewSession();
    sessionStorage.setItem('pending-prompt', msg);
    navigate(`/chat/${newId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const timeAgo = (dateStr: string | Date) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (authLoading) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
  };
  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 300 } },
  };

  return (
    <div
      className="min-h-screen overflow-y-auto scrollbar-hide relative z-10"
      style={{
        paddingTop: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px',
      }}
    >
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8"
      >
        {/* Header */}
        <motion.div variants={fadeUp} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ThemedLogo className="h-8 w-8" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {greeting}{profile?.display_name ? `, ${profile.display_name}` : ""}.
              </h1>
              <p className="text-xs text-muted-foreground">Your Arc Dashboard</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard/settings")}
            className="rounded-full h-9 w-9"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </motion.div>

        {/* Chat Input — mirrors the real ChatInput bar style */}
        <motion.div variants={fadeUp}>
          <div className="chat-input-halo flex items-center gap-3 rounded-full glass-shimmer">
            <button
              type="button"
              className="ci-menu-btn h-10 w-10 rounded-full flex items-center justify-center glass-shimmer text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => textareaRef.current?.focus()}
            >
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

        {/* Recent Chats */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Recent Chats
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-xs text-muted-foreground h-7 px-2">
              View all
            </Button>
          </div>
          {!isLoaded ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {[1, 2, 3].map(i => (
                <GlassCard key={i} className="p-3.5 rounded-xl">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </GlassCard>
              ))}
            </div>
          ) : recentChats.length === 0 ? (
            <GlassCard className="p-5 rounded-xl text-center">
              <MessageSquare className="h-8 w-8 text-primary/40 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No chats yet. Start a conversation above!</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {recentChats.map(session => (
                <GlassCard
                  key={session.id}
                  className="p-3.5 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform group"
                  onClick={() => navigate(`/chat/${session.id}`)}
                >
                  <p className="font-medium text-foreground truncate text-sm">{session.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(session.lastMessageAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {session.messageCount ?? session.messages.length} msgs
                    </span>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </motion.div>

        {/* Images Gallery */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Image className="h-4 w-4 text-primary" />
              Recent Images
            </h2>
          </div>
          {isImagesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : recentImages.length === 0 ? (
            <GlassCard className="p-5 rounded-xl text-center">
              <Image className="h-8 w-8 text-primary/40 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No images yet. Ask Arc to generate one!</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {recentImages.map((img, i) => (
                <motion.div
                  key={`${img.sessionId}-${i}`}
                  whileHover={{ scale: 1.03 }}
                  className="relative aspect-square rounded-xl overflow-hidden cursor-pointer glass group"
                  onClick={() => navigate(`/chat/${img.sessionId}`)}
                >
                  <SmoothImage
                    src={img.url}
                    alt={img.prompt}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <p className="text-white text-xs line-clamp-2">{img.prompt}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Apps & Memories Row */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Apps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                Apps
              </h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/apps")} className="text-xs text-muted-foreground h-7 px-2">
                View all
              </Button>
            </div>
            {loadingApps ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <GlassCard key={i} className="p-3 rounded-xl">
                    <Skeleton className="h-4 w-3/4" />
                  </GlassCard>
                ))}
              </div>
            ) : recentApps.length === 0 ? (
              <GlassCard className="p-5 rounded-xl text-center h-full flex flex-col items-center justify-center">
                <Rocket className="h-8 w-8 text-primary/40 mb-2" />
                <p className="text-muted-foreground text-sm">No apps yet</p>
                <p className="text-muted-foreground text-xs mt-1">Use <code className="text-primary font-mono">/build</code> to create one</p>
              </GlassCard>
            ) : (
              <div className="space-y-2">
                {recentApps.map(app => {
                  const fav = app.favicon_label ? getFaviconByLabel(app.favicon_label) : null;
                  const FavIcon = fav?.icon;
                  return (
                    <GlassCard
                      key={app.id}
                      className="p-3 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform flex items-center gap-3"
                      onClick={() => navigate(`/apps/${app.id}`)}
                    >
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
                })}
              </div>
            )}
          </div>

          {/* Memories (Context Blocks) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Memories
              </h2>
              <span className="text-xs text-muted-foreground">{contextBlocks.length} saved</span>
            </div>
            {blocksLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <GlassCard key={i} className="p-3 rounded-xl">
                    <Skeleton className="h-4 w-full" />
                  </GlassCard>
                ))}
              </div>
            ) : contextBlocks.length === 0 ? (
              <GlassCard className="p-5 rounded-xl text-center h-full flex flex-col items-center justify-center">
                <Brain className="h-8 w-8 text-primary/40 mb-2" />
                <p className="text-muted-foreground text-sm">No memories yet</p>
                <p className="text-muted-foreground text-xs mt-1">Say <code className="text-primary font-mono">"remember that..."</code></p>
              </GlassCard>
            ) : (
              <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-hide">
                {contextBlocks.slice(0, 8).map(block => (
                  <GlassCard key={block.id} className="p-3 rounded-xl">
                    <p className="text-sm text-foreground line-clamp-2">{block.content}</p>
                    <span className="text-xs text-muted-foreground mt-1 block">{timeAgo(block.created_at)}</span>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={fadeUp} className="grid grid-cols-3 sm:grid-cols-3 gap-2.5 pb-8">
          {[
            { label: "New Chat", icon: Plus, onClick: () => { const id = createNewSession(); navigate(`/chat/${id}`); } },
            { label: "Research", icon: Search, onClick: () => { navigate("/"); setTimeout(() => window.dispatchEvent(new CustomEvent('open-search-mode')), 100); } },
            { label: "Build App", icon: Rocket, onClick: () => navigate("/apps") },
          ].map(({ label, icon: Icon, onClick }) => (
            <GlassCard
              key={label}
              className="p-3.5 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform text-center"
              onClick={onClick}
            >
              <Icon className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs font-medium text-foreground">{label}</p>
            </GlassCard>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
