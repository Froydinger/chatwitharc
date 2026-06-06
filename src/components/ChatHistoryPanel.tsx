import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, MessageSquare, RefreshCw, Search, LayoutDashboard, Share2, ChevronRight, X } from "lucide-react";
import { ShareChatDialog } from "@/components/ShareChatDialog";
import { useArcStore } from "@/store/useArcStore";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useSearchStore } from "@/store/useSearchStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useChatSync } from "@/hooks/useChatSync";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type UnifiedSession = {
  id: string;
  title: string;
  timestamp: number;
  type: "chat" | "search";
  itemCount: number;
};

const ITEMS_PER_PAGE = 25;

function groupKey(ts: number): string {
  const now = new Date();
  const d = new Date(ts);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Earlier this week";
  if (diffDays < 30) return "This month";
  if (diffDays < 365) return d.toLocaleString(undefined, { month: "long" });
  return d.getFullYear().toString();
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function ChatHistoryPanel() {
  const navigate = useNavigate();
  const { isLoaded } = useChatSync();
  const isMobile = useIsMobile();
  const {
    chatSessions,
    currentSessionId,
    createNewSession,
    loadSession,
    deleteSession,
    syncFromSupabase,
    setRightPanelOpen,
  } = useArcStore();
  const { openSearchMode } = useSearchStore();
  const { toast } = useToast();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareSessionId, setShareSessionId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const goToChat = () => {
    if (isMobile || window.innerWidth < 1024) setRightPanelOpen(false);
  };

  const handleNewChat = () => {
    const newSessionId = createNewSession();
    navigate(`/chat/${newSessionId}`);
    goToChat();
  };

  const handleLoadSession = (sessionId: string) => {
    loadSession(sessionId);
    navigate(`/chat/${sessionId}`);
    goToChat();
  };

  const handleDeleteSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeletingId(sessionId);
    try {
      deleteSession(sessionId);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncFromSupabase();
      toast({ title: "Synced", description: "Chat history updated" });
    } catch {
      toast({
        title: "Sync failed",
        description: "Could not load chats from cloud",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const corporateMode = useCorporateModeStore((s) => s.enabled);

  const sortedSessions = useMemo(() => {
    const source = corporateMode
      ? chatSessions.filter((s) => s.isLocalOnly)
      : chatSessions.filter((s) => !s.isLocalOnly);

    return source
      .filter((s) => (s.messageCount ?? s.messages.length) > 0)
      .map<UnifiedSession>((s) => ({
        id: s.id,
        title: s.title,
        timestamp: new Date(s.lastMessageAt).getTime(),
        type: "chat",
        itemCount: s.messageCount ?? s.messages.length,
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [chatSessions, corporateMode]);

  const filtered = useMemo(() => {
    const result = sortedSessions;
    // Filter by search query
    const q = query.trim().toLowerCase();
    if (!q) return result;
    return result.filter((s) => s.title.toLowerCase().includes(q));
  }, [sortedSessions, query]);

  const isSearching = query.trim().length > 0;
  const paginated = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  // Group by date label (only when not searching)
  const grouped = useMemo(() => {
    if (isSearching)
      return [{ label: `${filtered.length} match${filtered.length === 1 ? "" : "es"}`, items: paginated }];
    const map = new Map<string, UnifiedSession[]>();
    for (const s of paginated) {
      const k = groupKey(s.timestamp);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries()).map(([label, items]) => ({
      label,
      items,
    }));
  }, [paginated, isSearching, filtered.length]);

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [query]);

  // Ensure active session is included in visible window
  useEffect(() => {
    if (!currentSessionId || isSearching) return;
    const idx = filtered.findIndex((s) => s.id === currentSessionId);
    if (idx < 0) return;
    if (idx >= visibleCount) {
      const next = Math.ceil((idx + 1) / ITEMS_PER_PAGE) * ITEMS_PER_PAGE;
      setVisibleCount(next);
    }
  }, [currentSessionId, filtered, isSearching, visibleCount]);

  // Infinite scroll: auto-load when sentinel is visible
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => c + ITEMS_PER_PAGE);
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, paginated.length]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Sticky top — Quick actions + Search */}
      <div className="px-3 pt-3 pb-2 space-y-2.5 shrink-0">
        {/* Glass quick-action row */}
        <div className="flex items-center gap-1 p-1 rounded-full backdrop-blur-2xl bg-background/40 border border-border/40 shadow-[0_0_12px_hsl(var(--primary)/0.12)]">
          <button
            onClick={handleNewChat}
            className="flex-1 min-w-0 h-8 px-2 rounded-full inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground/90 transition-all hover:scale-[1.02] active:scale-[0.97] bg-primary/30 hover:bg-primary/60"
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">New</span>
          </button>
          <button
            onClick={() => {
              openSearchMode();
              goToChat();
            }}
            className="flex-1 min-w-0 h-8 px-2 rounded-full inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground/90 transition-all hover:scale-[1.02] active:scale-[0.97] hover:bg-primary/10"
            title="Deep Search™"
          >
            <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">Deep</span>
          </button>
        </div>

        {/* Search input */}
        {!corporateMode && sortedSessions.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your chats"
              className="w-full h-9 pl-9 pr-9 rounded-full text-sm bg-muted/30 border border-border/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/70 transition-colors"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full inline-flex items-center justify-center bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Header row — title + sync */}
        <div className="flex items-center justify-between pt-0.5">
          <h2 className="text-lg font-bold text-foreground tracking-tight">{isSearching ? "Search" : "History"}</h2>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {filtered.length}
              {isSearching ? ` / ${sortedSessions.length}` : ""}
            </span>
            {!corporateMode && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleManualSync}
                disabled={isSyncing}
                title="Sync from cloud"
                className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-3">
        {!isLoaded ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-3 rounded-2xl border border-border/40 bg-muted/10">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="py-10">
            <GlassCard className="p-6 text-center">
              <MessageSquare className="h-10 w-10 text-primary mx-auto mb-3 opacity-80" />
              <h3 className="text-base font-semibold text-foreground mb-1.5">
                {corporateMode ? "No local chats yet" : "No chats yet"}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                {corporateMode
                  ? "Corporate Mode is on. New chats save to this device only."
                  : "Start your first conversation."}
              </p>
              <button
                onClick={handleNewChat}
                className="w-full h-10 rounded-full inline-flex items-center justify-center text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] bg-primary text-primary-foreground shadow-[0_0_8px_hsl(var(--primary)/0.5)] overflow-hidden relative"
              >
                <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <Plus className="h-4 w-4 mr-1.5 relative z-10" />
                <span className="relative z-10">New chat</span>
              </button>
            </GlassCard>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No chats match <span className="text-foreground font-medium">"{query}"</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() => {
                navigate("/dashboard?tab=chats");
                goToChat();
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-border/40 bg-muted/20 hover:bg-primary/10 hover:border-primary/40 transition-all text-[11px] font-semibold text-muted-foreground hover:text-primary group"
            >
              <span className="inline-flex items-center gap-1.5">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Full chat history
              </span>
              <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
            {grouped.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((session) => {
                    const isActive = currentSessionId === session.id;
                    return (
                      <div
                        key={`${session.type}-${session.id}`}
                        onClick={() => handleLoadSession(session.id)}
                        className={cn(
                          "group relative px-3 py-2.5 cursor-pointer rounded-xl border transition-all",
                          isActive
                            ? "border-primary/40 bg-primary/10 shadow-[0_0_12px_hsl(var(--primary)/0.18)]"
                            : "border-transparent hover:border-border/60 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "shrink-0 h-7 w-7 rounded-lg inline-flex items-center justify-center transition-colors",
                              isActive
                                ? "bg-primary/20 text-primary"
                                : "bg-muted/40 text-muted-foreground group-hover:text-primary",
                            )}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4
                              className={cn(
                                "text-sm font-medium truncate leading-tight",
                                isActive ? "text-primary" : "text-foreground",
                              )}
                            >
                              {session.title}
                            </h4>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              {session.itemCount} msg
                              {session.itemCount === 1 ? "" : "s"} · {shortDate(session.timestamp)}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full hover:bg-primary/15 hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShareSessionId(session.id);
                              }}
                              aria-label="Share chat"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7 rounded-full hover:bg-destructive/15 hover:text-destructive",
                                deletingId === session.id && "opacity-100",
                              )}
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              aria-label="Delete chat"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Infinite scroll sentinel + Load more */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex items-center justify-center pt-2 pb-1">
                <button
                  onClick={() => setVisibleCount((c) => c + ITEMS_PER_PAGE)}
                  className="h-8 px-3 rounded-full text-[11px] font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  Load more ({filtered.length - visibleCount} left)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ShareChatDialog
        sessionId={shareSessionId}
        open={!!shareSessionId}
        onOpenChange={(o) => !o && setShareSessionId(null)}
      />
    </div>
  );
}
