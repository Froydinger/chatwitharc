import { useState, useRef, useEffect } from "react";
import { Send, X, Image as ImageIcon } from "lucide-react";
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
  
  // Strong patterns for image generation
  if (/^(generate|create|make|draw|paint|design|render|produce|build)\s+(an?\s+)?(image|picture|photo|illustration|artwork|graphic)/i.test(m)) return true;
  if (/^(generate|create|make)\s+an?\s+image\s+of/i.test(m)) return true;
  if (/^(show\s+me|give\s+me|i\s+want|i\s+need)\s+(an?\s+)?(image|picture|photo)/i.test(m)) return true;
  
  // Check for explicit image-related keywords
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
  prompt = prompt.replace(/^(?:generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|graphic)?\s*(?:of)?\s*/i, "").trim();
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
  const [forceImageMode, setForceImageMode] = useState(false); // user toggled Nano Banana
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile();

  // Banana active when forced or input suggests image intent
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));

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
          
          // If it's an image request, enable image mode
          if (promptType === 'image') {
            setForceImageMode(true);
          }
          
          // Set the input value
          setInputValue(prompt);
          
          // Trigger send by simulating a button click after state updates
          setTimeout(() => {
            // Find and click the send button
            const sendButton = document.querySelector('[aria-label="Send"]') as HTMLButtonElement;
            if (sendButton && !sendButton.disabled) {
              sendButton.click();
            }
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

  // Event listener for modal-triggered image edits
  useEffect(() => {
    const handleImageEdit = (ev: Event) => {
      const e = ev as CustomEvent<{ content: string; baseImageUrl: string | string[]; editInstruction: string }>;
      if (!e?.detail) return;
      handleExternalImageEdit(e.detail.content, e.detail.baseImageUrl, e.detail.editInstruction);
    };
    window.addEventListener("processImageEdit", handleImageEdit as EventListener);
    return () => window.removeEventListener("processImageEdit", handleImageEdit as EventListener);
  }, [messages]);

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

  /* ---------- External image edit flow (from modal) ---------- */
  const handleExternalImageEdit = async (
    userMessage: string,
    baseImageUrl: string | string[],
    editInstruction: string,
  ) => {
    try {
      const ai = new AIService();
      setGeneratingImage(true);

      await addMessage({
        content: userMessage || editInstruction || "Edit request",
        role: "user",
        type: "image",
        imageUrls: Array.isArray(baseImageUrl) ? baseImageUrl : [baseImageUrl],
      });

      await addMessage({
        content: `Editing image: ${editInstruction}`,
        role: "assistant",
        type: "image-generating",
        imagePrompt: editInstruction,
      });

      const url = await ai.editImage(editInstruction, Array.isArray(baseImageUrl) ? baseImageUrl : [baseImageUrl]);

      // try persist to storage
      let finalUrl = url;
      try {
        const resp = await fetch(url);
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
        content: `Edited image: ${editInstruction}`,
        role: "assistant",
        type: "image",
        imageUrl: finalUrl,
      });
    } catch (err: any) {
      console.error("external edit error", err);
      await replaceLastMessage({
        content: `Sorry, I couldn't edit the image. ${err?.message || ""}`,
        role: "assistant",
        type: "text",
      });
    } finally {
      setGeneratingImage(false);
    }
  };

  /* ---------- Main send handler ---------- */
  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    const images = [...selectedImages];

    // Clear UI promptly
    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
    setLoading(true);

    try {
      const ai = new AIService();

      // Images uploaded -> either edit or analyze
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

        // If user message looks like edit -> edit flow
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

        // Otherwise analyze images
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

      // No uploaded images:
      // If Nano Banana active => ALWAYS generate image
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

      // Plain text flow
      const memoryItem = detectMemoryCommand(userMessage);
      if (memoryItem) {
        const wasNew = await addToMemoryBank(memoryItem);
        if (wasNew) {
          formatMemoryConfirmation(memoryItem.content);
        }
      }
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
    <div className="space-y-4">
      {/* Selected Images preview */}
      {selectedImages.length > 0 && (
        <div className="p-3 bg-glass/20 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
            <button onClick={clearSelected} className="text-xs text-muted-foreground hover:text-foreground">
              Clear All
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {selectedImages.map((f, i) => (
              <div key={i} className="relative group shrink-0">
                <img src={URL.createObjectURL(f)} alt={`sel-${i}`} className="w-16 h-16 object-cover rounded-lg" />
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
          "chat-input-halo flex items-center gap-3 transition-all duration-200",
          isActive ? "halo-active" : "",
          shouldShowBanana ? "ring-2 ring-yellow-400/60 shadow-[0_0_24px_rgba(250,204,21,.18)]" : "ring-0",
        ].join(" ")}
        style={{ borderRadius: "1rem" }}
      >
        {/* BANANA (replaces paperclip) */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Image actions"
                disabled={isLoading}
                className={[
                  "h-12 w-12 rounded-xl flex items-center justify-center transition-colors duration-200 border border-border/40",
                  "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                  shouldShowBanana
                    ? "bg-yellow-50/10 ring-1 ring-yellow-300/40 shadow-[0_6px_24px_rgba(250,204,21,.12)]"
                    : "",
                ].join(" ")}
              >
                <span className="text-[20px] leading-none">🍌</span>
              </button>
            </DropdownMenuTrigger>

            {/* Opaque menu background */}
            <DropdownMenuContent align="start" className="w-56 bg-card/95 backdrop-blur-xl border-border shadow-lg z-50">
              <DropdownMenuItem
                onClick={() => setForceImageMode(true)}
                className="cursor-pointer hover:bg-accent focus:bg-accent"
              >
                <span className="mr-2">🍌</span>
                <span>Generate Image</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer hover:bg-accent focus:bg-accent"
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                <span>Attach Images</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Close X next to banana when active (same behavior on desktop & mobile now for consistency) */}
          {shouldShowBanana && (
            <button
              onClick={() => setForceImageMode(false)}
              aria-label="Disable Nano Banana"
              className="h-10 w-10 inline-flex items-center justify-center rounded-md hover:bg-yellow-500/10"
              title="Disable Nano Banana"
            >
              <X className="h-5 w-5 text-yellow-600" />
            </button>
          )}
        </div>

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
            className={`card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[60px] max-h-[144px] leading-6 py-4 ${shouldShowBanana ? "pl-4" : ""}`}
            rows={1}
          />
        </div>

        {/* send – blue in light mode, primary in dark mode */}
        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-200 border
            ${(inputValue.trim() || selectedImages.length) 
              ? "bg-blue-600 dark:bg-primary text-white dark:text-primary-foreground hover:opacity-90 border-blue-600 dark:border-primary" 
              : "bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed border-transparent"
            }`}
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
