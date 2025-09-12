import { useState, useRef, useEffect } from "react";
import { Send, Paperclip } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { OpenAIService } from "@/services/openai";
import { GlassButton } from "@/components/ui/glass-button";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from "@/utils/memoryDetection";

export function ChatInput() {
  const { 
    messages, 
    addMessage, 
    isLoading, 
    isGeneratingImage,
    setLoading,
    setGeneratingImage
  } = useArcStore();
  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { profile, refetch: refetchProfile } = useProfile();

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

  // Auto-respond to quick start messages (only for text messages without images)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user' && 
        lastMessage?.type === 'text' && 
        !lastMessage?.imageUrls && 
        !isLoading && 
        messages.filter(m => m.role === 'assistant').length === 0) {
      // Only trigger auto-response if there are no assistant messages yet AND no images
      setLoading(true);
      handleAIResponse(lastMessage.content);
    }
  }, [messages]);

  // Extract implicit memory from the model's reply and save it
  const parseAndSaveImplicitMemory = async (text: string) => {
    const match = text.match(/\[MEMORY_SAVE\]([\s\S]*?)\[\/MEMORY_SAVE\]/i);
    if (match && match[1]) {
      const content = match[1].trim();
      if (content.length >= 3) {
        await addToMemoryBank({ content, timestamp: new Date() });
      }
      const cleaned = text.replace(match[0], '').trim();
      return { cleaned, saved: content } as const;
    }
    return { cleaned: text, saved: null as string | null } as const;
  };

  const handleAIResponse = async (userMessage: string) => {
    try {
      const openai = new OpenAIService();

      // Detect explicit memory save requests
      let explicitConfirmation = "";
      const memoryItem = detectMemoryCommand(userMessage);
      if (memoryItem) {
        await addToMemoryBank(memoryItem);
        explicitConfirmation = formatMemoryConfirmation(memoryItem.content);
        await refetchProfile();
      }
      
      // Convert messages to OpenAI format (already includes the last user message)
      const openaiMessages = messages
        .filter(msg => msg.type === 'text')
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      const response = await openai.sendMessage(openaiMessages);

      // Parse implicit memory instructions from the model
      const { cleaned, saved } = await parseAndSaveImplicitMemory(response);

      // Build a single assistant message combining confirmation and reply
      let finalContent = cleaned;
      if (explicitConfirmation) {
        finalContent = explicitConfirmation + "\n\n" + finalContent;
      } else if (saved) {
        finalContent = formatMemoryConfirmation(saved) + "\n\n" + finalContent;
      }
      
      await addMessage({
        content: finalContent,
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
      
      await addMessage({
        content: "Sorry, I encountered an error. Please try again.",
        role: 'assistant',
        type: 'text'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");

    // Handle multiple images - upload to storage for persistence with user folder structure
    let imageUrls: string[] = [];
    if (selectedImages.length > 0) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const uploadPromises = selectedImages.map(async (file) => {
          const fileName = `${user.id}/user-upload-${Date.now()}-${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
          
          const { data, error } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false
            });

          if (error) {
            console.error('Error uploading image:', error);
            return URL.createObjectURL(file); // Fallback to blob URL
          }

          const { data: publicUrlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
          return publicUrlData.publicUrl;
        });

        imageUrls = await Promise.all(uploadPromises);
      } catch (error) {
        console.error('Error uploading images:', error);
        // Fallback to blob URLs
        imageUrls = selectedImages.map(file => URL.createObjectURL(file));
      }
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
        
        // Add placeholder message immediately
        setGeneratingImage(true);
        const placeholderMessageId = Math.random().toString(36).substring(7);
        addMessage({
          content: `Generating image: ${imagePrompt || userMessage}`,
          role: 'assistant',
          type: 'image-generating',
          imagePrompt: imagePrompt || userMessage
        });
        
        try {
          const imageUrl = await openai.generateImage(imagePrompt || userMessage);
          
          // Upload generated image to Supabase storage for persistence
          let permanentImageUrl = imageUrl;
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Convert the generated image URL to a blob and upload it
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const fileName = `${user.id}/generated-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
            
            const { data, error } = await supabase.storage
              .from('avatars')
              .upload(fileName, blob, {
                contentType: 'image/png',
                upsert: false
              });

            if (error) {
              console.error('Error uploading generated image to storage:', error);
            } else {
              // Get the public URL
              const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);
              permanentImageUrl = publicUrlData.publicUrl;
            }
          } catch (uploadError) {
            console.error('Error uploading generated image:', uploadError);
            // Continue with original URL if upload fails
          }
          
          // Replace placeholder with actual image
          addMessage({
            content: `Generated image: ${imagePrompt || userMessage}`,
            role: 'assistant',
            type: 'image',
            imageUrl: permanentImageUrl
          });
        } catch (error) {
          console.error('Image generation error:', error);
          // Replace placeholder with error message
          await addMessage({
            content: `Sorry, I couldn't generate the image. ${error instanceof Error ? error.message : 'Please try again.'}`,
            role: 'assistant',
            type: 'text'
          });
        } finally {
          setGeneratingImage(false);
        }
      } else if (selectedImages.length > 0) {
        // Handle image analysis with text - prevent duplicate responses
        if (isLoading) return;
        
        try {
          // Create base64 from first image for analysis
          const file = selectedImages[0];
          const reader = new FileReader();
          
          reader.onload = async () => {
            try {
              const base64 = reader.result as string;
              const analysisPrompt = userMessage || 'What do you see in these images?';
              
              const response = await openai.sendMessageWithImage(
                [{ role: 'user', content: analysisPrompt }],
                base64
              );
              
              await addMessage({
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
              
              await addMessage({
                content: "Sorry, I couldn't analyze these images. Please try again.",
                role: 'assistant',
                type: 'text'
              });
            } finally {
              setLoading(false);
            }
          };
          
          reader.readAsDataURL(file);
          return; // Exit early since we handle the response in the file reader
        } catch (error) {
          console.error('File reading error:', error);
          setLoading(false);
        }
      } else {
        // Regular text conversation
        // Detect explicit memory before calling the model
        let explicitConfirmation = "";
        const memoryItem = detectMemoryCommand(userMessage);
        if (memoryItem) {
          await addToMemoryBank(memoryItem);
          explicitConfirmation = formatMemoryConfirmation(memoryItem.content);
          await refetchProfile();
        }
        
        const openaiMessages = messages
          .filter(msg => msg.type === 'text')
          .map(msg => ({ role: msg.role, content: msg.content }));
        
        openaiMessages.push({ role: 'user', content: userMessage });

        const response = await openai.sendMessage(openaiMessages);

        // Handle implicit memory suggested by the model
        const { cleaned, saved } = await parseAndSaveImplicitMemory(response);
        let finalContent = cleaned;
        if (explicitConfirmation) {
          finalContent = explicitConfirmation + "\n\n" + finalContent;
        } else if (saved) {
          finalContent = formatMemoryConfirmation(saved) + "\n\n" + finalContent;
        }
        
        await addMessage({ content: finalContent, role: 'assistant', type: 'text' });
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive"
      });
      
      await addMessage({
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
          <div className="flex items-center justify-center gap-4 mb-2">
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

      {/* Input Row */}
      <div className={`chat-input-halo flex items-end gap-3 rounded-full transition-all duration-300 ${isActive ? 'halo-active' : ''}`}>
        {/* Paperclip Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-200 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsActive(true)}
            onBlur={() => setIsActive(false)}
            placeholder={selectedImages.length > 0 ? "Add a message with your images..." : "Ask me anything..."}
            disabled={isLoading}
            className="card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[144px] leading-6"
            rows={1}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-200 ${
            inputValue.trim() || selectedImages.length > 0
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg' 
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}