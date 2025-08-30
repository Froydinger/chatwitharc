import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Image, Paperclip, Plus } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { OpenAIService } from "@/services/openai";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
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
  const [inputValue, setInputValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { profile } = useAuth();
  

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;


    const userMessage = inputValue.trim();
    setInputValue("");

    // Handle multiple images
    let imageUrls: string[] = [];
    if (selectedImages.length > 0) {
      imageUrls = selectedImages.map(file => URL.createObjectURL(file));
      setSelectedImages([]);
    }
    
    // Add user message with images
    addMessage({
      content: userMessage || "Sent images",
      role: 'user',
      type: selectedImages.length > 0 ? 'image' : 'text',
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined
    });

    setLoading(true);

    try {
      const openai = new OpenAIService();
      
      // Check if user is requesting image generation
      const imageKeywords = [
        'generate image', 'create image', 'make image', 'draw', 'generate a picture', 
        'create a picture', 'make a picture', 'show me', 'visualize', 'paint',
        'sketch', 'illustrate', 'design', 'make me an image', 'can you draw',
        'I want to see', 'picture of', 'image of', 'generate an image'
      ];
      
      const isImageRequest = imageKeywords.some(keyword => 
        userMessage.toLowerCase().includes(keyword.toLowerCase())
      ) || /\b(draw|paint|sketch|illustrate|visualize|picture|image)\s+(?:me\s+)?(?:a\s+|an\s+|some\s+)?/i.test(userMessage);

      if (isImageRequest && selectedImages.length === 0) {
        // Extract the image description from the message
        let imagePrompt = userMessage;
        for (const keyword of imageKeywords) {
          if (userMessage.toLowerCase().includes(keyword)) {
            imagePrompt = userMessage.toLowerCase().replace(keyword, '').trim();
            break;
          }
        }
        
        const imageUrl = await openai.generateImage(imagePrompt || userMessage);
        
        addMessage({
          content: `Generated image: ${imagePrompt || userMessage}`,
          role: 'assistant',
          type: 'image',
          imageUrl
        });
      } else if (selectedImages.length > 0) {
        // Handle image analysis with text
        const openai = new OpenAIService();
        
        // Convert first image to base64 for analysis
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result as string;
            const analysisPrompt = userMessage || 'What do you see in these images?';
            
            const response = await openai.sendMessageWithImage(
              [{ role: 'user', content: analysisPrompt }],
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
              description: "Failed to analyze images",
              variant: "destructive"
            });
            
            addMessage({
              content: "Sorry, I couldn't analyze these images. Please try again.",
              role: 'assistant',
              type: 'text'
            });
          } finally {
            setLoading(false);
          }
        };
        
        reader.readAsDataURL(selectedImages[0]);
        return; // Exit early since we handle the response in the file reader
      } else {
        // Regular text conversation
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

        const response = await openai.sendMessage(openaiMessages, profile);
        
        addMessage({
          content: response,
          role: 'assistant',
          type: 'text'
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive"
      });
      
      // Add error message
      addMessage({
        content: "Sorry, I encountered an error. Please try again.",
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

  const handleImageUpload = (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const maxImages = 4;
    
    if (selectedImages.length + imageFiles.length > maxImages) {
      toast({
        title: "Too many images",
        description: `You can only send up to ${maxImages} images at once`,
        variant: "destructive"
      });
      return;
    }

    setSelectedImages(prev => [...prev, ...imageFiles.slice(0, maxImages - prev.length)]);
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleImageUpload(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    // Find the edited message and continue conversation from that point
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;


    setLoading(true);

    try {
      const openai = new OpenAIService();
      
      // Get messages up to the edited message
      const conversationHistory = messages
        .slice(0, messageIndex + 1)
        .filter(msg => msg.type === 'text')
        .map(msg => ({
          role: msg.role,
          content: msg.id === messageId ? newContent : msg.content
        }));

      const response = await openai.sendMessage(conversationHistory, profile);
      
      addMessage({
        content: response,
        role: 'assistant',
        type: 'text'
      });
    } catch (error) {
      console.error('Continue conversation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to continue conversation",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
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
      <div className="sticky top-0 z-20 flex justify-between items-center p-4 bg-background/80 backdrop-blur-sm border-b border-border/20">
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
        className={`flex-1 mx-4 my-4 transition-all duration-300 overflow-hidden ${
          dragOver ? 'border-primary-glow border-2' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth relative">
          {/* Fade effect at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card/80 to-transparent pointer-events-none z-10" />
          
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
                  onEdit={handleEditMessage}
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