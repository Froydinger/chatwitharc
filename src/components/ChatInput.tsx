// src/components/ChatInput.tsx
import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { X, Paperclip, ArrowRight, Sparkles, ImagePlus, Mic, Code2, PenLine, Search, Globe, Square, Lightbulb, Rocket, FileText, ListPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { useFingerPopup } from "@/hooks/use-finger-popup";
import { useProfile } from "@/hooks/useProfile";
import { useAccentColor } from "@/hooks/useAccentColor";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { AIService } from "@/services/ai";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useStreamingWithContinuation } from "@/hooks/useStreamingWithContinuation";
import { detectMemoryCommand, addToMemoryBank } from "@/utils/memoryDetection";
import { addContextBlockDirect } from "@/hooks/useContextBlocks";
import { PromptLibrary } from "@/components/PromptLibrary";
import { getAllPromptsFlat } from "@/utils/promptGenerator";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useSearchStore } from "@/store/useSearchStore";
import { useVoiceModeStore } from "@/store/useVoiceModeStore";
import { cn } from "@/lib/utils";
import { useMessageQueueStore } from "@/store/useMessageQueueStore";
import { MessageQueue } from "@/components/MessageQueue";

// Global cancellation flag and AbortController
let cancelRequested = false;
let currentAbortController: AbortController | null = null;

export const cancelCurrentRequest = () => {
  cancelRequested = true;
  // Abort any ongoing fetch request FIRST to prevent more data arriving
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  const store = useArcStore.getState();
  store.setLoading(false);
  store.setGeneratingImage(false);
  store.setSearchingChats(false);
  store.setAccessingMemory(false);
  store.setSearchingWeb(false);
  
  // Also stop canvas AI writing state
  const canvasStore = useCanvasStore.getState();
  if (canvasStore.isAIWriting) {
    canvasStore.setAIWriting(false);
  }
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
  if (/^(image|draw|create)\//.test(m) || /^\/(image|draw|create)\b/.test(m)) return true;
  // Natural language detection for image generation requests
  // Supports: "generate an image of...", "draw me a cat", "make me a picture of...", "can you create an image of..."
  if (/^(can\s+you\s+)?(please\s+)?(generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration|artwork|graphic|icon|logo|wallpaper|poster|banner|thumbnail)/i.test(m)) return true;
  // "draw me a [subject]" or "paint me a [subject]" - drawing/painting implies visual
  if (/^(can\s+you\s+)?(please\s+)?(draw|paint|sketch)\s+(me\s+)?(a|an|the|some)\s+/i.test(m)) return true;
  // Broader match: verb + optional "me" + image word anywhere in short messages
  if (/\b(generate|create|make|draw|paint)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration)\b/i.test(m) && m.length < 200) return true;
  return false;
}

// Prefix-based detection: code/ OR /code — opens code canvas (inline code block), NOT the IDE
function checkForCodingRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support both code/ and /code syntax — prefix only, no natural language
  if (/^code\//.test(m) || /^\/code\b/.test(m)) return true;
  return false;
}

// Prefix-based detection: build/ OR /build — navigates to App Builder IDE
function checkForBuildRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (/^build\//.test(m) || /^\/build\b/.test(m)) return true;
  return false;
}

// Prefix-based detection: write/, /write, /canvas
function checkForCanvasRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support write/, /write, and /canvas
  if (/^write\//.test(m) || /^\/(write|canvas)\b/.test(m)) return true;
  // Natural language detection: "write me an essay", "draft a letter", "compose a poem"
  if (/^(can\s+you\s+)?(please\s+)?(write|draft|compose|author)\s+(me\s+)?(a|an|the)\s+/i.test(m)) return true;
  return false;
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

// Smart detection for natural language code/canvas requests (without requiring / prefix)
function looksLikeNaturalCodeRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  
  // Skip if it's conversational
  if (isConversationalMessage(m)) return false;
  
  // Patterns that strongly indicate code generation intent
  const codePatterns = [
    /^(build|create|make|code|develop|write)\s+(me\s+)?(a|an|the)?\s*(website|webpage|web page|app|application|landing page|dashboard|form|calculator|game|tool|component|ui|interface)/i,
    /^(can you|could you|please)?\s*(build|create|make|code|develop|write)\s+(me\s+)?(a|an|the)?\s*(website|webpage|web page|app|application|landing page|dashboard|form|calculator|game|tool|component|ui|interface)/i,
    /^(i need|i want)\s+(a|an|the)?\s*(website|webpage|web page|app|application|landing page|dashboard|form|calculator|game|tool|component|ui|interface)/i,
  ];
  
  return codePatterns.some(p => p.test(m));
}

function looksLikeNaturalCanvasRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  
  // Skip if it's conversational
  if (isConversationalMessage(m)) return false;
  
  // Patterns that strongly indicate writing/canvas intent
  const canvasPatterns = [
    /^(write|compose|draft|create)\s+(me\s+)?(a|an|the)?\s*(poem|essay|article|blog|story|letter|email|script|speech|song|lyrics|haiku|limerick|sonnet)/i,
    /^(can you|could you|please)?\s*(write|compose|draft|create)\s+(me\s+)?(a|an|the)?\s*(poem|essay|article|blog|story|letter|email|script|speech|song|lyrics|haiku|limerick|sonnet)/i,
    /^(i need|i want)\s+(a|an|the)?\s*(poem|essay|article|blog|story|letter|email|script|speech|song|lyrics)/i,
  ];
  
  return canvasPatterns.some(p => p.test(m));
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
    .replace(/^(image|draw|create|code|write|search|build)\/\s*/i, "")
    .replace(/^\/(image|draw|create|code|write|canvas|search|build)\s*/i, "")
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
  inline?: boolean;
};

export interface ChatInputRef {
  handleImageUploadFiles: (files: File[]) => void;
  focusInput: () => void;
}

export const ChatInput = forwardRef<ChatInputRef, Props>(function ChatInput({ onImagesChange, rightPanelOpen = false, inline = false }, ref) {
  useProfile();
  const portalRoot = useSafePortalRoot();
  const { toast } = useToast();
  const showPopup = useFingerPopup((state) => state.showPopup);
  const { user } = useAuth();
  const subscription = useSubscription();
  const isGuestMode = !user;

  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, isGeneratingImage, setGeneratingImage, editMessage, setSearchingChats, setAccessingMemory, setSearchingWeb, updateMessageMemoryAction, upsertCanvasMessage, upsertCodeMessage } =
    useArcStore();
  const { profile, updateProfile } = useProfile();
  const { accentColor } = useAccentColor();
  const { openSearchMode } = useSearchStore();
  const { streamWithContinuation } = useStreamingWithContinuation();

  // Subscribe to canvas store reactively for auto-mode indicator when canvas is open
  // Use individual selectors for reliable re-renders when canvas open state changes
  const isWriteCanvasOpen = useCanvasStore(
    (s) => s.isOpen && s.canvasType === 'writing'
  );

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]); // Store object URLs
  const [allImagesEditMode, setAllImagesEditMode] = useState(false); // Single toggle for all images
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]); // Document files (PDF, DOCX, etc.)
  const [isActive, setIsActive] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Ref to always point to latest handleExternalImageEdit (avoids stale closures in event listeners)
  const handleExternalImageEditRef = useRef<(...args: any[]) => void>(() => {});

  // Tiles menu
  const [showMenu, setShowMenu] = useState(false);
   const menuButtonRef = useRef<HTMLButtonElement>(null);
   const inputBarRef = useRef<HTMLDivElement>(null);
  const modelLabelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const shouldShowBuildMode = !!inputValue && checkForBuildRequest(inputValue);

  // When a /write canvas is open, auto-show canvas mode indicator so user knows
  // their messages will modify the canvas (not go to chat)
  const showCanvasIndicator = shouldShowCanvasMode || isWriteCanvasOpen;
  // Auto mode = indicator is shown because canvas is open, not from explicit /write prefix
  const isCanvasAutoMode = isWriteCanvasOpen && !shouldShowCanvasMode;


  // Show slash picker when user types just "/"
  const showSlashPicker = inputValue.trim() === "/";

  // Handle /research command to open research mode
  useEffect(() => {
    const val = inputValue.trim().toLowerCase();
    if (val === "/research") {
      setInputValue("");
      openSearchMode();
    }
  }, [inputValue, openSearchMode]);

  // Voice mode store
  const { activateVoiceMode } = useVoiceModeStore();
  
  // Navigation (for activating voice from non-chat pages like Dashboard)
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";

  // Textarea auto-resize with cursor position preservation
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPositionRef = useRef<number | null>(null);

  // Expose handleImageUploadFiles and focusInput via ref
  useImperativeHandle(ref, () => ({
    handleImageUploadFiles: (files: File[]) => {
      handleUploadFiles(files);
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

  // Supported document MIME types
  const DOCUMENT_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'text/plain',
    'text/markdown',
    'text/html',
    'text/csv',
    'application/json',
    'application/xml',
    'text/xml',
  ];

  const isDocumentFile = (file: File) => DOCUMENT_TYPES.includes(file.type) || /\.(pdf|docx|pptx|xlsx|txt|md|html|csv|json|xml)$/i.test(file.name);

  // File input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleUploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleUploadFiles = (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    const docs = files.filter((f) => !f.type.startsWith("image/") && isDocumentFile(f));

    if (images.length > 0) {
      const max = 14;
      setSelectedImages((prev) => {
        const merged = [...prev, ...images].slice(0, max);
        if (merged.length >= max && images.length > 0 && merged.length > prev.length) {
          toast({ title: "Max images", description: `Up to ${max} images supported`, variant: "default" });
        }
        return merged;
      });
    }

    if (docs.length > 0) {
      // Max 3 documents at a time
      setSelectedDocuments((prev) => {
        const merged = [...prev, ...docs].slice(0, 3);
        if (merged.length >= 3 && docs.length > 0 && merged.length > prev.length) {
          toast({ title: "Max documents", description: "Up to 3 documents supported at a time", variant: "default" });
        }
        return merged;
      });
    }

    // Warn about unsupported files
    const unsupported = files.filter(f => !f.type.startsWith("image/") && !isDocumentFile(f));
    if (unsupported.length > 0) {
      toast({ title: "Unsupported file type", description: `${unsupported[0].name} is not supported. Try PDF, DOCX, PPTX, XLSX, TXT, CSV, JSON, or images.`, variant: "destructive" });
    }
  };
  // Keep old name for backward compat with imperative handle
  const handleImageUploadFiles = handleUploadFiles;
  const removeImage = (idx: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== idx));
  };
  const removeDocument = (idx: number) => {
    setSelectedDocuments((prev) => prev.filter((_, i) => i !== idx));
  };
  const clearSelected = () => {
    setSelectedImages([]);
    setImagePreviewUrls([]);
    setAllImagesEditMode(false);
    setSelectedDocuments([]);
  };

  // Global drag & drop handlers — attach to document so overlay covers full screen
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) setIsDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) handleUploadFiles(files);
    };
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems.map((item) => item.getAsFile()).filter(Boolean) as File[];
      if (files.length > 0) handleUploadFiles(files);
    }
  }, []);

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
      handleExternalImageEditRef.current(e.detail.content, e.detail.baseImageUrl, e.detail.editInstruction, e.detail.imageModel, e.detail.additionalImages);
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
    // Read fresh from store to avoid stale closure issues
    if (useArcStore.getState().isGeneratingImage) return;
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
      const errMsg = err?.message || 'Image editing failed. Please try again.';
      await replaceLastMessage({
        content: errMsg,
        role: "assistant",
        type: "text",
      });
    } finally {
      setGeneratingImage(false);
    }
  };

  // Keep ref in sync so event listeners always call the latest version
  handleExternalImageEditRef.current = handleExternalImageEdit;


  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride ?? inputValue;
    if ((!messageToSend.trim() && selectedImages.length === 0 && selectedDocuments.length === 0) || isLoading) return;

    // Guest mode: check if limit reached
    if (isGuestMode) {
      const guestCount = parseInt(localStorage.getItem('arcai-guest-messages') || '0', 10);
      if (guestCount >= 15) {
        // Dispatch event to show signup prompt
        window.dispatchEvent(new CustomEvent('arcai:guestMessageSent'));
        return;
    }

    // Authenticated user: check daily message limit
    if (user && !subscription.canSendMessage) {
      toast({
        title: "Daily message limit reached",
        description: "Upgrade to ArcAi Pro for unlimited messages.",
        variant: "destructive",
      });
      return;
    }
    }

    const userMessage = messageToSend.trim();
    const images = [...selectedImages];
    const documents = [...selectedDocuments];
    // Capture mode states BEFORE clearing UI (they're needed in handleSendMessage)
    const wasCanvasMode = shouldShowCanvasMode || checkForCanvasRequest(userMessage);
    const wasCodingMode = shouldShowCodeMode || checkForCodingRequest(userMessage);
    const wasImageMode = shouldShowBanana || checkForImageRequest(userMessage);
    const wasSearchMode = shouldShowSearchMode || checkForSearchRequest(userMessage);
    const wasBuildMode = checkForBuildRequest(userMessage);

    // Clear UI promptly
    setInputValue("");
    setSelectedImages([]);
    setSelectedDocuments([]);
    setForceImageMode(false);
    setForceCodingMode(false);
    setForceCanvasMode(false);
    setForceSearchMode(false);
    setShowMenu(false);

    // BUILD MODE: /build navigates to the App Builder
    if (wasBuildMode) {
      const buildPrompt = extractPrefixPrompt(userMessage);
      // Navigate to App Builder — the prompt will be handled there
      navigate(buildPrompt ? `/apps?prompt=${encodeURIComponent(buildPrompt)}` : '/apps');
      return;
    }

    // Search mode (/search) - now does a regular web search in chat (NOT Research Mode)
    // Research Mode is opened separately via the button
    // We set forceWebSearch flag so the chat API always does a web search

    // Reset cancellation flag
    cancelRequested = false;
    setLoading(true);

    // Track message usage
    if (isGuestMode) {
      window.dispatchEvent(new CustomEvent('arcai:guestMessageSent'));
    } else if (user) {
      subscription.recordMessage();
    }

    try {
      const ai = new AIService();

      // Guest mode restrictions: only basic text chat
      if (isGuestMode && (images.length > 0 || documents.length > 0 || wasCanvasMode || wasCodingMode || wasImageMode)) {
        await addMessage({ content: userMessage || "Sent message", role: "user", type: "text" });
        await addMessage({
          content: "✨ Image generation, canvas, code, and document analysis features are available when you create a free account! Sign up to unlock all of Arc's capabilities.",
          role: "assistant",
          type: "text"
        });
        setLoading(false);
        return;
      }

      // With Documents -> analyze
      if (documents.length > 0) {
        await addMessage({
          content: userMessage || `Analyzing ${documents.length} document${documents.length > 1 ? 's' : ''}: ${documents.map(d => d.name).join(', ')}`,
          role: "user",
          type: "text",
        });

        try {
          for (const doc of documents) {
            const fileData = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error("Failed to read file"));
              reader.readAsDataURL(doc);
            });

            const analysisPrompt = userMessage || `Analyze and summarize this document: ${doc.name}`;
            const response = await ai.sendMessageWithDocument(
              [{ role: "user", content: analysisPrompt }],
              fileData,
              doc.name,
              doc.type || 'application/octet-stream'
            );
            await addMessage({ content: response, role: "assistant", type: "text" });
          }
        } catch (err: any) {
          toast({ title: "Error", description: err?.message || "Failed to analyze document", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze the document. Please try again.",
            role: "assistant",
            type: "text",
          });
        }
        return;
      }

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
            const errMsg = err?.message || 'Image editing failed. Please try again.';
            await replaceLastMessage({
              content: errMsg,
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
          const errMsg = err?.message || 'Image generation failed. Please try again.';
          await replaceLastMessage({
            content: errMsg,
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
        return;
      }

      // Auto-detect follow-up image edit: if last assistant message was an image
      // and the user's message looks like an edit directive, route to image edit
      if (!wasCanvasMode && !wasCodingMode && !wasSearchMode) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.type === 'image' && lastMsg.imageUrl && isImageEditRequest(userMessage)) {
          // Route as image edit against the last generated/edited image
          await addMessage({ content: userMessage, role: "user", type: "text" });
          await addMessage({
            content: `Editing image: ${userMessage}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt: userMessage,
          });
          setGeneratingImage(true);

          try {
            const editedUrl = await ai.editImage(userMessage, [lastMsg.imageUrl]);
            let finalUrl = editedUrl;
            try {
              const resp = await fetch(editedUrl);
              const blob = await resp.blob();
              const { data: { user } } = await supabase.auth.getUser();
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
            const errMsg = err?.message || 'Image editing failed. Please try again.';
            await replaceLastMessage({
              content: errMsg,
              role: "assistant",
              type: "text",
            });
          } finally {
            setGeneratingImage(false);
          }
          return;
        }
      }

      // Plain text - Show message IMMEDIATELY, then do memory detection in background
      let didSearchChats = false;
      
      // Add user message RIGHT AWAY for instant feedback
      const userMessageId = await addMessage({ 
        content: userMessage, 
        role: "user", 
        type: "text"
      });

      // Memory detection is now handled server-side via the AI's save_memory tool
      // The AI dynamically decides what to remember and saves to context_blocks

      try {
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));

        // Strip the code/ prefix if present
        const isCodingRequest = wasCodingMode;

        const canvasState = useCanvasStore.getState();

        // CODE MODE: /code now produces inline code blocks via the normal AI flow
        // (no longer opens IDE — use /build for that)
        // The isCodingRequest flag flows through to forceCode below

        // When writing canvas is open, default to routing there unless the message
        // is clearly conversational (e.g. "nice!", "thanks", "how does this work?")
        const shouldRouteToCanvas =
          wasCanvasMode ||
          (canvasState.isOpen && canvasState.canvasType === 'writing' && !isConversationalMessage(userMessage));

        // Check if code canvas is open and user is asking to edit it.
        // Also auto-open the canvas from the last code message in chat if it isn't open yet,
        // so follow-up messages work without requiring the user to click the code card first.
        let isCodeCanvasOpen = canvasState.isOpen && canvasState.canvasType === 'code';
        if (!isCodeCanvasOpen && looksLikeCodeEditRequest(userMessage)) {
          const recentMsgs = useArcStore.getState().messages;
          // First: look for a dedicated code tile message (type === 'code')
          const lastCodeMsg = [...recentMsgs].reverse().find(m => (m as any).type === 'code');
          if (lastCodeMsg) {
            const codeContent = (lastCodeMsg as any).codeContent || '';
            const codeLang = (lastCodeMsg as any).codeLanguage || 'html';
            useCanvasStore.getState().openWithContent(codeContent, 'code', codeLang);
            isCodeCanvasOpen = true;
          } else {
            // Fallback: scan recent assistant text messages for fenced code blocks
            const recentTextMsgs = [...recentMsgs]
              .reverse()
              .filter(m => m.role === 'assistant' && (m as any).type === 'text')
              .slice(0, 5);
            for (const msg of recentTextMsgs) {
              const match = msg.content.match(/```(\w+)?\n([\s\S]+?)```/);
              if (match) {
                const codeLang = match[1] || 'html';
                const codeContent = match[2] || '';
                if (codeContent.trim().length > 50) {
                  useCanvasStore.getState().openWithContent(codeContent, 'code', codeLang);
                  isCodeCanvasOpen = true;
                  break;
                }
              }
            }
          }
        }
        const shouldRouteToCodeCanvas = isCodeCanvasOpen && looksLikeCodeEditRequest(userMessage);

        // Re-read canvas state after potential openWithContent call above
        const freshCanvasState = useCanvasStore.getState();

        const cleanedMessage = extractPrefixPrompt(userMessage);

        // Build the message to send to AI
        let messageToSend: string;

        if (shouldRouteToCodeCanvas && freshCanvasState.content) {
          // Code canvas is open and user wants to modify existing code
          const existingCode = freshCanvasState.content;
          const language = freshCanvasState.codeLanguage || 'html';
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CODE: The user has existing ${language} code. Modify it based on their request using the update_code tool. You MUST output the COMPLETE, FULL modified code - do NOT truncate, summarize, or cut off mid-way. Write EVERY line.

EXISTING CODE TO MODIFY:
\`\`\`${language}
${existingCode}
\`\`\`

USER'S REQUEST: ${cleanedMessage || userMessage}

MANDATORY: Output the COMPLETE updated code. Never stop mid-sentence or mid-function. Include ALL code from start to finish.`;
        } else if (shouldRouteToCanvas && freshCanvasState.isOpen && freshCanvasState.content) {
          // Writing canvas is open with existing content - include it for modification
          const existingContent = freshCanvasState.content;
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: The user has existing writing in the canvas. Modify it based on their request using the update_canvas tool. You MUST output the COMPLETE, FULL modified markdown content - do NOT truncate, summarize, or cut off mid-way. Write EVERY paragraph.

EXISTING CANVAS CONTENT TO MODIFY:
${existingContent}

USER'S REQUEST: ${cleanedMessage || userMessage}

MANDATORY: Output the COMPLETE updated content. Never stop mid-sentence or mid-paragraph. Include ALL content from start to finish.`;
        } else if (shouldRouteToCanvas) {
          // New canvas request (no existing content)
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: Use the update_canvas tool to write COMPLETE, FULL markdown content for this request. Do NOT truncate, summarize, or cut short. Write the ENTIRE piece from beginning to end - every paragraph, every section, complete thoughts. Never stop mid-sentence:\n\n${cleanedMessage || userMessage}`;
        } else if (wasSearchMode) {
          messageToSend = `Search the web for: ${cleanedMessage || userMessage}`;
        } else if (isCodeCanvasOpen && freshCanvasState.content && !isConversationalMessage(userMessage)) {
          // Code canvas is open and user isn't explicitly asking to edit, but also not conversational
          // Only provide code context for messages that might be related to the code
          const existingCode = freshCanvasState.content;
          const language = freshCanvasState.codeLanguage || 'html';
          messageToSend = `${cleanedMessage || userMessage}

[CONTEXT: The user has a Code Canvas open with the following ${language} code. ONLY modify this code if the user is explicitly asking for changes. For casual conversation like "great!", "looks good", questions about how something works, etc. - just respond conversationally WITHOUT updating the code.]

Current code (${existingCode.split('\n').length} lines):
\`\`\`${language}
${existingCode}
\`\`\``;
        } else {
          // Conversational message or no canvas - just send as-is
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

        // For canvas/code: use streaming with auto-continuation
        // For regular text chat: use non-streaming (handles web search properly)
        if (shouldForceCode || shouldForceCanvas) {
          // STREAMING MODE - for canvas/code generation
          let streamedContent = '';
          let streamMode: 'canvas' | 'code' | 'text' = shouldForceCode ? 'code' : 'canvas';
          
          // Create AbortController for this request
          currentAbortController = new AbortController();
          const abortSignal = currentAbortController.signal;
          
          await streamWithContinuation({
            messages: aiMessages,
            profile,
            forceCanvas: shouldForceCanvas,
            forceCode: shouldForceCode,
            sessionId: currentSessionId || undefined,
            forceWebSearch: false, // No web search in canvas/code mode
            abortSignal,
            maxContinuations: 3, // Allow up to 3 auto-continuations for long code

            // onStart - just track the mode, don't open canvas yet
            onStart: async (mode) => {
              streamMode = mode;
              console.log(`🔄 Code generation started in ${mode} mode`);
            },

            // onDelta - accumulate content but DON'T stream to canvas (user wants no streaming)
            onDelta: (delta) => {
              if (cancelRequested || abortSignal.aborted) return; // Stop accumulating if cancelled
              streamedContent += delta;
            },
            
            // onContinuing - show toast when auto-continuation kicks in
            onContinuing: () => {
              toast({ 
                title: "Continuing generation...", 
                description: "Code was incomplete, automatically continuing where it left off.",
                variant: "default"
              });
            },
            
            // onDone - finalize (result includes wasContinued flag)
            onDone: async (result) => {
              // CRITICAL: If cancelled, do NOT add any messages or open canvas
              if (cancelRequested || abortSignal.aborted) return;
              const streamWebSources = result.webSources || [];
              
              // Determine memory action
              let memoryAction: any = undefined;
              if (streamWebSources.length > 0) {
                memoryAction = { type: 'web_searched' as const, sources: streamWebSources, query: userMessage };
              }
              
              // Get the FULL code - prefer streamedContent, fallback to result.content
              const finalContent = streamedContent || result.content || '';
              const lang = result.language || 'html';

              console.log(`✅ Code ready: streamed=${streamedContent.length}, result=${(result.content||'').length}, using=${finalContent.length} chars`);

              if (result.mode === 'code') {
                // Save to history FIRST
                await upsertCodeMessage(finalContent, lang, result.label, memoryAction);

                // Read content back from saved message (same source as tile click)
                const messages = useArcStore.getState().messages;
                const lastCodeMsg = [...messages].reverse().find(m => m.type === 'code');
                const verifiedContent = (lastCodeMsg as any)?.codeContent || finalContent;
                const verifiedLang = (lastCodeMsg as any)?.codeLanguage || lang;

                console.log(`📦 Opening canvas with verified content: ${verifiedContent.length} chars`);

                // Open canvas with verified content from saved message
                const { openWithContent } = useCanvasStore.getState();
                openWithContent(verifiedContent, 'code', verifiedLang);

                if (result.wasContinued) {
                  toast({
                    title: "Code generation complete!",
                    description: "Successfully continued and finished the code.",
                    variant: "default"
                  });
                }
              } else if (result.mode === 'canvas') {
                // Save to history FIRST
                await upsertCanvasMessage(finalContent, result.label, memoryAction);

                // Read content back from saved message
                const messages = useArcStore.getState().messages;
                const lastCanvasMsg = [...messages].reverse().find(m => m.type === 'canvas');
                const verifiedContent = (lastCanvasMsg as any)?.canvasContent || finalContent;

                // Open canvas with verified content
                const { openWithContent } = useCanvasStore.getState();
                openWithContent(verifiedContent, 'writing');
              }
              
              // Persist to session for canvas/code (use streamedContent, not result.content)
              const { currentSessionId, updateSessionCanvasContent } = useArcStore.getState();
              if (currentSessionId) {
                await updateSessionCanvasContent(currentSessionId, streamedContent || result.content);
              }
            },
            
            // onError - just show toast, canvas isn't open yet
            onError: (errorMsg) => {
              if (!abortSignal.aborted) {
                toast({ title: "Error", description: errorMsg, variant: "destructive" });
              }
            }
          });
          
          // Clean up abort controller
          currentAbortController = null;
        } else {
          // NON-STREAMING MODE - for regular text chat (handles web search properly)
          // The ThinkingIndicator component will show while isLoading is true
          // We don't add a placeholder message - the thinking indicator handles UI
          
          try {
            const ai = new AIService();
            const result = await ai.sendMessage(
              aiMessages,
              profile,
              (tools) => {
                // Handle tool usage - show indicator if web search was used
                if (tools.includes('web_search')) {
                  didSearchWeb = true;
                }
              },
              currentSessionId || undefined,
              wasSearchMode, // forceWebSearch
              false, // forceCanvas
              false, // forceCode
              false, // forceResearch
              isGuestMode // guestMode
            );
            
            // CRITICAL: If cancelled while waiting for response, discard everything
            if (cancelRequested) return;
            
            // Determine memory action
            let memoryAction: any = undefined;
            if (result.memorySaved) {
              memoryAction = { type: 'context_saved' as const, content: result.memorySaved.content };
              // Dispatch event so ContextBlocksPanel refreshes
              window.dispatchEvent(new CustomEvent('context-blocks-updated'));
            } else if (result.webSources && result.webSources.length > 0) {
              memoryAction = { type: 'web_searched' as const, sources: result.webSources, query: userMessage };
            }
            
            // Add the complete response as a new message
            await addMessage({
              content: result.content,
              role: 'assistant',
              type: 'text',
              memoryAction
            });
            
            // Handle canvas/code updates if the AI decided to use those tools
            if (result.codeUpdate) {
              const { openCodeCanvas } = useCanvasStore.getState();
              openCodeCanvas(result.codeUpdate.code, result.codeUpdate.language || 'html', result.codeUpdate.label);
              await upsertCodeMessage(result.codeUpdate.code, result.codeUpdate.language || 'html', result.codeUpdate.label);
            } else if (result.canvasUpdate) {
              const { openCanvas } = useCanvasStore.getState();
              openCanvas(result.canvasUpdate.content);
              await upsertCanvasMessage(result.canvasUpdate.content, result.canvasUpdate.label);
            }
          } catch (err: any) {
            // On error, add error message
            await addMessage({
              content: 'Sorry, I encountered an error. Please try again.',
              role: 'assistant',
              type: 'text'
            });
            throw err; // Re-throw to be caught by outer catch
          }
        }
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

  // Auto-send next queued message when loading finishes
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      // Loading just finished - check queue
      const { queue, isPaused, popNext } = useMessageQueueStore.getState();
      if (queue.length > 0 && !isPaused) {
        const next = popNext();
        if (next) {
          setTimeout(() => handleSend(next.content), 500);
        }
      }
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+Enter = add to queue
        if (inputValue.trim()) {
          useMessageQueueStore.getState().addToQueue(inputValue.trim());
          setInputValue("");
        }
      } else {
        handleSend();
      }
    }
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="space-y-4 relative">
      {/* Drag overlay — portaled to body so it escapes any transformed parent */}
      {portalRoot && createPortal(
        <AnimatePresence>
          {isDragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: "fixed", inset: 0, zIndex: 9999 }}
              className="flex items-center justify-center bg-background/90 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 400 }}
                style={{ position: "absolute", inset: 24 }}
                className="rounded-3xl border-2 border-dashed border-primary/60 bg-primary/5 flex flex-col items-center justify-center gap-4 pointer-events-none"
              >
                <div className="rounded-2xl bg-primary/10 p-5">
                  <Paperclip className="h-14 w-14 text-primary" />
                </div>
                <p className="text-2xl font-semibold text-foreground">Drop files here</p>
                <p className="text-base text-muted-foreground">Images, PDFs, DOCX, PPTX, and more</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        portalRoot,
      )}

      {/* Selected Documents preview - for non-inline, portal above dock */}
      {!inline && selectedDocuments.length > 0 && portalRoot && createPortal(
        <div
          className="fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"
          style={{ bottom: selectedImages.length > 0 ? "calc(210px + env(safe-area-inset-bottom, 0px))" : "calc(110px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Documents ({selectedDocuments.length}/3)</span>
              <button onClick={() => setSelectedDocuments([])} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
            </div>
            <div className="flex flex-col gap-2">
              {selectedDocuments.map((doc, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 group">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">{doc.name}</span>
                  <span className="text-xs text-muted-foreground">{(doc.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => removeDocument(i)} className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>,
        portalRoot,
      )}
      {/* Selected Images preview - for non-inline, portal above dock */}
      {!inline && selectedImages.length > 0 && portalRoot && createPortal(
        <div
          className="fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"
          style={{ bottom: "calc(110px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/14)</span>
              <button onClick={clearSelected} className="text-xs text-muted-foreground hover:text-foreground">Clear All</button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {selectedImages.map((f, i) => {
                const url = imagePreviewUrls[i];
                return (
                  <div key={i} className="relative group shrink-0">
                    <img src={url} alt={`sel-${i}`} className="w-16 h-16 object-cover rounded-full border border-border/40" />
                    <button onClick={() => removeImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
            {selectedImages.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border/30">
                <button type="button" onClick={() => setAllImagesEditMode(!allImagesEditMode)} className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-all bg-black text-white hover:bg-black/80">
                  {allImagesEditMode ? `Mode: Edit ✏️` : `Mode: Analyze 🔍`}
                </button>
              </div>
            )}
          </div>
        </div>,
        portalRoot,
      )}

      {/* Input Row */}
      <div ref={inputBarRef} className="chat-input-halo flex items-center gap-3 rounded-full">
        {/* LEFT BUTTON — Image/Code/Canvas mode indicator or + menu */}
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={
            shouldShowBanana
              ? "Disable image mode"
              : shouldShowCodeMode
              ? "Disable code mode"
              : shouldShowBuildMode
              ? "Disable build mode"
              : showCanvasIndicator
              ? (isCanvasAutoMode ? "Writing to canvas" : "Disable canvas mode")
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
              : shouldShowBuildMode
              ? "!bg-amber-500/20 ring-1 ring-amber-400/50 !shadow-[0_0_24px_rgba(245,158,11,0.25)]"
              : showCanvasIndicator
              ? "!bg-purple-500/20 ring-1 ring-purple-400/50 !shadow-[0_0_24px_rgba(168,85,247,0.25)]"
              : shouldShowSearchMode
              ? "!bg-cyan-500/20 ring-1 ring-cyan-400/50 !shadow-[0_0_24px_rgba(34,211,238,0.25)]"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          onClick={() => {
            if (shouldShowBanana) {
              setForceImageMode(false);
              // Clear input if it's just the prefix
              if (/^(image|draw|create)\/\s*$/i.test(inputValue) || /^\/(image|draw|create)\s*$/i.test(inputValue)) setInputValue("");
            } else if (shouldShowCodeMode) {
              setForceCodingMode(false);
              if (/^code\/\s*$/i.test(inputValue) || /^\/code\s*$/i.test(inputValue)) setInputValue("");
            } else if (shouldShowBuildMode) {
              if (/^build\/\s*$/i.test(inputValue) || /^\/build\s*$/i.test(inputValue)) setInputValue("");
            } else if (showCanvasIndicator) {
              if (!isCanvasAutoMode) {
                // Explicit /write mode - allow dismissing
                setForceCanvasMode(false);
                // Clear input if it's just the prefix
                if (/^write\/\s*$/i.test(inputValue) || /^\/(write|canvas)\s*$/i.test(inputValue)) setInputValue("");
              }
              // Auto mode (canvas open) - no-op; close the canvas panel to exit
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
          ) : shouldShowBuildMode ? (
            <>
              <Rocket className="h-5 w-5 text-amber-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">
                ×
              </span>
            </>
          ) : showCanvasIndicator ? (
            <>
              <PenLine className="h-5 w-5 text-purple-400" />
              {!isCanvasAutoMode && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">
                  ×
                </span>
              )}
            </>
          ) : shouldShowSearchMode ? (
            <>
              <Globe className="h-5 w-5 text-cyan-400" />
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
            onPaste={handlePaste}
            onFocus={() => {
              setIsActive(true);
              handleInputFocus();
            }}
            onBlur={() => setIsActive(false)}
            placeholder={selectedImages.length > 0 ? "Add something..." : shouldShowBanana ? "Describe your image..." : shouldShowCodeMode ? "Describe what to code..." : shouldShowBuildMode ? "Describe your app..." : showCanvasIndicator ? (isCanvasAutoMode ? "Describe changes to your writing..." : "What should I write...") : shouldShowSearchMode ? "Search the web..." : "Ask"}
            disabled={isLoading}
            className="!border-0 !bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[24px] max-h-[144px] leading-5 py-1.5 px-4 focus:outline-none focus:ring-0 text-[16px]"
            rows={1}
          />
        </div>
        
        {/* Slash command picker - portaled to escape overflow */}
        {/* Slash command picker - Unified glassy card design */}
        {portalRoot && showSlashPicker && createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              transition={{ type: "spring", damping: 30, stiffness: 700, mass: 0.25 }}
              className={cn(
                "fixed z-[9999] flex items-center justify-center px-4",
                rightPanelOpen && "lg:mr-80 xl:mr-96"
              )}
              style={isDashboard ? {
                top: inputBarRef.current ? inputBarRef.current.getBoundingClientRect().bottom + 12 : 120,
                left: 0,
                right: 0,
              } : {
                bottom: "calc(100px + env(safe-area-inset-bottom, 0px))",
                left: 0,
                right: 0,
              }}
            >
              {/* Compact inline pill bar */}
              <div className={cn(
                "relative flex flex-wrap items-center justify-center gap-1.5 py-2 px-3 rounded-2xl ring-[0.5px] ring-border/40 backdrop-blur-xl max-w-[calc(100vw-32px)]",
                isDashboard
                  ? "bg-black/80 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,.5)]"
                  : "glass-shimmer !shadow-[0_8px_32px_rgba(0,0,0,.3)]"
              )}>
                {[
                  { label: "Image", icon: <ImagePlus className="h-3.5 w-3.5" />, color: "text-green-400", action: () => { setInputValue("image/"); textareaRef.current?.focus(); } },
                  { label: "Search", icon: <Globe className="h-3.5 w-3.5" />, color: "text-cyan-400", action: () => { setInputValue("search/"); textareaRef.current?.focus(); } },
                  { label: "Write", icon: <PenLine className="h-3.5 w-3.5" />, color: "text-purple-400", action: () => { setForceCanvasMode(true); setInputValue("write/ "); textareaRef.current?.focus(); } },
                  { label: "Research", icon: <Search className="h-3.5 w-3.5" fill="currentColor" strokeWidth={1.5} />, color: "text-orange-400", action: () => { setInputValue(""); openSearchMode(); textareaRef.current?.focus(); } },
                  { label: "Code", icon: <Code2 className="h-3.5 w-3.5" />, color: "text-blue-400", action: () => { setInputValue("code/"); textareaRef.current?.focus(); } },
                  { label: "Build", icon: <Rocket className="h-3.5 w-3.5" />, color: "text-amber-400", action: () => { setInputValue("build/"); textareaRef.current?.focus(); } },
                ].map((item, i) => (
                  <motion.button
                    key={item.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02, type: "spring", damping: 25, stiffness: 500 }}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); item.action(); }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium",
                      "hover:bg-white/10 active:scale-95 transition-all",
                      item.color
                    )}
                  >
                    {item.icon}
                    <span className="text-foreground/80">{item.label}</span>
                  </motion.button>
                ))}
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", damping: 25, stiffness: 500 }}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setInputValue(""); textareaRef.current?.focus(); }}
                  className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-white/10 active:scale-95 transition-all text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              </div>
            </motion.div>
          </AnimatePresence>,
          portalRoot
        )}

        {/* Mic Icon - Voice Mode */}
        <button
          onClick={async () => {
            if (user && !subscription.canUseVoice) {
              toast({
                title: "Voice session limit reached",
                description: "Upgrade to ArcAi Pro for unlimited voice sessions.",
                variant: "destructive",
              });
              return;
            }

            // Check and request microphone permission before activating voice mode.
            // This ensures the browser permission dialog appears on all platforms
            // (Mac, Arc browser, PWA) instead of silently failing.
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
              try {
                // Check current permission state if the Permissions API is available
                if (navigator.permissions) {
                  const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                  if (permissionStatus.state === 'denied') {
                    toast({
                      title: "Microphone access blocked",
                      description: "Please allow microphone access in your browser settings (and macOS System Settings > Privacy & Security > Microphone), then try again.",
                      variant: "destructive",
                    });
                    return;
                  }
                }

                // If permission is 'prompt' or unknown, explicitly call getUserMedia
                // so the browser shows the native permission dialog right now,
                // in this user-gesture context (required by Safari/Arc/PWA).
                const permissionStatus = navigator.permissions
                  ? await navigator.permissions.query({ name: 'microphone' as PermissionName })
                  : null;

                if (!permissionStatus || permissionStatus.state === 'prompt') {
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  // Immediately stop the stream — it will be reopened by useAudioCapture
                  stream.getTracks().forEach(track => track.stop());
                }
              } catch (err: any) {
                // NotAllowedError = user denied or system blocked
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                  toast({
                    title: "Microphone access denied",
                    description: "To use voice mode, allow microphone access in your browser settings. On Mac, also check System Settings > Privacy & Security > Microphone.",
                    variant: "destructive",
                  });
                } else if (err.name === 'NotFoundError') {
                  toast({
                    title: "No microphone found",
                    description: "Please connect a microphone and try again.",
                    variant: "destructive",
                  });
                } else {
                  toast({
                    title: "Microphone error",
                    description: "Could not access microphone. Please check your settings and try again.",
                    variant: "destructive",
                  });
                }
                return;
              }
            }

            if (user) subscription.recordVoiceSession();
            
            // If we're not on a chat page, create a session and navigate first
            const isOnChatPage = location.pathname === '/' || location.pathname.startsWith('/chat/');
            if (!isOnChatPage) {
              const newId = useArcStore.getState().createNewSession();
              navigate(`/chat/${newId}`);
              // Delay voice activation slightly so the overlay mounts
              setTimeout(() => activateVoiceMode(), 150);
            } else {
              activateVoiceMode();
            }
          }}
          className={[
            "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
            "text-muted-foreground hover:text-foreground hover:!bg-primary/10",
            // Hide on mobile when typing (isActive), show on desktop always
            isActive ? "hidden sm:flex" : "flex",
          ].join(" ")}
          aria-label="Voice mode"
          title="Voice mode"
        >
          <Mic className="h-5 w-5" />
        </button>

        {/* Send / Stop Button */}
        {isLoading ? (
          <button
            onClick={() => {
              cancelCurrentRequest();
              toast({ title: "Stopped", description: "Request cancelled" });
            }}
            className={[
              "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
              accentColor === "noir"
                ? "!bg-white/80 text-black ring-2 ring-white/60 !shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                : "!bg-primary/80 text-primary-foreground ring-2 ring-primary !shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]",
            ].join(" ")}
            aria-label="Stop"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() && selectedImages.length === 0 && selectedDocuments.length === 0}
            className={[
              "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
              inputValue.trim() || selectedImages.length || selectedDocuments.length
                ? accentColor === "noir"
                  ? "!bg-white/90 text-black ring-2 ring-white/60 hover:!bg-white !shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                  : "!bg-primary/80 text-primary-foreground ring-2 ring-primary !shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
                : "text-muted-foreground cursor-not-allowed",
            ].join(" ")}
            aria-label="Send"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Tiles menu - anchored above star button */}
      {portalRoot &&
        createPortal(
          <AnimatePresence>
             {showMenu && (() => {
                const barRect = inputBarRef.current?.getBoundingClientRect();
                const btnRect = menuButtonRef.current?.getBoundingClientRect();
                const left = barRect ? barRect.left : 0;
                const posStyle = isDashboard
                  ? { left, top: barRect ? barRect.bottom + 8 : 120 }
                  : { left, bottom: btnRect ? window.innerHeight - btnRect.top + 8 : 90 };
                return (
                  <div
                    className="fixed z-[35] pointer-events-auto ci-tiles"
                    style={posStyle}
                  >
                    <motion.div
                      initial={{ opacity: 0, y: isDashboard ? -8 : 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: isDashboard ? -8 : 8, scale: 0.95 }}
                      transition={{ type: "spring", damping: 25, stiffness: 500 }}
                      className={cn(
                        "relative flex items-center gap-1.5 py-2 px-3 rounded-full ring-[0.5px] ring-border/40 backdrop-blur-xl",
                        isDashboard
                          ? "bg-black/80 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,.5)]"
                          : "glass-shimmer !shadow-[0_8px_32px_rgba(0,0,0,.3)]"
                      )}
                  >
                    {[
                      { label: "Attach", icon: <Paperclip className="h-3.5 w-3.5" />, color: "text-blue-400", hideLabel: true, action: () => { setShowMenu(false); fileInputRef.current?.click(); } },
                      { label: "Image", icon: <ImagePlus className="h-3.5 w-3.5" />, color: "text-green-400", action: () => { setForceImageMode(true); setShowMenu(false); } },
                      { label: "Research", icon: <Search className="h-3.5 w-3.5" fill="currentColor" strokeWidth={1.5} />, color: "text-orange-400", action: () => { setShowMenu(false); openSearchMode(); } },
                      { label: "Ideas", icon: <Lightbulb className="h-3.5 w-3.5" />, color: "text-violet-400", action: () => { setShowMenu(false); setShowPromptLibrary(true); } },
                    ].map((item, i) => (
                      <motion.button
                        key={item.label}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: i * 0.02, type: "spring", damping: 25, stiffness: 500 }}
                        onClick={item.action}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium",
                          "hover:bg-white/10 active:scale-95 transition-all",
                          item.color
                        )}
                      >
                        {item.icon}
                        {item.hideLabel ? null : <span className="text-foreground/80">{item.label}</span>}
                      </motion.button>
                    ))}
                  </motion.div>
                </div>
              );
            })()}
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
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.docx,.pptx,.xlsx,.txt,.md,.html,.csv,.json,.xml" multiple className="hidden" onChange={handleFileSelect} />

      {/* Inline selected images preview — portaled to inlinePortalRef if provided */}
      {inline && selectedImages.length > 0 && (() => {
        const content = (
          <div className="mt-3 w-full">
            <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/14)</span>
                <button onClick={clearSelected} className="text-xs text-muted-foreground hover:text-foreground">Clear All</button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedImages.map((f, i) => {
                  const url = imagePreviewUrls[i];
                  return (
                    <div key={i} className="relative group shrink-0">
                      <img src={url} alt={`sel-${i}`} className="w-16 h-16 object-cover rounded-full border border-border/40" />
                      <button onClick={() => removeImage(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {selectedImages.length > 0 && (
                <div className="mt-3 pt-2 border-t border-border/30">
                  <button type="button" onClick={() => setAllImagesEditMode(!allImagesEditMode)} className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-all bg-black text-white hover:bg-black/80">
                    {allImagesEditMode ? `Mode: Edit ✏️` : `Mode: Analyze 🔍`}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
        // Portal to the inline target outside glass-dock if available
        const inlineTarget = document.getElementById('dashboard-image-preview-target');
        return inlineTarget ? createPortal(content, inlineTarget) : content;
      })()}
      {/* Inline document preview */}
      {inline && selectedDocuments.length > 0 && (
        <div className="mt-2 w-full">
          <div className="rounded-2xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-lg px-3 py-2">
            {selectedDocuments.map((doc, i) => (
              <div key={i} className="flex items-center gap-2 py-1 group">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">{doc.name}</span>
                <button onClick={() => removeDocument(i)} className="w-4 h-4 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

ChatInput.displayName = "ChatInput";
