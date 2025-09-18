import { useState, useMemo } from "react";
import { History, Plus, Trash2, MessageSquare, Calendar, Lock, Search, Image } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaLibraryPanel } from "./MediaLibraryPanel";

export function ChatHistoryPanel() {
  const { 
    chatSessions, 
    currentSessionId, 
    createNewSession, 
    loadSession, 
    deleteSession
  } = useArcStore();

  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("history");

  /** Navigate back to chat - close dialog */
  const goToChat = () => {
    // Emit custom event to notify MobileChatApp to close history panel
    window.dispatchEvent(new CustomEvent('arcai:closeHistory'));
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

  const totalMessages = useMemo(
    () => chatSessions.reduce((total, s) => total + s.messages.length, 0),
    [chatSessions]
  );

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-6 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            {activeTab === "history" ? (
              <History className="h-8 w-8 text-primary-glow" />
            ) : (
              <Image className="h-8 w-8 text-primary-glow" />
            )}
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            {activeTab === "history" ? "Chat History" : "Media Library"}
          </h2>
        </div>

        {/* Security badge and subtitle */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-glass-border/60 bg-glass/40">
            <Lock className="h-4 w-4 text-primary-glow" />
            <span className="text-xs font-medium text-foreground">Encrypted in cloud</span>
          </div>
          <p className="text-muted-foreground text-base">
            {activeTab === "history" 
              ? "Your conversations are saved encrypted in the cloud, not on this device."
              : "Your AI-generated images from all conversations."
            }
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-md mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="media" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Media
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Toolbar: search + new chat (only show for history tab) */}
        {activeTab === "history" && (
          <div className="mx-auto max-w-2xl w-full flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chats by title or last message"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <GlassButton variant="glow" onClick={handleNewChat}>
              <Plus className="h-4 w-4 mr-2" />
              New chat
            </GlassButton>
          </div>
        )}
      </div>

      {/* Tab Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="history" className="space-y-8 mt-0">
          {Object.keys(groupedSessions).length === 0 ? (
            <div className="text-center py-16">
              <GlassCard variant="bubble" glow className="p-12 max-w-md mx-auto">
                <div className="glass rounded-full p-6 w-fit mx-auto mb-6">
                  <MessageSquare className="h-12 w-12 text-primary-glow" />
                </div>
                <h3 className="text-2xl font-semibold text-foreground mb-3">
                  No chat history yet
                </h3>
                <p className="text-muted-foreground mb-8 text-lg">
                  Start your first conversation to see your chat history here.
                </p>
                <GlassButton variant="glow" onClick={handleNewChat} size="lg">
                  <img
                    src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                    alt="ArcAI"
                    className="h-5 w-5 mr-2"
                  />
                  Create first chat
                </GlassButton>
              </GlassCard>
            </div>
          ) : (
            Object.entries(groupedSessions).map(([dateGroup, sessions]) => (
              <section key={dateGroup}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="glass rounded-full p-2">
                    <Calendar className="h-5 w-5 text-primary-glow" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">{dateGroup}</h3>
                  <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sessions.map((session) => (
                    <GlassCard
                      key={session.id}
                      variant={currentSessionId === session.id ? "bubble" : "default"}
                      glow={currentSessionId === session.id}
                      className={`p-5 cursor-pointer group transition-all ${
                        currentSessionId === session.id ? "ring-2 ring-primary-glow" : "hover:translate-y-[-2px]"
                      }`}
                      onClick={() => handleLoadSession(session.id)}
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-foreground line-clamp-2 text-base">
                            {session.title}
                          </h4>
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

                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-primary-glow">
                            <MessageSquare className="h-4 w-4" />
                            <span className="font-medium">{session.messages.length}</span>
                          </div>
                          <div className="text-xs text-muted-foreground text-right">
                            <div>{new Date(session.lastMessageAt).toLocaleDateString()}</div>
                            <div>{new Date(session.lastMessageAt).toLocaleTimeString()}</div>
                          </div>
                        </div>

                        {session.messages.length > 0 && (
                          <div className="text-sm text-muted-foreground bg-glass/30 rounded-lg p-3 border border-glass-border/50">
                            <p className="line-clamp-3 leading-relaxed">
                              {session.messages[session.messages.length - 1].content}
                            </p>
                          </div>
                        )}

                        {/* Small lock pill per card for reassurance */}
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" />
                          <span>Encrypted in cloud</span>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </section>
            ))
          )}

          {/* Stats */}
          {chatSessions.length > 0 && (
            <div>
              <GlassCard variant="bubble" glow className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4 text-center">Chat statistics</h3>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <div className="space-y-2">
                    <div className="glass rounded-full p-4 w-fit mx-auto">
                      <History className="h-6 w-6 text-primary-glow" />
                    </div>
                    <p className="text-3xl font-bold text-primary-glow">{chatSessions.length}</p>
                    <p className="text-sm text-muted-foreground font-medium">Total chats</p>
                  </div>
                  <div className="space-y-2">
                    <div className="glass rounded-full p-4 w-fit mx-auto">
                      <MessageSquare className="h-6 w-6 text-primary-glow" />
                    </div>
                    <p className="text-3xl font-bold text-primary-glow">{totalMessages}</p>
                    <p className="text-sm text-muted-foreground font-medium">Total messages</p>
                  </div>
                  <div className="space-y-2">
                    <div className="glass rounded-full p-4 w-fit mx-auto">
                      <Calendar className="h-6 w-6 text-primary-glow" />
                    </div>
                    <p className="text-3xl font-bold text-primary-glow">
                      {chatSessions.filter(s => s.messages.some(m => m.type === "image")).length}
                    </p>
                    <p className="text-sm text-muted-foreground font-medium">With images</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          )}
        </TabsContent>

        <TabsContent value="media" className="mt-0">
          <MediaLibraryPanel />
        </TabsContent>
      </Tabs>

      {/* Footer info line */}
      <p className="text-xs text-center text-muted-foreground">
        Storage note: chats are stored encrypted in the cloud. Clearing your browser will not remove them from your account.
      </p>
    </div>
  );
}