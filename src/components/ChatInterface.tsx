import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Image, Paperclip } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { MessageBubble } from "@/components/MessageBubble";

export function ChatInterface() {
  const { messages, addMessage, isLoading, setLoading } = useArcStore();
  const [inputValue, setInputValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    
    // Add user message
    addMessage({
      content: userMessage,
      role: 'user',
      type: 'text'
    });

    setLoading(true);

    // Simulate AI response with realistic delay
    setTimeout(() => {
      addMessage({
        content: `I understand you said: "${userMessage}". This is a demo response from ArcAI! The OpenAI integration will be implemented to use gpt-5-nano for fast, intelligent responses.`,
        role: 'assistant',
        type: 'text'
      });
      setLoading(false);
    }, 1000 + Math.random() * 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (file: File) => {
    const imageUrl = URL.createObjectURL(file);
    addMessage({
      content: `Uploaded image: ${file.name}`,
      role: 'user',
      type: 'image',
      imageUrl
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    imageFiles.forEach(handleImageUpload);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(handleImageUpload);
  };

  return (
    <div className="flex flex-col h-full max-h-[70vh] w-full max-w-4xl mx-auto">
      {/* Messages Container */}
      <GlassCard 
        variant="bubble" 
        glow
        className={`flex-1 p-6 mb-4 overflow-hidden transition-all duration-300 ${
          dragOver ? 'border-primary-glow border-2' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="h-full overflow-y-auto space-y-4 scroll-smooth">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12"
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="text-6xl mb-4"
                >
                  ✨
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
                <MessageBubble key={message.id} message={message} />
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

      {/* Input Area */}
      <GlassCard variant="bubble" className="p-4">
        <div className="flex items-end gap-3">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <GlassButton
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </GlassButton>
          </div>

          <div className="flex-1">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything..."
              disabled={isLoading}
              className="glass border-0 bg-glass/30 text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>

          <GlassButton
            variant={inputValue.trim() ? "glow" : "ghost"}
            size="icon"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}