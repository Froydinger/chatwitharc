import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Image as ImageIcon } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { AIService } from "@/services/ai";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from "@/utils/memoryDetection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Image editing/modification keywords for uploaded images
function isImageEditRequest(message: string): boolean {
  const editKeywords = [
    "edit this",
    "modify this",
    "change this",
    "alter this",
    "update this",
    "make it",
    "make this",
    "turn this",
    "convert this",
    "transform this",
    "add a",
    "add some",
    "put a",
    "put some",
    "give it",
    "give this",
    "remove the",
    "remove this",
    "take off",
    "take away",
    "make the",
    "change the",
    "turn the",
    "with a",
    "wearing a",
    "in a",
    "holding a",
    "but with",
    "except with",
    "instead of",
    "replace the",
    "swap the",
    "substitute",
    "put on",
    "add on",
  ];
  const lowerMessage = message.toLowerCase();
  return editKeywords.some((k) => lowerMessage.includes(k));
}

// Intelligent image request detection
function checkForImageRequest(message: string): boolean {
  const lowerMsg = message.toLowerCase().trim();

  const promptRequestIndicators = [
    /\b(?:make|write|create|give\s+me|provide)\s+(?:a\s+)?(?:prompt|description|text)\b/i,
    /\bprompt\s+for\b/i,
    /\bso\s+i\s+can\s+(?:paste|copy|use)\b/i,
    /\b(?:another|other)\s+(?:bot|ai|tool|app|site|website|platform)\b/i,
    /\b(?:copy|paste|share|send|use)\s+(?:it|this|that)\s+(?:in|to|with|for)\b/i,
    /\b(?:write|describe|explain)\s+(?:what|how)\b/i,
    /\bhelp\s+me\s+(?:write|describe|make|create)\b/i,
    /\bgive\s+me\s+(?:ideas?|suggestions?|examples?)\b/i,
    /\bwhat\s+(?:should|would)\s+i\s+(?:write|say|type|put)\b/i,
  ];
  if (promptRequestIndicators.some((p) => p.test(lowerMsg))) return false;

  if (/^generate\s+an?\s+image\s+of/i.test(lowerMsg)) return true;

  const directKeywords = [
    "generate",
    "create",
    "make",
    "draw",
    "paint",
    "sketch",
    "illustrate",
    "design",
    "render",
    "produce",
    "build",
    "craft",
    "show me",
    "visualize",
    "picture",
    "image",
    "photo",
    "artwork",
    "drawing",
    "painting",
    "graphic",
  ];
  const imageRequestPhrases = [
    "i want to see",
    "show me",
    "can you show",
    "what would.*look like",
    "i need.*image",
    "make.*picture",
    "create.*visual",
    "draw.*for me",
    "generate.*picture",
    "design.*logo",
    "create.*illustration",
    "make.*artwork",
    "paint.*scene",
    "sketch.*idea",
    "visualize.*concept",
    "render.*scene",
    "create.*design",
    "make.*graphic",
    "draw.*character",
    "illustrate.*story",
    "design.*poster",
    "create.*banner",
    "make.*cover",
    "draw.*diagram",
  ];
  const imageModificationPatterns = [
    /\b(?:give\s+it|make\s+it|change\s+it\s+to|turn\s+it)\s+.+(?:instead|rather|now)\b/i,
    /\b(?:make\s+it|change\s+it\s+to|turn\s+it\s+into|give\s+it)\s+(?:more|less|darker|brighter|bigger|smaller)\b/i,
    /\b(?:add|remove|change|modify|adjust|tweak)\s+(?:the|some|a)\s+.+(?:instead|to\s+it|on\s+it)\b/i,
    /\b(?:with\s+a|but\s+with|except\s+with|instead\s+of)\s+.+(?:hue|color|tone|style|background)\b/i,
    /\b(?:make\s+the|change\s+the|turn\s+the)\s+.+(?:purple|blue|red|green|yellow|orange|pink|black|white|gray|grey)\b/i,
    /\b(?:more|less)\s+(?:vibrant|colorful|saturated|bright|dark|moody|dramatic|realistic|abstract)\b/i,
  ];
  const visualDescriptionPatterns = [
    /^(?:a|an)\s+.*(scene|landscape|portrait|character|building|room|garden|forest|beach|mountain|city|street|house|car|animal|person|face|logo|design|artwork|drawing|painting|illustration)/i,
    /^(?:imagine|picture|envision)\s+/i,
    /\b(looks?\s+like|appears?\s+like|resembles?)\b/i,
    /\b(in\s+the\s+style\s+of|inspired\s+by|similar\s+to)\b/i,
    /\b(photorealistic|cartoon|anime|realistic|abstract|minimalist|detailed)\b/i,
    /\b(scene\s+with|landscape\s+with|portrait\s+of|character\s+with)\b/i,
    /\b(color\s+scheme|warm\s+colors|cool\s+colors|bright|dark|moody|lighting)\b/i,
  ];
  const questionPatterns = [
    /^what\s+(?:would|does|might).+(?:look\s+like|appear)/i,
    /^how\s+(?:would|does|might).+(?:look|appear)/i,
    /^can\s+you\s+(?:show|draw|create|make|generate|paint|sketch|illustrate)/i,
    /^could\s+you\s+(?:show|draw|create|make|generate|paint|sketch|illustrate)/i,
    /^would\s+you\s+(?:show|draw|create|make|generate|paint|sketch|illustrate)/i,
  ];

  const hasDirectKeyword = directKeywords.some((k) => lowerMsg.includes(k));
  const hasVisualContext = /\b(of|with|showing|featuring|depicting|containing)\s+/i.test(lowerMsg);
  const hasImagePhrase = imageRequestPhrases.some((phrase) => new RegExp(phrase, "i").test(lowerMsg));
  const hasModificationPattern = imageModificationPatterns.some((p) => p.test(lowerMsg));
  const hasVisualDescription = visualDescriptionPatterns.some((p) => p.test(lowerMsg));
  const hasQuestionPattern = questionPatterns.some((p) => p.test(lowerMsg));
  const hasArtisticContext =
    /\b(art|artistic|creative|visual|aesthetic|beautiful|stunning|amazing|gorgeous|colorful|vibrant|dramatic|epic|fantasy|surreal|abstract|realistic|photorealistic|HD|4K|detailed|intricate)\b/i.test(
      lowerMsg,
    );
  const hasStyleIndicators =
    /\b(watercolor|oil\s+painting|digital\s+art|pencil\s+sketch|charcoal|acrylic|pastel|ink|vector|3D|CGI|concept\s+art|fine\s+art|pop\s+art|street\s+art|graffiti)\b/i.test(
      lowerMsg,
    );
  const hasLocationDescription =
    /\b(sunset|sunrise|beach|ocean|mountain|forest|city|skyline|garden|room|kitchen|bedroom|office|street|park|lake|river|castle|house|building|bridge|road|path|field|valley|desert|jungle|snow|winter|summer|spring|autumn|night|day|evening|morning)\b/i.test(
      lowerMsg,
    );
  const isAskingAboutImages =
    /\b(?:about|discuss|talk\s+about|explain|help\s+with|understand)\s+.*\b(?:image|picture|photo|visual)\b/i.test(
      lowerMsg,
    );
  if (isAskingAboutImages && !hasDirectKeyword) return false;

  const score =
    (hasModificationPattern ? 4 : 0) +
    (hasDirectKeyword && hasVisualContext ? 3 : 0) +
    (hasImagePhrase ? 3 : 0) +
    (hasVisualDescription ? 2 : 0) +
    (hasQuestionPattern ? 2 : 0) +
    (hasDirectKeyword ? 1 : 0) +
    (hasArtisticContext ? 1 : 0) +
    (hasStyleIndicators ? 2 : 0) +
    (hasLocationDescription ? 1 : 0);

  return score >= 2;
}

// Extract clean image prompt from user message
function extractImagePrompt(message: string): string {
  let prompt = message.trim();
  const prefixesToRemove = [
    /^(?:please\s+)?(?:can\s+you\s+)?(?:could\s+you\s+)?(?:would\s+you\s+)?/i,
    /^(?:generate|create|make|draw|paint|sketch|illustrate|design|show\s+me|visualize)\s+(?:a\s+|an\s+)?(?:picture\s+of\s+|image\s+of\s+|drawing\s+of\s+|painting\s+of\s+)?/i,
    /^(?:draw|paint|create|make|generate|design)\s+(?:me\s+)?(?:a\s+|an\s+)?/i,
    /^(?:i\s+want\s+to\s+see|show\s+me)\s+(?:a\s+|an\s+)?/i,
    /^(?:what\s+(?:would|does)\s+.*\s+look\s+like\??\s*)/i,
    /^(?:how\s+(?:would|does)\s+.*\s+(?:look|appear)\??\s*)/i,
  ];
  for (const p of prefixesToRemove) prompt = prompt.replace(p, "").trim();
  if (prompt.length < 3) prompt = message.trim();
  if (!/^(?:a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) {
    if (!/s\s*$/.test(prompt.split(" ")[0])) prompt = `a ${prompt}`;
  }
  return prompt;
}

export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { messages, addMessage, replaceLastMessage, isLoading, isGeneratingImage, setLoading, setGeneratingImage } =
    useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // new

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { refetch: refetchProfile } = useProfile();

  // Detect if current input suggests image generation
  const shouldShowBanana = forceImageMode || (inputValue && checkForImageRequest(inputValue));

  // Mobile watcher
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Notify parent about image selection changes
  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const lineHeight = 24;
      const maxHeight = lineHeight * 3;
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + "px";
    }
  }, [inputValue]);

  // Auto-respond to quick start messages (only for text messages without images)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage?.role === "user" &&
      lastMessage?.type === "text" &&
      !lastMessage?.imageUrls &&
      !isLoading &&
      messages.filter((m) => m.role === "assistant").length === 0
    ) {
      setLoading(true);
      handleAIResponse(lastMessage.content);
    }
  }, [messages]);

  // Handle edited message events and trigger image gen when applicable
  useEffect(() => {
    const handleEditedMessage = async (event: CustomEvent) => {
      const { content } = event.detail as { content: string };

      const isImageGenerationRequest = checkForImageRequest(content);
      if (isImageGenerationRequest) {
        const imagePrompt = extractImagePrompt(content);
        const apiPrompt = `Generate image with Nano Banana: ${imagePrompt}`; // hidden prefix

        setGeneratingImage(true);
        await addMessage({
          content: `Generating image: ${imagePrompt}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt,
        });

        try {
          const ai = new AIService();
          const imageUrl = await ai.generateImage(apiPrompt);
          let permanentImageUrl = imageUrl;

          try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const fileName = `generated-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
            const { error } = await supabase.storage.from("avatars").upload(fileName, blob, {
              contentType: "image/png",
              upsert: false,
            });
            if (!error) {
              const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
              permanentImageUrl = publicUrlData.publicUrl;
            }
          } catch {}

          await replaceLastMessage({
            content: `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: permanentImageUrl,
          });
        } catch (error) {
          await replaceLastMessage({
            content: `Sorry, I couldn't generate the image. ${error instanceof Error ? error.message : "Please try again."}`,
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
      } else {
        handleAIResponse(content);
      }
    };

    const handleImageEdit = (event: CustomEvent) => {
      const { content, baseImageUrl, editInstruction } = event.detail;
      handleImageEditRequest(content, baseImageUrl, editInstruction);
    };

    const handleTriggerPrompt = async (event: CustomEvent) => {
      const { prompt, type } = event.detail as { prompt: string; type: string };
      if (type === "image") {
        setInputValue(prompt);
        setTimeout(() => {
          handleSend();
        }, 100);
      }
    };

    window.addEventListener("processEditedMessage", handleEditedMessage as EventListener);
    window.addEventListener("processImageEdit", handleImageEdit as EventListener);
    window.addEventListener("arcai:triggerPrompt", handleTriggerPrompt as EventListener);

    return () => {
      window.removeEventListener("processEditedMessage", handleEditedMessage as EventListener);
      window.removeEventListener("processImageEdit", handleImageEdit as EventListener);
      window.removeEventListener("arcai:triggerPrompt", handleTriggerPrompt as EventListener);
    };
  }, []);

  // Extract implicit memory from the model's reply and save it
  const parseAndSaveImplicitMemory = async (text: string) => {
    const match = text.match(/\[MEMORY_SAVE\]([\s\S]*?)\[\/MEMORY_SAVE\]/i);
    if (match && match[1]) {
      const content = match[1].trim();
      if (content.length >= 3) {
        const wasNewMemory = await addToMemoryBank({ content, timestamp: new Date() });
        const cleaned = text.replace(match[0], "").trim();
        return { cleaned, saved: wasNewMemory ? content : null } as const;
      }
    }
    return { cleaned: text, saved: null as string | null } as const;
  };

  const handleImageEditRequest = async (prompt: string, baseImageUrl: string, editInstruction: string) => {
    try {
      const ai = new AIService();
      setGeneratingImage(true);
      addMessage({
        content: `Editing image: ${editInstruction}`,
        role: "assistant",
        type: "image-generating",
        imagePrompt: editInstruction,
      });

      try {
        const imageUrl = await ai.editImage(editInstruction, baseImageUrl);
        let permanentImageUrl = imageUrl;
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const fileName = `edited-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
          const { error } = await supabase.storage.from("avatars").upload(fileName, blob, {
            contentType: "image/png",
            upsert: false,
          });
          if (!error) {
            const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
            permanentImageUrl = publicUrlData.publicUrl;
          }
        } catch {}
        await replaceLastMessage({
          content: `Edited image: ${editInstruction}`,
          role: "assistant",
          type: "image",
          imageUrl: permanentImageUrl,
        });
      } catch (error) {
        await replaceLastMessage({
          content: `Sorry, I couldn't edit the image. ${error instanceof Error ? error.message : "Please try again."}`,
          role: "assistant",
          type: "text",
        });
      } finally {
        setGeneratingImage(false);
      }
    } catch {
      setGeneratingImage(false);
    }
  };

  const handleAIResponse = async (userMessage: string) => {
    try {
      const ai = new AIService();

      let explicitConfirmation = "";
      const memoryItem = detectMemoryCommand(userMessage);
      if (memoryItem) {
        const wasNewMemory = await addToMemoryBank(memoryItem);
        if (wasNewMemory) explicitConfirmation = formatMemoryConfirmation(memoryItem.content);
      }

      const aiMessages = messages
        .filter((msg) => msg.type === "text")
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const response = await ai.sendMessage(aiMessages);
      const { cleaned } = await parseAndSaveImplicitMemory(response);

      await addMessage({ content: cleaned, role: "assistant", type: "text" });
    } catch (error) {
      const { toast } = useToast();
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive",
      });
      await addMessage({
        content: "Sorry, I encountered an error. Please try again.",
        role: "assistant",
        type: "text",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fast hybrid analysis
  const analyzePromptIntent = async (message: string): Promise<"image" | "text"> => {
    const localResult = checkForImageRequest(message);
    const lowerMsg = message.toLowerCase();
    const veryConfidentImageKeywords = [
      "generate image",
      "create image",
      "make image",
      "draw me",
      "show me a picture",
      "generate a picture",
      "create a photo",
      "make a drawing",
      "visualize this",
    ];
    const veryConfidentTextKeywords = [
      "explain",
      "tell me about",
      "what is",
      "how to",
      "help me understand",
      "write a",
      "describe",
      "summarize",
      "calculate",
      "define",
    ];
    if (veryConfidentImageKeywords.some((k) => lowerMsg.includes(k))) return "image";
    if (veryConfidentTextKeywords.some((k) => lowerMsg.includes(k))) return "text";
    if (localResult && (lowerMsg.includes("generate") || lowerMsg.includes("create") || lowerMsg.includes("make")))
      return "image";
    if (!localResult && message.length > 50 && !lowerMsg.includes("image") && !lowerMsg.includes("picture"))
      return "text";
    return localResult ? "image" : "text";
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    const imagesToProcess = [...selectedImages];

    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
    setLoading(true);

    const isUploadedImageEdit =
      imagesToProcess.length > 0 &&
      imagesToProcess.length <= 2 &&
      userMessage &&
      (isImageEditRequest(userMessage) ||
        /\b(put|place|combine|merge|add|create|make|compose|blend|mix|together|into|with|at|in)\b/i.test(userMessage));

    let isImageGenerationRequest = false;
    if (!imagesToProcess.length && userMessage) {
      const intent = await analyzePromptIntent(userMessage);
      isImageGenerationRequest = intent === "image";
    }

    try {
      let imageUrls: string[] = [];
      if (imagesToProcess.length > 0) {
        try {
          const uploadPromises = imagesToProcess.map(async (file) => {
            const fileName = `user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage.from("avatars").upload(fileName, file, {
              contentType: file.type,
              upsert: false,
            });
            if (error) return URL.createObjectURL(file);
            const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
            return publicUrlData.publicUrl;
          });
          imageUrls = await Promise.all(uploadPromises);
        } catch {
          imageUrls = imagesToProcess.map((f) => URL.createObjectURL(f));
        }
      }

      if (isUploadedImageEdit) {
        addMessage({ content: userMessage, role: "user", type: "image", imageUrls });
        setGeneratingImage(true);
        addMessage({
          content: `Editing image: ${userMessage}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt: userMessage,
        });

        try {
          const ai = new AIService();
          const baseImageUrls: string[] = imageUrls;
          const imageUrl = await ai.editImage(userMessage, baseImageUrls);
          let permanentImageUrl = imageUrl;
          try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const editedFileName = `edited-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
            const { error: uploadError } = await supabase.storage.from("avatars").upload(editedFileName, blob, {
              contentType: "image/png",
              upsert: false,
            });
            if (!uploadError) {
              const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(editedFileName);
              permanentImageUrl = publicUrlData.publicUrl;
            }
          } catch {}
          await replaceLastMessage({
            content: `Edited image: ${userMessage}`,
            role: "assistant",
            type: "image",
            imageUrl: permanentImageUrl,
          });
        } catch (error) {
          await replaceLastMessage({
            content: `Sorry, I couldn't edit the image. ${error instanceof Error ? error.message : "Please try again."}`,
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
      } else {
        addMessage({
          content: userMessage || "Sent images",
          role: "user",
          type: imagesToProcess.length > 0 ? "image" : "text",
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        });

        const ai = new AIService();

        if (isImageGenerationRequest) {
          const imagePrompt = extractImagePrompt(userMessage);

          // Nano Banana active means we prefix the actual API prompt silently
          const nanoActive = true; // if we got here, detection said image, treat as active
          const apiPrompt = nanoActive ? `Generate image with Nano Banana: ${imagePrompt}` : imagePrompt;

          setGeneratingImage(true);
          addMessage({
            content: `Generating image: ${imagePrompt}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt,
          });

          try {
            const imageUrl = await ai.generateImage(apiPrompt);

            let permanentImageUrl = imageUrl;
            try {
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              const fileName = `generated-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
              const { error } = await supabase.storage.from("avatars").upload(fileName, blob, {
                contentType: "image/png",
                upsert: false,
              });
              if (!error) {
                const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
                permanentImageUrl = publicUrlData.publicUrl;
              }
            } catch {}

            await replaceLastMessage({
              content: `Generated image: ${imagePrompt}`,
              role: "assistant",
              type: "image",
              imageUrl: permanentImageUrl,
            });
          } catch (error) {
            await replaceLastMessage({
              content: "Sorry, I couldn't generate the image.",
              role: "assistant",
              type: "text",
            });
          } finally {
            setGeneratingImage(false);
          }
        } else if (imagesToProcess.length > 0) {
          try {
            const base64Promises = imagesToProcess.map(
              (file) =>
                new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error("Failed to read image file"));
                  reader.readAsDataURL(file);
                }),
            );
            const base64Images = await Promise.all(base64Promises);
            const analysisPrompt =
              userMessage || `What do you see in ${imagesToProcess.length > 1 ? "these images" : "this image"}?`;
            const response = await ai.sendMessageWithImage([{ role: "user", content: analysisPrompt }], base64Images);
            await addMessage({ content: response, role: "assistant", type: "text" });
          } catch {
            const { toast } = useToast();
            toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
            await addMessage({
              content: "Sorry, I couldn't analyze these images. Please try again.",
              role: "assistant",
              type: "text",
            });
          }
        } else {
          let explicitConfirmation = "";
          const memoryItem = detectMemoryCommand(userMessage);
          if (memoryItem) {
            const wasNewMemory = await addToMemoryBank(memoryItem);
            if (wasNewMemory) explicitConfirmation = formatMemoryConfirmation(memoryItem.content);
            await refetchProfile();
          }

          const aiMessages = messages
            .filter((msg) => msg.type === "text")
            .map((msg) => ({ role: msg.role, content: msg.content }));
          aiMessages.push({ role: "user", content: userMessage });

          const response = await ai.sendMessage(aiMessages);
          const { cleaned } = await parseAndSaveImplicitMemory(response);
          await addMessage({ content: cleaned, role: "assistant", type: "text" });
        }
      }
    } catch (error) {
      const { toast } = useToast();
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive",
      });
      await addMessage({
        content: "Sorry, I encountered an error. Please try again.",
        role: "assistant",
        type: "text",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const maxImages = 4;
    if (selectedImages.length + imageFiles.length > maxImages) {
      const { toast } = useToast();
      toast({
        title: "Too many images",
        description: `You can only send up to ${maxImages} images at once`,
        variant: "destructive",
      });
      return;
    }
    setSelectedImages((prev) => [...prev, ...imageFiles.slice(0, maxImages - prev.length)]);
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <div className="p-3 bg-glass/20 rounded-lg">
          <div className="flex items-center justify-center gap-4 mb-2">
            <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
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
      <div
        className={`chat-input-halo flex items-end gap-3 transition-all duration-300 ${isActive ? "halo-active" : ""}`}
        style={{ borderRadius: "1rem" }}
      >
        {/* Attachment Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={isLoading}
              className="shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-200 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-card/95 backdrop-blur-xl border-border/50 z-50">
            <DropdownMenuItem
              onClick={() => setForceImageMode(true)}
              className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50"
            >
              <span className="mr-2">🍌</span>
              <span>Generate Images</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50"
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              <span>Attach Images</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 relative">
          {/* Banana pill indicator */}
          {shouldShowBanana && (
            <div
              className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-400/20 border border-yellow-400/40 backdrop-blur-sm animate-pulse`}
            >
              <span className="text-base">🍌</span>
              {/* hide text on mobile */}
              <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 hidden sm:inline">
                Nano Banana
              </span>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsActive(true)}
            onBlur={() => setIsActive(false)}
            placeholder={
              selectedImages.length > 0
                ? "Add a message with your images..."
                : shouldShowBanana
                  ? "Describe your image..."
                  : "Ask me anything..."
            }
            disabled={isLoading}
            className={`card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[144px] leading-6 ${
              shouldShowBanana ? (isMobile ? "pl-12" : "pl-36") : ""
            }`}
            rows={1}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-200 ${
            inputValue.trim() || selectedImages.length > 0
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {/* Hidden File Input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
