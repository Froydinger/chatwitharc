import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, Plus, Trash2, MessageSquare, Calendar } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/hooks/use-toast";

export function ChatHistoryPanel() {
  const { 
    chatSessions, 
    currentSessionId, 
    createNewSession, 
    loadSession, 
    deleteSession,
    setCurrentTab 
  } = useArcStore();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleNewChat = () => {
    createNewSession();
    setCurrentTab('chat');
    toast({
      title: "New Chat Created",
      description: "Ready for a fresh conversation!"
    });
  };

  const handleLoadSession = (sessionId: string) => {
    loadSession(sessionId);
    setCurrentTab('chat');
  };

  const handleDeleteSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeletingId(sessionId);
    
    try {
      deleteSession(sessionId);
      toast({
        title: "Chat deleted",
        description: "The chat has been removed successfully"
      });
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to delete chat",
        variant: "destructive"
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "Today";
    if (diffDays === 2) return "Yesterday";
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString();
  };

  const groupedSessions = chatSessions.reduce((groups, session) => {
    const dateKey = formatDate(new Date(session.lastMessageAt));
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(session);
    return groups;
  }, {} as Record<string, typeof chatSessions>);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-8 pt-16 px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        className="text-center space-y-4"
      >
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            <History className="h-8 w-8 text-primary-glow" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Chat History</h2>
        </div>
        <p className="text-muted-foreground text-lg">
          All your conversations are stored locally and privately
        </p>
        <GlassButton variant="glow" onClick={handleNewChat} className="mx-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </GlassButton>
      </motion.div>

      {/* Chat Sessions */}
      <div className="space-y-8">
        {Object.keys(groupedSessions).length === 0 ? (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <GlassCard variant="bubble" glow className="p-12 max-w-md mx-auto">
              <div className="glass rounded-full p-6 w-fit mx-auto mb-6">
                <MessageSquare className="h-12 w-12 text-primary-glow" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                No Chat History Yet
              </h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Start your first conversation to see your chat history here
              </p>
              <GlassButton
                variant="glow"
                onClick={handleNewChat}
                size="lg"
              >
                <img src="/lovable-uploads/307f07e3-5431-499e-90f8-7b51837059a7.png" alt="ArcAI" className="h-5 w-5 mr-2" />
                Create First Chat
              </GlassButton>
            </GlassCard>
          </motion.div>
        ) : (
          Object.entries(groupedSessions).map(([dateGroup, sessions], groupIndex) => (
            <motion.div
              key={dateGroup}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="glass rounded-full p-2">
                  <Calendar className="h-5 w-5 text-primary-glow" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">{dateGroup}</h3>
                <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <AnimatePresence mode="popLayout">
                  {sessions.map((session, sessionIndex) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 1 }}
                      animate={{ 
                        opacity: deletingId === session.id ? 0 : 1, 
                        scale: deletingId === session.id ? 0.9 : 1 
                      }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ 
                        duration: 0.3,
                        ease: "easeOut"
                      }}
                      layout
                    >
                      <GlassCard
                        variant={currentSessionId === session.id ? "bubble" : "default"}
                        glow={currentSessionId === session.id}
                        className={`p-6 cursor-pointer transition-all duration-300 hover:glass-strong group ${
                          currentSessionId === session.id ? "ring-2 ring-primary-glow" : ""
                        }`}
                        onClick={() => handleLoadSession(session.id)}
                      >
                        <div className="space-y-4">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary-glow transition-colors text-base">
                              {session.title}
                            </h4>
                            
                            <GlassButton
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
                              onClick={(e) => handleDeleteSession(session.id, e)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </GlassButton>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 text-primary-glow">
                                <MessageSquare className="h-4 w-4" />
                                <span className="font-medium">{session.messages.length}</span>
                              </div>
                              <span className="text-muted-foreground text-xs">
                                {new Date(session.lastMessageAt).toLocaleDateString()}
                              </span>
                            </div>
                            
                            <div className="text-xs text-muted-foreground">
                              {new Date(session.lastMessageAt).toLocaleTimeString()}
                            </div>
                          </div>

                          {/* Preview of last message */}
                          {session.messages.length > 0 && (
                            <div className="text-sm text-muted-foreground bg-glass/30 rounded-lg p-3 border border-glass-border/50">
                              <p className="line-clamp-3 leading-relaxed">
                                {session.messages[session.messages.length - 1].content}
                              </p>
                            </div>
                          )}
                        </div>
                      </GlassCard>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Stats */}
      {chatSessions.length > 0 && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
        >
          <GlassCard variant="bubble" glow className="p-8">
            <h3 className="text-xl font-semibold text-foreground mb-6 text-center">Chat Statistics</h3>
            <div className="grid grid-cols-3 gap-8 text-center">
              <div className="space-y-2">
                <div className="glass rounded-full p-4 w-fit mx-auto">
                  <History className="h-6 w-6 text-primary-glow" />
                </div>
                <p className="text-3xl font-bold text-primary-glow">
                  {chatSessions.length}
                </p>
                <p className="text-sm text-muted-foreground font-medium">Total Chats</p>
              </div>
              <div className="space-y-2">
                <div className="glass rounded-full p-4 w-fit mx-auto">
                  <MessageSquare className="h-6 w-6 text-primary-glow" />
                </div>
                <p className="text-3xl font-bold text-primary-glow">
                  {chatSessions.reduce((total, session) => total + session.messages.length, 0)}
                </p>
                <p className="text-sm text-muted-foreground font-medium">Total Messages</p>
              </div>
              <div className="space-y-2">
                <div className="glass rounded-full p-4 w-fit mx-auto">
                  <Calendar className="h-6 w-6 text-primary-glow" />
                </div>
                <p className="text-3xl font-bold text-primary-glow">
                  {chatSessions.filter(s => s.messages.some(m => m.type === 'image')).length}
                </p>
                <p className="text-sm text-muted-foreground font-medium">With Images</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}