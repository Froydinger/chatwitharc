import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image, Plus } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { OpenAIService } from "@/services/openai";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { MessageBubble } from "@/components/MessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function ChatInterface() {
  const { 
    messages, 
    addMessage, 
    isLoading, 
    setLoading, 
    createNewSession,
    currentSessionId 
  } = useArcStore();
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { profile } = useAuth();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // Handle file drops if needed
  };

  const handleNewChat = () => {
    createNewSession();
    toast({
      title: "New Chat Started",
      description: "Ready for a fresh conversation!"
    });
  };

  return (
    <div className="flex flex-col h-screen w-full max-w-sm sm:max-w-2xl lg:max-w-4xl mx-auto overflow-hidden relative">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 flex justify-between items-center p-4 bg-background/80 backdrop-blur-sm">
        <img src="/lovable-uploads/307f07e3-5431-499e-90f8-7b51837059a7.png" alt="ArcAI" className="h-8 w-8" />
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: "spring", damping: 15 }}
        >
          <GlassButton
            variant="bubble"
            size="icon"
            onClick={handleNewChat}
            className="hover:scale-105 transition-transform duration-200"
          >
            <Plus className="h-5 w-5" />
          </GlassButton>
        </motion.div>
      </div>

      {/* Messages Container */}
      <GlassCard 
        variant="bubble" 
        glow
        className={`flex-1 mx-4 mb-4 transition-all duration-300 overflow-hidden ${
          dragOver ? 'border-primary-glow border-2' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="h-full overflow-y-auto space-y-4 scroll-smooth relative">
          {/* Content area with top padding for header clearance */}
          <div className="pt-4 px-4 sm:px-6 space-y-4">
            <AnimatePresence mode="popLayout">
              {messages.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12"
                >
                  <motion.div
                    animate={{ rotate: [0, 2, -2, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    className="flex justify-center mb-4"
                  >
                    <img src="/lovable-uploads/307f07e3-5431-499e-90f8-7b51837059a7.png" alt="ArcAI" className="h-16 w-16" />
                  </motion.div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Welcome to ArcAI
                  </h3>
                  <p className="text-muted-foreground">
                    Start a conversation or drop an image to analyze
                  </p>
                </motion.div>
              ) : (
                messages.map((message) => (
                  <MessageBubble 
                    key={message.id} 
                    message={message} 
                    onEdit={() => {}} // Removed edit functionality for now
                  />
                ))
              )}
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex justify-start"
                >
                  <div className="glass rounded-2xl px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-2 h-2 bg-primary-glow rounded-full"
                            animate={{ 
                              scale: [1, 1.2, 1],
                              opacity: [0.5, 1, 0.5]
                            }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              delay: i * 0.2
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary-glow rounded-[var(--radius)] flex items-center justify-center"
          >
            <div className="text-center">
              <Image className="h-12 w-12 text-primary-glow mx-auto mb-2" />
              <p className="text-primary-foreground font-medium">Drop images here</p>
            </div>
          </motion.div>
        )}
      </GlassCard>
    </div>
  );
}