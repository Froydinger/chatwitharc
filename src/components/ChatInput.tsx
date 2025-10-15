import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { AIService } from "@/services/ai";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ---------------- Helpers ---------------- */
function isImageEditRequest(message: string): boolean {
  if (!message) return false;
  const keywords = [
    "edit",
    "modify",
    "change",
    "alter",
    "update",
    "replace",
    "retouch",
    "remove",
    "add",
    "combine",
    "merge",
    "blend",
    "compose",
    "make it",
    "make this",
    "turn this",
    "convert",
    "put",
    "place",
    "swap",
    "substitute",
    "adjust",
    "tweak",
    "transform",
  ];
  const lower = message.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function checkForImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase().trim();
  if (
    /^(generate|create|make|draw|paint|design|render|produce|build)\s+(an?\s+)?(image|picture|photo|illustration|artwork|graphic)/i.test(
      m,
    )
  )
    return true;
  if (/^(generate|create|make)\s+an?\s+image\s+of/i.test(m)) return true;
  if (/^(show\s+me|give\s+me|i\s+want|i\s+need)\s+(an?\s+)?(image|picture|photo)/i.test(m)) return true;
  const imageKeywords = [
    "generate image",
    "create image",
    "make image",
    "draw",
    "paint",
    "illustrate",
    "picture of",
    "photo of",
    "image of",
    "render",
    "visualize",
    "design",
    "artwork",
    "graphic",
  ];
  return imageKeywords.some((keyword) => m.includes(keyword));
}

function extractImagePrompt(message: string): string {
  let prompt = (message || "").trim();
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  prompt = prompt
    .replace(
      /^(?:generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|graphic)?\s*(?:of)?\s*/i,
      "",
    )
    .trim();
  if (!prompt) prompt = message.trim();
  if (!/^(a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) prompt = `a ${prompt}`;
  return prompt;
}

/* ---------------- Component ---------------- */
export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { messages, addMessage, replaceLastMessage, isLoading, isGeneratingImage, setLoading, setGeneratingImage } =
    useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);

  /** Banana mode is explicit (from menu) or inferred from text */
  const [forceImageMode, setForceImageMode] = useState(false);
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));

  const [menuOpen, setMenuOpen] = useState(false); // control + menu open state for stability

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile();

  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  // Quick prompts listener (populates input)
  useEffect(() => {
    const quickHandler = (ev: Event) => {
      try {
        const e = ev as CustomEvent<{ prompt?: string; type?: string }>;
        if (e?.detail?.prompt) {
          const prompt = e.detail.prompt;
          const promptType = e.detail.type;
          if (promptType === "image") setForceImageMode(true);
          setInputValue(prompt);
          setTimeout(() => {
            const sendButton = document.querySelector('[aria-label="Send"]') as HTMLButtonElement;
            if (sendButton && !sendButton.disabled) sendButton.click();
          }, 100);
        }
      } catch (err) {
        console.warn("quickPromptSelected handler error", err);
      }
    };
    window.addEventListener("quickPromptSelected", quickHandler as EventListener);
    window.addEventListener("arcai:triggerPrompt", quickHandler as EventListener);
    return () => {
      window.removeEventListener("quickPromptSelected", quickHandler as EventListener);
      window.removeEventListener("arcai:triggerPrompt", quickHandler as EventListener);
    };
  }, []);

  // textarea auto-resize
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const h = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = Math.min(h, 24 * 3) + "px";
  }, [inputValue]);

  const handleImageUploadFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const max = 4;
    setSelectedImages((prev) => {
      const merged = [...prev, ...images].slice(0, max);
      if (merged.length >= max && images.length > 0 && merged.length > prev.length) {
        toast({ title: "Max images", description: `Up to ${max} images supported`, variant: "default" });
      }
      return merged;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (idx: number) => setSelectedImages((prev) => prev.filter((_, i) => i !== idx));
  const clearSelected = () => setSelectedImages([]);

  /* ---------- Main send handler ---------- */
  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    const images = [...selectedImages];

    // Clear UI promptly
    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
    setMenuOpen(false);
    setLoading(true);

    try {
      const ai = new AIService();

      // With uploaded images: edit or analyze
      if (images.length > 0) {
        // upload images (best-effort) or fallback to blob URLs
        let imageUrls: string[] = [];
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");
          const uploadPromises = images.map(async (file) => {
            const name = `${user.id}/user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(name, file, { contentType: file.type, upsert: false });
            if (error) throw error;
            const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
            return pub.publicUrl;
          });
          imageUrls = await Promise.all(uploadPromises);
        } catch (err) {
          console.warn("upload images fallback", err);
          imageUrls = images.map((f) => URL.createObjectURL(f));
        }

        // Edit flow if instruction looks like edit
        if (userMessage && isImageEditRequest(userMessage)) {
          await addMessage({ content: userMessage, role: "user", type: "image", imageUrls });
          await addMessage({
            content: `Editing image: ${userMessage}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt: userMessage,
          });
          setGeneratingImage(true);

          try {
            const editedUrl = await ai.editImage(userMessage, imageUrls);
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
            } catch (err) {
              console.warn("persist edited image failed", err);
            }
            await replaceLastMessage({
              content: `Edited image: ${userMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrl,
            });
          } catch (err: any) {
            console.error("edit flow error", err);
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

        // Otherwise analyze
        await addMessage({
          content: userMessage || "Sent images",
          role: "user",
          type: "image",
          imageUrls: imageUrls.length ? imageUrls : undefined,
        });

        try {
          const base64s = await Promise.all(
            images.map(
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
            userMessage || `What do you see in ${images.length > 1 ? "these images" : "this image"}?`;
          const response = await ai.sendMessageWithImage([{ role: "user", content: analysisPrompt }], base64s);
          await addMessage({ content: response, role: "assistant", type: "text" });
        } catch (err: any) {
          console.error("image analysis failed", err);
          toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze these images. Please try again.",
            role: "assistant",
            type: "text",
          });
        }
        return;
      }

      // No uploaded images -> if banana active, generate
      if (shouldShowBanana) {
        const imagePrompt = extractImagePrompt(userMessage || "");
        await addMessage({ content: userMessage || imagePrompt, role: "user", type: "text" });
        await addMessage({
          content: `Generating image: ${imagePrompt}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt,
        });
        setGeneratingImage(true);

        try {
          const apiPrompt = `Generate an image: ${imagePrompt}`;
          const genUrl = await ai.generateImage(apiPrompt);
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
          } catch (err) {
            console.warn("persist generated image failed", err);
          }
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: finalUrl,
          });
        } catch (err: any) {
          console.error("generate image error", err);
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

      // Plain text
      await addMessage({ content: userMessage, role: "user", type: "text" });

      try {
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));
        aiMessages.push({ role: "user", content: userMessage });
        const reply = await ai.sendMessage(aiMessages);
        await addMessage({ content: reply, role: "assistant", type: "text" });
      } catch (err: any) {
        console.error("ai text error", err);
        toast({ title: "Error", description: err?.message || "Failed to get AI response", variant: "destructive" });
        await addMessage({
          content: "Sorry, I encountered an error. Please try again.",
          role: "assistant",
          type: "text",
        });
      }
    } catch (err) {
      console.error("send handler top-level error", err);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
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

  /* ---------------- Render ---------------- */
  return (
    <div className="space-y-3">
      {/* Selected Images preview */}
      {selectedImages.length > 0 && (
        <div className="ci-preview p-2">
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-xs text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
            <button onClick={clearSelected} className="text-xs text-muted-foreground hover:text-foreground">
              Clear All
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto px-1 pb-1">
            {selectedImages.map((f, i) => (
              <div key={i} className="relative group shrink-0">
                <img src={URL.createObjectURL(f)} alt={`sel-${i}`} className="ci-thumb" />
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

      {/* Input Row */}
      <div
        className={[
          "chat-input-halo flex items-center gap-2 transition-all duration-200 rounded-full bg-transparent",
          isActive ? "" : "",
          shouldShowBanana ? "ring-2 ring-yellow-400/60 shadow-[0_0_14px_rgba(250,204,21,.2)]" : "ring-0",
        ].join(" ")}
      >
        {/* MAIN LEFT BUTTON ( + / 🍌 / X ) */}
        <DropdownMenu open={shouldShowBanana ? false : menuOpen} onOpenChange={(o) => setMenuOpen(o)}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={shouldShowBanana ? "Disable image mode" : menuOpen ? "Close actions" : "Open actions"}
              onClick={() => {
                if (shouldShowBanana) {
                  setForceImageMode(false); // behave like X
                  return;
                }
                setMenuOpen((s) => !s);
              }}
              className="h-10 w-10 rounded-full flex items-center justify-center border border-border/40
                         bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground
                         transition-transform duration-200"
            >
              {shouldShowBanana ? (
                <span className="text-lg">🍌</span>
              ) : (
                <Plus className={`h-5 w-5 stroke-[2] ${menuOpen ? "rotate-45 transition-transform" : ""}`} />
              )}
            </button>
          </DropdownMenuTrigger>

          {!shouldShowBanana && (
            <DropdownMenuContent
              align="start"
              className="w-56 bg-card/95 backdrop-blur-xl border-border shadow-lg z-50"
            >
              <DropdownMenuItem
                onClick={() => {
                  setForceImageMode(true);
                  setMenuOpen(false);
                }}
                className="cursor-pointer hover:bg-accent focus:bg-accent"
              >
                <span className="mr-2">🍌</span>
                <span>Generate Image</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  fileInputRef.current?.click();
                  setMenuOpen(false);
                }}
                className="cursor-pointer hover:bg-accent focus:bg-accent"
              >
                <span className="mr-2">📎</span>
                <span>Attach Images</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          )}
        </DropdownMenu>

        {/* Extra X next to banana if you want a clear affordance (optional) */}
        {shouldShowBanana && (
          <button
            onClick={() => setForceImageMode(false)}
            aria-label="Disable image mode"
            className="h-10 w-10 rounded-full flex items-center justify-center text-yellow-600 hover:bg-yellow-500/10"
          >
            <X className="h-5 w-5 stroke-[2]" />
          </button>
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
                  : "Ask"
            }
            disabled={isLoading}
            className="border-none bg-transparent text-foreground placeholder:text-muted-foreground
                       resize-none min-h-[36px] max-h-[144px] leading-6 py-2 px-2 focus:outline-none focus:ring-0"
            rows={1}
          />
        </div>

        {/* send – thin right arrow */}
        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 border
            ${
              inputValue.trim() || selectedImages.length
                ? "bg-primary text-white border-primary hover:opacity-90"
                : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed border-transparent"
            }`}
          aria-label="Send"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
