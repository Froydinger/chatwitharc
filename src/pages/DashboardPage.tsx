import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare, Image, Rocket, Brain, ArrowLeft, Search,
  Plus, Clock, Sparkles, ExternalLink, Layers, Quote
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useArcStore } from "@/store/useArcStore";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { useChatSync } from "@/hooks/useChatSync";
import { useSearchStore } from "@/store/useSearchStore";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";
import { getFaviconByLabel } from "@/constants/faviconOptions";
import { useAdminBanner } from "@/components/AdminBanner";

interface DashboardStats {
  totalChats: number;
  totalImages: number;
  totalApps: number;
  totalMemories: number;
}

interface RecentApp {
  id: string;
  title: string;
  favicon_label: string | null;
  netlify_url: string | null;
  updated_at: string;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const { isSubscribed } = useSubscription();
  const { isLoaded } = useChatSync();
  const { chatSessions, createNewSession } = useArcStore();
  const isAdminBannerActive = useAdminBanner();

  const [stats, setStats] = useState<DashboardStats>({ totalChats: 0, totalImages: 0, totalApps: 0, totalMemories: 0 });
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loadingStats, setLoadingStats] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  // Load stats
  useEffect(() => {
    if (!user) return;
    loadStats();
  }, [user]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const uid = session.user.id;

      const [appsRes, imagesRes, profileRes] = await Promise.all([
        supabase.from('ide_projects').select('id, title, favicon_label, netlify_url, updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(6),
        supabase.rpc('count_user_images', { target_user_id: uid }),
        supabase.from('profiles').select('memory_info, context_info').eq('user_id', uid).single(),
      ]);

      const apps = (appsRes.data || []) as RecentApp[];
      setRecentApps(apps);

      // Count memories from profile memory_info
      let memoryCount = 0;
      if (profileRes.data?.memory_info) {
        const lines = profileRes.data.memory_info.split('\n').filter((l: string) => l.trim().startsWith('-'));
        memoryCount = lines.length;
      }

      setStats({
        totalChats: chatSessions.filter(s => (s.messageCount ?? s.messages.length) > 0).length,
        totalImages: typeof imagesRes.data === 'number' ? imagesRes.data : 0,
        totalApps: apps.length,
        totalMemories: memoryCount,
      });
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Recent chats
  const recentChats = useMemo(() => {
    return chatSessions
      .filter(s => (s.messageCount ?? s.messages.length) > 0)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 6);
  }, [chatSessions]);

  // Fun facts about Arc
  const funFacts = [
    "Arc can remember things about you across conversations.",
    "You can use /write to create documents and /build to create full apps.",
    "Arc supports voice mode — talk naturally and get spoken responses.",
    "Research Mode uses advanced AI to search and synthesize the web.",
    "Arc can generate, edit, and analyze images.",
    "Your data syncs across all your devices automatically.",
  ];
  const [currentFact, setCurrentFact] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCurrentFact(f => (f + 1) % funFacts.length), 6000);
    return () => clearInterval(timer);
  }, []);

  const handleSendMessage = () => {
    const msg = inputValue.trim();
    if (!msg) return;
    const newId = createNewSession();
    // Store prompt to be picked up by chat
    sessionStorage.setItem('pending-prompt', msg);
    navigate(`/chat/${newId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
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

  const statCards = [
    { label: "Chats", value: stats.totalChats, icon: MessageSquare, color: "text-blue-400", onClick: () => navigate("/") },
    { label: "Images", value: stats.totalImages, icon: Image, color: "text-pink-400", onClick: () => navigate("/") },
    { label: "Apps", value: stats.totalApps, icon: Rocket, color: "text-emerald-400", onClick: () => navigate("/apps") },
    { label: "Memories", value: stats.totalMemories, icon: Brain, color: "text-amber-400", onClick: () => navigate("/") },
  ];

  return (
    <div
      className="min-h-screen bg-background overflow-y-auto"
      style={{
        paddingTop: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <ThemedLogo className="h-9 w-9" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                {greeting}{profile?.display_name ? `, ${profile.display_name}` : ""}.
              </h1>
              <p className="text-sm text-muted-foreground">Your Arc Dashboard</p>
            </div>
          </div>
        </motion.div>

        {/* Chat Input Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <GlassCard className="p-1 rounded-2xl">
            <div className="flex items-center gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Arc anything..."
                rows={1}
                className="flex-1 bg-transparent border-0 outline-none resize-none text-foreground placeholder:text-muted-foreground px-4 py-3 text-base"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="rounded-xl h-10 px-4 mr-1"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Chat
              </Button>
            </div>
          </GlassCard>
        </motion.div>

        {/* Stat Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {statCards.map(({ label, value, icon: Icon, color, onClick }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <GlassCard
                className="p-4 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform"
                onClick={onClick}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg bg-muted/50", color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    {loadingStats ? (
                      <Skeleton className="h-7 w-10" />
                    ) : (
                      <p className="text-2xl font-bold text-foreground">{value}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>

        {/* Recent Chats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Recent Chats
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="text-xs text-muted-foreground">
              View all
            </Button>
          </div>
          {!isLoaded ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <GlassCard key={i} className="p-4 rounded-xl">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </GlassCard>
              ))}
            </div>
          ) : recentChats.length === 0 ? (
            <GlassCard className="p-6 rounded-xl text-center">
              <p className="text-muted-foreground text-sm">No chats yet. Start a conversation above!</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentChats.map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.03 }}
                >
                  <GlassCard
                    className="p-4 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform group"
                    onClick={() => navigate(`/chat/${session.id}`)}
                  >
                    <p className="font-medium text-foreground truncate text-sm">{session.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(session.lastMessageAt instanceof Date ? session.lastMessageAt.toISOString() : String(session.lastMessageAt))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {session.messageCount ?? session.messages.length} msgs
                      </span>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Apps */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Apps
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigate("/apps")} className="text-xs text-muted-foreground">
              View all
            </Button>
          </div>
          {loadingStats ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <GlassCard key={i} className="p-4 rounded-xl">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </GlassCard>
              ))}
            </div>
          ) : recentApps.length === 0 ? (
            <GlassCard className="p-6 rounded-xl text-center">
              <p className="text-muted-foreground text-sm">No apps yet. Use <code className="text-primary font-mono text-xs">/build</code> to create one!</p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentApps.map((app, i) => {
                const favicon = app.favicon_label ? getFaviconByLabel(app.favicon_label) : null;
                return (
                  <motion.div
                    key={app.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.03 }}
                  >
                    <GlassCard
                      className="p-4 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform group"
                      onClick={() => navigate(`/apps/${app.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">{favicon?.emoji || "🚀"}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate text-sm">{app.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{timeAgo(app.updated_at)}</span>
                            {app.netlify_url && (
                              <ExternalLink className="h-3 w-3 text-emerald-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Fun Facts & Memories Row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {/* Fun Fact */}
          <GlassCard className="p-5 rounded-xl">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              Did you know?
            </h3>
            <motion.p
              key={currentFact}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-sm text-muted-foreground leading-relaxed"
            >
              {funFacts[currentFact]}
            </motion.p>
          </GlassCard>

          {/* Memories */}
          <GlassCard className="p-5 rounded-xl">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-amber-400" />
              Memories
            </h3>
            {loadingStats ? (
              <Skeleton className="h-10 w-full" />
            ) : stats.totalMemories > 0 ? (
              <p className="text-sm text-muted-foreground">
                Arc remembers <span className="text-foreground font-medium">{stats.totalMemories}</span> things about you.
                Say <code className="text-primary font-mono text-xs">"remember that..."</code> to add more.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No memories yet. Tell Arc to <code className="text-primary font-mono text-xs">"remember that..."</code> and it will.
              </p>
            )}
          </GlassCard>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-8"
        >
          {[
            { label: "New Chat", icon: Plus, onClick: () => { const id = createNewSession(); navigate(`/chat/${id}`); } },
            { label: "Research", icon: Search, onClick: () => { useSearchStore.getState().openSearchMode(); navigate("/"); } },
            { label: "Build App", icon: Rocket, onClick: () => navigate("/apps") },
            { label: "Settings", icon: Layers, onClick: () => navigate("/") },
          ].map(({ label, icon: Icon, onClick }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.05 }}
            >
              <GlassCard
                className="p-4 rounded-xl cursor-pointer hover:scale-[1.02] transition-transform text-center"
                onClick={onClick}
              >
                <Icon className="h-5 w-5 mx-auto mb-1.5 text-primary" />
                <p className="text-xs font-medium text-foreground">{label}</p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
