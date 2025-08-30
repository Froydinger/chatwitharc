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
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-8 pt-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <div className="flex items-center justify-center gap-3">
          <History className="h-8 w-8 text-primary-glow" />
          <h2 className="text-2xl font-bold text-foreground">Chat History</h2>
        </div>
        <p className="text-muted-foreground">
          All your conversations are stored locally and privately
        </p>
      </motion.div>

      {/* Chat Sessions */}
      <div className="space-y-6">
        {Object.keys(groupedSessions).length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <GlassCard variant="bubble" glow className="p-8">
              <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No Chat History Yet
              </h3>
              <p className="text-muted-foreground mb-6">
                Start your first conversation to see your chat history here
              </p>
              <GlassButton
                variant="glow"
                onClick={handleNewChat}
              >
                <img src="/lovable-uploads/307f07e3-5431-499e-90f8-7b51837059a7.png" alt="ArcAI" className="h-4 w-4 mr-2" />
                Create First Chat
              </GlassButton>
            </GlassCard>
          </motion.div>
        ) : (
          Object.entries(groupedSessions).map(([dateGroup, sessions], groupIndex) => (
            <motion.div
              key={dateGroup}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIndex * 0.1 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">{dateGroup}</h3>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {sessions.map((session, sessionIndex) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ 
                        opacity: deletingId === session.id ? 0 : 1, 
                        scale: deletingId === session.id ? 0.8 : 1 
                      }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ 
                        delay: sessionIndex * 0.05,
                        type: "spring",
                        damping: 20
                      }}
                      layout
                    >
                      <GlassCard
                        variant={currentSessionId === session.id ? "bubble" : "default"}
                        glow={currentSessionId === session.id}
                        className={`p-4 cursor-pointer transition-all duration-300 hover:glass-strong group ${
                          currentSessionId === session.id ? "ring-2 ring-primary-glow" : ""
                        }`}
                        onClick={() => handleLoadSession(session.id)}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <h4 className="font-medium text-foreground line-clamp-2 group-hover:text-primary-glow transition-colors">
                              {session.title}
                            </h4>
                            
                            <GlassButton
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => handleDeleteSession(session.id, e)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </GlassButton>
                          </div>

                          <div className="text-sm text-muted-foreground">
                            <p className="flex items-center gap-2">
                              <MessageSquare className="h-3 w-3" />
                              {session.messages.length} messages
                            </p>
                            <p className="mt-1">
                              {new Date(session.lastMessageAt).toLocaleString()}
                            </p>
                          </div>

                          {/* Preview of last message */}
                          {session.messages.length > 0 && (
                            <div className="text-xs text-muted-foreground bg-glass/50 rounded-lg p-2">
                              <p className="line-clamp-2">
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <GlassCard variant="bubble" className="p-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary-glow">
                  {chatSessions.length}
                </p>
                <p className="text-sm text-muted-foreground">Total Chats</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary-glow">
                  {chatSessions.reduce((total, session) => total + session.messages.length, 0)}
                </p>
                <p className="text-sm text-muted-foreground">Total Messages</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary-glow">
                  {chatSessions.filter(s => s.messages.some(m => m.type === 'image')).length}
                </p>
                <p className="text-sm text-muted-foreground">With Images</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}