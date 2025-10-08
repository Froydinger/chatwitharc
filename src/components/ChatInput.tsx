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

/* ---------------- helpers ---------------- */
function isImageEditRequest(message: string): boolean {
  const editKeywords = [
    "edit",
    "modify",
    "change",
    "alter",
    "update",
    "replace",
    "swap",
    "remove",
    "add",
    "put",
    "combine",
    "blend",
    "merge",
    "retouch",
    "fix",
  ];
  const lower = (message || "").toLowerCase();
  return editKeywords.some((k) => lower.includes(k));
}

function checkForImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  // quick heuristics
  const explicit = /^generate\s+an?\s+image\s+of/i.test(m);
  if (explicit) return true;
  return /(generate|create|make|draw|paint|design|render|picture|photo|image)/i.test(m);
}

function extractImagePrompt(message: string): string {
  let prompt = (message || "").trim();
  // remove polite prefixes
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  // remove leading generation verbs
  prompt = prompt.replace(/^(?:generate|create|make|draw|paint|design|visualize|show\s+me)\s+(?:an?\s+)?/i, "").trim();
  if (!prompt) prompt = message.trim();
  // ensure descriptive start
  if (!/^(a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) {
    prompt = `a ${prompt}`;
  }
  return prompt;
}

/* ---------------- component ---------------- */
export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, isGeneratingImage, setGeneratingImage } =
    useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false); // user forced Nano Banana
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile();

  // When banana is active (either forced or detected), show banana UI.
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));

  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  // Quick prompts: populate input when external quick prompt dispatches
  useEffect(() => {
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<{ prompt: string }>;
      if (e?.detail?.prompt) {
        setInputValue(e.detail.prompt);
        // focus after setting
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener("quickPromptSelected", handler as EventListener);
    return () => window.removeEventListener("quickPromptSelected", handler as EventListener);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const h = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = Math.min(h, 24 * 3) + "px";
  }, [inputValue]);

  const handleImageUpload = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const max = 4;
    setSelectedImages((prev) => {
      const combined = [...prev, ...images].slice(0, max);
      if (combined.length >= max && images.length > 0 && combined.length > prev.length) {
        toast({ title: "Max images", description: `Up to ${max} images supported`, variant: "default" });
      }
      return combined;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (idx: number) => setSelectedImages((prev) => prev.filter((_, i) => i !== idx));
  const clearAllImages = () => setSelectedImages([]);

  /* ------------- core send logic ------------- */
  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    const imagesToProcess = [...selectedImages]; // copy
    // clear quickly for UI
    setInputValue("");
    setSelectedImages([]);
    // If banana was forced, keep it off after send
    setForceImageMode(false);

    setLoading(true);

    try {
      const ai = new AIService();

      // If there are images uploaded -> either edit or analyze (edit priority)
      if (imagesToProcess.length > 0) {
        // upload images (attempt supabase, fallback to blob URL)
        let imageUrls: string[] = [];
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");
          const promises = imagesToProcess.map(async (file) => {
            const name = `${user.id}/user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(name, file, { contentType: file.type, upsert: false });
            if (error) throw error;
            const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
            return pub.publicUrl;
          });
          imageUrls = await Promise.all(promises);
        } catch {
          imageUrls = imagesToProcess.map((f) => URL.createObjectURL(f));
        }

        // If the user message looks like an edit request -> call editImage
        if (userMessage && isImageEditRequest(userMessage)) {
          await addMessage({ content: userMessage, role: "user", type: "image", imageUrls });
          addMessage({
            content: `Editing image: ${userMessage}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt: userMessage,
          });
          setGeneratingImage(true);
          try {
            const editedUrl = await ai.editImage(userMessage, imageUrls);
            // attempt to persist edited image to storage (best-effort)
            let finalUrl = editedUrl;
            try {
              const resp = await fetch(editedUrl);
              const blob = await resp.blob();
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (user) {
                const name = `${user.id}/edited-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
                const { error } = await supabase.storage
                  .from("avatars")
                  .upload(name, blob, { contentType: "image/png", upsert: false });
                if (!error) {
                  const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
                  finalUrl = pub.publicUrl;
                }
              }
            } catch {
              // ignore upload error and use returned URL
            }
            await replaceLastMessage({
              content: `Edited image: ${userMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrl,
            });
          } catch (err: any) {
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

        // Otherwise treat as analysis (no edit requested)
        await addMessage({
          content: userMessage || "Sent images",
          role: "user",
          type: "image",
          imageUrls: imageUrls.length ? imageUrls : undefined,
        });
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
            userMessage || `What do you see in ${imagesToProcess.length > 1 ? "these images" : "this image"}?`;
          const response = await ai.sendMessageWithImage([{ role: "user", content: analysisPrompt }], base64s);
          await addMessage({ content: response, role: "assistant", type: "text" });
        } catch (err: any) {
          toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze these images. Please try again.",
            role: "assistant",
            type: "text",
          });
        }
        return;
      }

      // No uploaded images: if Nano Banana is active (either forced or detected) => ALWAYS generate image
      if (shouldShowBanana) {
        const imagePrompt = extractImagePrompt(userMessage || "");
        const apiPrompt = `Generate an image: ${imagePrompt}`;
        addMessage({
          content: `Generating image: ${imagePrompt}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt,
        });
        setGeneratingImage(true);
        try {
          const genUrl = await ai.generateImage(apiPrompt);
          // try to persist
          let finalUrl = genUrl;
          try {
            const resp = await fetch(genUrl);
            const blob = await resp.blob();
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              const name = `${user.id}/generated-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
              const { error } = await supabase.storage
                .from("avatars")
                .upload(name, blob, { contentType: "image/png", upsert: false });
              if (!error) {
                const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
                finalUrl = pub.publicUrl;
              }
            }
          } catch {
            // ignore upload error
          }
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: finalUrl,
          });
        } catch (err: any) {
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

      // Plain text flow
      // detect memory commands
      const memoryItem = detectMemoryCommand(userMessage);
      if (memoryItem) {
        const wasNew = await addToMemoryBank(memoryItem);
        if (wasNew) {
          const confirmation = formatMemoryConfirmation(memoryItem.content);
          // don't show confirmation inline (silent save)
        }
      }
      await addMessage({ content: userMessage, role: "user", type: "text" });
      try {
        const ai = new AIService();
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));
        aiMessages.push({ role: "user", content: userMessage });
        const reply = await ai.sendMessage(aiMessages);
        await addMessage({ content: reply, role: "assistant", type: "text" });
      } catch (err: any) {
        toast({ title: "Error", description: err?.message || "Failed to get AI response", variant: "destructive" });
        await addMessage({
          content: "Sorry, I encountered an error. Please try again.",
          role: "assistant",
          type: "text",
        });
      }
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
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
      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <div className="p-3 bg-glass/20 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
            <button onClick={clearAllImages} className="text-xs text-muted-foreground hover:text-foreground">
              Clear All
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {selectedImages.map((file, idx) => (
              <div key={idx} className="relative group shrink-0">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Selected ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded-lg"
                />
                <button
                  onClick={() => removeImage(idx)}
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
        className={[
          "chat-input-halo flex items-center gap-3 transition-all duration-200",
          isActive ? "halo-active" : "",
          shouldShowBanana ? "ring-2 ring-yellow-400/60 shadow-[0_0_24px_rgba(250,204,21,.2)]" : "ring-0",
        ].join(" ")}
        style={{ borderRadius: "1rem" }}
      >
        {/* BANANA BUTTON (replaces paperclip) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={isLoading}
              className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-colors duration-200 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40 ${shouldShowBanana ? "transform-gpu" : ""}`}
              aria-label="Image actions"
            >
              <span className="text-[20px] leading-none">🍌</span>
            </button>
          </DropdownMenuTrigger>

          {/* Menu: make opaque/readable */}
          <DropdownMenuContent align="start" className="w-56 bg-card border-border/50 z-50">
            <DropdownMenuItem
              onClick={() => setForceImageMode(true)}
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

        {/* Active badge - desktop shows text, mobile hides text and shows X close to emoji */}
        {shouldShowBanana && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400/10 border border-yellow-400/30">
            <span className="hidden sm:inline text-xs font-medium text-yellow-700 dark:text-yellow-400">
              🍌 Nano Banana
            </span>

            {/* mobile-only: emoji + X closely placed */}
            <div className="flex items-center gap-2 sm:hidden">
              <span className="text-base leading-none">🍌</span>
              <button
                onClick={() => setForceImageMode(false)}
                aria-label="Disable Nano Banana"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-yellow-500/20"
              >
                <X className="h-4 w-4 text-yellow-700" />
              </button>
            </div>

            {/* desktop: keep an X but smaller and inline */}
            <button
              onClick={() => setForceImageMode(false)}
              aria-label="Disable Nano Banana"
              className="hidden sm:inline-flex ml-1 h-6 w-6 items-center justify-center rounded-full hover:bg-yellow-500/20"
            >
              <X className="h-4 w-4 text-yellow-700" />
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
            className={`card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[144px] leading-6 ${shouldShowBanana ? "pl-4" : ""}`}
            rows={1}
          />
        </div>

        {/* send – always black in light mode */}
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

      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
