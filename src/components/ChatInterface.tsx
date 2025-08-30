import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Image, Paperclip } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { OpenAIService } from "@/services/openai";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { MessageBubble } from "@/components/MessageBubble";
import { useToast } from "@/hooks/use-toast";

export function ChatInterface() {
  const { messages, addMessage, isLoading, setLoading, apiKey } = useArcStore();
  const [inputValue, setInputValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please add your OpenAI API key in settings to start chatting.",
        variant: "destructive"
      });
      return;
    }

    const userMessage = inputValue.trim();
    setInputValue("");
    
    // Add user message
    addMessage({
      content: userMessage,
      role: 'user',
      type: 'text'
    });

    setLoading(true);

    try {
      const openai = new OpenAIService(apiKey);
      
      // Convert messages to OpenAI format
      const openaiMessages = messages
        .filter(msg => msg.type === 'text') // Only text messages for now
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      
      // Add the new user message
      openaiMessages.push({
        role: 'user',
        content: userMessage
      });

      const response = await openai.sendMessage(openaiMessages);
      
      addMessage({
        content: response,
        role: 'assistant',
        type: 'text'
      });
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive"
      });
      
      // Add error message
      addMessage({
        content: "Sorry, I encountered an error. Please check your API key and try again.",
        role: 'assistant',
        type: 'text'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!apiKey) {
      toast({
        title: "API Key Required",
        description: "Please add your OpenAI API key to analyze images.",
        variant: "destructive"
      });
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    
    // Add user message with image
    addMessage({
      content: `Uploaded image: ${file.name}`,
      role: 'user',
      type: 'image',
      imageUrl
    });

    setLoading(true);

    try {
      const openai = new OpenAIService(apiKey);
      
      // Convert to base64 for API
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          
          const response = await openai.sendMessageWithImage(
            [{ role: 'user', content: 'What do you see in this image?' }],
            base64
          );
          
          addMessage({
            content: response,
            role: 'assistant',
            type: 'text'
          });
        } catch (error) {
          console.error('Image analysis error:', error);
          toast({
            title: "Error",
            description: "Failed to analyze image",
            variant: "destructive"
          });
          
          addMessage({
            content: "Sorry, I couldn't analyze this image. Please try again.",
            role: 'assistant',
            type: 'text'
          });
        } finally {
          setLoading(false);
        }
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Image upload error:', error);
      setLoading(false);
    }
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