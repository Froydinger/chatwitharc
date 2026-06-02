import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, MessageSquare, RefreshCw, Search, LayoutDashboard, Share2 } from "lucide-react";
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
    setRightPanelOpen
  } = useArcStore();

  const {
    openSearchMode,
  } = useSearchStore();

  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareSessionId, setShareSessionId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  /** Navigate back to chat - close panel only on mobile/tablet */
  const goToChat = () => {
    // Only auto-close on mobile and small tablets (< 1024px)
    if (isMobile || window.innerWidth < 1024) {
      setRightPanelOpen(false);
    }
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
        variant: "destructive"
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncFromSupabase();
      toast({
        title: "Synced",
        description: "Chat history updated",
      });
    } catch {
      toast({
        title: "Sync failed",
        description: "Could not load chats from cloud",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDateGroup = (date: Date) => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
      (startOfDay(now).getTime() - startOfDay(date).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  type UnifiedSession = {
    id: string;
    title: string;
    timestamp: number;
    type: 'chat' | 'search';
    itemCount: number;
  };

  const corporateMode = useCorporateModeStore((s) => s.enabled);

  const sortedSessions = useMemo(() => {
    // In Corporate Mode, only show local-only sessions (created on-device).
    // In normal mode, hide local-only sessions — they belong to corp mode only.
    const sourceSessions = corporateMode
      ? chatSessions.filter(s => s.isLocalOnly)
      : chatSessions.filter(s => !s.isLocalOnly);

    const chatItems: UnifiedSession[] = sourceSessions
      .filter(session => (session.messageCount ?? session.messages.length) > 0)
      .map(session => ({
        id: session.id,
        title: session.title,
        timestamp: new Date(session.lastMessageAt).getTime(),
        type: 'chat' as const,
        itemCount: session.messageCount ?? session.messages.length,
      }));

    return chatItems.sort((a, b) => b.timestamp - a.timestamp);
  }, [chatSessions, corporateMode]);

  const totalMessages = useMemo(
    () => chatSessions.reduce((total, s) => total + (s.messageCount ?? s.messages.length), 0),
    [chatSessions]
  );

  // Scroll to top when panel opens
  useEffect(() => {
    const container = document.querySelector('.w-full.max-w-3xl.mx-auto.space-y-4');
    if (container) {
      container.scrollTop = 0;
    }
  }, []);

  // Pagination
  const totalPages = Math.ceil(sortedSessions.length / ITEMS_PER_PAGE);
  const paginatedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedSessions.slice(startIndex, endIndex);
  }, [sortedSessions, currentPage]);

  // Auto-jump to the page containing the currently active session so the
  // highlighted active chat stays visible without "bumping" sort order.
  useEffect(() => {
    if (!currentSessionId) return;
    const idx = sortedSessions.findIndex(s => s.id === currentSessionId);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / ITEMS_PER_PAGE) + 1;
    setCurrentPage(prev => (prev === targetPage ? prev : targetPage));
  }, [currentSessionId, sortedSessions]);

  const PaginationButtons = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between gap-2 px-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="backdrop-blur-xl bg-background/70 border-border/40"
        >
          Prev Page
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="backdrop-blur-xl bg-background/70 border-border/40"
        >
          Next Page
        </Button>
      </div>
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pt-4 px-4 pb-4 h-full overflow-y-auto scrollbar-hide">
      {/* Quick Actions — compact segmented glass pill (responsive) */}
      <div
        ref={pillRef}
        className="flex items-center gap-1 p-1.5 rounded-full backdrop-blur-2xl bg-background/40 border border-border/40 shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
      >
        <button
          onClick={() => navigate('/dashboard')}
          className="flex-1 min-w-0 h-9 px-2 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.97] bg-primary/60 text-white shadow-[0_0_8px_hsl(var(--primary)/0.45)] relative overflow-hidden"
          title="Dashboard"
        >
          <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <LayoutDashboard className="h-3.5 w-3.5 relative z-10 shrink-0" />
          <span className="relative z-10 truncate">{compactPill ? "Dash" : "Dashboard"}</span>
        </button>
        <button
          onClick={handleNewChat}
          className="flex-1 min-w-0 h-9 px-2 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground/90 transition-all hover:scale-[1.02] active:scale-[0.97] hover:bg-primary/10"
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
          className="flex-1 min-w-0 h-9 px-2 rounded-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground/90 transition-all hover:scale-[1.02] active:scale-[0.97] hover:bg-primary/10"
          title="Research Mode"
        >
          <Search className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">Research</span>
        </button>
      </div>


      {/* Chat History Header */}
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-2xl font-bold text-foreground">Chat History</h2>
        {!corporateMode && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleManualSync}
            disabled={isSyncing}
            title="Sync from cloud"
            className="h-8 w-8"
          >
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          </Button>
        )}
      </div>

      {/* Chat Sessions */}
      {!isLoaded ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <GlassCard key={i} className="p-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : sortedSessions.length === 0 ? (
        <div className="text-center py-12">
          <GlassCard className="p-8 max-w-md mx-auto">
            <MessageSquare className="h-12 w-12 text-primary-glow mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {corporateMode ? "No local chats yet" : "No chat history yet"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {corporateMode
                ? "Corporate Mode is on. Start a new chat — it'll be saved on this device only. Your cloud chats will reappear when you disable Corporate Mode."
                : "Start your first conversation to see your chat history here."}
            </p>
            <div className="space-y-2">
              <button
                onClick={handleNewChat}
                className="w-full h-12 rounded-full inline-flex items-center justify-center text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98] bg-primary text-primary-foreground shadow-[0_0_8px_hsl(var(--primary)/0.5),0_0_16px_hsl(var(--primary)/0.3)] overflow-hidden relative"
              >
                <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <Plus className="h-4 w-4 mr-2 relative z-10" />
                <span className="relative z-10">Create first chat</span>
              </button>
              {!corporateMode && (
                <Button
                  onClick={handleManualSync}
                  variant="outline"
                  className="w-full"
                  disabled={isSyncing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync from cloud'}
                </Button>
              )}
            </div>
          </GlassCard>
        </div>
      ) : (
        <>
          <PaginationButtons />
          <div className="space-y-2">
            {paginatedSessions.map((session) => {
              const isActive = currentSessionId === session.id;

              return (
                <div
                  key={`${session.type}-${session.id}`}
                  className={cn(
                    "p-4 cursor-pointer group transition-all rounded-2xl border",
                    "bg-background",
                    isActive
                      ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/10"
                      : "border-border hover:border-primary/30 hover:bg-muted/50"
                  )}
                  onClick={() => handleLoadSession(session.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className="flex-shrink-0 mt-0.5 text-primary">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={cn(
                          "font-medium truncate",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {session.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          <span className="px-2 py-0.5 rounded-full bg-muted/30">
                            {session.itemCount} messages
                          </span>
                          <span>•</span>
                          <span>{new Date(session.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full transition-all hover:bg-primary/10 hover:text-primary opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShareSessionId(session.id);
                        }}
                        aria-label="Share chat"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8 rounded-full transition-all",
                          "hover:bg-destructive/10 hover:text-destructive",
                          deletingId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                        onClick={(e) => handleDeleteSession(session.id, e)}
                        aria-label="Delete chat"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <PaginationButtons />
        </>
      )}
      <ShareChatDialog
        sessionId={shareSessionId}
        open={!!shareSessionId}
        onOpenChange={(o) => !o && setShareSessionId(null)}
      />
    </div>
  );
}