// src/components/ChatInput.tsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, Plus, ArrowRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { AIService } from "@/services/ai";
import { supabase } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from "@/utils/memoryDetection";

// Global cancellation flag
let cancelRequested = false;

export const cancelCurrentRequest = () => {
  cancelRequested = true;
  const store = useArcStore.getState();
  store.setLoading(false);
  store.setGeneratingImage(false);
};

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
  
  // Require explicit image-related words to be present
  const hasImageWord = /\b(image|picture|photo|illustration|artwork|graphic|visual|drawing|painting)\b/i.test(m);
  if (!hasImageWord) return false;
  
  // Check for explicit image generation patterns
  if (
    /^(generate|create|make|draw|paint|design|render|produce)\s+(an?\s+)?(image|picture|photo|illustration|artwork|graphic)/i.test(m)
  ) return true;
  
  if (/^(generate|create|make)\s+an?\s+image\s+of/i.test(m)) return true;
  
  if (/^(show\s+me|give\s+me|i\s+want|i\s+need)\s+(an?\s+)?(image|picture|photo)/i.test(m)) return true;
  
  // More specific keyword combinations
  const imageKeywords = [
    "generate image",
    "create image",
    "make image",
    "draw image",
    "paint image",
    "generate picture",
    "create picture",
    "image of",
    "picture of",
    "photo of",
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

/* ---------------- Tiny utilities ---------------- */
const useSafePortalRoot = () => {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.body), []);
  return root;
};

type Props = { onImagesChange?: (hasImages: boolean) => void };

export function ChatInput({ onImagesChange }: Props) {
  useProfile();
  const portalRoot = useSafePortalRoot();
  const { toast } = useToast();

  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, isGeneratingImage, setGeneratingImage } =
    useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]); // Store object URLs
  const [imageEditModes, setImageEditModes] = useState<boolean[]>([]); // Track which images are in edit mode
  const [isActive, setIsActive] = useState(false);

  // Tiles menu
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Banana toggle
  const [forceImageMode, setForceImageMode] = useState(false);
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));

  // Textarea auto-resize
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const h = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = Math.min(h, 24 * 3) + "px";
  }, [inputValue]);

  // Create and cleanup object URLs for image previews
  useEffect(() => {
    // Revoke old URLs
    imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    
    // Create new URLs
    const newUrls = selectedImages.map(file => URL.createObjectURL(file));
    setImagePreviewUrls(newUrls);
    
    // Cleanup on unmount or when images change
    return () => {
      newUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [selectedImages]);

  // Notify parent about images
  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  // Close tiles on outside click / esc
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!showMenu) return;
      const t = e.target as HTMLElement;
      if (!t.closest?.(".ci-tiles") && !t.closest?.(".ci-menu-btn")) setShowMenu(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showMenu]);

  // File input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleImageUploadFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const max = 4;
    setSelectedImages((prev) => {
      const merged = [...prev, ...images].slice(0, max);
      if (merged.length >= max && images.length > 0 && merged.length > prev.length) {
        toast({ title: "Max images", description: `Up to ${max} images supported`, variant: "default" });
      }
      // Initialize edit modes for new images (default to analyze mode)
      setImageEditModes(prevModes => [...prevModes, ...new Array(merged.length - prev.length).fill(false)]);
      return merged;
    });
  };
  const removeImage = (idx: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== idx));
    setImageEditModes((prev) => prev.filter((_, i) => i !== idx));
  };
  const clearSelected = () => {
    setSelectedImages([]);
    setImageEditModes([]);
    setImagePreviewUrls([]);
  };
  const toggleImageEditMode = (idx: number) => {
    setImageEditModes((prev) => prev.map((mode, i) => (i === idx ? !mode : mode)));
  };

  /* ---------- Quick prompt / edit event hooks ---------- */
  useEffect(() => {
    const quickHandler = (ev: Event) => {
      try {
        const e = ev as CustomEvent<{ prompt?: string; type?: string }>;
        if (e?.detail?.prompt) {
          const prompt = e.detail.prompt;
          const type = e.detail.type;
          if (type === "image") setForceImageMode(true);
          setInputValue(prompt);
          setTimeout(() => {
            const btn = document.querySelector('[aria-label="Send"]') as HTMLButtonElement;
            if (btn && !btn.disabled) btn.click();
          }, 80);
        }
      } catch {}
    };
    const editHandler = (ev: Event) => {
      const e = ev as CustomEvent<{ content: string; baseImageUrl: string | string[]; editInstruction: string }>;
      if (!e?.detail) return;
      handleExternalImageEdit(e.detail.content, e.detail.baseImageUrl, e.detail.editInstruction);
    };
    const editedMessageHandler = (ev: Event) => {
      const e = ev as CustomEvent<{ content: string; editedMessageId: string }>;
      if (!e?.detail) return;
      handleEditedMessage(e.detail.content, e.detail.editedMessageId);
    };
    window.addEventListener("quickPromptSelected", quickHandler as EventListener);
    window.addEventListener("arcai:triggerPrompt", quickHandler as EventListener);
    window.addEventListener("processImageEdit", editHandler as EventListener);
    window.addEventListener("processEditedMessage", editedMessageHandler as EventListener);
    return () => {
      window.removeEventListener("quickPromptSelected", quickHandler as EventListener);
      window.removeEventListener("arcai:triggerPrompt", quickHandler as EventListener);
      window.removeEventListener("processImageEdit", editHandler as EventListener);
      window.removeEventListener("processEditedMessage", editedMessageHandler as EventListener);
    };
  }, [messages]);

  /* ---------- External image edit (modal) ---------- */
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

      // persist best-effort
      let finalUrl = url;
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const name = `${user.id}/edited-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
          const { error } = await supabase.storage.from("avatars").upload(name, blob, {
            contentType: "image/png",
            upsert: false,
          });
          if (!error) {
            const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
            finalUrl = pub.publicUrl;
          }
        }
      } catch {}

      await replaceLastMessage({
        content: `Edited image: ${editInstruction}`,
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
  };

  /* ---------- Handle edited message resend ---------- */
  const handleEditedMessage = async (newContent: string, editedMessageId: string) => {
    if (!newContent.trim() || isLoading) return;

    setLoading(true);

    try {
      const ai = new AIService();
      // Get all messages up to the edited one, replace its content, and send to AI
      const messageIndex = messages.findIndex((m) => m.id === editedMessageId);
      if (messageIndex === -1) return;

      // Remove all messages after the edited one
      const messagesToKeep = messages.slice(0, messageIndex + 1);
      
      // Build conversation history for AI
      const aiMessages = messagesToKeep
        .filter((m) => m.type === "text")
        .map((m) => ({
          role: m.role,
          content: m.id === editedMessageId ? newContent : m.content,
        }));

      const reply = await ai.sendMessage(aiMessages);
      await addMessage({ content: reply, role: "assistant", type: "text" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to get AI response", variant: "destructive" });
      await addMessage({
        content: "Sorry, I encountered an error. Please try again.",
        role: "assistant",
        type: "text",
      });
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Submit ---------- */
  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    const images = [...selectedImages];

    // Clear UI promptly
    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
    setShowMenu(false);
    
    // Reset cancellation flag
    cancelRequested = false;
    setLoading(true);

    try {
      const ai = new AIService();

      // With Images -> edit or analyze
      if (images.length > 0) {
        // upload images or fallback
        let imageUrls: string[] = [];
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");
          const uploadPromises = images.map(async (file) => {
            const name = `${user.id}/user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage.from("avatars").upload(name, file, {
              contentType: file.type,
              upsert: false,
            });
            if (error) throw error;
            const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
            return pub.publicUrl;
          });
          imageUrls = await Promise.all(uploadPromises);
        } catch {
          imageUrls = images.map((f) => URL.createObjectURL(f));
        }

        // Check if ANY images are in edit mode
        const hasEditModeImages = imageEditModes.some((mode) => mode);

        if (hasEditModeImages || (userMessage && isImageEditRequest(userMessage))) {
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
                const { error } = await supabase.storage.from("avatars").upload(name, blob, {
                  contentType: "image/png",
                  upsert: false,
                });
                if (!error) {
                  const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
                  finalUrl = pub.publicUrl;
                }
              }
            } catch {}
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

        // Analyze
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
        } catch {
          toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze these images. Please try again.",
            role: "assistant",
            type: "text",
          });
        }
        return;
      }

      // No images: Banana => generate; else text
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
              const { error } = await supabase.storage.from("avatars").upload(name, blob, {
                contentType: "image/png",
                upsert: false,
              });
              if (!error) {
                const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
                finalUrl = pub.publicUrl;
              }
            }
          } catch {}
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

      // Plain text
      if (userMessage) {
        const memoryItem = detectMemoryCommand(userMessage);
        if (memoryItem) {
          const wasNew = await addToMemoryBank(memoryItem);
          if (wasNew) formatMemoryConfirmation(memoryItem.content);
        }
      }

      await addMessage({ content: userMessage, role: "user", type: "text" });
      try {
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));
        aiMessages.push({ role: "user", content: userMessage });
        
        // Check if cancelled before making the call
        if (cancelRequested) {
          return;
        }
        
        const reply = await new AIService().sendMessage(aiMessages);
        
        // Check if cancelled after getting response
        if (cancelRequested) {
          return;
        }
        
        await addMessage({ content: reply, role: "assistant", type: "text" });
      } catch (err: any) {
        // Check if request was cancelled
        if (cancelRequested) {
          return;
        }
        toast({ title: "Error", description: err?.message || "Failed to get AI response", variant: "destructive" });
        await addMessage({
          content: "Sorry, I encountered an error. Please try again.",
          role: "assistant",
          type: "text",
        });
      }
    } finally {
      if (!cancelRequested) {
        setLoading(false);
      }
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
    <div className="space-y-4 relative">
      {/* Selected Images preview (fixed portal above the dock) */}
      {portalRoot &&
        selectedImages.length > 0 &&
        createPortal(
          <div
            className="fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"
            style={{ bottom: "calc(110px + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
                <button onClick={clearSelected} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear All
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedImages.map((f, i) => {
                  const url = imagePreviewUrls[i];
                  const isEditMode = imageEditModes[i] || false;
                  return (
                    <div key={i} className="relative group shrink-0">
                      <img
                        src={url}
                        alt={`sel-${i}`}
                        className="w-16 h-16 object-cover rounded-full border border-border/40"
                      />
                      
                      {/* Mode toggle badge */}
                      <button
                        type="button"
                        onClick={() => toggleImageEditMode(i)}
                        className={`absolute bottom-0 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[9px] font-medium transition-all backdrop-blur-sm border ${
                          isEditMode
                            ? "bg-primary/90 border-primary text-primary-foreground"
                            : "bg-muted/90 border-border/50 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {isEditMode ? "Edit" : "Analyze"}
                      </button>
                      
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          portalRoot,
        )}

      {/* Input Row */}
      <div
        className={[
          "chat-input-halo flex items-center gap-3 transition-all duration-200 rounded-full bg-transparent",
          isActive ? "halo-active" : "",
          shouldShowBanana ? "ring-2 ring-yellow-400/60 shadow-[0_0_24px_rgba(250,204,21,.18)]" : "ring-0",
        ].join(" ")}
      >
        {/* LEFT BUTTON — Banana replaces + when active */}
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={shouldShowBanana ? "Disable image mode" : showMenu ? "Close menu" : "Open menu"}
          className={[
            "ci-menu-btn h-12 w-12 rounded-full flex items-center justify-center transition-colors duration-200 border border-border/40 relative",
            shouldShowBanana
              ? "bg-yellow-50/10 ring-1 ring-yellow-300/50 shadow-[0_0_24px_rgba(250,204,21,.18)]"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
          ].join(" ")}
          onClick={() => {
            if (shouldShowBanana) setForceImageMode(false);
            else setShowMenu((v) => !v);
          }}
        >
          {shouldShowBanana ? (
            <>
              <span className="text-lg leading-none">🍌</span>
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">
                ×
              </span>
            </>
          ) : (
            <span
              className="inline-block transition-transform"
              style={{ transform: `rotate(${showMenu ? 45 : 0}deg)` }}
            >
              <Plus className="h-5 w-5" />
            </span>
          )}
        </button>

        {/* Input */}
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsActive(true)}
            onBlur={() => setIsActive(false)}
            placeholder={selectedImages.length > 0 ? "Add something..." : shouldShowBanana ? "Describe" : "Ask"}
            disabled={isLoading}
            className="border-none !bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[52px] max-h-[144px] leading-6 py-3 px-4 focus:outline-none focus:ring-0 text-[16px]"
            rows={1}
          />
        </div>

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={[
            "shrink-0 h-12 w-12 rounded-full flex items-center justify-center transition-all duration-200 border border-border/40",
            inputValue.trim() || selectedImages.length
              ? "dark:bg-primary text-white dark:text-primary-foreground hover:opacity-90 dark:border-primary bg-blue-500 border-blue-500 text-white"
              : "bg-muted/50 text-muted-foreground cursor-not-allowed",
          ].join(" ")}
          aria-label="Send"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      {/* Tiles popover (lower z-index than sidebar; fixed above dock) */}
      {portalRoot &&
        showMenu &&
        createPortal(
          <div
            className="ci-tiles fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[35]"
            style={{ bottom: "calc(140px + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="grid grid-cols-2 gap-4 px-1">
              {/* Generate Image tile (yellow glow) */}
              <button
                onClick={() => {
                  setForceImageMode(true);
                  setShowMenu(false);
                }}
                className="rounded-2xl border bg-background/80 backdrop-blur-xl px-4 py-4 text-left transition-all hover:translate-y-[-2px] hover:scale-[1.01]"
                style={{
                  borderColor: "rgba(250,204,21,0.35)",
                  boxShadow:
                    "0 10px 30px rgba(0,0,0,.25), 0 0 0 1px rgba(250,204,21,.20) inset, 0 0 20px rgba(250,204,21,.18)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">🍌</span>
                  <div className="text-lg font-semibold">Generate Image</div>
                </div>
                <div className="text-sm text-muted-foreground leading-snug">
                  Turn this prompt into an image using Nano Banana.
                </div>
              </button>

              {/* Attach Images tile (blue glow) */}
              <button
                onClick={() => {
                  setShowMenu(false);
                  fileInputRef.current?.click();
                }}
                className="rounded-2xl border bg-background/80 backdrop-blur-xl px-4 py-4 text-left transition-all hover:translate-y-[-2px] hover:scale-[1.01]"
                style={{
                  borderColor: "rgba(59,130,246,0.35)",
                  boxShadow:
                    "0 10px 30px rgba(0,0,0,.25), 0 0 0 1px rgba(59,130,246,.20) inset, 0 0 20px rgba(59,130,246,.18)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                    <Paperclip className="h-4 w-4" />
                  </span>
                  <div className="text-lg font-semibold">Attach</div>
                </div>
                <div className="text-sm text-muted-foreground leading-snug">Attach to analyze or edit!</div>
              </button>
            </div>
          </div>,
          portalRoot,
        )}

      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
