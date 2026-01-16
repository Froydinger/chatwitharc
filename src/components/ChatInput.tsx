// src/components/ChatInput.tsx
import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, ArrowRight, Sparkles, ImagePlus, Brain, Code2, PenLine, Search, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { useFingerPopup } from "@/hooks/use-finger-popup";
import { useProfile } from "@/hooks/useProfile";
import { useAccentColor } from "@/hooks/useAccentColor";
import { AIService } from "@/services/ai";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
// Memory detection disabled - using chat history search instead
import { PromptLibrary } from "@/components/PromptLibrary";
import { getAllPromptsFlat } from "@/utils/promptGenerator";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useSearchStore } from "@/store/useSearchStore";
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
// Prefix-based detection: image/, draw/, create/ OR /image, /draw, /create
function checkForImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support both prefix/ and /prefix syntax
  return /^(image|draw|create)\//.test(m) || /^\/(image|draw|create)\b/.test(m);
}

// Prefix-based detection: code/ OR /code
function checkForCodingRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support both code/ and /code syntax
  return /^code\//.test(m) || /^\/code\b/.test(m);
}

// Prefix-based detection: write/, /write, /canvas
function checkForCanvasRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support write/, /write, and /canvas
  return /^write\//.test(m) || /^\/(write|canvas)\b/.test(m);
}

// Prefix-based detection: search/, /search
function checkForSearchRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support both search/ and /search syntax
  return /^search\//.test(m) || /^\/search\b/.test(m);
}

// Detect conversational messages that should NOT trigger code/canvas updates
// These are casual comments, questions, reactions - not actionable requests
function isConversationalMessage(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  // Short messages (under 30 chars) that are questions or reactions are usually conversational
  const isShort = m.length < 30;

  // Patterns that indicate casual conversation, not a code request
  const conversationalPatterns = [
    /^(wow|woah|whoa|cool|nice|awesome|great|amazing|neat|sweet|dope|sick|rad)/i,
    /^(thanks|thank you|thx|ty|cheers)/i,
    /^(ok|okay|k|sure|got it|understood|i see|makes sense)/i,
    /^(how did|how does|how do|how is|how come|why did|why does|why do|what is|what does|what did|where did|where does|who|when)/i,
    /^(that'?s?|this is|it'?s?) (cool|awesome|great|amazing|nice|interesting|neat|wild|crazy|insane)/i,
    /^(lol|haha|hehe|lmao|rofl|omg|wtf)/i,
    /^(yes|no|yeah|nah|yep|nope|yup)/i,
    /\?{2,}/, // Multiple question marks indicate surprise/question
    /!{2,}/, // Multiple exclamation marks indicate excitement
  ];

  // If it matches conversational patterns, it's conversational
  if (conversationalPatterns.some(p => p.test(m))) return true;

  // Short messages ending in ? are usually questions, not requests
  if (isShort && m.endsWith('?')) return true;

  // Very short messages (under 15 chars) without action words are usually reactions
  if (m.length < 15 && !/(add|change|fix|update|make|create|build|remove|delete)/.test(m)) return true;

  return false;
}

// Heuristic for when the Canvas is already open and the user is clearly asking
// to format/rewrite the current draft (without using write/ prefix).
function looksLikeCanvasEditRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  // First check if it's clearly conversational - if so, NOT an edit request
  if (isConversationalMessage(m)) return false;

  const keywords = [
    "format",
    "reformat",
    "rewrite",
    "revise",
    "edit",
    "polish",
    "improve",
    "expand",
    "shorten",
    "summarize",
    "outline",
    "draft",
    "blog",
    "essay",
    "article",
    "script",
    "email",
    "letter",
    "headers",
    "headings",
    "bold",
    "italic",
    "bullet",
    "bullets",
    "markdown",
  ];
  return keywords.some((k) => m.includes(k));
}

// Heuristic for when the Code Canvas is open and user is asking to modify/enhance the code
function looksLikeCodeEditRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();

  // First check if it's clearly conversational - if so, NOT an edit request
  if (isConversationalMessage(m)) return false;

  const keywords = [
    "make it",
    "add",
    "change",
    "modify",
    "update",
    "fix",
    "improve",
    "enhance",
    "include",
    "remove",
    "delete",
    "style",
    "color",
    "animation",
    "dashboard",
    "button",
    "feature",
    "function",
    "component",
    "refactor",
    "optimize",
    "can you",
    "please",
    "i want",
    "now",
    "also",
    "with",
  ];
  return keywords.some((k) => m.includes(k));
}

// Extract the prompt after the prefix (strips prefix/ or /prefix)
function extractPrefixPrompt(message: string): string {
  return message
    .replace(/^(image|draw|create|code|write|search)\/\s*/i, "")
    .replace(/^\/(image|draw|create|code|write|canvas|search)\s*/i, "")
    .trim();
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

  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, isGeneratingImage, setGeneratingImage, editMessage, setSearchingChats, setAccessingMemory, setSearchingWeb, updateMessageMemoryAction, upsertCanvasMessage, upsertCodeMessage } =
    useArcStore();
  const { profile, updateProfile } = useProfile();
  const { accentColor } = useAccentColor();
  const { openSearchMode } = useSearchStore();

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

  // Mode toggles for image, coding, canvas, and search
  const [forceImageMode, setForceImageMode] = useState(false);
  const [forceCodingMode, setForceCodingMode] = useState(false);
  const [forceCanvasMode, setForceCanvasMode] = useState(false);
  const [forceSearchMode, setForceSearchMode] = useState(false);
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));
  const shouldShowCodeMode = forceCodingMode || (!!inputValue && checkForCodingRequest(inputValue));
  const shouldShowCanvasMode = forceCanvasMode || (!!inputValue && checkForCanvasRequest(inputValue));
  const shouldShowSearchMode = forceSearchMode || (!!inputValue && checkForSearchRequest(inputValue));

  // Show slash picker when user types just "/"
  const showSlashPicker = inputValue.trim() === "/";

  // Track current session model for brain icon state
  const [sessionModel, setSessionModel] = useState<string>(() =>
    sessionStorage.getItem('arc_session_model') || 'google/gemini-3-flash-preview'
  );
  
  // Track provider for cycling through correct models
  const [modelProvider, setModelProvider] = useState<'gemini' | 'gpt'>(() => {
    const stored = sessionStorage.getItem('arc_model_provider');
    return (stored === 'gpt' ? 'gpt' : 'gemini') as 'gemini' | 'gpt';
  });

  // Auto-switch to Pro when code/ mode is active (it's way better at code)
  useEffect(() => {
    const proModel = modelProvider === 'gpt' ? 'openai/gpt-5' : 'google/gemini-3-pro-preview';
    if (shouldShowCodeMode && sessionModel !== proModel) {
      sessionStorage.setItem('arc_session_model', proModel);
      setSessionModel(proModel);
    }
  }, [shouldShowCodeMode, sessionModel, modelProvider]);

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

  // Sync session model and provider state with sessionStorage (for chat switching)
  useEffect(() => {
    const syncSessionState = () => {
      const storedModel = sessionStorage.getItem('arc_session_model');
      const storedProvider = sessionStorage.getItem('arc_model_provider');
      if (storedModel && storedModel !== sessionModel) {
        setSessionModel(storedModel);
      }
      if (storedProvider && storedProvider !== modelProvider) {
        setModelProvider(storedProvider as 'gemini' | 'gpt');
      }
    };

    // Check periodically to detect external changes (e.g., from chat switching)
    const interval = setInterval(syncSessionState, 300);
    return () => clearInterval(interval);
  }, [sessionModel, modelProvider]);

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

      let didSearchWeb = false;
      const { currentSessionId } = useArcStore.getState();
      const result = await ai.sendMessage(aiMessages, undefined, (tools) => {
        console.log('🔧 Tools used:', tools);
        
        // Set indicators when we detect tool usage
        if (tools.includes('search_past_chats')) {
          console.log('✅ Setting searchingChats indicator');
          setSearchingChats(true);
          didSearchChats = true;
        }
        if (tools.includes('web_search')) {
          setSearchingWeb(true);
          didSearchWeb = true;
        }
      }, currentSessionId || undefined);
      
      // Clear the loading state
      setLoading(false);
      
      // Keep tool indicators visible for 2 seconds so user sees them
      setTimeout(() => {
        setSearchingChats(false);
        setAccessingMemory(false);
        setSearchingWeb(false);
      }, 2000);
      
      // Determine memory action based on what tools were used
      let memoryAction: any = undefined;
      if (didSearchWeb && result.webSources && result.webSources.length > 0) {
        memoryAction = { type: 'web_searched' as const, sources: result.webSources, query: newContent };
      } else if (didSearchChats) {
        memoryAction = { type: 'chats_searched' as const };
      }

      await addMessage({
        content: result.content,
        role: "assistant",
        type: "text",
        memoryAction
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

    // Capture mode states BEFORE clearing UI (they're needed in handleSendMessage)
    const wasCanvasMode = shouldShowCanvasMode || checkForCanvasRequest(userMessage);
    const wasCodingMode = shouldShowCodeMode || checkForCodingRequest(userMessage);
    const wasImageMode = shouldShowBanana || checkForImageRequest(userMessage);
    const wasSearchMode = shouldShowSearchMode || checkForSearchRequest(userMessage);

    // Clear UI promptly
    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
    setForceCodingMode(false);
    setForceCanvasMode(false);
    setForceSearchMode(false);
    setShowMenu(false);

    // Search mode (/search) - now does a regular web search in chat (NOT Research Mode)
    // Research Mode is opened separately via the button
    // We set forceWebSearch flag so the chat API always does a web search

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

      // Canvas mode - let the regular text flow handle it via AI's update_canvas tool
      // The AI will be instructed to use update_canvas and the response will add a canvas message inline

      // No images: Banana => generate; else text
      if (wasImageMode) {
        // Strip the prefix (image/, draw/, create/, /image, etc.) and use the rest as prompt
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

      // Plain text - Show message IMMEDIATELY, then do memory detection in background
      let didSearchChats = false;
      
      // Add user message RIGHT AWAY for instant feedback
      const userMessageId = await addMessage({ 
        content: userMessage, 
        role: "user", 
        type: "text"
      });

      // Memory system disabled - using chat history search instead
      // The AI uses search_past_chats tool to find relevant context from past conversations
      // This is more natural - like how a brain recalls by searching through memories

      try {
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));

        // Strip the code/ prefix if present, and prepend "Code the following:" for the AI
        const isCodingRequest = wasCodingMode;

        const canvasState = useCanvasStore.getState();
        const shouldRouteToCanvas =
          wasCanvasMode ||
          (canvasState.isOpen && canvasState.canvasType === 'writing' && looksLikeCanvasEditRequest(userMessage));

        // Check if code canvas is open and user is asking to edit it
        const isCodeCanvasOpen = canvasState.isOpen && canvasState.canvasType === 'code';
        const shouldRouteToCodeCanvas = isCodeCanvasOpen && looksLikeCodeEditRequest(userMessage);

        const cleanedMessage = extractPrefixPrompt(userMessage);

        // Show expectation-setting toast for canvas/code with Gemini 3 Pro
        const isUsingWiseModel = sessionModel === 'google/gemini-3-pro-preview';
        if ((isCodingRequest || shouldRouteToCanvas || shouldRouteToCodeCanvas) && isUsingWiseModel) {
          toast({
            title: "Using Wise model",
            description: "This may take 30-60 seconds for complex content",
            duration: 4000,
          });
        }

        // Build the message to send to AI
        let messageToSend: string;

        if (isCodingRequest) {
          // Explicit code/ prefix - new code request
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CODE: Use the update_code tool to write COMPLETE, FULL code for this request. Do NOT truncate, summarize, or cut short. Write the ENTIRE implementation: ${cleanedMessage}`;
        } else if (shouldRouteToCodeCanvas && canvasState.content) {
          // Code canvas is open and user wants to modify existing code
          const existingCode = canvasState.content;
          const language = canvasState.codeLanguage || 'html';
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CODE: The user has existing ${language} code. Modify it based on their request using the update_code tool. You MUST output the COMPLETE, FULL modified code - do NOT truncate, summarize, or cut off mid-way. Write EVERY line.

EXISTING CODE TO MODIFY:
\`\`\`${language}
${existingCode}
\`\`\`

USER'S REQUEST: ${cleanedMessage || userMessage}

MANDATORY: Output the COMPLETE updated code. Never stop mid-sentence or mid-function. Include ALL code from start to finish.`;
        } else if (shouldRouteToCanvas) {
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: Use the update_canvas tool to write COMPLETE, FULL markdown content for this request. Do NOT truncate, summarize, or cut short. Write the ENTIRE piece from beginning to end - every paragraph, every section, complete thoughts. Never stop mid-sentence:\n\n${cleanedMessage || userMessage}`;
        } else if (wasSearchMode) {
          messageToSend = `Search the web for: ${cleanedMessage || userMessage}`;
        } else if (isCodeCanvasOpen && canvasState.content) {
          // Code canvas is open but user isn't explicitly asking to edit
          // Still provide the code as context in case AI decides to modify it
          const existingCode = canvasState.content;
          const language = canvasState.codeLanguage || 'html';
          messageToSend = `${cleanedMessage || userMessage}

[CONTEXT: The user has a Code Canvas open with the following ${language} code. If you need to modify this code for any reason, you MUST preserve ALL existing CSS styles, animations, and functionality. Output the COMPLETE code with ALL original styling intact. NEVER strip or remove existing styles.]

Current code (${existingCode.split('\n').length} lines):
\`\`\`${language}
${existingCode}
\`\`\``;
        } else {
          messageToSend = cleanedMessage || userMessage;
        }

        aiMessages.push({ role: "user", content: messageToSend });

        
        // Check if cancelled before making the call
        if (cancelRequested) {
          return;
        }
        
        let didSearchWeb = false;
        const { currentSessionId } = useArcStore.getState();

        // Determine explicit mode flags to pass to backend
        // This ensures the AI uses the correct tool without confusion
        const shouldForceCode = isCodingRequest || shouldRouteToCodeCanvas;
        const shouldForceCanvas = shouldRouteToCanvas && !shouldForceCode;

        console.log('🎯 Canvas/Code mode detection:', {
          isCodingRequest,
          shouldRouteToCodeCanvas,
          shouldRouteToCanvas,
          shouldForceCode,
          shouldForceCanvas,
          wasSearchMode
        });

        // Always use streaming for all messages
        const aiService = new AIService();
        let streamedContent = '';
        let streamMode: 'canvas' | 'code' | 'text' = shouldForceCode ? 'code' : shouldForceCanvas ? 'canvas' : 'text';
        let streamLabel = '';
        let streamLanguage = 'html';
        let streamWebSources: any[] = [];
        let streamingMessageId: string | null = null;
        
        await aiService.sendMessageStreaming(
          aiMessages,
          profile,
          shouldForceCanvas,
          shouldForceCode,
          // onStart - open canvas immediately if canvas/code mode, or add placeholder message for text
          async (mode) => {
            streamMode = mode;
            if (mode === 'code' || mode === 'canvas') {
              const { startStreaming } = useCanvasStore.getState();
              startStreaming(mode === 'code' ? 'code' : 'writing', 'html');
            } else {
              // For text, add a streaming message that we'll update
              streamingMessageId = await addMessage({
                content: '▍', // Cursor indicator
                role: 'assistant',
                type: 'text',
              });
            }
          },
          // onDelta - stream content to canvas or update message
          (delta) => {
            streamedContent += delta;
            if (streamMode === 'code' || streamMode === 'canvas') {
              const { streamContent } = useCanvasStore.getState();
              streamContent(delta);
            } else if (streamingMessageId) {
              // Update the streaming message with accumulated content
              const { editMessage } = useArcStore.getState();
              editMessage(streamingMessageId, streamedContent + '▍');
            }
          },
          // onDone - finalize
          async (result) => {
            streamLabel = result.label || '';
            streamLanguage = result.language || 'html';
            streamWebSources = result.webSources || [];
            
            // Determine memory action
            let memoryAction: any = undefined;
            if (streamWebSources.length > 0) {
              memoryAction = { type: 'web_searched' as const, sources: streamWebSources, query: userMessage };
            }
            
            if (result.mode === 'code') {
              const { setAIWriting, setCodeLanguage } = useCanvasStore.getState();
              setAIWriting(false);
              setCodeLanguage(result.language || 'html');
              // Save to history
              await upsertCodeMessage(result.content, result.language || 'html', result.label, memoryAction);
            } else if (result.mode === 'canvas') {
              const { setAIWriting } = useCanvasStore.getState();
              setAIWriting(false);
              await upsertCanvasMessage(result.content, result.label, memoryAction);
            } else if (streamingMessageId) {
              // Update the final content without cursor
              const { editMessage, updateMessageMemoryAction } = useArcStore.getState();
              editMessage(streamingMessageId, result.content);
              if (memoryAction) {
                updateMessageMemoryAction(streamingMessageId, memoryAction);
              }
            }
            
            // Persist to session for canvas/code
            if (result.mode === 'code' || result.mode === 'canvas') {
              const { currentSessionId, updateSessionCanvasContent } = useArcStore.getState();
              if (currentSessionId) {
                await updateSessionCanvasContent(currentSessionId, result.content);
              }
            }
          },
          // onError
          (errorMsg) => {
            if (streamMode === 'code' || streamMode === 'canvas') {
              const { setAIWriting } = useCanvasStore.getState();
              setAIWriting(false);
            }
            if (streamingMessageId) {
              // Update message with error
              const { editMessage } = useArcStore.getState();
              editMessage(streamingMessageId, 'Sorry, I encountered an error. Please try again.');
            }
            toast({ title: "Error", description: errorMsg, variant: "destructive" });
          },
          currentSessionId || undefined,
          wasSearchMode && !shouldForceCode && !shouldForceCanvas
        );
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
        {/* LEFT BUTTON — Image/Code/Canvas mode indicator or + menu */}
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={
            shouldShowBanana
              ? "Disable image mode"
              : shouldShowCodeMode
              ? "Disable code mode"
              : shouldShowCanvasMode
              ? "Disable canvas mode"
              : shouldShowSearchMode
              ? "Disable search mode"
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
              : shouldShowCanvasMode
              ? "!bg-purple-500/20 ring-1 ring-purple-400/50 !shadow-[0_0_24px_rgba(168,85,247,0.25)]"
              : shouldShowSearchMode
              ? "!bg-orange-500/20 ring-1 ring-orange-400/50 !shadow-[0_0_24px_rgba(251,146,60,0.25)]"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          onClick={() => {
            if (shouldShowBanana) {
              setForceImageMode(false);
              // Clear input if it's just the prefix
              if (/^(image|draw|create)\/\s*$/i.test(inputValue) || /^\/(image|draw|create)\s*$/i.test(inputValue)) setInputValue("");
            } else if (shouldShowCodeMode) {
              setForceCodingMode(false);
              // Clear input if it's just the prefix
              if (/^code\/\s*$/i.test(inputValue) || /^\/code\s*$/i.test(inputValue)) setInputValue("");
            } else if (shouldShowCanvasMode) {
              setForceCanvasMode(false);
              // Clear input if it's just the prefix
              if (/^write\/\s*$/i.test(inputValue) || /^\/(write|canvas)\s*$/i.test(inputValue)) setInputValue("");
            } else if (shouldShowSearchMode) {
              setForceSearchMode(false);
              // Clear input if it's just the prefix
              if (/^search\/\s*$/i.test(inputValue) || /^\/search\s*$/i.test(inputValue)) setInputValue("");
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
          ) : shouldShowCanvasMode ? (
            <>
              <PenLine className="h-5 w-5 text-purple-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">
                ×
              </span>
            </>
          ) : shouldShowSearchMode ? (
            <>
              <Globe className="h-5 w-5 text-orange-400" />
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
            placeholder={selectedImages.length > 0 ? "Add something..." : shouldShowBanana ? "Describe your image..." : shouldShowCodeMode ? "Describe what to build..." : shouldShowCanvasMode ? "What should I write..." : shouldShowSearchMode ? "Search the web..." : "Ask"}
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
              className="fixed z-[9999] flex items-center justify-center px-4"
              style={{
                bottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
                left: 0,
                right: 0,
              }}
            >
              <div className="flex flex-col items-stretch gap-2 w-full max-w-lg">
                {/* Top row - Research Mode card */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInputValue("");
                    // Open Research Mode (blank search canvas)
                    openSearchMode();
                    textareaRef.current?.focus();
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black border border-orange-400/50 text-orange-400 hover:bg-orange-500/20 transition-colors shadow-xl"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-medium">Research Mode</span>
                </button>

                {/* Bottom row - Slash commands */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setInputValue("image/");
                      textareaRef.current?.focus();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black border border-green-400/50 text-green-400 hover:bg-green-500/20 transition-colors shadow-xl"
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
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black border border-blue-400/50 text-blue-400 hover:bg-blue-500/20 transition-colors shadow-xl"
                >
                  <Code2 className="h-4 w-4" />
                  <span className="text-sm font-medium">code/</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setForceCanvasMode(true);
                    setInputValue("write/ ");
                    textareaRef.current?.focus();
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black border border-purple-400/50 text-purple-400 hover:bg-purple-500/20 transition-colors shadow-xl"
                >
                  <PenLine className="h-4 w-4" />
                  <span className="text-sm font-medium">write/</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInputValue("search/");
                    textareaRef.current?.focus();
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black border border-cyan-400/50 text-cyan-400 hover:bg-cyan-500/20 transition-colors shadow-xl"
                >
                  <Globe className="h-4 w-4" />
                  <span className="text-sm font-medium">search/</span>
                </button>
                  {/* Dismiss button */}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setInputValue("");
                      textareaRef.current?.focus();
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 sm:w-10 sm:h-10 rounded-xl sm:rounded-full bg-black border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors shadow-xl"
                  >
                    <X className="h-4 w-4" />
                    <span className="text-sm font-medium sm:hidden">Dismiss</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>,
          portalRoot
        )}

        {/* Brain Icon Toggle - cycles through model tiers */}
        <button
          onClick={async (e) => {
            // Define model tiers for each provider
            const geminiTiers = ['google/gemini-3-flash-preview', 'google/gemini-3-pro-preview'];
            const gptTiers = ['openai/gpt-5-nano', 'openai/gpt-5.2', 'openai/gpt-5'];
            
            const currentTiers = modelProvider === 'gpt' ? gptTiers : geminiTiers;
            const currentIndex = currentTiers.indexOf(sessionModel);
            const nextIndex = (currentIndex + 1) % currentTiers.length;
            const newModel = currentTiers[nextIndex];
            
            try {
              // Get button center position for popup
              const rect = e.currentTarget.getBoundingClientRect();

              // Update sessionStorage so the model is actually used for API calls
              sessionStorage.setItem('arc_session_model', newModel);
              setSessionModel(newModel);

              // Update profile for UI persistence (optional)
              await updateProfile({ preferred_model: newModel });

              // Determine tier name based on model
              let tierName = 'Quick';
              if (newModel === 'google/gemini-3-pro-preview' || newModel === 'openai/gpt-5') {
                tierName = 'Wise & Thoughtful';
              } else if (newModel === 'openai/gpt-5.2') {
                tierName = 'Smarter & Quick';
              }

              // Show bouncy popup from brain icon
              showPopup(tierName, rect.left + rect.width / 2, rect.top + rect.height / 2);
            } catch (e) {
              console.error("Failed to toggle model:", e);
            }
          }}
          className={[
            "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
            // Highlight when using Pro/Wise tier
            (sessionModel === "google/gemini-3-pro-preview" || sessionModel === "openai/gpt-5")
              ? "!bg-primary/20 text-primary ring-2 ring-primary !shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
              : sessionModel === "openai/gpt-5.2"
                ? "!bg-primary/10 text-primary ring-1 ring-primary/50"
                : "text-muted-foreground hover:text-foreground",
            // Hide on mobile when typing (isActive), show on desktop always
            isActive ? "hidden sm:flex" : "flex",
          ].join(" ")}
          aria-label="Toggle AI model"
          title={
            sessionModel === "google/gemini-3-pro-preview" || sessionModel === "openai/gpt-5" 
              ? "Wise & Thoughtful" 
              : sessionModel === "openai/gpt-5.2" 
                ? "Smarter & Quick" 
                : "Quick"
          }
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
                ? "!bg-white/90 text-black ring-2 ring-white/60 hover:!bg-white !shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                : "!bg-primary/80 text-primary-foreground ring-2 ring-primary !shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
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
                    <div className="relative flex items-center justify-center gap-0.5 sm:gap-1 h-36 sm:h-44 max-w-2xl mx-auto">
                      {/* Quick Prompts - Far left */}
                      <motion.button
                        initial={{ opacity: 0, y: 40, rotate: -15, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: -15,
                          scale: 1,
                        }}
                        exit={{ opacity: 0, y: 20, rotate: -15, scale: 0.95 }}
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
                        className="group rounded-2xl glass-shimmer ring-[0.5px] ring-violet-500/60 px-2 py-4 sm:px-3 sm:py-5 hover:scale-105 hover:rotate-0 hover:z-30 active:scale-95 w-20 h-32 sm:w-28 sm:h-40 !shadow-[0_8px_32px_rgba(0,0,0,.2),0_0_12px_rgba(139,92,246,.2)]"
                        style={{ transformOrigin: "bottom center" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 h-full">
                          <span className="inline-flex h-8 w-8 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-violet-500/15 shrink-0 glass-shimmer ring-[0.5px] ring-violet-500/40">
                            <Sparkles className="h-4 w-4 sm:h-6 sm:w-6 text-violet-500" />
                          </span>
                          <div className="text-[10px] sm:text-sm font-semibold">Prompts</div>
                        </div>
                      </motion.button>

                      {/* Research Mode - Second left */}
                      <motion.button
                        initial={{ opacity: 0, y: 40, rotate: -5, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: -5,
                          scale: 1,
                        }}
                        exit={{ opacity: 0, y: 20, rotate: -5, scale: 0.95 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 550,
                          mass: 0.4,
                        }}
                        onClick={() => {
                          setShowMenu(false);
                          openSearchMode();
                        }}
                        className="group rounded-2xl glass-shimmer ring-[0.5px] ring-orange-500/60 px-2 py-4 sm:px-3 sm:py-5 hover:scale-105 hover:rotate-0 hover:z-30 active:scale-95 w-20 h-32 sm:w-28 sm:h-40 !shadow-[0_8px_32px_rgba(0,0,0,.2),0_0_12px_rgba(249,115,22,.2)]"
                        style={{ transformOrigin: "bottom center" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 h-full">
                          <span className="inline-flex h-8 w-8 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-orange-500/15 shrink-0 glass-shimmer ring-[0.5px] ring-orange-500/40">
                            <Search className="h-4 w-4 sm:h-6 sm:w-6 text-orange-400" />
                          </span>
                          <div className="text-[10px] sm:text-sm font-semibold">Research</div>
                        </div>
                      </motion.button>

                      {/* Generate Image - Second right */}
                      <motion.button
                        initial={{ opacity: 0, y: 40, rotate: 5, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: 5,
                          scale: 1,
                        }}
                        exit={{ opacity: 0, y: 20, rotate: 5, scale: 0.95 }}
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
                        className="group rounded-2xl glass-shimmer ring-[0.5px] ring-green-500/60 px-2 py-4 sm:px-3 sm:py-5 hover:scale-105 hover:rotate-0 hover:z-30 active:scale-95 w-20 h-32 sm:w-28 sm:h-40 z-10 !shadow-[0_8px_32px_rgba(0,0,0,.2),0_0_12px_rgba(34,197,94,.2)]"
                        style={{ transformOrigin: "bottom center" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 h-full">
                          <span className="inline-flex h-8 w-8 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-green-500/15 shrink-0 glass-shimmer ring-[0.5px] ring-green-500/40">
                            <ImagePlus className="h-4 w-4 sm:h-6 sm:w-6 text-green-400" />
                          </span>
                          <div className="text-[10px] sm:text-sm font-semibold">Image</div>
                        </div>
                      </motion.button>

                      {/* Attach - Far right */}
                      <motion.button
                        initial={{ opacity: 0, y: 40, rotate: 15, scale: 0.9 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: 15,
                          scale: 1,
                        }}
                        exit={{ opacity: 0, y: 20, rotate: 15, scale: 0.95 }}
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
                        className="group rounded-2xl glass-shimmer ring-[0.5px] ring-blue-500/60 px-2 py-4 sm:px-3 sm:py-5 hover:scale-105 hover:rotate-0 hover:z-30 active:scale-95 w-20 h-32 sm:w-28 sm:h-40 !shadow-[0_8px_32px_rgba(0,0,0,.2),0_0_12px_rgba(59,130,246,.2)]"
                        style={{ transformOrigin: "bottom center" }}
                      >
                        <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2 h-full">
                          <span className="inline-flex h-8 w-8 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-blue-500/15 shrink-0 glass-shimmer ring-[0.5px] ring-blue-500/40">
                            <Paperclip className="h-4 w-4 sm:h-6 sm:w-6 text-blue-500" />
                          </span>
                          <div className="text-[10px] sm:text-sm font-semibold">Attach</div>
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
