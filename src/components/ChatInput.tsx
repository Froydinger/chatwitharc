import { useState, useRef, useEffect } from "react";
import { Send, Image as ImageIcon, X } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { AIService } from "@/services/ai";
import { GlassButton } from "@/components/ui/glass-button";
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

/* ---------------- helpers (unchanged-ish, robust detection) ---------------- */
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
  // obvious negative signals for "prompt text" requests
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile(); // keep profile warm

  // banana active when forced or detected intent
  const shouldShowBanana = forceImageMode || (inputValue && checkForImageRequest(inputValue));

  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const h = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = Math.min(h, 24 * 3) + "px";
  }, [inputValue]);

  /* ---------- Quick prompts compatibility (re-enabled) ---------- */
  useEffect(() => {
    const handler = (e: Event) => {
      // quickPromptSelected should be a CustomEvent with { prompt }
      const ev = e as CustomEvent<{ prompt: string }>;
      const prompt = ev?.detail?.prompt;
      if (prompt) {
        setInputValue(prompt);
        // focus after next paint
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener("quickPromptSelected", handler as EventListener);
    return () => window.removeEventListener("quickPromptSelected", handler as EventListener);
  }, []);

  /* ---------- file select / preview ---------- */
  const handleImageUpload = (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const max = 4;
    if (selectedImages.length + imageFiles.length > max) {
      toast({
        title: "Too many images",
        description: `You can only send up to ${max} images at once`,
        variant: "destructive",
      });
      return;
    }
    setSelectedImages((prev) => [...prev, ...imageFiles.slice(0, max - prev.length)]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (i: number) => setSelectedImages((prev) => prev.filter((_, idx) => idx !== i));
  const clearAllImages = () => setSelectedImages([]);

  /* ---------- core send / flows ---------- */
  // normalize and ensure placeholders are awaited so replaceLastMessage works
  const addPlaceholder = async (placeholder: { content: string; role: string; type: string; imagePrompt?: string }) => {
    // ensure addMessage returns a Promise in your store; await where possible
    try {
      await addMessage(placeholder as any);
    } catch {
      /* fallback: fire-and-forget */
    }
  };

  const handleImageEditRequest = async (prompt: string, baseImageUrl: string | string[], editInstruction: string) => {
    try {
      const ai = new AIService();
      setGeneratingImage(true);
      // ensure placeholder exists BEFORE starting
      await addPlaceholder({
        content: `Editing image: ${editInstruction}`,
        role: "assistant",
        type: "image-generating",
        imagePrompt: editInstruction,
      });

      // normalize base urls
      const baseUrls = Array.isArray(baseImageUrl) ? baseImageUrl : [baseImageUrl];
      const imageUrl = await ai.editImage(editInstruction, baseUrls);

      // try upload
      let permanent = imageUrl;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const res = await fetch(imageUrl);
          const blob = await res.blob();
          const name = `${user.id}/edited-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
          const { error } = await supabase.storage
            .from("avatars")
            .upload(name, blob, { contentType: "image/png", upsert: false });
          if (!error) {
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
            permanent = pub.publicUrl;
          }
        }
      } catch (e) {
        /* ignore upload problems */
      }

      await replaceLastMessage({
        content: `Edited image: ${editInstruction}`,
        role: "assistant",
        type: "image",
        imageUrl: permanent,
      });
    } catch (err) {
      await replaceLastMessage({
        content: `Sorry, I couldn't edit the image. ${(err as Error)?.message || ""}`,
        role: "assistant",
        type: "text",
      });
    } finally {
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

      const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));
      const response = await ai.sendMessage(aiMessages);
      const { cleaned, saved } = await (async (r: string) => {
        const match = r.match(/\[MEMORY_SAVE\]([\s\S]*?)\[\/MEMORY_SAVE\]/i);
        if (match && match[1]) {
          const content = match[1].trim();
          if (content.length >= 3) {
            const wasNew = await addToMemoryBank({ content, timestamp: new Date() });
            const cleanedResp = r.replace(match[0], "").trim();
            return { cleaned: cleanedResp, saved: wasNew ? content : null };
          }
        }
        return { cleaned: r, saved: null };
      })(response);

      await addMessage({ content: cleaned, role: "assistant", type: "text" });

      if (explicitConfirmation && saved) {
        // keep profile up-to-date
      }
    } catch (e) {
      toast({
        title: "Error",
        description: (e as Error).message || "Failed to get AI response",
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

  // simple local intent analyzer (keeps behavior fast)
  const analyzePromptIntent = async (message: string): Promise<"image" | "text"> => {
    const local = checkForImageRequest(message);
    const lower = message.toLowerCase();
    if (/(generate|create|make)\s+an?\s+image/i.test(lower)) return "image";
    if (local && (lower.includes("generate") || lower.includes("create") || lower.includes("make"))) return "image";
    if (!local && message.length > 80 && !lower.includes("image") && !lower.includes("picture")) return "text";
    return local ? "image" : "text";
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    const imagesToProcess = [...selectedImages];

    // reset UI immediately
    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
    setLoading(true);

    // detect different flows
    const isUploadedImageEdit =
      imagesToProcess.length > 0 &&
      imagesToProcess.length <= 2 &&
      userMessage &&
      (isImageEditRequest(userMessage) ||
        /\b(put|place|combine|merge|add|compose|blend|mix|together|into|with)\b/i.test(userMessage));

    let isImageGenerationRequest = false;
    if (!imagesToProcess.length && userMessage) {
      const intent = await analyzePromptIntent(userMessage);
      isImageGenerationRequest = intent === "image";
    }

    try {
      // upload any images if present now (so we have URLs to attach in the user message)
      let imageUrls: string[] = [];
      if (imagesToProcess.length > 0) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");
          const uploads = imagesToProcess.map(async (file) => {
            const name = `${user.id}/user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(name, file, { contentType: file.type, upsert: false });
            if (error) return URL.createObjectURL(file);
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
            return pub.publicUrl;
          });
          imageUrls = await Promise.all(uploads);
        } catch {
          imageUrls = imagesToProcess.map((f) => URL.createObjectURL(f));
        }
      }

      // upload / edit flow
      if (isUploadedImageEdit) {
        // post user message with imageUrls
        await addMessage({ content: userMessage, role: "user", type: "image", imageUrls });
        // add placeholder and process edit
        await addPlaceholder({
          content: `Editing image: ${userMessage}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt: userMessage,
        });
        setGeneratingImage(true);

        try {
          // ensure base images uploaded and use their public urls (if we already used imageUrls that's ok)
          // call AI service with the array of base urls
          const ai = new AIService();
          // prefer already-created imageUrls if they look public, else pass the blob URLs (AIService should accept both)
          const imageUrl = await ai.editImage(userMessage, imageUrls);
          // upload edited image to storage if possible
          let permanent = imageUrl;
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              const resp = await fetch(imageUrl);
              const blob = await resp.blob();
              const name = `${user.id}/edited-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
              const { error } = await supabase.storage
                .from("avatars")
                .upload(name, blob, { contentType: "image/png", upsert: false });
              if (!error) {
                const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
                permanent = pub.publicUrl;
              }
            }
          } catch (ignored) {}
          await replaceLastMessage({
            content: `Edited image: ${userMessage}`,
            role: "assistant",
            type: "image",
            imageUrl: permanent,
          });
        } catch (err: any) {
          console.error("Image editing error:", err);
          await replaceLastMessage({
            content: `Sorry, I couldn't edit the image. ${err?.message || ""}`,
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
        return;
      }

      // non-edit (either generate, analyze, or text)
      await addMessage({
        content: userMessage || (imageUrls.length ? "Sent images" : ""),
        role: "user",
        type: imageUrls.length ? "image" : "text",
        imageUrls: imageUrls.length ? imageUrls : undefined,
      });

      const ai = new AIService();

      // image generation
      if (isImageGenerationRequest) {
        const imagePrompt = extractImagePrompt(userMessage);
        // add placeholder and await
        await addPlaceholder({
          content: `Generate an image: ${imagePrompt}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt,
        });
        setGeneratingImage(true);

        try {
          const imageUrl = await ai.generateImage(imagePrompt);
          let permanent = imageUrl;
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              const resp = await fetch(imageUrl);
              const blob = await resp.blob();
              const name = `${user.id}/generated-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
              const { error } = await supabase.storage
                .from("avatars")
                .upload(name, blob, { contentType: "image/png", upsert: false });
              if (!error) {
                const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
                permanent = pub.publicUrl;
              }
            }
          } catch (ignored) {}
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: permanent,
          });
        } catch (err: any) {
          console.error("Image generation error:", err);
          await replaceLastMessage({
            content: `Sorry, I couldn't generate the image. ${err?.message || ""}`,
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
        return;
      }

      // image analysis (files uploaded but not an edit)
      if (imageUrls.length > 0) {
        try {
          const base64s = await Promise.all(
            imagesToProcess.map(
              (file) =>
                new Promise<string>((res, rej) => {
                  const r = new FileReader();
                  r.onload = () => res(r.result as string);
                  r.onerror = () => rej(new Error("read fail"));
                  r.readAsDataURL(file);
                }),
            ),
          );
          const analysisPrompt =
            userMessage || `What do you see in ${base64s.length > 1 ? "these images" : "this image"}?`;
          const response = await ai.sendMessageWithImage([{ role: "user", content: analysisPrompt }], base64s);
          await addMessage({ content: response, role: "assistant", type: "text" });
        } catch (err) {
          console.error("Image analysis error:", err);
          toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze these images. Please try again.",
            role: "assistant",
            type: "text",
          });
        }
        return;
      }

      // otherwise plain text
      let explicitConfirmation = "";
      const memoryItem = detectMemoryCommand(userMessage);
      if (memoryItem) {
        const wasNew = await addToMemoryBank(memoryItem);
        if (wasNew) explicitConfirmation = formatMemoryConfirmation(memoryItem.content);
      }
      const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));
      aiMessages.push({ role: "user", content: userMessage });

      const response = await ai.sendMessage(aiMessages);
      // handle implicit memory markers
      const match = response.match(/\[MEMORY_SAVE\]([\s\S]*?)\[\/MEMORY_SAVE\]/i);
      let cleaned = response;
      if (match && match[1]) {
        const content = match[1].trim();
        if (content.length >= 3) {
          await addToMemoryBank({ content, timestamp: new Date() });
          cleaned = response.replace(match[0], "").trim();
        }
      }

      await addMessage({ content: cleaned, role: "assistant", type: "text" });
      if (explicitConfirmation) {
        /* silent handling */
      }
    } catch (err) {
      console.error("Chat error:", err);
      toast({
        title: "Error",
        description: (err as Error).message || "Failed to get AI response",
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

  /* ---------- keyboard ---------- */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ---------- render ---------- */
  return (
    <div className="space-y-4">
      {/* Selected images preview */}
      {selectedImages.length > 0 && (
        <div className="p-3 bg-glass/20 rounded-lg">
          <div className="flex items-center justify-between gap-4 mb-2">
            <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
            <button onClick={clearAllImages} className="text-xs text-muted-foreground hover:text-foreground">
              Clear All
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {selectedImages.map((file, i) => (
              <div key={i} className="relative group shrink-0">
                <img src={URL.createObjectURL(file)} alt={`sel-${i}`} className="w-16 h-16 object-cover rounded-lg" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* input row */}
      <div
        className={[
          "chat-input-halo flex items-center gap-3 transition-all duration-200",
          isActive ? "halo-active" : "",
          shouldShowBanana ? "ring-2 ring-yellow-400/40 shadow-[0_0_14px_rgba(250,204,21,0.25)]" : "ring-0",
        ].join(" ")}
        style={{ borderRadius: "1rem" }}
      >
        {/* BANANA (replaces paperclip) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={isLoading}
              aria-label="Image actions"
              className={[
                "shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-colors duration-150 border border-border/40",
                "bg-muted/50 text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              {/* emoji sized to match lucide 20px */}
              <span style={{ fontSize: 20, lineHeight: 1 }}>🍌</span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-56 bg-card/95 backdrop-blur-xl border-border/50 z-50">
            <DropdownMenuItem onClick={() => setForceImageMode(true)} className="cursor-pointer hover:bg-accent/50">
              <span className="mr-2">🍌</span>
              <span>Generate Image</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer hover:bg-accent/50"
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              <span>Attach Images</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* when banana active, show a compact badge inline next to the banana button (not inside the textarea) */}
        {shouldShowBanana && (
          <div className="flex items-center gap-2 shrink-0 rounded-full px-3 py-1 bg-yellow-400/10 border border-yellow-400/30">
            <span className="text-base leading-none">🍌</span>
            <span className="hidden sm:inline text-sm font-medium text-yellow-600 dark:text-yellow-300">
              Nano Banana
            </span>
            <button
              onClick={() => setForceImageMode(false)}
              className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-yellow-500/20"
              aria-label="Disable image generation"
            >
              <X className="h-4 w-4 text-yellow-600 dark:text-yellow-300" />
            </button>
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
            className={[
              "card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[144px] leading-6",
              // if banana visible, reduce left padding so text doesn't overlap banana when responsive
              shouldShowBanana ? "pl-4 sm:pl-4" : "",
            ].join(" ")}
            rows={1}
          />
        </div>

        {/* send - always black in light mode (use neutral style) */}
        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-150
            ${!(inputValue.trim() || selectedImages.length) ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-black text-white hover:bg-black/90"}`}
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
