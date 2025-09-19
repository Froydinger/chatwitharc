import { useState, useMemo } from "react";
import { Plus, Trash2, MessageSquare, Search, Image, FileText } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ChatHistoryPanel() {
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
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("chats");

  /** Navigate back to chat - close panel */
  const goToChat = () => {
    setRightPanelOpen(false);
  };

  const handleNewChat = () => {
    createNewSession();
    goToChat();
  };

  const handleLoadSession = (sessionId: string) => {
    loadSession(sessionId);
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

  const visibleSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chatSessions;
    return chatSessions.filter(s => {
      const last = s.messages[s.messages.length - 1]?.content || "";
      return s.title.toLowerCase().includes(q) || last.toLowerCase().includes(q);
    });
  }, [chatSessions, query]);

  const groupedSessions = useMemo(() => {
    return visibleSessions.reduce((groups, session) => {
      const dateKey = formatDateGroup(new Date(session.lastMessageAt));
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(session);
      return groups;
    }, {} as Record<string, typeof chatSessions>);
  }, [visibleSessions]);

  // Filter sessions by type
  const textSessions = useMemo(() => {
    return visibleSessions.filter(session => 
      !session.messages.some(msg => msg.type === 'image' || msg.imageUrl)
    );
  }, [visibleSessions]);

  const mediaSessions = useMemo(() => {
    return visibleSessions.filter(session => 
      session.messages.some(msg => msg.type === 'image' || msg.imageUrl)
    );
  }, [visibleSessions]);

  const totalMessages = useMemo(
    () => chatSessions.reduce((total, s) => total + s.messages.length, 0),
    [chatSessions]
  );

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pt-4 px-4 pb-4 h-full overflow-y-auto scrollbar-hide">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">History</h2>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="chats" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Chats ({textSessions.length})
          </TabsTrigger>
          <TabsTrigger value="media" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Media ({mediaSessions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chats" className="flex-1 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                tabIndex={-1}
              />
            </div>
            <GlassButton variant="glow" onClick={handleNewChat}>
              <Plus className="h-4 w-4 mr-2" />
              New chat
            </GlassButton>
          </div>

          {/* Chat Sessions */}
          {textSessions.length === 0 ? (
            <div className="text-center py-12">
              <GlassCard className="p-8 max-w-md mx-auto">
                <MessageSquare className="h-12 w-12 text-primary-glow mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  No text chats yet
                </h3>
                <p className="text-muted-foreground mb-6">
                  Start a conversation to see your chat history here.
                </p>
                <GlassButton variant="glow" onClick={handleNewChat}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create first chat
                </GlassButton>
              </GlassCard>
            </div>
          ) : (
            <div className="space-y-2">
              {textSessions.map((session) => (
                <GlassCard
                  key={session.id}
                  variant={currentSessionId === session.id ? "bubble" : "default"}
                  className={`p-4 cursor-pointer group transition-all ${
                    currentSessionId === session.id ? "ring-1 ring-primary-glow" : "hover:bg-glass/60"
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
                    <GlassButton
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 text-destructive hover:text-destructive flex-shrink-0 ${
                        deletingId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-4 w-4" />
                    </GlassButton>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="media" className="flex-1 space-y-4">
          {/* Media Sessions */}
          {mediaSessions.length === 0 ? (
            <div className="text-center py-12">
              <GlassCard className="p-8 max-w-md mx-auto">
                <Image className="h-12 w-12 text-primary-glow mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  No media chats yet
                </h3>
                <p className="text-muted-foreground mb-6">
                  Generate images or upload media to see them here.
                </p>
                <GlassButton variant="glow" onClick={handleNewChat}>
                  <Plus className="h-4 w-4 mr-2" />
                  Start creating
                </GlassButton>
              </GlassCard>
            </div>
          ) : (
            <div className="space-y-2">
              {mediaSessions.map((session) => (
                <GlassCard
                  key={session.id}
                  variant={currentSessionId === session.id ? "bubble" : "default"}
                  className={`p-4 cursor-pointer group transition-all ${
                    currentSessionId === session.id ? "ring-1 ring-primary-glow" : "hover:bg-glass/60"
                  }`}
                  onClick={() => handleLoadSession(session.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Image className="h-4 w-4 text-primary-glow" />
                        <h4 className="font-medium text-foreground truncate">
                          {session.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span>{session.messages.length} messages</span>
                        <span>•</span>
                        <span>{session.messages.filter(m => m.type === 'image' || m.imageUrl).length} images</span>
                        <span>•</span>
                        <span>{new Date(session.lastMessageAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <GlassButton
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 text-destructive hover:text-destructive flex-shrink-0 ${
                        deletingId === session.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-4 w-4" />
                    </GlassButton>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}