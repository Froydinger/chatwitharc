// src/components/ChatInput.tsx
import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  X,
  Paperclip,
  ArrowRight,
  Sparkles,
  Plus,
  ImagePlus,
  Mic,
  Code2,
  PenLine,
  Search,
  Globe,
  Square,
  Lightbulb,
  Rocket,
  FileText,
  ListPlus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
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
import { routeRequest } from "@/utils/routeRequest";
import { streamLocalChat } from "@/services/localAI";
import { buildLocalSystemPrompt } from "@/utils/localSystemPrompt";
import { findFirstToolCall, executeLocalToolCall, stripToolTags, hasPartialOpenTag } from "@/utils/localToolProtocol";
import { ImageOptionsDock, ImageOptionsContent } from "@/components/ImageOptionsDock";
import { PromptEnhancer } from "@/components/PromptEnhancer";
import { UsageMeter } from "@/components/UsageMeter";
import { useImageGenStore } from "@/store/useImageGenStore";
import { usePersonasStore } from "@/store/usePersonasStore";

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
  if (
    /^(can\s+you\s+)?(please\s+)?(generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration|artwork|graphic|icon|logo|wallpaper|poster|banner|thumbnail)/i.test(
      m,
    )
  )
    return true;
  // "draw me a [subject]" or "paint me a [subject]" - drawing/painting implies visual
  if (/^(can\s+you\s+)?(please\s+)?(draw|paint|sketch)\s+(me\s+)?(a|an|the|some)\s+/i.test(m)) return true;
  // Broader match: verb + optional "me" + image word anywhere in short messages
  if (
    /\b(generate|create|make|draw|paint)\s+(me\s+)?(an?\s+)?(image|picture|photo|illustration)\b/i.test(m) &&
    m.length < 200
  )
    return true;
  return false;
}

// Prefix-based detection: code/ OR /code — opens code canvas (inline code block), NOT the IDE
function checkForCodingRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  // Support code/, /code, build/, /build — App Builder IDE is disabled, so /build is routed to code
  if (/^code\//.test(m) || /^\/code\b/.test(m)) return true;
  if (/^build\//.test(m) || /^\/build\b/.test(m)) return true;
  return false;
}

// App Builder IDE is disabled — /build is treated as a regular code request
function checkForBuildRequest(_message: string): boolean {
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
  if (conversationalPatterns.some((p) => p.test(m))) return true;

  // Short messages ending in ? are usually questions, not requests
  if (isShort && m.endsWith("?")) return true;

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

  return codePatterns.some((p) => p.test(m));
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

  return canvasPatterns.some((p) => p.test(m));
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

// Detect @mention context: returns {isActive, searchTerm} if user is typing @personaname
function detectPersonaMention(text: string): { isActive: boolean; searchTerm: string } {
  const match = text.match(/@([\w\s]*)$/);
  if (match) {
    return { isActive: true, searchTerm: match[1].trim() };
  }
  return { isActive: false, searchTerm: "" };
}

// Feature flag: personas are temporarily hidden/disabled in the UI while the
// persona send flow is being fixed. All persona logic and the store remain
// intact — flip this to `true` to re-enable the entire feature.
const PERSONAS_ENABLED = true;

function parsePersonaPrefixFromList(text: string, personaList: Array<{ id: string; name: string }>) {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("@")) return null;
  const afterAt = trimmed.slice(1);
  const match = [...personaList]
    .sort((a, b) => b.name.length - a.name.length)
    .find((p) => {
      const lowerName = p.name.toLowerCase();
      const lowerAfter = afterAt.toLowerCase();
      return lowerAfter === lowerName || lowerAfter.startsWith(`${lowerName} `);
    });
  if (!match) return null;
  return {
    persona: match,
    remaining: afterAt.slice(match.name.length).trimStart(),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a system message for the active persona of the current session, if any.
// Returns null when no persona is locked. Used to prepend to the AI message list
// so the model actually behaves as the persona (and any tools/reminders run in that voice).
function buildPersonaSystemMessage(): { role: "system" | "user" | "assistant"; content: string } | null {
  if (!PERSONAS_ENABLED) return null;
  const { currentSessionId, chatSessions } = useArcStore.getState();
  const session = chatSessions.find((s) => s.id === currentSessionId);
  if (!session?.personaId) return null;
  const persona = usePersonasStore.getState().getPersonaById(session.personaId);
  if (!persona) return null;
  // [PERSONA_OVERLAY] marker tells the chat edge function to KEEP all of Arc's
  // brain (memory, tools, web search, canvas, etc.) but layer the persona's
  // character on top — exactly like ChatGPT's custom GPTs.
  const content = `[PERSONA_OVERLAY]\nYou will speak and behave as the persona "${persona.name}" for this entire conversation. Keep all of your normal Arc capabilities (memory, web search, canvas, code, file generation, image generation, scheduled tasks, every tool) fully available — use them whenever helpful — but always respond IN CHARACTER as this persona. Adopt the persona's tone, voice, vocabulary, mannerisms, and worldview. Do not break character. You can acknowledge being an AI only if the persona itself would.\n\n=== PERSONA DEFINITION ===\n${persona.systemPrompt}\n=== END PERSONA ===`;
  return { role: "system" as const, content };
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
  sendMessage: (content: string) => void;
}

export const ChatInput = forwardRef<ChatInputRef, Props>(function ChatInput(
  { onImagesChange, rightPanelOpen = false, inline = false },
  ref,
) {
  useProfile();
  const portalRoot = useSafePortalRoot();
  const { toast } = useToast();
  const showPopup = useFingerPopup((state) => state.showPopup);
  const { user, isAnonymous } = useAuth();
  const subscription = useSubscription();
  // Guest mode = no user OR anonymous (auto-issued) Supabase session.
  const isGuestMode = !user || isAnonymous;
  const requireAuth = useRequireAuth();
  const { personas, fetchPersonas } = usePersonasStore();

  const {
    messages,
    addMessage,
    replaceLastMessage,
    isLoading,
    setLoading,
    isGeneratingImage,
    setGeneratingImage,
    editMessage,
    setSearchingChats,
    setAccessingMemory,
    setSearchingWeb,
    updateMessageMemoryAction,
    upsertCanvasMessage,
    upsertCodeMessage,
  } = useArcStore();
  // Reactive subscription so the input bar updates when a persona is locked/cleared
  const activeSessionPersonaId = useArcStore((s) => {
    const sid = s.currentSessionId;
    return sid ? s.chatSessions.find((x) => x.id === sid)?.personaId ?? null : null;
  });
  const activePersona = PERSONAS_ENABLED && activeSessionPersonaId
    ? personas.find((p) => p.id === activeSessionPersonaId) ?? null
    : null;
  const { profile, updateProfile } = useProfile();
  const { accentColor } = useAccentColor();
  const { openSearchMode } = useSearchStore();
  const { streamWithContinuation } = useStreamingWithContinuation();

  // Subscribe to canvas store reactively for auto-mode indicator when canvas is open
  // Use individual selectors for reliable re-renders when canvas open state changes
  const isWriteCanvasOpen = useCanvasStore((s) => s.isOpen && s.canvasType === "writing");

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [allImagesEditMode, setAllImagesEditMode] = useState(true);
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
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

  // Tick to force re-render when the input bar's screen position can change
  // (window resize, scroll, soft keyboard open/close via visualViewport).
  // Used to anchor floating menus (ImageOptionsDock, UsageMeter) just above
  // the input bar rather than glued to the viewport bottom.
  const [, setViewportTick] = useState(0);
  useEffect(() => {
    const bump = () => setViewportTick((t) => (t + 1) % 1000000);
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    window.visualViewport?.addEventListener("resize", bump);
    window.visualViewport?.addEventListener("scroll", bump);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      window.visualViewport?.removeEventListener("resize", bump);
      window.visualViewport?.removeEventListener("scroll", bump);
    };
  }, []);

  // Re-render anchored previews when the input bar itself moves/resizes
  // (welcome screen re-centers when image previews appear, etc.)
  useEffect(() => {
    const el = inputBarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const bump = () => setViewportTick((t) => (t + 1) % 1000000);
    const ro = new ResizeObserver(bump);
    ro.observe(el);
    const bodyRo = new ResizeObserver(bump);
    bodyRo.observe(document.body);
    return () => {
      ro.disconnect();
      bodyRo.disconnect();
    };
  }, []);

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

  // Persisted user-chosen image model + aspect ratio (for /image, "draw…", etc.)
  const { model: imageGenModel, aspectRatio: imageGenAspect } = useImageGenStore();

  // When a /write canvas is open, auto-show canvas mode indicator so user knows
  // their messages will modify the canvas (not go to chat)
  const showCanvasIndicator = shouldShowCanvasMode || isWriteCanvasOpen;
  // Auto mode = indicator is shown because canvas is open, not from explicit /write prefix
  const isCanvasAutoMode = isWriteCanvasOpen && !shouldShowCanvasMode;

  // When user types just "/" open the same tools menu as the + button
  useEffect(() => {
    if (inputValue.trim() === "/") {
      setInputValue("");
      setShowMenu(true);
    }
  }, [inputValue]);

  // Handle /deep command to open research mode
  useEffect(() => {
    const val = inputValue.trim().toLowerCase();
    if (val === "/deep" || val === "/research") {
      setInputValue("");
      openSearchMode();
    }
  }, [inputValue, openSearchMode]);

  // Voice mode store
  const { activateVoiceMode, isActive: isVoiceActive } = useVoiceModeStore();

  // Fetch personas on mount
  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  // Detect @mentions as user types — suppressed when a persona is already active
  // (multi-persona chats are not supported yet).
  const rawMention = detectPersonaMention(inputValue);
  const showingPersonaSuggestions = PERSONAS_ENABLED && rawMention.isActive && !activePersona;
  const searchTerm = rawMention.searchTerm;
  const sortedPersonas = [...personas].sort((a, b) => {
    const aCustom = !a.id.startsWith('builtin-');
    const bCustom = !b.id.startsWith('builtin-');
    if (aCustom !== bCustom) return aCustom ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const filteredPersonas = showingPersonaSuggestions
    ? sortedPersonas
        .filter(p => p.name.toLowerCase().startsWith(searchTerm.toLowerCase()))
    : [];
  const personaMention = PERSONAS_ENABLED ? parsePersonaPrefixFromList(inputValue, personas) : null;

  // If the user types @ in a chat that already has a persona, strip it and warn.
  useEffect(() => {
    if (rawMention.isActive && activePersona) {
      const activePrefix = new RegExp(`^@${escapeRegExp(activePersona.name)}(?:\\s|$)`, "i");
      if (activePrefix.test(inputValue.trimStart())) return;
      const lastAtIndex = inputValue.lastIndexOf("@");
      if (lastAtIndex >= 0) {
        setInputValue(inputValue.slice(0, lastAtIndex));
      }
      toast({
        title: "One persona per chat",
        description: "Multi-persona chats are not yet available. Start a new chat to switch.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMention.isActive, !!activePersona]);

  // Activate a persona on the current (or new) session. Avatar appears over the +
  // menu as a pending-tool style chip; the X next to it clears the persona.
  const selectPersona = (persona: { id: string; name: string }) => {
    const arc = useArcStore.getState();
    let sessionId = arc.currentSessionId;
    if (!sessionId) {
      sessionId = arc.createNewSession();
    }
    useArcStore.setState((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, personaId: persona.id } : s
      ),
    }));
    setInputValue(`@${persona.name} `);
    setShowMenu(false);
    toast({
      title: `Chatting with ${persona.name}`,
      description: "Type your message — this whole chat is now in character.",
    });
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const clearActivePersona = () => {
    const arc = useArcStore.getState();
    const sessionId = arc.currentSessionId;
    if (!sessionId) return;
    useArcStore.setState((state) => ({
      chatSessions: state.chatSessions.map((s) =>
        s.id === sessionId ? { ...s, personaId: undefined } : s
      ),
    }));
    if (activePersona) {
      setInputValue((v) => v.replace(new RegExp(`^@${escapeRegExp(activePersona.name)}\\s+`, "i"), ""));
    }
  };

  // Navigation (for activating voice from non-chat pages like Dashboard)
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";

  // Textarea auto-resize with cursor position preservation
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPositionRef = useRef<number | null>(null);

  // Expose handleImageUploadFiles, focusInput, and sendMessage via ref
  useImperativeHandle(
    ref,
    () => ({
      handleImageUploadFiles: (files: File[]) => {
        handleUploadFiles(files);
      },
      focusInput: () => {
        textareaRef.current?.focus();
      },
      sendMessage: (content: string) => {
        handleSend(content);
      },
    }),
    [toast],
  );

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
          behavior: "smooth",
          block: "center",
        });
      }
    }, 300);
  }, []);

  // Create and cleanup object URLs for image previews
  useEffect(() => {
    // Revoke old URLs
    imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));

    // Create new URLs
    const newUrls = selectedImages.map((file) => URL.createObjectURL(file));
    setImagePreviewUrls(newUrls);

    // Cleanup on unmount or when images change
    return () => {
      newUrls.forEach((url) => URL.revokeObjectURL(url));
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
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
    "text/plain",
    "text/markdown",
    "text/html",
    "text/csv",
    "application/json",
    "application/xml",
    "text/xml",
  ];

  const isDocumentFile = (file: File) =>
    DOCUMENT_TYPES.includes(file.type) || /\.(pdf|docx|pptx|xlsx|txt|md|html|csv|json|xml)$/i.test(file.name);

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
    const unsupported = files.filter((f) => !f.type.startsWith("image/") && !isDocumentFile(f));
    if (unsupported.length > 0) {
      toast({
        title: "Unsupported file type",
        description: `${unsupported[0].name} is not supported. Try PDF, DOCX, PPTX, XLSX, TXT, CSV, JSON, or images.`,
        variant: "destructive",
      });
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
  const handleEditedMessage = useCallback(
    async (newContent: string, editedMessageId: string) => {
      if (!newContent.trim()) return;
      // If loading, queue the edited message instead of blocking
      if (isLoading) {
        useMessageQueueStore.getState().addToQueue(newContent.trim());
        return;
      }

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
            role: m.role as "user" | "assistant" | "system",
            content: m.id === editedMessageId ? newContent : m.content,
          }));

        // Prepend persona system prompt so the AI behaves as the locked persona
        const personaMsg = buildPersonaSystemMessage();
        if (personaMsg) aiMessages.unshift(personaMsg);

        let didSearchWeb = false;
        const { currentSessionId } = useArcStore.getState();
        const result = await ai.sendMessage(
          aiMessages,
          undefined,
          (tools) => {
            console.log("🔧 Tools used:", tools);

            // Set indicators when we detect tool usage
            if (tools.includes("search_past_chats")) {
              console.log("✅ Setting searchingChats indicator");
              setSearchingChats(true);
              didSearchChats = true;
            }
            if (tools.includes("web_search")) {
              setSearchingWeb(true);
              didSearchWeb = true;
            }
          },
          currentSessionId || undefined,
        );

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
          memoryAction = {
            type: "web_searched" as const,
            sources: result.webSources,
            query: newContent,
            searchProvider: result.searchProvider,
          };
        } else if (didSearchChats) {
          memoryAction = { type: "chats_searched" as const };
        }

        await addMessage({
          content: result.content,
          role: "assistant",
          type: "text",
          memoryAction,
          sourceModel: didSearchWeb
            ? result.searchProvider === "tavily"
              ? "cloud-search-tavily"
              : "cloud-search"
            : "cloud-chat",
        });
      } catch (err: any) {
        console.error("Chat error:", err);
        setLoading(false);
        setSearchingChats(false);
        setAccessingMemory(false);

        toast({ title: "Error", description: err?.message || "Failed to get AI response", variant: "destructive" });
        await addMessage({
          content: "Sorry, I encountered an error. Please try again.",
          role: "assistant",
          type: "text",
          sourceModel: "cloud-chat",
        });
      }
    },
    [messages, isLoading, setLoading, addMessage, toast, setSearchingChats, setAccessingMemory],
  );

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
      const e = ev as CustomEvent<{
        content: string;
        baseImageUrl: string | string[];
        additionalImages?: string[];
        editInstruction: string;
        imageModel?: string;
        aspectRatio?: string;
      }>;
      if (!e?.detail) return;
      handleExternalImageEditRef.current(
        e.detail.content,
        e.detail.baseImageUrl,
        e.detail.editInstruction,
        e.detail.imageModel,
        e.detail.additionalImages,
        e.detail.aspectRatio,
      );
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
    aspectRatio?: string,
  ) => {
    // Read fresh from store to avoid stale closure issues
    if (useArcStore.getState().isGeneratingImage) return;
    try {
      const ai = new AIService();
      setGeneratingImage(true);

      // Merge base images with additional images
      const baseUrls = Array.isArray(baseImageUrl) ? baseImageUrl : [baseImageUrl];
      const allImageUrls =
        additionalImages && additionalImages.length > 0 ? [...baseUrls, ...additionalImages] : baseUrls;

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

      const url = await ai.editImage(editInstruction, allImageUrls, imageModel, aspectRatio);

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
      const errMsg = err?.message || "Image editing failed. Please try again.";
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
    if (!messageToSend.trim() && selectedImages.length === 0 && selectedDocuments.length === 0) return;

    // If Arc is currently thinking, queue the message instead of blocking
    // Check both React state AND direct store state to avoid stale closure races
    const storeIsLoading = useArcStore.getState().isLoading;
    const storeIsGenerating = useArcStore.getState().isGeneratingImage;
    if (isLoading || storeIsLoading || storeIsGenerating) {
      if (messageToSend.trim()) {
        useMessageQueueStore.getState().addToQueue(messageToSend.trim());
        if (!messageOverride) setInputValue("");
      }
      return;
    }

    // Guest mode: check if limit reached
    if (isGuestMode) {
      const guestCount = parseInt(localStorage.getItem("arcai-guest-messages") || "0", 10);
      if (guestCount >= 15) {
        // Dispatch event to show signup prompt
        window.dispatchEvent(new CustomEvent("arcai:guestMessageSent"));
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
    let images = [...selectedImages];
    let documents = [...selectedDocuments];

    // Detect @mention context: returns {isActive, searchTerm} if user is typing @personaname
    let finalMessage = userMessage;
    const personaMention = PERSONAS_ENABLED ? parsePersonaPrefixFromList(userMessage, personas) : null;
    if (personaMention) {
      const { persona, remaining } = personaMention;
      if (persona) {
        // Lock this conversation to the selected persona
        let { currentSessionId } = useArcStore.getState();
        if (!currentSessionId) currentSessionId = useArcStore.getState().createNewSession();
        if (currentSessionId) {
          useArcStore.setState((state) => ({
            chatSessions: state.chatSessions.map((s) =>
              s.id === currentSessionId ? { ...s, personaId: persona.id } : s
            ),
          }));
        }
        finalMessage = remaining;
        toast({
          title: `Switched to ${persona.name}`,
          description: "This conversation is now locked to this persona.",
        });
        if (!finalMessage.trim() && images.length === 0 && documents.length === 0) {
          toast({
            title: `Chatting with ${persona.name}`,
            description: "Type your message after the persona name, then send.",
          });
          setInputValue(`@${persona.name} `);
          setTimeout(() => textareaRef.current?.focus(), 0);
          return;
        }
      } else {
        toast({
          title: "Persona not found",
          description: "That persona doesn't exist. Pick one from the persona menu.",
          variant: "destructive",
        });
      }
    }

    // Capture mode states BEFORE clearing UI (they're needed in handleSendMessage)
    let wasCanvasMode = shouldShowCanvasMode || checkForCanvasRequest(finalMessage);
    let wasCodingMode = shouldShowCodeMode || checkForCodingRequest(finalMessage);
    let wasImageMode = shouldShowBanana || checkForImageRequest(finalMessage);
    let wasSearchMode = shouldShowSearchMode || checkForSearchRequest(finalMessage);
    let wasBuildMode = checkForBuildRequest(finalMessage);

    // Clear UI promptly
    setInputValue("");
    setSelectedImages([]);
    setSelectedDocuments([]);
    setForceImageMode(false);
    setForceCodingMode(false);
    setForceCanvasMode(false);
    setForceSearchMode(false);
    setShowMenu(false);

    // === CORPORATE MODE: hard-strip every cloud tool from this turn ===
    const corporateMode = useCorporateModeStore.getState().enabled;
    if (corporateMode) {
      if (
        images.length ||
        documents.length ||
        wasCanvasMode ||
        wasCodingMode ||
        wasImageMode ||
        wasSearchMode ||
        wasBuildMode
      ) {
        toast({
          title: "Corporate Mode is on",
          description: "Tools and attachments are disabled. Sending as plain on-device chat.",
        });
      }
      images = [];
      documents = [];
      wasCanvasMode = false;
      wasCodingMode = false;
      wasImageMode = false;
      wasSearchMode = false;
      wasBuildMode = false;
    }

    // BUILD MODE: /build navigates to the App Builder
    if (wasBuildMode) {
      const buildPrompt = extractPrefixPrompt(finalMessage);
      // Navigate to App Builder — the prompt will be handled there
      navigate(buildPrompt ? `/apps?prompt=${encodeURIComponent(buildPrompt)}` : "/apps");
      return;
    }

    // Search mode (/search) - now does a regular web search in chat (NOT Deep Search Mode)
    // Deep Search Mode is opened separately via the button
    // We set forceWebSearch flag so the chat API always does a web search

    // Reset cancellation flag
    cancelRequested = false;
    setLoading(true);

    // Track message usage
    if (isGuestMode) {
      window.dispatchEvent(new CustomEvent("arcai:guestMessageSent"));
    } else if (user) {
      subscription.recordMessage();
    }

    try {
      const ai = new AIService();

      // Guest mode restrictions: only basic text chat
      if (
        isGuestMode &&
        (images.length > 0 || documents.length > 0 || wasCanvasMode || wasCodingMode || wasImageMode)
      ) {
        await addMessage({ content: finalMessage || "Sent message", role: "user", type: "text" });
        await addMessage({
          content:
            "✨ Image generation, canvas, code, and document analysis features are available when you create a free account! Sign up to unlock all of Arc's capabilities.",
          role: "assistant",
          type: "text",
          sourceModel: "cloud-chat",
        });
        setLoading(false);
        return;
      }

      // With Documents -> analyze
      if (documents.length > 0) {
        await addMessage({
          content:
            finalMessage ||
            `Analyzing ${documents.length} document${documents.length > 1 ? "s" : ""}: ${documents.map((d) => d.name).join(", ")}`,
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

            const analysisPrompt = finalMessage || `Analyze and summarize this document: ${doc.name}`;
            const personaMsg = buildPersonaSystemMessage();
            const response = await ai.sendMessageWithDocument(
              [...(personaMsg ? [personaMsg] : []), { role: "user", content: analysisPrompt }],
              fileData,
              doc.name,
              doc.type || "application/octet-stream",
            );
            await addMessage({ content: response, role: "assistant", type: "text", sourceModel: "cloud-document" });
          }
        } catch (err: any) {
          toast({ title: "Error", description: err?.message || "Failed to analyze document", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze the document. Please try again.",
            role: "assistant",
            type: "text",
            sourceModel: "cloud-document",
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

        if (isEditMode) {
          await addMessage({ content: finalMessage, role: "user", type: "image", imageUrls });
          await addMessage({
            content: `Editing image: ${finalMessage}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt: finalMessage,
            sourceModel: "cloud-image-edit",
          });
          setGeneratingImage(true);

          try {
            const editedUrl = await ai.editImage(finalMessage, imageUrls, imageGenModel, imageGenAspect);
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
              content: `Edited image: ${finalMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrl,
              sourceModel: "cloud-image-edit",
            });
          } catch (err: any) {
            const errMsg = err?.message || "Image editing failed. Please try again.";
            await replaceLastMessage({
              content: errMsg,
              role: "assistant",
              type: "text",
              sourceModel: "cloud-image-edit",
            });
          } finally {
            setGeneratingImage(false);
          }
          return;
        }

        // Analyze
        await addMessage({
          content: finalMessage || "Sent images",
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
          const isSvgRequest =
            /\bsvg\b|as\s+svg|to\s+svg|make.{0,20}svg|svg.{0,20}version|convert.{0,20}svg|vector\s+graphic/i.test(
              finalMessage,
            );
          const analysisPrompt = isSvgRequest
            ? `You are an SVG artist. Carefully analyze this image and recreate it as a complete, valid SVG. Use shapes (rect, circle, ellipse, path, polygon), gradients, and accurate colors to faithfully represent the image. Set a viewBox and width/height attributes. Output ONLY the SVG markup inside a single \`\`\`svg code block with absolutely no other text, explanation, or commentary outside the code block.`
            : finalMessage || `What do you see in ${images.length > 1 ? "these images" : "this image"}?`;
          const personaMsg = buildPersonaSystemMessage();
          const response = await ai.sendMessageWithImage([...(personaMsg ? [personaMsg] : []), { role: "user", content: analysisPrompt }], base64s);
          await addMessage({ content: response, role: "assistant", type: "text", sourceModel: "cloud-vision" });
        } catch {
          toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze these images. Please try again.",
            role: "assistant",
            type: "text",
            sourceModel: "cloud-vision",
          });
        }
        return;
      }

      // Canvas mode - let the regular text flow handle it via AI's update_canvas tool
      // The AI will be instructed to use update_canvas and the response will add a canvas message inline

      // No images: Banana => generate; else text
      if (wasImageMode) {
        // Strip the prefix (image/, draw/, create/, /image, etc.) and use the rest as prompt
        const imagePrompt = extractPrefixPrompt(finalMessage || "") || "a beautiful image";
        await addMessage({ content: finalMessage || imagePrompt, role: "user", type: "text" });
        await addMessage({
          content: `Generating image: ${imagePrompt}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt,
          sourceModel: "cloud-image",
        });
        setGeneratingImage(true);

        try {
          const apiPrompt = `Generate an image: ${imagePrompt}`;
          const genUrl = await ai.generateImage(apiPrompt, imageGenModel, imageGenAspect);
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
            sourceModel: "cloud-image",
          });
        } catch (err: any) {
          const errMsg = err?.message || "Image generation failed. Please try again.";
          await replaceLastMessage({
            content: errMsg,
            role: "assistant",
            type: "text",
            sourceModel: "cloud-image",
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
        if (
          lastMsg?.role === "assistant" &&
          lastMsg.type === "image" &&
          lastMsg.imageUrl &&
          isImageEditRequest(finalMessage)
        ) {
          // Route as image edit against the last generated/edited image
          await addMessage({ content: finalMessage, role: "user", type: "text" });
          await addMessage({
            content: `Editing image: ${finalMessage}`,
            role: "assistant",
            type: "image-generating",
            imagePrompt: finalMessage,
            sourceModel: "cloud-image-edit",
          });
          setGeneratingImage(true);

          try {
            const editedUrl = await ai.editImage(finalMessage, [lastMsg.imageUrl], imageGenModel, imageGenAspect);
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
              content: `Edited image: ${finalMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrl,
              sourceModel: "cloud-image-edit",
            });
          } catch (err: any) {
            const errMsg = err?.message || "Image editing failed. Please try again.";
            await replaceLastMessage({
              content: errMsg,
              role: "assistant",
              type: "text",
              sourceModel: "cloud-image-edit",
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
        content: finalMessage,
        role: "user",
        type: "text",
      });

      // Memory detection is now handled server-side via the AI's save_memory tool
      // The AI dynamically decides what to remember and saves to context_blocks

      try {
        const aiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> =
          messages.filter((m) => m.type === "text").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        // Prepend persona system prompt so the AI behaves as the locked persona
        const personaMsg = buildPersonaSystemMessage();
        if (personaMsg) aiMessages.unshift(personaMsg);

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
          (canvasState.isOpen && canvasState.canvasType === "writing" && !isConversationalMessage(finalMessage));

        // Check if code canvas is open and user is asking to edit it.
        // Also auto-open the canvas from the last code message in chat if it isn't open yet,
        // so follow-up messages work without requiring the user to click the code card first.
        let isCodeCanvasOpen = canvasState.isOpen && canvasState.canvasType === "code";
        if (!isCodeCanvasOpen && looksLikeCodeEditRequest(finalMessage)) {
          const recentMsgs = useArcStore.getState().messages;
          // First: look for a dedicated code tile message (type === 'code')
          const lastCodeMsg = [...recentMsgs].reverse().find((m) => (m as any).type === "code");
          if (lastCodeMsg) {
            const codeContent = (lastCodeMsg as any).codeContent || "";
            const codeLang = (lastCodeMsg as any).codeLanguage || "html";
            useCanvasStore.getState().openWithContent(codeContent, "code", codeLang);
            isCodeCanvasOpen = true;
          } else {
            // Fallback: scan recent assistant text messages for fenced code blocks
            const recentTextMsgs = [...recentMsgs]
              .reverse()
              .filter((m) => m.role === "assistant" && (m as any).type === "text")
              .slice(0, 5);
            for (const msg of recentTextMsgs) {
              const match = msg.content.match(/```(\w+)?\n([\s\S]+?)```/);
              if (match) {
                const codeLang = match[1] || "html";
                const codeContent = match[2] || "";
                if (codeContent.trim().length > 50) {
                  useCanvasStore.getState().openWithContent(codeContent, "code", codeLang);
                  isCodeCanvasOpen = true;
                  break;
                }
              }
            }
          }
        }
        const shouldRouteToCodeCanvas = isCodeCanvasOpen && looksLikeCodeEditRequest(finalMessage);

        // Re-read canvas state after potential openWithContent call above
        const freshCanvasState = useCanvasStore.getState();

        const cleanedMessage = extractPrefixPrompt(finalMessage);

        // Build the message to send to AI
        // Helper: truncate large content to stay within the 15k server message limit
        // Keeps the first and last portions so the AI sees structure + ending
        const MAX_CONTEXT_CHARS = 12000; // leave room for instructions + user message
        const truncateForContext = (content: string, budget: number = MAX_CONTEXT_CHARS): string => {
          if (content.length <= budget) return content;
          const keepEach = Math.floor(budget / 2) - 50;
          const lines = content.split("\n");
          const totalLines = lines.length;
          return (
            content.slice(0, keepEach) +
            `\n\n/* ... [${totalLines} lines total, middle truncated to fit message limit] ... */\n\n` +
            content.slice(-keepEach)
          );
        };

        let messageToSend: string;

        if (shouldRouteToCodeCanvas && freshCanvasState.content) {
          // Code canvas is open and user wants to modify existing code
          const existingCode = freshCanvasState.content;
          const language = freshCanvasState.codeLanguage || "html";
          const userReq = cleanedMessage || finalMessage;
          // Budget: 15000 total - instructions (~500) - user request - safety margin
          const codeBudget = Math.max(4000, 14000 - userReq.length - 500);
          const safeCode = truncateForContext(existingCode, codeBudget);
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CODE: The user has existing ${language} code (${existingCode.split("\n").length} lines). Modify it based on their request using the update_code tool. You MUST output the COMPLETE, FULL modified code - do NOT truncate, summarize, or cut off mid-way. Write EVERY line.

EXISTING CODE TO MODIFY:
\`\`\`${language}
${safeCode}
\`\`\`

USER'S REQUEST: ${userReq}

MANDATORY: Output the COMPLETE updated code. Never stop mid-sentence or mid-function. Include ALL code from start to finish.`;
        } else if (shouldRouteToCanvas && freshCanvasState.isOpen && freshCanvasState.content) {
          // Writing canvas is open with existing content - include it for modification
          const existingContent = freshCanvasState.content;
          const userReq = cleanedMessage || finalMessage;
          const canvasBudget = Math.max(4000, 14000 - userReq.length - 500);
          const safeContent = truncateForContext(existingContent, canvasBudget);
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: The user has existing writing in the canvas. Modify it based on their request using the update_canvas tool. You MUST output the COMPLETE, FULL modified markdown content - do NOT truncate, summarize, or cut off mid-way. Write EVERY paragraph.

EXISTING CANVAS CONTENT TO MODIFY:
${safeContent}

USER'S REQUEST: ${userReq}

MANDATORY: Output the COMPLETE updated content. Never stop mid-sentence or mid-paragraph. Include ALL content from start to finish.`;
        } else if (shouldRouteToCanvas) {
          // New canvas request (no existing content)
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: Use the update_canvas tool to write COMPLETE, FULL markdown content for this request. Do NOT truncate, summarize, or cut short. Write the ENTIRE piece from beginning to end - every paragraph, every section, complete thoughts. Never stop mid-sentence:\n\n${cleanedMessage || finalMessage}`;
        } else if (wasSearchMode) {
          messageToSend = `Search the web for: ${cleanedMessage || finalMessage}`;
        } else if (isCodeCanvasOpen && freshCanvasState.content && !isConversationalMessage(finalMessage)) {
          // Code canvas is open and user isn't explicitly asking to edit, but also not conversational
          // Only provide code context for messages that might be related to the code
          const existingCode = freshCanvasState.content;
          const language = freshCanvasState.codeLanguage || "html";
          const userReq = cleanedMessage || finalMessage;
          const contextBudget = Math.max(4000, 14000 - userReq.length - 500);
          const safeCode = truncateForContext(existingCode, contextBudget);
          messageToSend = `${userReq}

[CONTEXT: The user has a Code Canvas open with ${language} code (${existingCode.split("\n").length} lines). ONLY modify this code if the user is explicitly asking for changes. For casual conversation like "great!", "looks good", questions about how something works, etc. - just respond conversationally WITHOUT updating the code.]

Current code (${existingCode.split("\n").length} lines):
\`\`\`${language}
${safeCode}
\`\`\``;
        } else {
          // Conversational message or no canvas - just send as-is
          messageToSend = cleanedMessage || finalMessage;
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

        console.log("🎯 Canvas/Code mode detection:", {
          isCodingRequest,
          shouldRouteToCodeCanvas,
          shouldRouteToCanvas,
          shouldForceCode,
          shouldForceCanvas,
          wasSearchMode,
        });

        // For canvas/code: use streaming with auto-continuation
        // For regular text chat: use non-streaming (handles web search properly)
        if (shouldForceCode || shouldForceCanvas) {
          // STREAMING MODE - for canvas/code generation
          let streamedContent = "";
          let streamMode: "canvas" | "code" | "text" = shouldForceCode ? "code" : "canvas";

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
                variant: "default",
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
                memoryAction = {
                  type: "web_searched" as const,
                  sources: streamWebSources,
                  query: userMessage,
                  searchProvider: (result as any).searchProvider,
                };
              }

              // Get the FULL code - prefer streamedContent, fallback to result.content
              const finalContent = streamedContent || result.content || "";
              const lang = result.language || "html";

              console.log(
                `✅ Code ready: streamed=${streamedContent.length}, result=${(result.content || "").length}, using=${finalContent.length} chars`,
              );

              if (result.mode === "code") {
                // Save to history FIRST
                const codeMsgId = await upsertCodeMessage(finalContent, lang, result.label, memoryAction);
                // Tag the source model on the saved code tile
                useArcStore.setState((state) => {
                  const idx = state.messages.findIndex((m) => m.id === codeMsgId);
                  if (idx === -1) return state;
                  const updated = [...state.messages];
                  updated[idx] = { ...updated[idx], sourceModel: "cloud-code" } as any;
                  return { messages: updated } as any;
                });

                // Read content back from saved message (same source as tile click)
                const messages = useArcStore.getState().messages;
                const lastCodeMsg = [...messages].reverse().find((m) => m.type === "code");
                const verifiedContent = (lastCodeMsg as any)?.codeContent || finalContent;
                const verifiedLang = (lastCodeMsg as any)?.codeLanguage || lang;

                console.log(`📦 Opening canvas with verified content: ${verifiedContent.length} chars`);

                // Open canvas with verified content from saved message
                const { openWithContent } = useCanvasStore.getState();
                openWithContent(verifiedContent, "code", verifiedLang);

                if (result.wasContinued) {
                  toast({
                    title: "Code generation complete!",
                    description: "Successfully continued and finished the code.",
                    variant: "default",
                  });
                }
              } else if (result.mode === "canvas") {
                // Save to history FIRST
                const canvasMsgId = await upsertCanvasMessage(finalContent, result.label, memoryAction);
                useArcStore.setState((state) => {
                  const idx = state.messages.findIndex((m) => m.id === canvasMsgId);
                  if (idx === -1) return state;
                  const updated = [...state.messages];
                  updated[idx] = { ...updated[idx], sourceModel: "cloud-canvas" } as any;
                  return { messages: updated } as any;
                });

                // Read content back from saved message
                const messages = useArcStore.getState().messages;
                const lastCanvasMsg = [...messages].reverse().find((m) => m.type === "canvas");
                const verifiedContent = (lastCanvasMsg as any)?.canvasContent || finalContent;

                // Open canvas with verified content
                const { openWithContent } = useCanvasStore.getState();
                openWithContent(verifiedContent, "writing");
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
            },
          });

          // Clean up abort controller
          currentAbortController = null;
        } else {
          // NON-STREAMING MODE - for regular text chat (handles web search properly)
          // The ThinkingIndicator component will show while isLoading is true
          // We don't add a placeholder message - the thinking indicator handles UI

          try {
            // SMART ROUTING: decide if this can run on local Gemma
            const route = activePersona ? "cloud-chat" : routeRequest({
              forceWebSearch: wasSearchMode,
              forceCanvas: false,
              forceCode: false,
              hasImageAttachment: aiMessages.some((m: any) => Array.isArray(m.content)),
              isImageGenerationRequest: false,
            });

            if (route === "local") {
              // === LOCAL ON-DEVICE PATH ===
              try {
                const localSystem = await buildLocalSystemPrompt(profile as any);

                // Cap history: last 8 string-only messages. Local model can't
                // see images, so drop array-content messages entirely.
                const localHistory = aiMessages
                  .filter((m: any) => typeof m.content === "string" && m.content.trim())
                  .slice(-8)
                  .map((m: any) => ({ role: m.role, content: m.content as string }));

                // Defer creating the assistant bubble until the first token
                // arrives. While we wait, the global ThinkingIndicator (driven
                // by isLoading + setSearchingChats/setAccessingMemory) is what
                // the user sees — same UX as cloud Arc.
                let placeholderId: string | null = null;
                const ensurePlaceholder = async () => {
                  if (placeholderId) return placeholderId;
                  placeholderId = await addMessage({
                    content: "",
                    role: "assistant",
                    type: "text",
                    sourceModel: "local",
                  });
                  // First token = thinking is over; clear the loader.
                  setLoading(false);
                  return placeholderId;
                };

                // Conversation we feed the local model. We may run multiple
                // turns: model emits a <recall>/<remember> tag → we execute
                // it → we append the result and let the model continue.
                const conversation: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
                  { role: "system", content: localSystem },
                  ...localHistory,
                ];

                let displayed = "";
                let pendingMemoryAction: {
                  type: "memory_saved" | "memory_accessed" | "chats_searched";
                  content?: string;
                  query?: string;
                } | null = null;
                const MAX_TOOL_TURNS = 3;

                for (let turn = 0; turn < MAX_TOOL_TURNS + 1; turn++) {
                  if (cancelRequested || currentAbortController?.signal.aborted) break;

                  let streamed = "";
                  let pending = "";
                  let rafScheduled = false;

                  const flush = async () => {
                    rafScheduled = false;
                    if (!pending) return;
                    const visible = hasPartialOpenTag(streamed)
                      ? stripToolTags(streamed.slice(0, streamed.lastIndexOf("<")))
                      : stripToolTags(streamed);
                    const next = (displayed + (visible ? (displayed ? " " : "") + visible : "")).trim();
                    if (!next) {
                      pending = "";
                      return;
                    }
                    const id = await ensurePlaceholder();
                    useArcStore.setState((state) => {
                      const idx = state.messages.findIndex((m) => m.id === id);
                      if (idx === -1) return state;
                      const updated = [...state.messages];
                      updated[idx] = { ...updated[idx], content: next };
                      return { messages: updated } as any;
                    });
                    pending = "";
                  };

                  const localAbort = new AbortController();
                  if (currentAbortController) {
                    currentAbortController.signal.addEventListener("abort", () => localAbort.abort(), { once: true });
                  }

                  // Hard per-turn timeout — local model should never hang the UI.
                  // 90s is generous for a slow first-token on a cold engine.
                  const TURN_TIMEOUT_MS = 90_000;
                  const turnTimeout = setTimeout(() => {
                    console.warn("[Arc Local] turn timed out, aborting stream");
                    localAbort.abort();
                  }, TURN_TIMEOUT_MS);

                  try {
                    await streamLocalChat(
                      conversation,
                      (delta) => {
                        streamed += delta;
                        pending += delta;
                        if (!rafScheduled) {
                          rafScheduled = true;
                          requestAnimationFrame(() => {
                            flush();
                          });
                        }
                        // If a complete tag has arrived, stop this turn early.
                        if (turn < MAX_TOOL_TURNS && findFirstToolCall(streamed)) {
                          localAbort.abort();
                        }
                      },
                      localAbort.signal,
                      () => {},
                    );
                  } finally {
                    clearTimeout(turnTimeout);
                  }

                  // Final flush of this turn's visible content.
                  const visibleNow = stripToolTags(streamed).trim();
                  if (visibleNow) {
                    displayed = (displayed ? displayed + " " : "") + visibleNow;
                    displayed = displayed.trim();
                  }

                  // Look for a tool call to execute.
                  const call = turn < MAX_TOOL_TURNS ? findFirstToolCall(streamed) : null;
                  if (!call) break;

                  // Show the right thinking indicator while we run the tool.
                  if (call.tool === "recall") {
                    setSearchingChats(true);
                    setLoading(true);
                  } else if (call.tool === "remember") {
                    setAccessingMemory(true);
                    setLoading(true);
                  }

                  conversation.push({ role: "assistant", content: streamed });
                  let result = "";
                  try {
                    result = await executeLocalToolCall(call);
                  } catch (e: any) {
                    result = `Tool error: ${e?.message || "unknown"}`;
                  }

                  // Record the memory action for the bubble pill.
                  if (call.tool === "recall") {
                    pendingMemoryAction = { type: "chats_searched", query: call.arg, content: result };
                    setSearchingChats(false);
                  } else if (call.tool === "remember") {
                    pendingMemoryAction = { type: "memory_saved", content: call.arg };
                    setAccessingMemory(false);
                  }

                  conversation.push({
                    role: "user",
                    content: `<tool_result tool="${call.tool}">${result}</tool_result>\n\nContinue your reply to the user using this result. Do NOT emit another <${call.tool}> tag for the same query.`,
                  });
                }

                // Final commit. We MUST persist via editMessage (which writes
                // to Supabase) — raw setState only updates memory, so the next
                // chat-sync poll would wipe the local reply with an empty row.
                const id = await ensurePlaceholder();
                const finalContent = displayed || "I couldn't generate a response locally.";
                editMessage(id, finalContent);
                if (pendingMemoryAction) {
                  updateMessageMemoryAction(id, pendingMemoryAction as any);
                }
                // Re-apply sourceModel since editMessage doesn't touch it but
                // also doesn't strip it — defensive set in case of races.
                useArcStore.setState((state) => {
                  const idx = state.messages.findIndex((m) => m.id === id);
                  if (idx === -1) return state;
                  const updated = [...state.messages];
                  updated[idx] = { ...updated[idx], sourceModel: "local" } as any;
                  return { messages: updated } as any;
                });
                setLoading(false);
                setSearchingChats(false);
                setAccessingMemory(false);

                if (cancelRequested) return;
              } catch (localErr: any) {
                console.warn("Local model failed, falling back to cloud:", localErr);
                toast({ title: "Local model error", description: "Falling back to cloud.", variant: "default" });
                // Fall through to cloud path below
                const ai = new AIService();
                const result = await ai.sendMessage(
                  aiMessages,
                  profile,
                  undefined,
                  currentSessionId || undefined,
                  false,
                  false,
                  false,
                  false,
                  isGuestMode,
                );
                if (cancelRequested) return;
                await addMessage({
                  content: result.content,
                  role: "assistant",
                  type: "text",
                  sourceModel: "cloud-chat",
                });
              }
            } else {
              // === CLOUD PATH ===
              const ai = new AIService();
              const result = await ai.sendMessage(
                aiMessages,
                profile,
                (tools) => {
                  if (tools.includes("web_search")) {
                    didSearchWeb = true;
                  }
                },
                currentSessionId || undefined,
                wasSearchMode, // forceWebSearch
                false, // forceCanvas
                false, // forceCode
                false, // forceResearch
                isGuestMode, // guestMode
              );

              // CRITICAL: If cancelled while waiting for response, discard everything
              if (cancelRequested) return;

              // Determine memory action
              let memoryAction: any = undefined;
              if (result.memorySaved) {
                memoryAction = { type: "context_saved" as const, content: result.memorySaved.content };
                window.dispatchEvent(new CustomEvent("context-blocks-updated"));
              } else if (result.webSources && result.webSources.length > 0) {
                memoryAction = {
                  type: "web_searched" as const,
                  sources: result.webSources,
                  query: userMessage,
                  searchProvider: result.searchProvider,
                };
              }

              // Add the complete response with source tag
              await addMessage({
                content: result.content,
                role: "assistant",
                type: "text",
                memoryAction,
                weatherData: result.weatherData,
                scheduledTask: result.scheduledTask,
                notificationDispatch: result.notificationDispatch,
                locationUsed: result.locationUsed,
                sourceModel: didSearchWeb
                  ? result.searchProvider === "tavily"
                    ? "cloud-search-tavily"
                    : "cloud-search"
                  : "cloud-chat",
              });

              // Handle canvas/code updates if the AI decided to use those tools
              if (result.codeUpdate) {
                const { openCodeCanvas } = useCanvasStore.getState();
                openCodeCanvas(result.codeUpdate.code, result.codeUpdate.language || "html", result.codeUpdate.label);
                const codeMsgId = await upsertCodeMessage(
                  result.codeUpdate.code,
                  result.codeUpdate.language || "html",
                  result.codeUpdate.label,
                );
                useArcStore.setState((state) => {
                  const idx = state.messages.findIndex((m) => m.id === codeMsgId);
                  if (idx === -1) return state;
                  const updated = [...state.messages];
                  updated[idx] = { ...updated[idx], sourceModel: "cloud-code" } as any;
                  return { messages: updated } as any;
                });
              } else if (result.canvasUpdate) {
                const { openCanvas } = useCanvasStore.getState();
                openCanvas(result.canvasUpdate.content);
                const canvasMsgId = await upsertCanvasMessage(result.canvasUpdate.content, result.canvasUpdate.label);
                useArcStore.setState((state) => {
                  const idx = state.messages.findIndex((m) => m.id === canvasMsgId);
                  if (idx === -1) return state;
                  const updated = [...state.messages];
                  updated[idx] = { ...updated[idx], sourceModel: "cloud-canvas" } as any;
                  return { messages: updated } as any;
                });
              }
            }
          } catch (err: any) {
            // On error, add error message
            await addMessage({
              content: "Sorry, I encountered an error. Please try again.",
              role: "assistant",
              type: "text",
              sourceModel: "cloud-chat",
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
          sourceModel: "cloud-chat",
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
  const queueDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      // Loading just finished — wait for state to settle, then poll until truly idle
      // before dispatching the next queued message. Polling avoids the race where
      // isLoading flickers false->true and the queued send gets re-queued silently.
      let attempts = 0;
      const tryDrain = () => {
        attempts++;
        const storeLoading = useArcStore.getState().isLoading;
        const storeGenerating = useArcStore.getState().isGeneratingImage;
        if (storeLoading || storeGenerating) {
          if (attempts < 20) {
            queueDrainTimerRef.current = setTimeout(tryDrain, 250);
          }
          return;
        }
        const { queue, isPaused, popNext } = useMessageQueueStore.getState();
        if (queue.length > 0 && !isPaused) {
          const next = popNext();
          if (next) {
            // Slight defer so React has flushed the previous turn's renders
            // (user/assistant bubbles) before we kick off the next handleSend.
            queueDrainTimerRef.current = setTimeout(() => handleSend(next.content), 50);
          }
        }
      };
      queueDrainTimerRef.current = setTimeout(tryDrain, 600);
      return () => {
        if (queueDrainTimerRef.current) clearTimeout(queueDrainTimerRef.current);
      };
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+Enter = always explicitly add to queue
        if (inputValue.trim()) {
          useMessageQueueStore.getState().addToQueue(inputValue.trim());
          setInputValue("");
        }
      } else {
        // Enter = send (or auto-queue if Arc is thinking)
        handleSend();
      }
    }
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="space-y-2 relative">
      {/* Drag overlay — portaled to body so it escapes any transformed parent */}
      {portalRoot &&
        createPortal(
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

      {/* Image options dock — visible whenever the user is in image-gen mode.
          Stacked above any selected-images / selected-documents previews. */}
      {!inline &&
        shouldShowBanana &&
        selectedImages.length === 0 &&
        (() => {
          const hasDocs = selectedDocuments.length > 0;
          const rect = inputBarRef.current?.getBoundingClientRect();
          const previewStack = hasDocs ? 100 : 0;
          const dockBottom = rect
            ? `${Math.max(12, window.innerHeight - rect.top + 12 + previewStack)}px`
            : `calc(${110 + previewStack}px + env(safe-area-inset-bottom, 0px))`;
          return (
            <ImageOptionsDock
              portalRoot={portalRoot}
              bottomOffset={dockBottom}
              leftPx={rect?.left}
              widthPx={rect?.width}
            />
          );
        })()}

      {/* Selected Documents preview - for non-inline, portal anchored above input */}
      {!inline &&
        selectedDocuments.length > 0 &&
        portalRoot &&
        (() => {
          const rect = inputBarRef.current?.getBoundingClientRect();
          const imgStack = selectedImages.length > 0 ? 220 : 0;
          const bottom = rect
            ? `${Math.max(12, window.innerHeight - rect.top + 12 + imgStack)}px`
            : `calc(${110 + imgStack}px + env(safe-area-inset-bottom, 0px))`;
          const anchored = rect ? { left: `${rect.left}px`, width: `${rect.width}px`, bottom } : { bottom };
          return createPortal(
            <div className={rect ? "fixed z-[33]" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"} style={anchored}>
              <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3 mx-auto max-w-[760px]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Documents ({selectedDocuments.length}/3)</span>
                  <button
                    onClick={() => setSelectedDocuments([])}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {selectedDocuments.map((doc, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 group">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm text-foreground truncate flex-1">{doc.name}</span>
                      <span className="text-xs text-muted-foreground">{(doc.size / 1024).toFixed(0)} KB</span>
                      <button
                        onClick={() => removeDocument(i)}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            portalRoot,
          );
        })()}

      {/* Selected Images preview - for non-inline, portal anchored above input */}
      {!inline &&
        selectedImages.length > 0 &&
        portalRoot &&
        (() => {
          const rect = inputBarRef.current?.getBoundingClientRect();
          const bottom = rect
            ? `${Math.max(12, window.innerHeight - rect.top + 12)}px`
            : `calc(110px + env(safe-area-inset-bottom, 0px))`;
          const anchored = rect ? { left: `${rect.left}px`, width: `${rect.width}px`, bottom } : { bottom };
          return createPortal(
            <div className={rect ? "fixed z-[33]" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"} style={anchored}>
              <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3 mx-auto max-w-[760px]">
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
                          className="w-10 h-10 sm:w-16 sm:h-16 object-cover rounded-full border border-border/40"
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
                {(shouldShowBanana || allImagesEditMode) && (
                  <div className="mt-3 pt-2 border-t border-border/30">
                    <ImageOptionsContent />
                  </div>
                )}
              </div>
            </div>,
            portalRoot,
          );
        })()}

      {/* Prompt enhancer chip — floats above input (portal) */}
      {inputValue.trim().split(/\s+/).filter(Boolean).length >= 2 &&
        portalRoot &&
        (() => {
          const rect = inputBarRef.current?.getBoundingClientRect();
          const bottom = rect
            ? `${Math.max(12, window.innerHeight - rect.top + 8)}px`
            : `calc(120px + env(safe-area-inset-bottom, 0px))`;
          const anchored = rect ? { left: `${rect.left}px`, width: `${rect.width}px`, bottom } : { bottom };
          return createPortal(
            <div
              className={rect ? "fixed z-[32] pointer-events-none" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[32] pointer-events-none"}
              style={anchored}
            >
              <div className="px-4 flex justify-end mx-auto max-w-[760px]">
                <PromptEnhancer
                  text={inputValue}
                  kind={shouldShowBanana ? "image" : "chat"}
                  onAccept={(improved) => {
                    setInputValue(improved);
                    toast({ title: "Prompt enhanced ✨", duration: 2000 });
                  }}
                  className="pointer-events-auto"
                />
              </div>
            </div>,
            portalRoot,
          );
        })()}

      {/* Usage Meter for Voice — anchored above input (portal) when no images/docs previews are active */}
      {!inline &&
        isVoiceActive &&
        !shouldShowBanana &&
        selectedImages.length === 0 &&
        selectedDocuments.length === 0 &&
        portalRoot &&
        (() => {
          const rect = inputBarRef.current?.getBoundingClientRect();
          const bottom = rect
            ? `${Math.max(12, window.innerHeight - rect.top + 12)}px`
            : `calc(110px + env(safe-area-inset-bottom, 0px))`;
          const anchored = rect ? { left: `${rect.left}px`, width: `${rect.width}px`, bottom } : { bottom };
          return createPortal(
            <div
              className={rect ? "fixed z-[32] pointer-events-none" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[32] pointer-events-none"}
              style={anchored}
            >
              <div className="px-1 flex justify-end mx-auto max-w-[760px]">
                <UsageMeter kind="voice" className="pointer-events-auto" />
              </div>
            </div>,
            portalRoot,
          );
        })()}

      <div
        ref={inputBarRef}
        className={cn(
          "relative flex flex-col gap-2 p-0.5 transition-all duration-300",
          isActive ? "opacity-100" : "opacity-95",
        )}
      >
        <div className="flex items-end gap-2 relative">
          {/* Main Input Wrapper */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mode indicators removed — single-tool indication is handled inline elsewhere */}


            <div className="relative flex items-center gap-2">
              {/* Add/Attachment Menu */}
              <div className="relative">
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  className={cn(
                    "ci-menu-btn flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-muted/15 active:scale-95 shrink-0 overflow-hidden",
                    (shouldShowSearchMode || shouldShowBanana || shouldShowCodeMode || showCanvasIndicator || personaMention || activePersona) && !showMenu && "text-primary"
                  )}
                  aria-label={activePersona ? `Chatting with ${activePersona.name}` : "Add content"}
                  title={activePersona ? `Chatting with ${activePersona.name}` : undefined}
                >
                  {showMenu ? (
                    <X className="h-4 w-4 transition-transform duration-300" />
                  ) : activePersona ? (
                    activePersona.avatarUrl ? (
                      <img
                        src={activePersona.avatarUrl}
                        alt={activePersona.name}
                        loading="lazy"
                        className="w-8 h-8 rounded-full object-cover bg-white ring-2 ring-primary/60"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold ring-2 ring-primary/60">
                        {activePersona.name[0].toUpperCase()}
                      </div>
                    )
                  ) : personaMention ? (
                    <Sparkles className="h-4 w-4 text-primary" />
                  ) : shouldShowSearchMode ? (
                    <Globe className="h-4 w-4 text-indigo-400" />
                  ) : shouldShowBanana ? (
                    <ImagePlus className="h-4 w-4 text-amber-500" />
                  ) : shouldShowCodeMode ? (
                    <Code2 className="h-4 w-4 text-emerald-500" />
                  ) : showCanvasIndicator ? (
                    <PenLine className="h-4 w-4 text-pink-400" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>

                {/* Clear active persona badge */}
                {!showMenu && activePersona && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearActivePersona();
                      toast({ title: "Persona cleared", description: "Back to a normal chat." });
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground/80 text-background flex items-center justify-center shadow-md hover:bg-foreground transition-colors z-10"
                    aria-label="Clear persona"
                    title="Clear persona"
                  >
                    <X className="w-2.5 h-2.5" strokeWidth={3} />
                  </button>
                )}

                {/* Clear active tool badge */}
                {!showMenu && !activePersona && (shouldShowSearchMode || shouldShowBanana || shouldShowCodeMode || shouldShowCanvasMode) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForceImageMode(false);
                      setForceSearchMode(false);
                      setForceCodingMode(false);
                      setForceCanvasMode(false);
                      setInputValue((v) =>
                        v.replace(/^\s*(image|search|code|write)\/\s*/i, "")
                      );
                      textareaRef.current?.focus();
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground/80 text-background flex items-center justify-center shadow-md hover:bg-foreground transition-colors z-10"
                    aria-label="Clear active tool"
                    title="Clear active tool"
                  >
                    <X className="w-2.5 h-2.5" strokeWidth={3} />
                  </button>
                )}

                {/* Slash/Add Picker Menu */}
                {createPortal(
                  <AnimatePresence>
                  {showMenu && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="ci-tiles fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowMenu(false)}
                      />
                      <div className="ci-tiles fixed inset-0 z-[401] flex items-center justify-center p-4 pointer-events-none">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        style={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                        }}
                        className="pointer-events-auto w-[min(92vw,480px)] max-h-[85vh] overflow-y-auto p-4 rounded-3xl shadow-2xl"
                      >
                        <div className="flex items-center justify-between mb-3 px-1">
                          <span className="text-sm font-semibold">Tools & Actions</span>
                          <button
                            onClick={() => setShowMenu(false)}
                            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                            aria-label="Close"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowMenu(false);
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-white/10 transition-colors group border border-white/5"
                          >
                            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30">
                              <Paperclip className="h-5 w-5 text-blue-400" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-sm font-semibold">Attach</span>
                              <span className="text-[10px] text-muted-foreground font-normal">Files, PDFs, Docs</span>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setForceImageMode(true);
                              setInputValue("image/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-white/10 transition-colors group border border-white/5"
                          >
                            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30">
                              <ImagePlus className="h-5 w-5 text-amber-500" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-sm font-semibold">Generate</span>
                              <span className="text-[10px] text-muted-foreground font-normal">AI Image Creation</span>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setForceSearchMode(true);
                              setInputValue("search/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-white/10 transition-colors group border border-white/5"
                          >
                            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30">
                              <Globe className="h-5 w-5 text-indigo-400" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-sm font-semibold">Search</span>
                              <span className="text-[10px] text-muted-foreground font-normal">Live Web Results</span>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setForceCodingMode(true);
                              setInputValue("code/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-white/10 transition-colors group border border-white/5"
                          >
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30">
                              <Code2 className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-sm font-semibold">Code</span>
                              <span className="text-[10px] text-muted-foreground font-normal">Scripting & logic</span>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setForceCanvasMode(true);
                              setInputValue("write/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-white/10 transition-colors group border border-white/5"
                          >
                            <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center group-hover:bg-pink-500/30">
                              <PenLine className="h-5 w-5 text-pink-400" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-sm font-semibold">Draft</span>
                              <span className="text-[10px] text-muted-foreground font-normal">Writing & Layouts</span>
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              setShowPromptLibrary(true);
                              setShowMenu(false);
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-white/10 transition-colors group border border-white/5"
                          >
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                              <ListPlus className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-sm font-semibold">Prompts</span>
                              <span className="text-[10px] text-muted-foreground font-normal">Template library</span>
                            </div>
                          </button>
                        </div>
                        {PERSONAS_ENABLED && !activePersona && sortedPersonas.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-white/10">
                            <div className="px-1 mb-2 text-xs font-semibold text-muted-foreground">Personas</div>
                            <div className="grid grid-cols-2 gap-2">
                              {sortedPersonas.map((p) => {
                                const isCustom = !p.id.startsWith('builtin-');
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => selectPersona(p)}
                                    className="flex items-center gap-2 p-2 rounded-2xl hover:bg-white/10 transition-colors border border-white/5 text-left min-w-0"
                                  >
                                    {p.avatarUrl ? (
                                      <img src={p.avatarUrl} alt={p.name} loading="lazy" className="w-9 h-9 rounded-full object-cover bg-white shrink-0" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                        {p.name[0].toUpperCase()}
                                      </div>
                                    )}
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-semibold truncate">{p.name}</span>
                                      {isCustom && <span className="block text-[10px] text-primary font-semibold">Custom</span>}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </motion.div>
                      </div>
                    </>
                  )}
                </AnimatePresence>,
                  document.body
                )}
              </div>

              {/* Persona Mentions Suggestions — centered modal like Tools menu */}
              {createPortal(
                <AnimatePresence>
                  {showingPersonaSuggestions && filteredPersonas.length > 0 && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm"
                        onClick={() => {
                          const lastAtIndex = inputValue.lastIndexOf("@");
                          if (lastAtIndex >= 0) setInputValue(inputValue.slice(0, lastAtIndex));
                        }}
                      />
                      <div className="fixed inset-0 z-[401] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          style={{
                            background: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                          }}
                          className="pointer-events-auto w-[min(92vw,480px)] max-h-[85vh] overflow-y-auto p-4 rounded-3xl shadow-2xl"
                        >
                          <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-sm font-semibold">Summon a Persona</span>
                            <button
                              onClick={() => {
                                const lastAtIndex = inputValue.lastIndexOf("@");
                                if (lastAtIndex >= 0) setInputValue(inputValue.slice(0, lastAtIndex));
                              }}
                              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                              aria-label="Close"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {filteredPersonas.map((p) => {
                              const isCustom = !p.id.startsWith('builtin-');
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => selectPersona(p)}
                                  className="flex flex-col items-center gap-2 p-4 rounded-2xl hover:bg-white/10 transition-colors group border border-white/5 text-center relative"
                                >
                                  {isCustom && (
                                    <span className="absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                                      Custom
                                    </span>
                                  )}
                                  {p.avatarUrl ? (
                                    <img
                                      src={p.avatarUrl}
                                      alt={p.name}
                                      loading="lazy"
                                      className="w-12 h-12 rounded-xl object-cover bg-white"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg">
                                      {p.name[0].toUpperCase()}
                                    </div>
                                  )}
                                  <div className="flex flex-col items-center min-w-0 w-full">
                                    <span className="text-sm font-semibold truncate w-full">{p.name}</span>
                                    <span className="text-[10px] text-muted-foreground font-normal line-clamp-2">{p.description || ''}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      </div>
                    </>
                  )}
                </AnimatePresence>,
                document.body,
              )}





              {/* Input Field */}
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                onPaste={handlePaste}
                onFocus={handleInputFocus}
                placeholder={isLoading ? "Thinking..." : "Message Arc..."}
                className="flex-1 min-h-[28px] max-h-[200px] border-0 bg-transparent py-1 pr-4 focus-visible:ring-0 resize-none text-base placeholder:text-muted-foreground/60 scrollbar-hide"
                rows={1}
              />
            </div>
          </div>

          {/* Action Button - Voice or Send or Stop */}
          <div className="flex items-center gap-1.5 shrink-0 self-center">
            {isLoading || isGeneratingImage ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={cancelCurrentRequest}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-lg transition-all"
                title="Stop response"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </motion.button>
            ) : inputValue.trim() || selectedImages.length > 0 || selectedDocuments.length > 0 ? (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSend()}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-transparent text-primary hover:bg-primary/10 transition-all"
                aria-label="Send"
              >
                <ArrowRight className="h-4 w-4" />
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (isDashboard) {
                    navigate("/chat");
                    setTimeout(() => activateVoiceMode(), 100);
                  } else {
                    activateVoiceMode();
                  }
                }}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/40 hover:bg-primary/15 text-foreground hover:text-primary transition-all"
                title="Voice mode"
              >
                <Mic className="h-4 w-4" />
              </motion.button>
            )}
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />

      <PromptLibrary
        isOpen={showPromptLibrary}
        onClose={() => setShowPromptLibrary(false)}
        prompts={quickPrompts}
        onSelectPrompt={(p) => {
          setInputValue(p);
          textareaRef.current?.focus();
        }}
      />
    </div>
  );
});
