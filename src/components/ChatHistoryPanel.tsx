import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export function ChatHistoryPanel() {
  const navigate = useNavigate();
  const { 
    chatSessions, 
    currentSessionId, 
    createNewSession, 
    loadSession, 
    deleteSession,
    setRightPanelOpen
  } = useArcStore();

  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [chatSessions]);

  /** Navigate back to chat - close panel */
  const goToChat = () => {
    setRightPanelOpen(false);
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

  const sortedSessions = useMemo(() => {
    return [...chatSessions]
      .filter(session => session.messages.length > 0)
      .sort((a, b) => 
        new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
  }, [chatSessions]);

  const totalMessages = useMemo(
    () => chatSessions.reduce((total, s) => total + s.messages.length, 0),
    [chatSessions]
  );

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pt-4 px-4 pb-4 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Chat History</h2>
      </div>

      {/* New Chat Button */}
      <div className="mb-4">
        <Button onClick={handleNewChat} className="w-full bg-black text-white hover:bg-black/80">
          <Plus className="h-4 w-4 mr-2" />
          New chat
        </Button>
      </div>

      {/* Chat Sessions */}
      {isLoading ? (
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
              No chat history yet
            </h3>
            <p className="text-muted-foreground mb-6">
              Start your first conversation to see your chat history here.
            </p>
            <Button onClick={handleNewChat} className="bg-black text-white hover:bg-black/80">
              <Plus className="h-4 w-4 mr-2" />
              Create first chat
            </Button>
          </GlassCard>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedSessions.map((session) => (
            <GlassCard
              key={session.id}
              variant={currentSessionId === session.id ? "bubble" : "default"}
              className={`p-4 cursor-pointer group transition-all glass-card-dark ${
                currentSessionId === session.id ? "ring-1 ring-primary-glow rounded-xl" : "hover:bg-glass/60"
              }`}
              onClick={() => handleLoadSession(session.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground truncate">
                    {session.title}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span>{session.messages.length} messages</span>
                    <span>•</span>
                    <span>{new Date(session.lastMessageAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 text-destructive hover:text-destructive flex-shrink-0 bg-black text-white hover:bg-black/80 ${
                    deletingId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}