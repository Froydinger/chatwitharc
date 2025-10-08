import { useState, useRef, useEffect } from "react";
import { Send, Image as ImageIcon, X } from "lucide-react";
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

/* ---------------- helpers (unchanged detection/cleanup) ---------------- */
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
  const mods = [/\b(add|remove|change|modify|adjust|tweak)\b/i];
  const visuals = [
    /^(?:a|an)\s+.*(scene|landscape|portrait|character|logo|design|artwork|illustration)/i,
    /^(?:imagine|picture|envision)\s+/i,
  ];
  const qs = [
    /^what\s+(?:would|does|might).+look/i,
    /^how\s+(?:would|does|might).+(?:look|appear)/i,
    /^can\s+you\s+(?:show|draw|create|make|generate)/i,
  ];

  const score =
    (mods.some((p) => p.test(m)) ? 4 : 0) +
    (direct.some((k) => m.includes(k)) ? 1 : 0) +
    (phrases.some((p) => new RegExp(p, "i").test(m)) ? 3 : 0) +
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

/* ---------------- component ---------------- */
export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, isGeneratingImage, setGeneratingImage } =
    useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false);
  const [bananaOverride, setBananaOverride] = useState<null | "on" | "off">(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile(); // keep profile hook warm

  // image-gen active (explicit or inferred), with user override
  const bananaActive =
    bananaOverride === "on" ||
    (bananaOverride !== "off" && (forceImageMode || (inputValue && checkForImageRequest(inputValue))));

  /* ---------- effects ---------- */
  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const h = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = Math.min(h, 24 * 3) + "px";
  }, [inputValue]);

  /* ---------- core handlers (send / attach) ---------- */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    const max = 4;
    if (selectedImages.length + files.length > max) {
      toast({
        title: "Too many images",
        description: `You can only send up to ${max} images at once`,
        variant: "destructive",
      });
      return;
    }
    setSelectedImages((prev) => [...prev, ...files.slice(0, max - prev.length)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const cancelBanana = () => {
    setBananaOverride("off");
    setForceImageMode(false);
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
        /\b(put|place|combine|merge|add|compose|blend|mix|together|into|with|at|in)\b/i.test(userMessage));

    let isImageGenerationRequest = false;
    if (!imagesToProcess.length && userMessage) {
      isImageGenerationRequest = bananaActive; // simple, trust active state
    }

    try {
      // upload any images to storage first
      let imageUrls: string[] = [];
      if (imagesToProcess.length > 0) {
        try {
          const uploadPromises = imagesToProcess.map(async (file) => {
            const name = `user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(name, file, { contentType: file.type, upsert: false });
            if (error) return URL.createObjectURL(file);
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
            return pub.publicUrl;
          });
          imageUrls = await Promise.all(uploadPromises);
        } catch {
          imageUrls = imagesToProcess.map((f) => URL.createObjectURL(f));
        }
      }

      // Put user's message in the stream
      addMessage({
        content: userMessage || (imagesToProcess.length ? "Sent images" : ""),
        role: "user",
        type: imagesToProcess.length > 0 ? "image" : "text",
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      });

      if (isUploadedImageEdit) {
        // Edit flow
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
      } else if (isImageGenerationRequest) {
        // Generate flow with the hidden prefix
        const imagePrompt = extractImagePrompt(userMessage);
        const apiPrompt = `Generate an image: ${imagePrompt}`;
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
        // Analysis flow
        try {
          const base64s = await Promise.all(
            imagesToProcess.map(
              (file) =>
                new Promise<string>((res, rej) => {
                  const r = new FileReader();
                  r.onload = () => res(r.result as string);
                  r.onerror = () => rej(new Error("Failed to read image file"));
                  r.readAsDataURL(file);
                }),
            ),
          );
          const ai = new AIService();
          const analysisPrompt =
            userMessage || `What do you see in ${imagesToProcess.length > 1 ? "these images" : "this image"}?`;
          const response = await ai.sendMessageWithImage([{ role: "user", content: analysisPrompt }], base64s);
          await addMessage({ content: response, role: "assistant", type: "text" });
        } catch {
          toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze these images. Please try again.",
            role: "assistant",
            type: "text",
          });
        }
      } else {
        // Plain text flow
        const ai = new AIService();
        const memoryItem = detectMemoryCommand(userMessage);
        if (memoryItem) await addToMemoryBank(memoryItem);
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));
        aiMessages.push({ role: "user", content: userMessage });
        const response = await ai.sendMessage(aiMessages);
        await addMessage({ content: response, role: "assistant", type: "text" });
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

  /* ---------------- render ---------------- */
  return (
    <div className="space-y-4">
      {/* input row */}
      <div
        className={[
          "chat-input-halo flex items-center gap-2 sm:gap-3 transition-all duration-300",
          isActive ? "halo-active" : "",
          bananaActive ? "ring-2 ring-yellow-400/70 shadow-[0_0_40px_-6px_rgb(250_204_21_/_.6)]" : "ring-0",
        ].join(" ")}
        style={{ borderRadius: "1rem" }}
      >
        {/* BANANA CONTROL (single control; morphs to badge when active) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {bananaActive ? (
              // ACTIVE: badge (click body -> menu; X cancels)
              <div
                className="self-center inline-flex h-9 pl-2 pr-1 sm:pl-3 sm:pr-2 items-center gap-1 rounded-full bg-yellow-400/20 border border-yellow-400/40 cursor-pointer select-none leading-none"
                aria-label="Image actions (active)"
              >
                <span className="text-[20px] leading-none filter drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] animate-pulse">
                  🍌
                </span>
                <span className="hidden sm:inline text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  Nano Banana
                </span>
                <button
                  className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-yellow-500/20"
                  aria-label="Disable image generation"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelBanana();
                  }}
                >
                  <X className="h-3.5 w-3.5 text-yellow-700 dark:text-yellow-300" />
                </button>
              </div>
            ) : (
              // INACTIVE: centered 48x48 icon button
              <button
                disabled={isLoading}
                className="self-center shrink-0 h-12 w-12 rounded-xl inline-flex items-center justify-center bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
                aria-label="Image actions"
                onClick={(e) => e.preventDefault()}
              >
                <span className="text-[20px] leading-none">🍌</span>
              </button>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-56 bg-card/95 backdrop-blur-xl border-border/50 z-50">
            <DropdownMenuItem
              onClick={() => {
                setForceImageMode(true);
                setBananaOverride("on");
              }}
              className="cursor-pointer hover:bg-accent/50 focus:bg-accent/50"
            >
              <span className="mr-2">🍌</span>
              <span>Generate Image</span>
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

        {/* INPUT */}
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (bananaOverride === "off") setBananaOverride(null);
            }}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsActive(true)}
            onBlur={() => setIsActive(false)}
            placeholder={
              selectedImages.length > 0
                ? "Add a message with your images..."
                : bananaActive
                  ? "Describe your image..."
                  : "Ask me anything..."
            }
            disabled={isLoading}
            className="card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[144px] leading-6"
            rows={1}
          />
        </div>

        {/* SEND — always black in light mode */}
        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-200
            bg-black text-white hover:bg-black/90
            dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90
            ${!(inputValue.trim() || selectedImages.length) ? "opacity-60 cursor-not-allowed" : ""}`}
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {/* Hidden File Input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
