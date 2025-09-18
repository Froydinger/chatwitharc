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

// Image editing/modification keywords for uploaded images
function isImageEditRequest(message: string): boolean {
  const editKeywords = [
    'edit this', 'modify this', 'change this', 'alter this', 'update this',
    'make it', 'make this', 'turn this', 'convert this', 'transform this',
    'add a', 'add some', 'put a', 'put some', 'give it', 'give this',
    'remove the', 'remove this', 'take off', 'take away',
    'make the', 'change the', 'turn the', 'with a', 'wearing a',
    'in a', 'holding a', 'but with', 'except with', 'instead of',
    'replace the', 'swap the', 'substitute', 'put on', 'add on'
  ];
  
  const lowerMessage = message.toLowerCase();
  return editKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Intelligent image request detection
function checkForImageRequest(message: string): boolean {
  const lowerMsg = message.toLowerCase().trim();
  
  // First check: If user is asking for a prompt/text, NOT an image
  const promptRequestIndicators = [
    /\b(?:make|write|create|give\s+me|provide)\s+(?:a\s+)?(?:prompt|description|text)\b/i,
    /\bprompt\s+for\b/i,
    /\bso\s+i\s+can\s+(?:paste|copy|use)\b/i,
    /\b(?:another|other)\s+(?:bot|ai|tool|app|site|website|platform)\b/i,
    /\b(?:copy|paste|share|send|use)\s+(?:it|this|that)\s+(?:in|to|with|for)\b/i,
    /\b(?:write|describe|explain)\s+(?:what|how)\b/i,
    /\bhelp\s+me\s+(?:write|describe|make|create)\b/i,
    /\bgive\s+me\s+(?:ideas?|suggestions?|examples?)\b/i,
    /\bwhat\s+(?:should|would)\s+i\s+(?:write|say|type|put)\b/i
  ];
  
  // If they're asking for a prompt/text, return false (don't generate image)
  if (promptRequestIndicators.some(pattern => pattern.test(lowerMsg))) {
    return false;
  }
  
  // EXPLICIT check for "generate an image" pattern - highest priority
  if (/^generate\s+an?\s+image\s+of/i.test(lowerMsg)) {
    console.log('EXPLICIT IMAGE GENERATION DETECTED:', lowerMsg);
    return true;
  }
  
  // Direct generation keywords
  const directKeywords = [
    'generate', 'create', 'make', 'draw', 'paint', 'sketch', 'illustrate', 
    'design', 'render', 'produce', 'build', 'craft', 'show me', 'visualize',
    'picture', 'image', 'photo', 'artwork', 'drawing', 'painting', 'graphic'
  ];
  
  // Phrases that indicate image requests
  const imageRequestPhrases = [
    'i want to see', 'show me', 'can you show', 'what would.*look like',
    'i need.*image', 'make.*picture', 'create.*visual', 'draw.*for me',
    'generate.*picture', 'design.*logo', 'create.*illustration', 'make.*artwork',
    'paint.*scene', 'sketch.*idea', 'visualize.*concept', 'render.*scene',
    'create.*design', 'make.*graphic', 'draw.*character', 'illustrate.*story',
    'design.*poster', 'create.*banner', 'make.*cover', 'draw.*diagram'
  ];
  
  // Patterns for image modification requests (iterating on existing images)
  const imageModificationPatterns = [
    /\b(?:give\s+it|make\s+it|change\s+it\s+to|turn\s+it)\s+.+(?:instead|rather|now)\b/i,
    /\b(?:make\s+it|change\s+it\s+to|turn\s+it\s+into|give\s+it)\s+(?:more|less|darker|brighter|bigger|smaller)\b/i,
    /\b(?:add|remove|change|modify|adjust|tweak)\s+(?:the|some|a)\s+.+(?:instead|to\s+it|on\s+it)\b/i,
    /\b(?:with\s+a|but\s+with|except\s+with|instead\s+of)\s+.+(?:hue|color|tone|style|background)\b/i,
    /\b(?:make\s+the|change\s+the|turn\s+the)\s+.+(?:purple|blue|red|green|yellow|orange|pink|black|white|gray|grey)\b/i,
    /\b(?:more|less)\s+(?:vibrant|colorful|saturated|bright|dark|moody|dramatic|realistic|abstract)\b/i
  ];
  
  // Visual description patterns that suggest image generation
  const visualDescriptionPatterns = [
    /^(?:a|an)\s+.*(scene|landscape|portrait|character|building|room|garden|forest|beach|mountain|city|street|house|car|animal|person|face|logo|design|artwork|drawing|painting|illustration)/i,
    /^(?:imagine|picture|envision)\s+/i,
    /\b(looks?\s+like|appears?\s+like|resembles?)\b/i,
    /\b(in\s+the\s+style\s+of|inspired\s+by|similar\s+to)\b/i,
    /\b(photorealistic|cartoon|anime|realistic|abstract|minimalist|detailed)\b/i,
    /\b(scene\s+with|landscape\s+with|portrait\s+of|character\s+with)\b/i,
    /\b(color\s+scheme|warm\s+colors|cool\s+colors|bright|dark|moody|lighting)\b/i
  ];
  
  // Question patterns that suggest wanting to see something
  const questionPatterns = [
    /^what\s+(?:would|does|might).+(?:look\s+like|appear)/i,
    /^how\s+(?:would|does|might).+(?:look|appear)/i,
    /^can\s+you\s+(?:show|draw|create|make|generate|paint|sketch|illustrate)/i,
    /^could\s+you\s+(?:show|draw|create|make|generate|paint|sketch|illustrate)/i,
    /^would\s+you\s+(?:show|draw|create|make|generate|paint|sketch|illustrate)/i
  ];
  
  // Check direct keywords combined with visual terms
  const hasDirectKeyword = directKeywords.some(keyword => lowerMsg.includes(keyword));
  const hasVisualContext = /\b(of|with|showing|featuring|depicting|containing)\s+/i.test(lowerMsg);
  
  // Check phrase patterns
  const hasImagePhrase = imageRequestPhrases.some(phrase => 
    new RegExp(phrase, 'i').test(lowerMsg)
  );
  
  // Check image modification patterns (high priority)
  const hasModificationPattern = imageModificationPatterns.some(pattern => 
    pattern.test(lowerMsg)
  );
  
  // Debug logging
  console.log('Image detection debug:', {
    message: lowerMsg,
    hasModificationPattern,
    hasDirectKeyword,
    hasImagePhrase,
    patterns: imageModificationPatterns.map(p => ({ pattern: p.toString(), matches: p.test(lowerMsg) }))
  });
  
  // Check visual description patterns
  const hasVisualDescription = visualDescriptionPatterns.some(pattern => 
    pattern.test(lowerMsg)
  );
  
  // Check question patterns
  const hasQuestionPattern = questionPatterns.some(pattern => 
    pattern.test(lowerMsg)
  );
  
  // Artistic/creative context
  const hasArtisticContext = /\b(art|artistic|creative|visual|aesthetic|beautiful|stunning|amazing|gorgeous|colorful|vibrant|dramatic|epic|fantasy|surreal|abstract|realistic|photorealistic|HD|4K|detailed|intricate)\b/i.test(lowerMsg);
  
  // Style or medium indicators
  const hasStyleIndicators = /\b(watercolor|oil\s+painting|digital\s+art|pencil\s+sketch|charcoal|acrylic|pastel|ink|vector|3D|CGI|concept\s+art|fine\s+art|pop\s+art|street\s+art|graffiti)\b/i.test(lowerMsg);
  
  // Location/setting descriptions that are often visual
  const hasLocationDescription = /\b(sunset|sunrise|beach|ocean|mountain|forest|city|skyline|garden|room|kitchen|bedroom|office|street|park|lake|river|castle|house|building|bridge|road|path|field|valley|desert|jungle|snow|winter|summer|spring|autumn|night|day|evening|morning)\b/i.test(lowerMsg);
  
  // Additional check: Make sure it's not just asking about image generation
  const isAskingAboutImages = /\b(?:about|discuss|talk\s+about|explain|help\s+with|understand)\s+.*\b(?:image|picture|photo|visual)\b/i.test(lowerMsg);
  if (isAskingAboutImages && !hasDirectKeyword) {
    return false;
  }
  
  // Combine all checks with smart weighting
  const score = 
    (hasModificationPattern ? 4 : 0) +  // Highest priority for image modifications
    (hasDirectKeyword && hasVisualContext ? 3 : 0) +
    (hasImagePhrase ? 3 : 0) +  
    (hasVisualDescription ? 2 : 0) +
    (hasQuestionPattern ? 2 : 0) +
    (hasDirectKeyword ? 1 : 0) +
    (hasArtisticContext ? 1 : 0) +
    (hasStyleIndicators ? 2 : 0) +
    (hasLocationDescription ? 1 : 0);
  
  console.log('Image detection final score:', {
    score,
    threshold: 2,
    willGenerateImage: score >= 2,
    explicitCheck: /^generate\s+an?\s+image\s+of/i.test(lowerMsg)
  });

  // Return true if score is 2 or higher (indicating strong image intent)
  return score >= 2;
}

// Extract clean image prompt from user message
function extractImagePrompt(message: string): string {
  let prompt = message.trim();
  
  // Remove common image request prefixes
  const prefixesToRemove = [
    /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:would\s+you\s+)?/i,
    /^(?:generate|create|make|draw|paint|sketch|illustrate|design|show\s+me|visualize)\s+(?:a\s+|an\s+)?(?:picture\s+of\s+|image\s+of\s+|drawing\s+of\s+|painting\s+of\s+)?/i,
    /^(?:draw|paint|create|make|generate|design)\s+(?:me\s+)?(?:a\s+|an\s+)?/i,
    /^(?:i\s+want\s+to\s+see|show\s+me)\s+(?:a\s+|an\s+)?/i,
    /^(?:what\s+(?:would|does)\s+.*\s+look\s+like\??\s*)/i,
    /^(?:how\s+(?:would|does)\s+.*\s+(?:look|appear)\??\s*)/i
  ];
  
  for (const prefix of prefixesToRemove) {
    prompt = prompt.replace(prefix, '').trim();
  }
  
  // If the prompt is too short after cleaning, use the original
  if (prompt.length < 3) {
    prompt = message.trim();
  }
  
  // Ensure it starts with a descriptive phrase
  if (!/^(?:a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) {
    // Add "a" if it seems to be describing a singular thing
    if (!/s\s*$/.test(prompt.split(' ')[0])) {
      prompt = `a ${prompt}`;
    }
  }
  
  return prompt;
}

export function ChatInput() {
  const { 
    messages, 
    addMessage, 
    replaceLastMessage,
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

  // Listen for edited message events
  useEffect(() => {
    const handleEditedMessage = async (event: CustomEvent) => {
      const { content } = event.detail;
      console.log('Processing edited message:', content);
      
      // Check if the edited message is requesting image generation
      const isImageGenerationRequest = checkForImageRequest(content);
      console.log('Edited message image generation check:', isImageGenerationRequest);
      
      if (isImageGenerationRequest) {
        // Handle image generation for edited message
        let imagePrompt = extractImagePrompt(content);
        
        // Add placeholder message immediately
        setGeneratingImage(true);
        await addMessage({
          content: `Generating image: ${imagePrompt || content}`,
          role: 'assistant',
          type: 'image-generating',
          imagePrompt: imagePrompt || content
        });
        
        try {
          const openai = new OpenAIService();
          const imageUrl = await openai.generateImage(imagePrompt || content);
          
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
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt || content}`,
            role: 'assistant',
            type: 'image',
            imageUrl: permanentImageUrl
          });
        } catch (error) {
          console.error('Image generation error:', error);
          // Replace placeholder with error message
          await replaceLastMessage({
            content: `Sorry, I couldn't generate the image. ${error instanceof Error ? error.message : 'Please try again.'}`,
            role: 'assistant',
            type: 'text'
          });
        } finally {
          setGeneratingImage(false);
        }
      } else {
        // Handle regular AI response for edited message
        handleAIResponse(content);
      }
    };

    const handleImageEdit = (event: CustomEvent) => {
      const { content, baseImageUrl, editInstruction } = event.detail;
      console.log('Processing image edit:', { content, baseImageUrl, editInstruction });
      handleImageEditRequest(content, baseImageUrl, editInstruction);
    };

    window.addEventListener('processEditedMessage', handleEditedMessage as EventListener);
    window.addEventListener('processImageEdit', handleImageEdit as EventListener);
    
    return () => {
      window.removeEventListener('processEditedMessage', handleEditedMessage as EventListener);
      window.removeEventListener('processImageEdit', handleImageEdit as EventListener);
    };
  }, []);

  // Extract implicit memory from the model's reply and save it
  const parseAndSaveImplicitMemory = async (text: string) => {
    const match = text.match(/\[MEMORY_SAVE\]([\s\S]*?)\[\/MEMORY_SAVE\]/i);
    if (match && match[1]) {
      const content = match[1].trim();
      if (content.length >= 3) {
        const wasNewMemory = await addToMemoryBank({ content, timestamp: new Date() });
        const cleaned = text.replace(match[0], '').trim();
        return { cleaned, saved: wasNewMemory ? content : null } as const;
      }
    }
    return { cleaned: text, saved: null as string | null } as const;
  };

  const handleImageEditRequest = async (prompt: string, baseImageUrl: string, editInstruction: string) => {
    try {
      const openai = new OpenAIService();
      
      // Add placeholder message immediately
      setGeneratingImage(true);
      const placeholderMessage = {
        content: `Editing image: ${editInstruction}`,
        role: 'assistant' as const,
        type: 'image-generating' as const,
        imagePrompt: editInstruction
      };
      addMessage(placeholderMessage);
      
      try {
        // Use the new editImage method
        const imageUrl = await openai.editImage(editInstruction, baseImageUrl);
        
        // Upload edited image to Supabase storage for persistence
        let permanentImageUrl = imageUrl;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Not authenticated');

          // Convert the edited image URL to a blob and upload it
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const fileName = `${user.id}/edited-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
          
          const { data, error } = await supabase.storage
            .from('avatars')
            .upload(fileName, blob, {
              contentType: 'image/png',
              upsert: false
            });

          if (error) {
            console.error('Error uploading edited image to storage:', error);
          } else {
            // Get the public URL
            const { data: publicUrlData } = supabase.storage
              .from('avatars')
              .getPublicUrl(fileName);
            permanentImageUrl = publicUrlData.publicUrl;
          }
        } catch (uploadError) {
          console.error('Error uploading edited image:', uploadError);
          // Continue with original URL if upload fails
        }

        // Replace placeholder with actual image
        await replaceLastMessage({
          content: `Edited image: ${editInstruction}`,
          role: 'assistant',
          type: 'image',
          imageUrl: permanentImageUrl
        });
      } catch (error) {
        console.error('Image editing error:', error);
        // Replace placeholder with error message
        await replaceLastMessage({
          content: `Sorry, I couldn't edit the image. ${error instanceof Error ? error.message : 'Please try again.'}`,
          role: 'assistant',
          type: 'text'
        });
      } finally {
        setGeneratingImage(false);
      }
    } catch (error) {
      console.error('Image edit request error:', error);
      setGeneratingImage(false);
    }
  };

  const handleAIResponse = async (userMessage: string) => {
    try {
      const openai = new OpenAIService();

      // Detect explicit memory save requests
      let explicitConfirmation = "";
      const memoryItem = detectMemoryCommand(userMessage);
      if (memoryItem) {
        const wasNewMemory = await addToMemoryBank(memoryItem);
        if (wasNewMemory) {
          explicitConfirmation = formatMemoryConfirmation(memoryItem.content);
        }
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

      // Send clean response without memory confirmations to maintain natural flow
      await addMessage({
        content: cleaned,
        role: 'assistant',
        type: 'text'
      });
      
      // Handle explicit memory saves silently
      if (explicitConfirmation && saved) {
        // Memory was saved, but don't show confirmation to maintain conversational flow
        await refetchProfile();
      }
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
    const imagesToProcess = [...selectedImages]; // Store images before clearing
    console.log('SEND HANDLER CALLED:', { userMessage, imagesToProcess: imagesToProcess.length });
    setInputValue("");
    setSelectedImages([]); // Clear immediately to prevent UI issues

    setLoading(true);

    // Early detection of image edit requests to prevent ghost bubbles
    const isUploadedImageEdit = imagesToProcess.length > 0 && userMessage && isImageEditRequest(userMessage);
    const isImageGenerationRequest = !imagesToProcess.length && checkForImageRequest(userMessage);
    console.log('FLOW DETECTION:', { 
      isUploadedImageEdit, 
      isImageGenerationRequest, 
      hasImages: imagesToProcess.length > 0,
      userMessage 
    });

    try {
      // Handle multiple images - upload to storage for persistence with user folder structure
      let imageUrls: string[] = [];
      if (imagesToProcess.length > 0) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Not authenticated');

          const uploadPromises = imagesToProcess.map(async (file) => {
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
          imageUrls = imagesToProcess.map(file => URL.createObjectURL(file));
        }
      }
      
      // Handle different types of requests based on early detection
      if (isUploadedImageEdit) {
        // This is an image edit request with uploaded images
        // Add user message first
        addMessage({
          content: userMessage,
          role: 'user',
          type: 'image',
          imageUrls: imageUrls
        });

        // Add fancy loading placeholder for image editing
        setGeneratingImage(true);
        const placeholderMessage = {
          content: `Editing image: ${userMessage}`,
          role: 'assistant' as const,
          type: 'image-generating' as const,
          imagePrompt: userMessage
        };
        addMessage(placeholderMessage);

        // Process the image edit
        try {
          const openai = new OpenAIService();
          const file = imagesToProcess[0];
          
          // Upload the base image to get a URL
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Not authenticated');
          
          const fileName = `${user.id}/base-for-edit-${Date.now()}-${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
          
          const { data, error } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false
            });
            
          if (error) throw error;
          
          const { data: publicUrlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
          const baseImageUrl = publicUrlData.publicUrl;
          
          // Generate edited image
          const imageUrl = await openai.editImage(userMessage, baseImageUrl);
          
          // Upload edited image to storage for persistence
          let permanentImageUrl = imageUrl;
          try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const editedFileName = `${user.id}/edited-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('avatars')
              .upload(editedFileName, blob, {
                contentType: 'image/png',
                upsert: false
              });

            if (!uploadError) {
              const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(editedFileName);
              permanentImageUrl = publicUrlData.publicUrl;
            }
          } catch (uploadError) {
            console.error('Error uploading edited image:', uploadError);
          }

          // Replace placeholder with actual image
          await replaceLastMessage({
            content: `Edited image: ${userMessage}`,
            role: 'assistant',
            type: 'image',
            imageUrl: permanentImageUrl
          });
        } catch (error) {
          console.error('Image editing error:', error);
          // Replace placeholder with error message
          await replaceLastMessage({
            content: `Sorry, I couldn't edit the image. ${error instanceof Error ? error.message : 'Please try again.'}`,
            role: 'assistant',
            type: 'text'
          });
        } finally {
          setGeneratingImage(false);
        }
      } else {
        // Add user message for non-edit requests
        addMessage({
          content: userMessage || "Sent images",
          role: 'user',
          type: imagesToProcess.length > 0 ? 'image' : 'text',
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined
        });

        const openai = new OpenAIService();
        
        // Check if user is requesting image generation with intelligent detection
        console.log('Main submit - image generation check:', isImageGenerationRequest, 'for message:', userMessage);
        if (isImageGenerationRequest) {
        // Extract the image description intelligently
        let imagePrompt = extractImagePrompt(userMessage);
        
        // Add placeholder message immediately
        setGeneratingImage(true);
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
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt || userMessage}`,
            role: 'assistant',
            type: 'image',
            imageUrl: permanentImageUrl
          });
        } catch (error) {
          console.error('Image generation error:', error);
          // Replace placeholder with error message
          await replaceLastMessage({
            content: `Sorry, I couldn't generate the image. ${error instanceof Error ? error.message : 'Please try again.'}`,
            role: 'assistant',
            type: 'text'
          });
        } finally {
          setGeneratingImage(false);
        }
        } else if (imagesToProcess.length > 0) {
          // Handle regular image analysis
          try {
            // Convert first image to base64 for analysis
            const file = imagesToProcess[0];
            const base64Promise = new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error('Failed to read image file'));
              reader.readAsDataURL(file);
            });
            
            const base64 = await base64Promise;
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
          }
        } else {
          // Regular text conversation
          // Detect explicit memory before calling the model
          let explicitConfirmation = "";
          const memoryItem = detectMemoryCommand(userMessage);
          if (memoryItem) {
            const wasNewMemory = await addToMemoryBank(memoryItem);
            if (wasNewMemory) {
              explicitConfirmation = formatMemoryConfirmation(memoryItem.content);
            }
            await refetchProfile();
          }
          
          const openaiMessages = messages
            .filter(msg => msg.type === 'text')
            .map(msg => ({ role: msg.role, content: msg.content }));
          
          openaiMessages.push({ role: 'user', content: userMessage });

          const response = await openai.sendMessage(openaiMessages);

          // Handle implicit memory suggested by the model  
          const { cleaned, saved } = await parseAndSaveImplicitMemory(response);
          
          // Send clean response without memory confirmations
          await addMessage({ content: cleaned, role: 'assistant', type: 'text' });
          
          // Handle explicit memory saves silently 
          if (explicitConfirmation && saved) {
            await refetchProfile();
          }
        }
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