// src/components/ChatInput.tsx
import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, ArrowRight, Sparkles, ImagePlus, Brain, Code2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { useFingerPopup } from "@/hooks/use-finger-popup";
import { useProfile } from "@/hooks/useProfile";
import { useAccentColor } from "@/hooks/useAccentColor";
import { AIService } from "@/services/ai";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from "@/utils/memoryDetection";
import { PromptLibrary } from "@/components/PromptLibrary";
import { getAllPromptsFlat } from "@/utils/promptGenerator";
import { cn } from "@/lib/utils";

// Global cancellation flag
let cancelRequested = false;

export const cancelCurrentRequest = () => {
  cancelRequested = true;
  const store = useArcStore.getState();
  store.setLoading(false);
  store.setGeneratingImage(false);
  store.setSearchingChats(false);
  store.setAccessingMemory(false);
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
// Prefix-based detection: image/, draw/, create/ for images
function checkForImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Only trigger on explicit prefixes
  return /^(image|draw|create)\//.test(m);
}

// Prefix-based detection: code/ for coding
function checkForCodingRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Only trigger on explicit prefix
  return /^code\//.test(m);
}

// Extract the prompt after the prefix (strips prefix/)
function extractPrefixPrompt(message: string): string {
  return message.replace(/^(image|draw|create|code)\/\s*/i, "").trim();
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

type Props = {
  onImagesChange?: (hasImages: boolean) => void;
  rightPanelOpen?: boolean;
};

export interface ChatInputRef {
  handleImageUploadFiles: (files: File[]) => void;
  focusInput: () => void;
}

export const ChatInput = forwardRef<ChatInputRef, Props>(function ChatInput({ onImagesChange, rightPanelOpen = false }, ref) {
  useProfile();
  const portalRoot = useSafePortalRoot();
  const { toast } = useToast();
  const showPopup = useFingerPopup((state) => state.showPopup);

  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, isGeneratingImage, setGeneratingImage, editMessage, setSearchingChats, setAccessingMemory } =
    useArcStore();
  const { profile, updateProfile } = useProfile();
  const { accentColor } = useAccentColor();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]); // Store object URLs
  const [allImagesEditMode, setAllImagesEditMode] = useState(false); // Single toggle for all images
  const [isActive, setIsActive] = useState(false);

  // Tiles menu
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const modelLabelTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Prompt library
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const quickPrompts = getAllPromptsFlat();

  // Mode toggles for image and coding
  const [forceImageMode, setForceImageMode] = useState(false);
  const [forceCodingMode, setForceCodingMode] = useState(false);
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));
  const shouldShowCodeMode = forceCodingMode || (!!inputValue && checkForCodingRequest(inputValue));

  // Show slash picker when user types just "/"
  const showSlashPicker = inputValue.trim() === "/";

  // Track current session model for brain icon state
  const [sessionModel, setSessionModel] = useState<string>(() =>
    sessionStorage.getItem('arc_session_model') || 'google/gemini-2.5-flash'
  );

  // Auto-switch to Gemini 3 Pro when code/ mode is active (it's way better at code)
  useEffect(() => {
    if (shouldShowCodeMode && sessionModel !== 'google/gemini-3-pro-preview') {
      sessionStorage.setItem('arc_session_model', 'google/gemini-3-pro-preview');
      setSessionModel('google/gemini-3-pro-preview');
    }
  }, [shouldShowCodeMode, sessionModel]);

  // Textarea auto-resize with cursor position preservation
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPositionRef = useRef<number | null>(null);

  // Expose handleImageUploadFiles and focusInput via ref
  useImperativeHandle(ref, () => ({
    handleImageUploadFiles: (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      const max = 14;
      setSelectedImages((prev) => {
        const merged = [...prev, ...images].slice(0, max);
        if (merged.length >= max && images.length > 0 && merged.length > prev.length) {
          toast({ title: "Max images", description: `Up to ${max} images supported`, variant: "default" });
        }
        return merged;
      });
    },
    focusInput: () => {
      textareaRef.current?.focus();
    },
  }), [toast]);

  useEffect(() => {
    if (!textareaRef.current) return;

    // Save cursor position before resize
    const cursorPos = textareaRef.current.selectionStart;

    textareaRef.current.style.height = "auto";
    const h = textareaRef.current.scrollHeight;
    textareaRef.current.style.height = Math.min(h, 24 * 3) + "px";

    // Restore cursor position after resize
    if (cursorPositionRef.current !== null) {
      textareaRef.current.setSelectionRange(cursorPositionRef.current, cursorPositionRef.current);
      cursorPositionRef.current = null;
    } else if (document.activeElement === textareaRef.current) {
      textareaRef.current.setSelectionRange(cursorPos, cursorPos);
    }
  }, [inputValue]);

  // Handle mobile keyboard opening - scroll input into view
  const handleInputFocus = useCallback(() => {
    // Small delay to let keyboard animation start
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 300);
  }, []);

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

  // Sync session model state with sessionStorage (for chat switching)
  useEffect(() => {
    const syncSessionModel = () => {
      const storedModel = sessionStorage.getItem('arc_session_model');
      if (storedModel && storedModel !== sessionModel) {
        setSessionModel(storedModel);
      }
    };

    // Check periodically to detect external changes (e.g., from chat switching)
    const interval = setInterval(syncSessionModel, 300);
    return () => clearInterval(interval);
  }, [sessionModel]);

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

  // Cleanup model label timeout on unmount
  useEffect(() => {
    return () => {
      if (modelLabelTimeoutRef.current) {
        clearTimeout(modelLabelTimeoutRef.current);
      }
    };
  }, []);

  // File input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleImageUploadFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const max = 14;
    setSelectedImages((prev) => {
      const merged = [...prev, ...images].slice(0, max);
      if (merged.length >= max && images.length > 0 && merged.length > prev.length) {
        toast({ title: "Max images", description: `Up to ${max} images supported`, variant: "default" });
      }
      return merged;
    });
  };
  const removeImage = (idx: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== idx));
  };
  const clearSelected = () => {
    setSelectedImages([]);
    setImagePreviewUrls([]);
    setAllImagesEditMode(false);
  };

  /* ---------- Handle edited message resend ---------- */
  const handleEditedMessage = useCallback(async (newContent: string, editedMessageId: string) => {
    if (!newContent.trim() || isLoading) return;

    setLoading(true);
    let didSearchChats = false;

    try {
      const ai = new AIService();
      // Get all messages up to the edited one, replace its content, and send to AI
      const messageIndex = messages.findIndex((m) => m.id === editedMessageId);
      if (messageIndex === -1) {
        setLoading(false);
        return;
      }

      // Remove all messages after the edited one
      const messagesToKeep = messages.slice(0, messageIndex + 1);
      
      // Build conversation history for AI
      const aiMessages = messagesToKeep
        .filter((m) => m.type === "text")
        .map((m) => ({
          role: m.role,
          content: m.id === editedMessageId ? newContent : m.content,
        }));

      const reply = await ai.sendMessage(aiMessages, undefined, (tools) => {
        console.log('🔧 Tools used:', tools);
        
        // Set indicators when we detect tool usage
        if (tools.includes('search_past_chats')) {
          console.log('✅ Setting searchingChats indicator');
          setSearchingChats(true);
          didSearchChats = true;
        }
        if (tools.includes('web_search')) {
          // Could add web search indicator
        }
      });
      
      // Clear the loading state
      setLoading(false);
      
      // Keep tool indicators visible for 2 seconds so user sees them
      setTimeout(() => {
        setSearchingChats(false);
        setAccessingMemory(false);
      }, 2000);
      
      await addMessage({ 
        content: reply, 
        role: "assistant", 
        type: "text",
        memoryAction: didSearchChats ? { type: 'chats_searched' as const } : undefined
      });
    } catch (err: any) {
      console.error('Chat error:', err);
      setLoading(false);
      setSearchingChats(false);
      setAccessingMemory(false);
      
      toast({ title: "Error", description: err?.message || "Failed to get AI response", variant: "destructive" });
      await addMessage({
        content: "Sorry, I encountered an error. Please try again.",
        role: "assistant",
        type: "text",
      });
    }
  }, [messages, isLoading, setLoading, addMessage, toast, setSearchingChats, setAccessingMemory]);

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
      const e = ev as CustomEvent<{ content: string; baseImageUrl: string | string[]; additionalImages?: string[]; editInstruction: string; imageModel?: string }>;
      if (!e?.detail) return;
      handleExternalImageEdit(e.detail.content, e.detail.baseImageUrl, e.detail.editInstruction, e.detail.imageModel, e.detail.additionalImages);
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
  }, [handleEditedMessage]);

  /* ---------- External image edit (modal) ---------- */
  const handleExternalImageEdit = async (
    userMessage: string,
    baseImageUrl: string | string[],
    editInstruction: string,
    imageModel?: string,
    additionalImages?: string[],
  ) => {
    try {
      const ai = new AIService();
      setGeneratingImage(true);

      // Merge base images with additional images
      const baseUrls = Array.isArray(baseImageUrl) ? baseImageUrl : [baseImageUrl];
      const allImageUrls = additionalImages && additionalImages.length > 0
        ? [...baseUrls, ...additionalImages]
        : baseUrls;

      await addMessage({
        content: userMessage || editInstruction || "Edit request",
        role: "user",
        type: "image",
        imageUrls: allImageUrls, // Show all images (original + additional) in user message
      });

      await addMessage({
        content: `Editing image: ${editInstruction}`,
        role: "assistant",
        type: "image-generating",
        imagePrompt: editInstruction,
      });

      const url = await ai.editImage(editInstruction, allImageUrls, imageModel);

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


  /* ---------- Submit ---------- */
  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride ?? inputValue;
    if ((!messageToSend.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = messageToSend.trim();
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

        // Check if images are in edit mode
        const isEditMode = allImagesEditMode;

        if (isEditMode || (userMessage && isImageEditRequest(userMessage))) {
          await addMessage({ content: userMessage, role: "user", type: "image", imageUrls });
          await addMessage({
            content: `Editing image: ${userMessage}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt: userMessage,
          });
          setGeneratingImage(true);

          try {
            const editedUrl = await ai.editImage(userMessage, imageUrls, undefined);
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
        // Strip the prefix (image/, draw/, create/) and use the rest as prompt
        const imagePrompt = extractPrefixPrompt(userMessage || "") || "a beautiful image";
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
          const genUrl = await ai.generateImage(apiPrompt, sessionModel);
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
      let memorySavedContent: string | null = null;
      let didSearchChats = false;
      
      if (userMessage) {
        // Build conversation context for memory extraction
        const conversationContext = messages
          .filter((m) => m.type === "text")
          .map((m) => ({ role: m.role, content: m.content }));

        // Use AI-powered memory detection with user's name for proper formatting
        const userName = profile?.display_name || "User";
        const memoryItem = await detectMemoryCommand(userMessage, conversationContext, userName);
        if (memoryItem) {
          const wasNew = await addToMemoryBank(memoryItem);
          if (wasNew) {
            console.log('Memory saved:', memoryItem.content);
            memorySavedContent = memoryItem.content;
          }
        }
      }

      // Add user message with memory action if memory was saved
      await addMessage({ 
        content: userMessage, 
        role: "user", 
        type: "text",
        memoryAction: memorySavedContent ? { type: 'memory_saved' as const, content: memorySavedContent } : undefined
      });
      
      try {
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));

        // Strip the code/ prefix if present, and prepend "Code the following:" for the AI
        const isCodingRequest = shouldShowCodeMode || checkForCodingRequest(userMessage);
        const cleanedMessage = extractPrefixPrompt(userMessage);
        const messageToSend = isCodingRequest ? `Code the following: ${cleanedMessage}` : cleanedMessage || userMessage;

        aiMessages.push({ role: "user", content: messageToSend });

        
        // Check if cancelled before making the call
        if (cancelRequested) {
          return;
        }
        
        const reply = await new AIService().sendMessage(aiMessages, profile, (tools) => {
          console.log('🔧 Tools used in handleSend:', tools);
          // Set indicators based on tool usage
          if (tools.includes('search_past_chats')) {
            console.log('✅ Setting searchingChats in handleSend');
            setSearchingChats(true);
            didSearchChats = true;
          }
          if (tools.includes('web_search')) {
            // Could add web search indicator
          }
        });
        
        // Check if cancelled after getting response
        if (cancelRequested) {
          setSearchingChats(false);
          setAccessingMemory(false);
          return;
        }
        
        // Keep indicators visible for 2 seconds so user sees them
        setTimeout(() => {
          setSearchingChats(false);
          setAccessingMemory(false);
        }, 2000);
        
        // Add assistant message with memory action if chats were searched
        await addMessage({ 
          content: reply, 
          role: "assistant", 
          type: "text",
          memoryAction: didSearchChats ? { type: 'chats_searched' as const } : undefined
        });
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
            <div
              className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/14)</span>
                <button onClick={clearSelected} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear All
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedImages.map((f, i) => {
                  const url = imagePreviewUrls[i];
                  return (
                    <div key={i} className="relative group shrink-0">
                      <img
                        src={url}
                        alt={`sel-${i}`}
                        className="w-16 h-16 object-cover rounded-full border border-border/40"
                      />
                      
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
              
              {/* Single mode toggle for all images */}
              {selectedImages.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => setAllImagesEditMode(!allImagesEditMode)}
                    className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-all bg-black text-white hover:bg-black/80"
                  >
                    {allImagesEditMode ? `Mode: Edit ✏️` : `Mode: Analyze 🔍`}
                  </button>
                </div>
              )}
            </div>
          </div>,
          portalRoot,
        )}

      {/* Input Row */}
      <div className="chat-input-halo flex items-center gap-3 rounded-full">
        {/* LEFT BUTTON — Image/Code mode indicator or + menu */}
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={
            shouldShowBanana
              ? "Disable image mode"
              : shouldShowCodeMode
              ? "Disable code mode"
              : showMenu
              ? "Close menu"
              : "Quick options"
          }
          className={[
            "ci-menu-btn h-10 w-10 rounded-full flex items-center justify-center transition-colors duration-200 relative glass-shimmer",
            shouldShowBanana
              ? "!bg-green-500/20 ring-1 ring-green-400/50 !shadow-[0_0_24px_rgba(34,197,94,0.25)]"
              : shouldShowCodeMode
              ? "!bg-blue-500/20 ring-1 ring-blue-400/50 !shadow-[0_0_24px_rgba(59,130,246,0.25)]"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          onClick={() => {
            if (shouldShowBanana) {
              setForceImageMode(false);
              // Clear input if it's just the prefix
              if (/^(image|draw|create)\/\s*$/i.test(inputValue)) setInputValue("");
            } else if (shouldShowCodeMode) {
              setForceCodingMode(false);
              // Clear input if it's just the prefix
              if (/^code\/\s*$/i.test(inputValue)) setInputValue("");
            } else {
              setShowMenu((v) => !v);
            }
          }}
        >
          {shouldShowBanana ? (
            <>
              <ImagePlus className="h-5 w-5 text-green-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">
                ×
              </span>
            </>
          ) : shouldShowCodeMode ? (
            <>
              <Code2 className="h-5 w-5 text-blue-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">
                ×
              </span>
            </>
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </button>

        {/* Input */}
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => {
              setIsActive(true);
              handleInputFocus();
            }}
            onBlur={() => setIsActive(false)}
            placeholder={selectedImages.length > 0 ? "Add something..." : shouldShowBanana ? "Describe your image..." : shouldShowCodeMode ? "Describe what to build..." : "Ask"}
            disabled={isLoading}
            className="border-none !bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[24px] max-h-[144px] leading-5 py-1.5 px-4 focus:outline-none focus:ring-0 text-[16px]"
            rows={1}
          />
        </div>
        
        {/* Slash command picker - portaled to escape overflow */}
        {portalRoot && showSlashPicker && createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[9999] flex items-center justify-center gap-2"
              style={{ 
                bottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
                left: 0,
                right: 0,
              }}
            >
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInputValue("image/");
                  textareaRef.current?.focus();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black border border-green-400/50 text-green-400 hover:bg-green-500/20 transition-colors shadow-xl"
              >
                <ImagePlus className="h-4 w-4" />
                <span className="text-sm font-medium">image/</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInputValue("code/");
                  textareaRef.current?.focus();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black border border-blue-400/50 text-blue-400 hover:bg-blue-500/20 transition-colors shadow-xl"
              >
                <Code2 className="h-4 w-4" />
                <span className="text-sm font-medium">code/</span>
              </button>
              {/* Dismiss button */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setInputValue("");
                  textareaRef.current?.focus();
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-black border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors shadow-xl"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </AnimatePresence>,
          portalRoot
        )}

        {/* Brain Icon Toggle - hidden on mobile when typing */}
        <button
          onClick={async (e) => {
            const newModel = sessionModel === "google/gemini-3-pro-preview"
              ? "google/gemini-2.5-flash"
              : "google/gemini-3-pro-preview";
            try {
              // Get button center position for popup
              const rect = e.currentTarget.getBoundingClientRect();

              // Update sessionStorage so the model is actually used for API calls
              sessionStorage.setItem('arc_session_model', newModel);
              setSessionModel(newModel);

              // Update profile for UI persistence (optional)
              await updateProfile({ preferred_model: newModel });

              // Show bouncy popup from brain icon
              showPopup(
                newModel === "google/gemini-3-pro-preview" ? "Wise & Thoughtful" : "Smart & Fast",
                rect.left + rect.width / 2,
                rect.top + rect.height / 2
              );
            } catch (e) {
              console.error("Failed to toggle model:", e);
            }
          }}
          className={[
            "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
            sessionModel === "google/gemini-3-pro-preview"
              ? "!bg-primary/20 text-primary ring-1 ring-primary !shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
              : "text-muted-foreground hover:text-foreground",
            // Hide on mobile when typing (isActive), show on desktop always
            isActive ? "hidden sm:flex" : "flex",
          ].join(" ")}
          aria-label="Toggle AI model"
          title={sessionModel === "google/gemini-3-pro-preview" ? "Wise & Thoughtful" : "Smart & Fast"}
        >
          <Brain className="h-5 w-5" />
        </button>

        {/* Send */}
        <button
          onClick={() => handleSend()}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={[
            "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
            inputValue.trim() || selectedImages.length
              ? accentColor === "noir"
                ? "!bg-white/90 text-black ring-1 ring-white/50 hover:!bg-white !shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                : "!bg-primary/20 text-primary ring-1 ring-primary !shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
              : "text-muted-foreground cursor-not-allowed",
          ].join(" ")}
          aria-label="Send"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      {/* Tiles menu - bouncy popup above input */}
      {portalRoot &&
        createPortal(
          <AnimatePresence>
            {showMenu && (
              <div
                className={cn(
                  "fixed bottom-0 left-0 right-0 z-[35] pointer-events-none",
                  "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                )}
                style={{ paddingBottom: "calc(90px + env(safe-area-inset-bottom, 0px))" }}
              >
                <div
                  className={cn(
                    "max-w-4xl mx-auto pointer-events-auto",
                    "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    rightPanelOpen && "lg:mr-80 xl:mr-96"
                  )}
                >
                  <div className="px-4">
                    {/* Fanned playing cards */}
                    <div className="relative flex items-center justify-center gap-1 h-44 max-w-sm mx-auto">
                      {/* Quick Prompts - Left card */}
                      <motion.button
                        initial={{ opacity: 0, y: 40, rotate: -10, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: -10,
                          scale: 1,
                        }}
                        exit={{ opacity: 0, y: 20, rotate: -10, scale: 0.95 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 550,
                          mass: 0.4,
                        }}
                        onClick={() => {
                          setShowMenu(false);
                          setShowPromptLibrary(true);
                        }}
                        className="group rounded-2xl glass-shimmer !border-violet-500/50 px-3 py-5 hover:scale-105 hover:rotate-0 hover:z-30 active:scale-95 w-24 h-36 sm:w-28 sm:h-40 !shadow-[0_8px_32px_rgba(0,0,0,.2),0_0_12px_rgba(139,92,246,.2)]"
                        style={{ transformOrigin: "bottom center" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-2 h-full">
                          <span className="inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-violet-500/15 shrink-0 glass-shimmer !border-violet-500/30">
                            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-violet-500" />
                          </span>
                          <div className="text-xs sm:text-sm font-semibold">Prompts</div>
                        </div>
                      </motion.button>

                      {/* Generate Image - Center card */}
                      <motion.button
                        initial={{ opacity: 0, y: 40, rotate: 0, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: 0,
                          scale: 1,
                        }}
                        exit={{ opacity: 0, y: 20, rotate: 0, scale: 0.95 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 550,
                          mass: 0.4,
                        }}
                        onClick={() => {
                          setForceImageMode(true);
                          setShowMenu(false);
                        }}
                        className="group rounded-2xl glass-shimmer !border-green-500/50 px-3 py-5 hover:scale-105 hover:z-30 active:scale-95 w-24 h-36 sm:w-28 sm:h-40 z-10 !shadow-[0_8px_32px_rgba(0,0,0,.2),0_0_12px_rgba(34,197,94,.2)]"
                        style={{ transformOrigin: "bottom center" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-2 h-full">
                          <span className="inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-green-500/15 shrink-0 glass-shimmer !border-green-500/30">
                            <ImagePlus className="h-5 w-5 sm:h-6 sm:w-6 text-green-400" />
                          </span>
                          <div className="text-xs sm:text-sm font-semibold">Image</div>
                        </div>
                      </motion.button>

                      {/* Attach - Right card */}
                      <motion.button
                        initial={{ opacity: 0, y: 40, rotate: 10, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: 10,
                          scale: 1,
                        }}
                        exit={{ opacity: 0, y: 20, rotate: 10, scale: 0.95 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 550,
                          mass: 0.4,
                        }}
                        onClick={() => {
                          setShowMenu(false);
                          fileInputRef.current?.click();
                        }}
                        className="group rounded-2xl glass-shimmer !border-blue-500/50 px-3 py-5 hover:scale-105 hover:rotate-0 hover:z-30 active:scale-95 w-24 h-36 sm:w-28 sm:h-40 !shadow-[0_8px_32px_rgba(0,0,0,.2),0_0_12px_rgba(59,130,246,.2)]"
                        style={{ transformOrigin: "bottom center" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-2 h-full">
                          <span className="inline-flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-blue-500/15 shrink-0 glass-shimmer !border-blue-500/30">
                            <Paperclip className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
                          </span>
                          <div className="text-xs sm:text-sm font-semibold">Attach</div>
                        </div>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          portalRoot,
        )}

      {/* Prompt Library - rendered via portal to escape container */}
      {portalRoot &&
        createPortal(
          <PromptLibrary
            isOpen={showPromptLibrary}
            onClose={() => setShowPromptLibrary(false)}
            prompts={quickPrompts}
            onSelectPrompt={(prompt) => {
              setShowPromptLibrary(false);

              // Code prompts auto-send immediately
              if (prompt.toLowerCase().startsWith('code:')) {
                handleSend(prompt);
                return;
              }

              // Image prompts: set banana mode and populate input
              if (prompt.toLowerCase().includes('generate image')) {
                setForceImageMode(true);
              }

              // All non-code prompts: populate input and focus (user sends manually)
              setInputValue(prompt);
              setTimeout(() => {
                textareaRef.current?.focus();
              }, 100);
            }}
          />,
          portalRoot
        )}

      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
});

ChatInput.displayName = "ChatInput";
