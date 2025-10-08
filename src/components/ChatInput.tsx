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

/* ---------- helpers (unchanged) ---------- */
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
  const lower = message.toLowerCase();
  return editKeywords.some((k) => lower.includes(k));
}

function checkForImageRequest(message: string): boolean {
  const m = message.toLowerCase().trim();
  const promptAsk = [
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
  if (promptAsk.some((p) => p.test(m))) return false;
  if (/^generate\s+an?\s+image\s+of/i.test(m)) return true;

  const direct = [
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
  const phrases = [
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
  const mods = [
    /\b(?:give\s+it|make\s+it|change\s+it\s+to|turn\s+it)\s+.+(?:instead|rather|now)\b/i,
    /\b(?:make\s+it|change\s+it\s+to|turn\s+it\s+into|give\s+it)\s+(?:more|less|darker|brighter|bigger|smaller)\b/i,
    /\b(?:add|remove|change|modify|adjust|tweak)\b/i,
  ];
  const visuals = [
    /^(?:a|an)\s+.*(scene|landscape|portrait|character|logo|design|artwork|illustration)/i,
    /^(?:imagine|picture|envision)\s+/i,
  ];
  const qs = [
    /^what\s+(?:would|does|might).+look/i,
    /^how\s+(?:would|does|might).+(?:look|appear)/i,
    /^can\s+you\s+(?:show|draw|create|make|generate)/i,
  ];

  const hasDirect = direct.some((k) => m.includes(k));
  const hasPhrase = phrases.some((p) => new RegExp(p, "i").test(m));
  const score =
    (mods.some((p) => p.test(m)) ? 4 : 0) +
    (hasDirect ? 1 : 0) +
    (hasPhrase ? 3 : 0) +
    (visuals.some((p) => p.test(m)) ? 2 : 0) +
    (qs.some((p) => p.test(m)) ? 2 : 0);

  return score >= 2;
}

function extractImagePrompt(message: string): string {
  let prompt = message.trim();
  const remove = [
    /^(?:please\s+)?(?:can|could|would)\s+you\s+/i,
    /^(?:generate|create|make|draw|paint|sketch|illustrate|design|show\s+me|visualize)\s+(?:a|an)?\s*/i,
    /^(?:i\s+want\s+to\s+see|show\s+me)\s+/i,
  ];
  for (const r of remove) prompt = prompt.replace(r, "").trim();
  if (prompt.length < 3) prompt = message.trim();
  if (!/^(?:a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) prompt = `a ${prompt}`;
  return prompt;
}

/* ---------- component ---------- */
export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, setGeneratingImage } = useArcStore();
  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile(); // keep hook wired

  const shouldShowBanana = forceImageMode || (inputValue && checkForImageRequest(inputValue));

  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const h = textareaRef.current.scrollHeight;
    const max = 24 * 3;
    textareaRef.current.style.height = Math.min(h, max) + "px";
  }, [inputValue]);

  /* ---------- edited message → image gen with new prefix ---------- */
  useEffect(() => {
    const handleEditedMessage = async (event: CustomEvent) => {
      const { content } = event.detail as { content: string };
      if (checkForImageRequest(content)) {
        const imagePrompt = extractImagePrompt(content);
        const apiPrompt = `Generate an image: ${imagePrompt}`; // new prefix

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
          let finalUrl = imageUrl;
          try {
            const blob = await (await fetch(imageUrl)).blob();
            const fileName = `generated-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(fileName, blob, { contentType: "image/png", upsert: false });
            if (!error) {
              const { data: pub } = supabase.storage.from("avatars").getPublicUrl(fileName);
              finalUrl = pub.publicUrl;
            }
          } catch {}
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: finalUrl,
          });
        } catch (e) {
          await replaceLastMessage({
            content: `Sorry, I couldn't generate the image.`,
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
      }
    };

    window.addEventListener("processEditedMessage", handleEditedMessage as EventListener);
    return () => window.removeEventListener("processEditedMessage", handleEditedMessage as EventListener);
  }, []);

  /* ---------- send ---------- */
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
    if (!imagesToProcess.length && userMessage) isImageGenerationRequest = checkForImageRequest(userMessage);

    try {
      let imageUrls: string[] = [];
      if (imagesToProcess.length > 0) {
        try {
          const uploadPromises = imagesToProcess.map(async (file) => {
            const fileName = `user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(fileName, file, { contentType: file.type, upsert: false });
            if (error) return URL.createObjectURL(file);
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(fileName);
            return pub.publicUrl;
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
          const editedUrl = await ai.editImage(userMessage, imageUrls);
          let finalUrl = editedUrl;
          try {
            const blob = await (await fetch(editedUrl)).blob();
            const name = `edited-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(name, blob, { contentType: "image/png", upsert: false });
            if (!error) {
              const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
              finalUrl = pub.publicUrl;
            }
          } catch {}
          await replaceLastMessage({
            content: `Edited image: ${userMessage}`,
            role: "assistant",
            type: "image",
            imageUrl: finalUrl,
          });
        } catch {
          await replaceLastMessage({ content: "Sorry, I couldn't edit the image.", role: "assistant", type: "text" });
        } finally {
          setGeneratingImage(false);
        }
      } else {
        addMessage({
          content: userMessage || "Sent images",
          role: "user",
          type: imagesToProcess.length ? "image" : "text",
          imageUrls: imageUrls.length ? imageUrls : undefined,
        });

        if (isImageGenerationRequest) {
          const imagePrompt = extractImagePrompt(userMessage);
          const apiPrompt = `Generate an image: ${imagePrompt}`; // <<< new prefix

          setGeneratingImage(true);
          addMessage({
            content: `Generating image: ${imagePrompt}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt,
          });

          try {
            const ai = new AIService();
            const genUrl = await ai.generateImage(apiPrompt);
            let finalUrl = genUrl;
            try {
              const blob = await (await fetch(genUrl)).blob();
              const name = `generated-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
              const { error } = await supabase.storage
                .from("avatars")
                .upload(name, blob, { contentType: "image/png", upsert: false });
              if (!error) {
                const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
                finalUrl = pub.publicUrl;
              }
            } catch {}
            await replaceLastMessage({
              content: `Generated image: ${imagePrompt}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrl,
            });
          } catch {
            await replaceLastMessage({
              content: "Sorry, I couldn't generate the image.",
              role: "assistant",
              type: "text",
            });
          } finally {
            setGeneratingImage(false);
          }
        } else if (imagesToProcess.length > 0) {
          // analysis flow unchanged...
          const ai = new AIService();
          const base64s = await Promise.all(
            imagesToProcess.map(
              (file) =>
                new Promise<string>((res, rej) => {
                  const r = new FileReader();
                  r.onload = () => res(r.result as string);
                  r.onerror = () => rej();
                  r.readAsDataURL(file);
                }),
            ),
          );
          const prompt =
            userMessage || `What do you see in ${imagesToProcess.length > 1 ? "these images" : "this image"}?`;
          const reply = await ai.sendMessageWithImage([{ role: "user", content: prompt }], base64s);
          await addMessage({ content: reply, role: "assistant", type: "text" });
        } else {
          // text flow unchanged...
          const ai = new AIService();
          const memoryItem = detectMemoryCommand(userMessage);
          if (memoryItem) await addToMemoryBank(memoryItem);
          const aiMessages = messages
            .filter((m) => m.type === "text")
            .map((m) => ({ role: m.role, content: m.content }));
          aiMessages.push({ role: "user", content: userMessage });
          const reply = await ai.sendMessage(aiMessages);
          await addMessage({ content: reply, role: "assistant", type: "text" });
        }
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to get AI response",
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
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const max = 4;
    if (selectedImages.length + imgs.length > max) {
      toast({
        title: "Too many images",
        description: `You can only send up to ${max} images at once`,
        variant: "destructive",
      });
      return;
    }
    setSelectedImages((p) => [...p, ...imgs.slice(0, max - p.length)]);
  };

  const removeImage = (i: number) => setSelectedImages((prev) => prev.filter((_, idx) => idx !== i));
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* previews (unchanged) */}
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

      {/* input row — tighter gap on mobile */}
      <div
        className={`chat-input-halo flex items-end gap-2 sm:gap-3 transition-all duration-300 ${isActive ? "halo-active" : ""}`}
        style={{ borderRadius: "1rem" }}
      >
        {/* attachment */}
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

        {/* banana badge lives BETWEEN the clip and the input; on mobile show emoji only */}
        {shouldShowBanana && (
          <div className="shrink-0 h-8 px-2 sm:px-3 rounded-full bg-yellow-400/20 border border-yellow-400/40 backdrop-blur-sm flex items-center animate-pulse">
            <span className="text-base leading-none">🍌</span>
            <span className="ml-1 hidden sm:inline text-xs font-medium text-yellow-700 dark:text-yellow-400">
              Nano Banana
            </span>
          </div>
        )}

        {/* input */}
        <div className="flex-1">
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
            className="card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[144px] leading-6"
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

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
