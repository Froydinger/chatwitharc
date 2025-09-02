import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { OpenAIService } from "@/services/openai";
import { GlassButton } from "@/components/ui/glass-button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { RealtimeConnection, USE_REALTIME } from "@/utils/realtime";

export function ChatInput() {
  const { 
    messages, 
    addMessage, 
    isLoading, 
    setLoading
  } = useArcStore();
  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const realtimeRef = useRef<RealtimeConnection | null>(null);
  const { toast } = useToast();
  const { profile } = useAuth();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const lineHeight = 24; // Approximate line height
      const maxHeight = lineHeight * 3; // 3 lines max before scrolling
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [inputValue]);

  // Auto-respond to quick start messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user' && !isLoading && messages.filter(m => m.role === 'assistant').length === 0) {
      // Only trigger auto-response if there are no assistant messages yet (first message of conversation)
      setLoading(true);
      handleAIResponse(lastMessage.content);
    }
  }, [messages]);

  const handleAIResponse = async (userMessage: string) => {
    try {
      const openai = new OpenAIService();
      
      // Convert messages to OpenAI format
      const openaiMessages = messages
        .filter(msg => msg.type === 'text')
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      const response = await openai.sendMessage(openaiMessages, profile);
      
      addMessage({
        content: response,
        role: 'assistant',
        type: 'text'
      });
    } catch (error) {
      console.error('AI response error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive"
      });
      
      addMessage({
        content: "Sorry, I encountered an error. Please try again.",
        role: 'assistant',
        type: 'text'
      });
    } finally {
      setLoading(false);
    }
  };

  const getSystemPrompt = () => {
    const basePrompt = "You are ArcAI, a helpful and supportive AI assistant.";
    const userContext = profile?.context_info ? `\n\nUser context: ${profile.context_info}` : "";
    return basePrompt + userContext;
  };

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

    // Use Realtime if enabled and no images
    if (USE_REALTIME && selectedImages.length === 0) {
      try {
        if (!realtimeRef.current) {
          // Initialize realtime connection
          realtimeRef.current = new RealtimeConnection({
            onMessage: (message) => {
              if (message.content) {
                setStreamingMessage(prev => prev + message.content);
              }
            },
            onError: (error) => {
              console.error('Realtime error:', error);
              toast({
                title: "Error",
                description: error,
                variant: "destructive"
              });
              setLoading(false);
            },
            onComplete: () => {
              if (streamingMessage) {
                addMessage({
                  content: streamingMessage,
                  role: 'assistant',
                  type: 'text'
                });
                setStreamingMessage("");
                setStreamingMessageId(null);
              }
              setLoading(false);
            }
          });
          
          await realtimeRef.current.connect(getSystemPrompt());
        }

        if (realtimeRef.current.isReady()) {
          // Start streaming message
          const messageId = Date.now().toString();
          setStreamingMessageId(messageId);
          setStreamingMessage("");
          
          realtimeRef.current.sendUserText(userMessage);
        } else {
          throw new Error('Realtime connection not ready');
        }
        return;
      } catch (error) {
        console.error('Realtime failed, falling back to HTTP:', error);
        // Fall through to legacy HTTP flow
      }
    }

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
        
        // Add placeholder message immediately
        addMessage({
          content: `Generating image: ${imagePrompt || userMessage}`,
          role: 'assistant',
          type: 'image-generating',
          imagePrompt: imagePrompt || userMessage
        });
        
        try {
          const imageUrl = await openai.generateImage(imagePrompt || userMessage);
          
          // Update with the actual image
          addMessage({
            content: `Generated image: ${imagePrompt || userMessage}`,
            role: 'assistant',
            type: 'image',
            imageUrl
          });
        } catch (error) {
          // Handle error by adding error message
          addMessage({
            content: `Sorry, I couldn't generate the image. ${error instanceof Error ? error.message : 'Please try again.'}`,
            role: 'assistant',
            type: 'text'
          });
        }
      } else if (selectedImages.length > 0) {
        // Handle image analysis with text
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
        const openaiMessages = messages
          .filter(msg => msg.type === 'text')
          .map(msg => ({
            role: msg.role,
            content: msg.content
          }));
        
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
      
      addMessage({
        content: "Sorry, I encountered an error. Please try again.",
        role: 'assistant',
        type: 'text'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <div className="p-3 bg-glass/20 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Selected Images ({selectedImages.length}/4)
            </span>
            <button
              onClick={() => setSelectedImages([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear All
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {selectedImages.map((file, index) => (
              <div key={index} className="relative group shrink-0">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Selected ${index + 1}`}
                  className="w-16 h-16 object-cover rounded-lg"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streaming Message Display */}
      {streamingMessage && streamingMessageId && (
        <div className="p-3 bg-glass/20 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-glass/50 flex items-center justify-center">
              <div
                className="w-8 h-8 rounded-full bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url('/lovable-uploads/87484cd8-85ad-46c7-af84-5cfe46e7a8f8.png')`,
                }}
              />
            </div>
            <div className="flex-1 glass rounded-lg p-3">
              <p className="text-foreground whitespace-pre-wrap break-words">
                {streamingMessage}
                <span className="animate-pulse">|</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input Row */}
      <div className="flex items-end gap-4 px-4">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={selectedImages.length > 0 ? "Add a message with your images..." : "Ask me anything..."}
            disabled={isLoading}
            className="glass border-0 bg-glass/30 text-foreground placeholder:text-muted-foreground resize-none min-h-[40px] max-h-[72px] leading-6 whitespace-nowrap overflow-hidden"
            rows={1}
          />
        </div>

        <GlassButton
          variant={inputValue.trim() ? "default" : "ghost"}
          size="icon"
          onClick={handleSend}
          disabled={isLoading}
          className={`shrink-0 transition-all duration-200 ${
            inputValue.trim() 
              ? 'bg-primary/30 text-primary-foreground hover:bg-primary/40 shadow-lg' 
              : ''
          }`}
        >
          <Send className="h-4 w-4" />
        </GlassButton>
      </div>
    </div>
  );
}