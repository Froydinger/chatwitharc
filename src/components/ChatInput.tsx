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
  Hammer,
  Clapperboard,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { predictActivity } from "@/lib/activityPrediction";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useToast } from "@/hooks/use-toast";
import { useBugReport } from "@/hooks/useBugReport";
import { useFingerPopup } from "@/hooks/use-finger-popup";
import { useProfile } from "@/hooks/useProfile";
import { useAccentColor } from "@/hooks/useAccentColor";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useModelStore, getModelForTask, LUNA_MODEL } from "@/store/useModelStore";
import { AIService, getQueryComplexity } from "@/services/ai";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useStreamingWithContinuation } from "@/hooks/useStreamingWithContinuation";
import { detectMemoryCommand, addToMemoryBank } from "@/utils/memoryDetection";
import { addContextBlockDirect, useContextBlocks } from "@/hooks/useContextBlocks";
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
// ChatModelPicker now lives in the chat header (MobileChatApp), not the input bar.
import { UsageMeter } from "@/components/UsageMeter";
import { useImageGenStore, useResolvedImageModel, useEditImageModel } from "@/store/useImageGenStore";
import { useVideoGenStore, orientationForDimensions } from "@/store/useVideoGenStore";
import { useVideoAccess } from "@/hooks/useVideoAccess";
import { useSearchResultsModalStore } from "@/store/useSearchResultsModalStore";
import { AnimateAttachmentModal } from "@/components/AnimateAttachmentModal";
import { useImageQuota } from "@/hooks/useImageQuota";

// Global cancellation flag and AbortController
let cancelRequested = false;
let currentAbortController: AbortController | null = null;

function shouldForceVideoSearch(message: string): boolean {
  const text = message.toLowerCase();
  const asksForVideo =
    /\b(youtube|youtu\.be|video|clip|watch|play|embed)\b/.test(text) ||
    /\bshow me\b.*\b(kid|song|scene|video|clip)\b/.test(text);
  const wantsLookup =
    /\b(show me|find|look up|search|pull up|get me|link|embed|play|watch)\b/.test(text) ||
    /\bon youtube\b/.test(text);

  return asksForVideo && wantsLookup;
}

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
    /^(?:(?:okay|ok|yeah|alright|cool)[,!]?\s+)?(can\s+you\s+)?(please\s+)?(generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(me\s+)?(an?\s+)?(image|picture|pic|photo|illustration|artwork|graphic|icon|logo|wallpaper|poster|banner|thumbnail)/i.test(
      m,
    )
  )
    return true;
  // "draw me a [subject]" or "paint me a [subject]" - drawing/painting implies visual
  if (/^(can\s+you\s+)?(please\s+)?(draw|paint|sketch)\s+(me\s+)?(a|an|the|some)\s+/i.test(m)) return true;
  // Broader match: verb + optional "me" + image word anywhere in short messages
  if (
    /\b(generate|create|make|draw|paint)\s+(me\s+)?(an?\s+)?(image|picture|pic|photo|illustration)\b/i.test(m) &&
    m.length < 200
  )
    return true;
  return false;
}

/**
 * Video is Boost-only and costs ~$0.40 a clip, so detection is deliberately
 * narrower than the image equivalent — an explicit prefix or an unambiguous
 * "make a video of ..." phrasing. Vague verbs like "create" or "render" on
 * their own stay on the image path.
 */
function checkForVideoRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (/^(video|animate)\//.test(m) || /^\/(video|animate)\b/.test(m)) return true;
  if (
    /^(can\s+you\s+)?(please\s+)?(generate|create|make|render|produce)\s+(me\s+)?(an?\s+)?(short\s+)?(video|clip|animation|gif)\b/i.test(m)
  )
    return true;
  if (/\b(make|create|generate|turn\s+this\s+into)\s+(it\s+|this\s+|that\s+)?(an?\s+)?(video|animation|clip)\b/i.test(m) && m.length < 200)
    return true;
  return false;
}

/** "animate this", "make this image move" — an edit-style follow-up on a still. */
function isAnimateImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (/^(animate|\/animate|animate\/)\b/.test(m)) return true;
  return /\b(animate|bring\s+(this|it)\s+to\s+life|make\s+(this|it)\s+(move|animated)|turn\s+(this|it)\s+into\s+a\s+(video|clip|animation))\b/i.test(m);
}

/**
 * Strips the request scaffolding down to the subject. Returns "" when the
 * message was pure directive ("animate this"), so callers can fall back to a
 * sensible default instead of feeding the model the instruction verbatim.
 */
function extractVideoPrompt(message: string): string {
  let prompt = (message || "").trim();
  prompt = prompt.replace(/^(video|animate)\/\s*/i, "").replace(/^\/(video|animate)\s*/i, "").trim();
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  prompt = prompt
    .replace(
      /^(?:generate|create|make|render|produce)\s+(?:me\s+)?(?:an?\s+)?(?:short\s+)?(?:video|clip|animation)?\s*(?:of|showing)?\s*/i,
      "",
    )
    .trim();
  // Bare animate directives carry no subject — drop them entirely rather than
  // sending "animate this" to the model as the scene description.
  prompt = prompt
    .replace(
      /^(?:animate|bring)\s+(?:this|it|that)(?:\s+image)?(?:\s+to\s+life)?\s*/i,
      "",
    )
    .replace(/^(?:make|turn)\s+(?:this|it|that)\s+(?:move|animated|into\s+an?\s+(?:video|clip|animation))\s*/i, "")
    .trim();
  return prompt;
}

/**
 * The model only renders 1280x720 or 720x1280, so a still being animated is
 * matched to whichever is closer to its own shape — a square or landscape
 * image would otherwise get centre-cropped into portrait. Defaults to
 * landscape if the image can't be measured.
 */
async function orientationForImageUrl(url: string): Promise<'landscape' | 'portrait'> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (o: 'landscape' | 'portrait') => resolve(o);
    img.onload = () => done(orientationForDimensions(img.naturalWidth, img.naturalHeight));
    img.onerror = () => done('landscape');
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

function extractSubjectForImageRequest(message: string): string {
  const m = message.trim();
  let cleaned = m.replace(/^(can\s+you\s+)?(please\s+)?(show\s+me|find|search\s+for|look\s+up|google|generate|create|make|draw|paint|render|give\s+me)\s+/i, '');
  cleaned = cleaned.replace(/^(an?\s+)?(image|picture|pic|photo|illustration|drawing|visual|graphic|sketch|artwork|clipart|photos|images|pictures|pics)\s+(of|for|about)\s+/i, '');
  cleaned = cleaned.replace(/\b(photos|images|pictures|pics|photo|image|picture|pic)\b/i, '');
  return cleaned.trim() || "a beautiful subject";
}

function analyzeImageRequestIntent(message: string): 'generate' | 'search' | 'ask' | 'none' {
  if (!message) return 'none';
  const m = message.trim().toLowerCase();
  
  const isImageQuery = /\b(image|picture|pic|photo|illustration|drawing|visual|graphic|sketch|artwork|clipart)s?\b/i.test(m);
  if (!isImageQuery) {
    return 'none';
  }

  const explicitGen = /\b(generate|create|make|draw|paint|render|sketch|produce|design|vector|ai\s+generate|generate\s+ai|stable\s+diffusion|dall-e|midjourney|make\s+me\s+an?)\b/i.test(m);
  const explicitSearch = /\b(search|find|look\s+up|google|tavily|web\s+search|real|actual|photo\s+of|photograph|stock\s+photo|camera|live)\b/i.test(m);

  if (explicitGen && !explicitSearch) {
    return 'generate';
  }
  if (explicitSearch && !explicitGen) {
    return 'search';
  }
  return 'ask';
}

// Prefix-based detection: code/ OR /code — opens code canvas (inline code block), NOT the IDE
function checkForCodingRequest(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (/^code\//.test(m) || /^\/code\b/.test(m)) return true;
  return false;
}

// App Builder IDE is paused — /build shows a coming-soon notice
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

  const actionableCanvasLanguage =
    /\b(canvas|draft|doc|document|agenda|outline|post|article|email|letter|script|copy)\b/i.test(m) &&
    /\b(i\s+(filled|updated|changed|edited|added|wrote)|filled\s+in|fill\s+(in\s+)?(the\s+)?rest|finish|complete|continue|go\s+nuts|just\s+go|use\s+what|take\s+what)\b/i.test(m);

  if (actionableCanvasLanguage) return false;

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
    "i filled",
    "filled in",
    "i updated",
    "updated the canvas",
    "changed the canvas",
    "edited the canvas",
    "fill in the rest",
    "fill the rest",
    "finish it",
    "complete it",
    "continue",
    "just go",
    "go nuts",
    "use what i",
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

function referencesCanvasSurface(message: string): boolean {
  if (!message) return false;
  return /\b(canvas|draft|doc|document|agenda|outline|piece|article|post|email|letter)\b/i.test(message);
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

function referencesCodeSurface(message: string): boolean {
  if (!message) return false;
  const m = message.trim().toLowerCase();
  if (isConversationalMessage(m)) return false;

  return /\b(code|coded|html|css|javascript|typescript|react|component|app|website|webpage|page|ui|ux|interface|layout|visuals?|design|style|styles|styling|button|buttons|animation|responsive|mobile|desktop)\b/i.test(m);
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
  prompt = prompt.replace(/^(?:(?:okay|ok|yeah|alright|cool)[,!]?\s+)?/i, "").trim();
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  prompt = prompt
    .replace(
      /^(?:generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(?:an?\s+)?(?:image|picture|pic|photo|illustration|artwork|graphic)?\s*(?:of)?\s*/i,
      "",
    )
    .trim();
  if (!prompt) prompt = message.trim();
  if (!/^(a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) prompt = `a ${prompt}`;
  return prompt;
}

function isContextualImagePrompt(message: string): boolean {
  const cleaned = extractPrefixPrompt(message).trim().toLowerCase().replace(/[.!?]+$/g, '');
  return /^(?:okay\s+|ok\s+|yeah\s+|alright\s+)?(?:go\s+for\s+it|do\s+it|make\s+it|generate\s+it|create\s+it|that|this|it)$/i.test(cleaned) ||
    /\b(?:image|picture|pic|photo|illustration)\s+(?:of\s+)?(?:that|this|it)\b/i.test(cleaned) ||
    /\b(?:generate|create|make|draw|render|visualize)\b[\s\S]*\b(?:that|this|it)\b/i.test(cleaned);
}

function findRecentVisualContext(messages: Message[]): string | null {
  for (let index = messages.length - 1; index >= Math.max(0, messages.length - 8); index -= 1) {
    const message = messages[index];
    if (message.imagePrompt?.trim()) return message.imagePrompt.trim();
    if (message.type !== 'text' || !message.content?.trim()) continue;

    const content = message.content.trim();
    // Prefer an explicit prompt Arc already drafted, including any negative
    // prompt that follows it. This is the common "okay, generate that" flow.
    const promptMarker = content.match(/(?:^|\n)\s*(?:\*\*)?Prompt:(?:\*\*)?\s*/i);
    if (promptMarker?.index !== undefined) {
      return content.slice(promptMarker.index + promptMarker[0].length).trim().slice(0, 5000);
    }

    // Skip tiny acknowledgements and tool/status copy; use the latest actual
    // concept description from either participant.
    if (content.length < 40) continue;
    if (/^(generating|editing|searching|i(?:'|’)ll look|let me look)/i.test(content)) continue;
    return content.slice(0, 5000);
  }
  return null;
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
  const openBugReport = useBugReport((state) => state.openBugReport);
  const showPopup = useFingerPopup((state) => state.showPopup);
  const { user, isAnonymous } = useAuth();
  // Guest mode = no user OR anonymous (auto-issued) Supabase session.
  const isGuestMode = !user || isAnonymous;
  const requireAuth = useRequireAuth();
  const { hasBoost, openCheckout } = useSubscription();

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
    createNewSession,
  } = useArcStore();
  const { profile, updateProfile } = useProfile();
  const { accentColor } = useAccentColor();
  const { openSearchMode } = useSearchStore();
  const { streamWithContinuation } = useStreamingWithContinuation();

  useEffect(() => {
    const handleOpenBugReport = (event: Event) => {
      const summary = (event as CustomEvent<{ summary?: string }>).detail?.summary || "";
      openBugReport(summary);
    };
    window.addEventListener("arc-open-bug-report", handleOpenBugReport);
    return () => window.removeEventListener("arc-open-bug-report", handleOpenBugReport);
  }, [openBugReport]);

  // Subscribe to canvas store reactively for auto-mode indicator when canvas is open
  // Use individual selectors for reliable re-renders when canvas open state changes
  const isWriteCanvasOpen = useCanvasStore((s) => s.isOpen && s.canvasType === "writing");

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [animateAttachmentOpen, setAnimateAttachmentOpen] = useState(false);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [allImagesEditMode, setAllImagesEditMode] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const { dailyImagesUsed, remainingImages, limit } = useImageQuota();
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const handleOpen = () => setShowLimitsModal(true);
    window.addEventListener("open-image-limits-modal", handleOpen);
    return () => window.removeEventListener("open-image-limits-modal", handleOpen);
  }, []);

  // Ref to always point to latest handleExternalImageEdit (avoids stale closures in event listeners)
  const handleExternalImageEditRef = useRef<(...args: any[]) => void>(() => {});
  // Same pattern as the image-edit ref: the listener is registered once, so it
  // has to reach the current closure rather than the one from mount.
  const runVideoGenerationRef = useRef<(...args: any[]) => void>(() => {});

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

  // Mode toggles for image, coding, canvas, search, and build (IDE)
  const [forceImageMode, setForceImageMode] = useState(false);
  const [forceCodingMode, setForceCodingMode] = useState(false);
  const [forceCanvasMode, setForceCanvasMode] = useState(false);
  const [forceSearchMode, setForceSearchMode] = useState(false);
  const [forceBuildMode, setForceBuildMode] = useState(false);
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));
  const shouldShowCodeMode = forceCodingMode || (!!inputValue && checkForCodingRequest(inputValue));
  const shouldShowCanvasMode = forceCanvasMode || (!!inputValue && checkForCanvasRequest(inputValue));
  const shouldShowSearchMode = forceSearchMode || (!!inputValue && checkForSearchRequest(inputValue));
  const shouldShowBuildMode = forceBuildMode || (!!inputValue && checkForBuildRequest(inputValue));

  // Persisted user-chosen image model + aspect ratio (for /image, "draw…", etc.)
  const { aspectRatio: imageGenAspect, editAspectRatio: imageEditAspect, count: imageGenCount } = useImageGenStore();
  const imageGenModel = useResolvedImageModel();
  // Edits are GPT Image 2 only — never send the Quick (mini) model to an edit.
  const imageEditModel = useEditImageModel();

  // Video is allowlisted by email rather than sold with Boost — see
  // useVideoAccess for why. The server enforces the same list.
  const { seconds: videoSeconds, orientation: videoOrientation } = useVideoGenStore();
  const { canGenerateVideo } = useVideoAccess();

  // When a /write canvas is open, auto-show canvas mode indicator so user knows
  // their messages will modify the canvas (not go to chat)
  const showCanvasIndicator = shouldShowCanvasMode || isWriteCanvasOpen;
  // Auto mode = indicator is shown because canvas is open, not from explicit /write prefix
  const isCanvasAutoMode = isWriteCanvasOpen && !shouldShowCanvasMode;

  // When user types just "/" open the same tools menu as the + button
  useEffect(() => {
    if (inputValue.trim() === "/") {
      setInputValue("");
      if (isGuestMode) {
        requireAuth("tools");
        return;
      }
      setShowMenu(true);
    }
  }, [inputValue, isGuestMode, requireAuth]);

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
  // Only claim "accessing memories" when memories were actually attached to
  // the request — with none, a self-referential question is just a question.
  const { blocks: memoryBlocks } = useContextBlocks();

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

  // Listen for user image choice selection (from choice button grid)
  useEffect(() => {
    const handleChoice = async (e: Event) => {
      const { action, subject, messageId } = (e as CustomEvent).detail;
      
      // Clear choice metadata to make the buttons vanish from UI
      useArcStore.setState((state) => {
        const idx = state.messages.findIndex((m: any) => m.id === messageId);
        if (idx === -1) return state;
        const updated = [...state.messages];
        updated[idx] = { ...updated[idx], imageChoiceSubject: undefined };
        return { messages: updated } as any;
      });

      // Submit immediately on behalf of the user
      if (action === 'generate') {
        void handleSend(`/image ${subject}`);
      } else {
        void handleSend(`/search images of ${subject}`);
      }
    };

    window.addEventListener('image-choice-selected', handleChoice);
    return () => window.removeEventListener('image-choice-selected', handleChoice);
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
      const max = 6;
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


        let didSearchWeb = false;
        const shouldSearchForVideo = shouldForceVideoSearch(newContent);
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
            // save_memory was never wired up, so setAccessingMemory(true) had no
            // caller anywhere in the cloud path and the memory indicator could
            // never appear — only ever be switched off.
            if (tools.includes("save_memory")) {
              setAccessingMemory(true);
            }
          },
          currentSessionId || undefined,
          shouldSearchForVideo,
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
          useSearchResultsModalStore.getState().show({
            query: newContent,
            content: result.content,
            sources: result.webSources,
          });
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
          modelUsed: result.modelUsed,
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
          modelUsed: useModelStore.getState().chatModel,
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
        count?: number;
      }>;
      if (!e?.detail) return;
      handleExternalImageEditRef.current(
        e.detail.content,
        e.detail.baseImageUrl,
        e.detail.editInstruction,
        e.detail.imageModel,
        e.detail.additionalImages,
        e.detail.aspectRatio,
        e.detail.count,
      );
    };
    const editedMessageHandler = (ev: Event) => {
      const e = ev as CustomEvent<{ content: string; editedMessageId: string }>;
      if (!e?.detail) return;
      handleEditedMessage(e.detail.content, e.detail.editedMessageId);
    };
    const animateHandler = (ev: Event) => {
      const e = ev as CustomEvent<{ imageUrl: string; prompt?: string }>;
      if (!e?.detail?.imageUrl) return;
      const prompt = e.detail.prompt?.trim() || "Bring this image to life with subtle, natural motion";
      runVideoGenerationRef.current("Animate this image", prompt, e.detail.imageUrl);
    };
    window.addEventListener("quickPromptSelected", quickHandler as EventListener);
    window.addEventListener("arcai:triggerPrompt", quickHandler as EventListener);
    window.addEventListener("processImageEdit", editHandler as EventListener);
    window.addEventListener("processEditedMessage", editedMessageHandler as EventListener);
    window.addEventListener("processAnimateImage", animateHandler as EventListener);
    return () => {
      window.removeEventListener("quickPromptSelected", quickHandler as EventListener);
      window.removeEventListener("arcai:triggerPrompt", quickHandler as EventListener);
      window.removeEventListener("processImageEdit", editHandler as EventListener);
      window.removeEventListener("processEditedMessage", editedMessageHandler as EventListener);
      window.removeEventListener("processAnimateImage", animateHandler as EventListener);
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
    countOverride?: number,
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

      const effectiveCount = Math.max(1, Math.min(3, Math.floor(Number(countOverride ?? imageGenCount) || 1)));
      const finalUrls = await ai.editImage(editInstruction, allImageUrls, imageModel, aspectRatio, effectiveCount);

      const fallbackModel = ((): string | null => { try { const v = (window as any).__lastImageFallback || null; (window as any).__lastImageFallback = null; return v; } catch { return null; } })();
      await replaceLastMessage({
        content: finalUrls.length > 1 ? `Edited ${finalUrls.length} images: ${editInstruction}` : `Edited image: ${editInstruction}`,
        role: "assistant",
        type: "image",
        imageUrl: finalUrls[0],
        imageUrls: finalUrls,
        sourceModel: fallbackModel ? "cloud-image-edit-fallback" : "cloud-image-edit",
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

  /* ---------- Video generation (Boost/admin only) ---------- */

  /**
   * Renders a clip and drops it in the chat. Two shapes: text-to-video, or
   * animating an existing still when `sourceImageUrl` is given.
   *
   * The finished MP4 lands in the browser's IndexedDB and nowhere else — the
   * message row only carries the job id. That keeps Supabase from filling up
   * with video, at the cost of the clip being device-local, which is why the
   * completion copy says so out loud.
   */
  const runVideoGeneration = async (
    userMessage: string,
    videoPrompt: string,
    sourceImageUrl?: string,
  ) => {
    if (useArcStore.getState().isGeneratingImage) return;

    // Backstop only. Callers already gate on canGenerateVideo, and the server
    // enforces the real allowlist, so reaching this means something upstream
    // is wrong rather than a user hitting a limit.
    if (!canGenerateVideo) {
      toast({
        title: "Video isn't enabled on this account",
        description: "Video generation is limited while the provider is being replaced.",
        variant: "destructive",
      });
      return;
    }

    await addMessage({
      content: userMessage,
      role: "user",
      type: sourceImageUrl ? "image" : "text",
      ...(sourceImageUrl ? { imageUrl: sourceImageUrl, imageUrls: [sourceImageUrl] } : {}),
    });

    await addMessage({
      content: sourceImageUrl ? `Animating image: ${videoPrompt}` : `Generating video: ${videoPrompt}`,
      role: "assistant",
      type: "video-generating",
      videoPrompt,
      videoSourceImageUrl: sourceImageUrl,
      sourceModel: "cloud-video",
    });

    setGeneratingImage(true);

    try {
      const ai = new AIService();
      // A still keeps its own shape; text-to-video follows the saved pref.
      const orientation = sourceImageUrl
        ? await orientationForImageUrl(sourceImageUrl)
        : videoOrientation;

      const result = await ai.generateVideo(videoPrompt, {
        seconds: videoSeconds,
        orientation,
        sourceImageUrl,
      });

      await replaceLastMessage({
        content: sourceImageUrl
          ? `Animated your image — saved on this device only, so download it if you want to keep it.`
          : `Here's your ${result.seconds}s video — saved on this device only, so download it if you want to keep it.`,
        role: "assistant",
        type: "video",
        videoJobId: result.jobId,
        videoPrompt,
        videoSeconds: result.seconds,
        videoSize: result.size,
        videoSourceImageUrl: sourceImageUrl,
        sourceModel: "cloud-video",
      });
    } catch (err: any) {
      await replaceLastMessage({
        content: err?.message || "Video generation failed. Please try again.",
        role: "assistant",
        type: "text",
        sourceModel: "cloud-video",
      });
    } finally {
      setGeneratingImage(false);
    }
  };

  runVideoGenerationRef.current = runVideoGeneration;

  /**
   * Animate an image the user attached (rather than one Arc generated).
   *
   * The file has to be uploaded first: the edge function fetches the source
   * server-side, and the preview is a `blob:` URL that only exists in this
   * tab. Storing a data URL on the message instead would work but would bloat
   * the chat row, since messages persist as JSONB.
   */
  const handleAnimateAttachment = async (file: File, prompt: string) => {
    if (useArcStore.getState().isGeneratingImage) return;

    let sourceUrl: string;
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not signed in");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const name = `${currentUser.id}/animate-source-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(name, file, {
        contentType: file.type || "image/png",
        upsert: false,
      });
      if (error) throw error;
      const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
      if (!pub?.publicUrl) throw new Error("No public URL returned");
      sourceUrl = pub.publicUrl;
    } catch (err) {
      console.error("Animate attachment upload failed:", err);
      toast({
        title: "Couldn't upload that image",
        description: "The image needs to be uploaded before it can be animated. Please try again.",
        variant: "destructive",
      });
      return;
    }

    clearSelected();
    await runVideoGeneration(prompt, prompt, sourceUrl);
  };

  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride ?? inputValue;
    if (!messageToSend.trim() && selectedImages.length === 0 && selectedDocuments.length === 0) return;

    if (!user || isAnonymous) {
      if (messageToSend.trim()) {
        sessionStorage.setItem("pending-prompt", messageToSend.trim());
      }
      requireAuth("generic");
      return;
    }

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
    }

    const userMessage = messageToSend.trim();
    let images = [...selectedImages];
    let documents = [...selectedDocuments];

    // Check if the user is asking to change models in chat
    const lowerMsg = userMessage.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").trim();
    const isModelSwitchQuery =
      lowerMsg === "use a better model" || lowerMsg === "use better model" || lowerMsg === "go better" || lowerMsg === "better model" ||
      lowerMsg === "use the best model" || lowerMsg === "use best model" || lowerMsg === "go best" || lowerMsg === "best model" ||
      lowerMsg === "use a faster model" || lowerMsg === "use faster model" || lowerMsg === "go faster" || lowerMsg === "use a faster" || lowerMsg === "faster model" ||
      lowerMsg === "use a smarter model" || lowerMsg === "use smarter model" || lowerMsg === "go smarter" || lowerMsg === "use a smarter" || lowerMsg === "smarter model" ||
      lowerMsg === "switch models" || lowerMsg === "upgrade model" || lowerMsg === "change model" || lowerMsg === "change models" || lowerMsg === "switch model";

    if (isModelSwitchQuery) {
      // Add user message to UI
      await addMessage({ content: userMessage, role: "user", type: "text" });
      
      // Get the current model in use to display as the tag on the helper message
      const currentModel = useModelStore.getState().chatModel;

      // Add assistant prompt instructing model picker usage
      await addMessage({
        content: "Luna is Arc's default and only model for now. Use the picker at the top of the chat to choose Auto, Quick, Balanced, or Deep reasoning. Auto starts with Quick and steps up for clearly harder requests.",
        role: "assistant",
        type: "text",
        sourceModel: "cloud-chat",
        modelUsed: currentModel,
      });

      setInputValue("");
      setLoading(false);
      return;
    }

    let finalMessage = userMessage;

    // Capture mode states BEFORE clearing UI (they're needed in handleSendMessage)
    let wasCanvasMode = shouldShowCanvasMode || checkForCanvasRequest(finalMessage);
    let wasCodingMode = shouldShowCodeMode || checkForCodingRequest(finalMessage);
    // Video is checked before image so "make a video of a cat" doesn't get
    // claimed by the (much broader) image matcher. Gated on access up front so
    // the feature is genuinely invisible to everyone else — a video request
    // from another account falls through to normal chat rather than getting
    // told about a feature it can't use.
    let wasVideoMode = canGenerateVideo && checkForVideoRequest(finalMessage);
    let wasImageMode = !wasVideoMode && (shouldShowBanana || checkForImageRequest(finalMessage));
    let wasSearchMode = shouldShowSearchMode || checkForSearchRequest(finalMessage);
    let wasBuildMode = checkForBuildRequest(finalMessage);

    // Natural language image generation/search routing when no slash command and no UI toggles are active
    const isSlashOrOverride = finalMessage.trim().startsWith("/") ||
                              shouldShowCanvasMode || shouldShowCodeMode || shouldShowBanana || shouldShowSearchMode;

    if (!isSlashOrOverride && !documents.length && !images.length) {
      const intent = analyzeImageRequestIntent(finalMessage);
      if (intent === 'generate') {
        wasImageMode = true;
      } else if (intent === 'search') {
        wasSearchMode = true;
      } else if (intent === 'ask') {
        const subject = extractSubjectForImageRequest(finalMessage);
        
        // Add user message to UI
        await addMessage({ content: finalMessage, role: "user", type: "text" });
        
        // Add choice prompt from assistant
        await addMessage({
          content: `Would you like to **generate** a custom AI image of "${subject}", or **search** the web for photos?`,
          role: "assistant",
          type: "text",
          imageChoiceSubject: subject,
        });
        
        // Reset state & exit handleSend
        setInputValue("");
        setSelectedImages([]);
        setSelectedDocuments([]);
        setForceImageMode(false);
        setForceCodingMode(false);
        setForceCanvasMode(false);
        setForceSearchMode(false);
        setShowMenu(false);
        setLoading(false);
        return;
      }
    }

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
        wasVideoMode ||
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
      wasVideoMode = false;
      wasSearchMode = false;
      wasBuildMode = false;
    }

    // BUILD MODE: App Builder is paused while the IDE is rebuilt.
    if (wasBuildMode) {
      toast({
        title: "App Builder is coming soon",
        description: "Use /code for single-file prototypes while the IDE workspace is offline.",
      });
      return;
    }

    // Search mode (/search) - now does a regular web search in chat (NOT Deep Search Mode)
    // Deep Search Mode is opened separately via the button
    // We set forceWebSearch flag so the chat API always does a web search

    // Reset cancellation flag
    cancelRequested = false;
    const requestSessionId = useArcStore.getState().currentSessionId || createNewSession();
    setLoading(true);

    // Show the right animation NOW rather than after the response reports what
    // ran. For these inputs the server has already fixed its tool choice from
    // the same message text (see activityPrediction.ts), so this is not a guess
    // — and anything the model picks on its own still falls through to the
    // response-reported tools below, which stay authoritative.
    const predicted = predictActivity(finalMessage, {
      forceWebSearch: wasSearchMode,
      hasMemoryContext: memoryBlocks.length > 0,
    });
    if (predicted === "web") setSearchingWeb(true);
    else if (predicted === "chats") setSearchingChats(true);
    else if (predicted === "memory") setAccessingMemory(true);

    // Track message usage
    if (isGuestMode) {
      window.dispatchEvent(new CustomEvent("arcai:guestMessageSent"));
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
            const response = await ai.sendMessageWithDocument(
              [{ role: "user", content: analysisPrompt }],
              fileData,
              doc.name,
              doc.type || "application/octet-stream",
            );
            await addMessage({
              content: response,
              role: "assistant",
              type: "text",
              sourceModel: "cloud-document",
              modelUsed: LUNA_MODEL,
            });
          }
        } catch (err: any) {
          toast({ title: "Error", description: err?.message || "Failed to analyze document", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze the document. Please try again.",
            role: "assistant",
            type: "text",
            sourceModel: "cloud-document",
            modelUsed: LUNA_MODEL,
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
          // If storage upload fails (common with pasted clipboard blobs), keep the
          // images editable by sending data URLs to the edit function. Never send
          // browser-only blob: URLs to the backend.
          imageUrls = await Promise.all(
            images.map(
              (file) =>
                new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error("Failed to read image"));
                  reader.readAsDataURL(file);
                })
            )
          );
        }

        // Edit mode triggers if: explicit toggle, the user typed an edit-style
        // instruction along with the attached images, or multiple images were
        // attached (combine/merge intent). This matches the prior Gemini UX
        // where pasting + asking to change something Just Worked.
        const isEditMode =
          allImagesEditMode ||
          (finalMessage && isImageEditRequest(finalMessage)) ||
          images.length > 1;

        if (isEditMode && !hasBoost) {
          toast({
            title: "Boost Premium Feature",
            description: "Image editing and combining is only available on the Boost tier. Please upgrade to unlock editing!",
            variant: "destructive"
          });
          openCheckout();
          return;
        }

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
            const finalUrls = await ai.editImage(finalMessage, imageUrls, imageEditModel, imageEditAspect, Math.max(1, Math.min(3, imageGenCount || 1)));
            const fallbackModel = ((): string | null => { try { const v = (window as any).__lastImageFallback || null; (window as any).__lastImageFallback = null; return v; } catch { return null; } })();
            await replaceLastMessage({
              content: finalUrls.length > 1 ? `Edited ${finalUrls.length} images: ${finalMessage}` : `Edited image: ${finalMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrls[0],
              imageUrls: finalUrls,
              sourceModel: fallbackModel ? "cloud-image-edit-fallback" : "cloud-image-edit",
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
          const response = await ai.sendMessageWithImage([{ role: "user", content: analysisPrompt }], base64s);
          await addMessage({
            content: response,
            role: "assistant",
            type: "text",
            sourceModel: "cloud-vision",
            modelUsed: LUNA_MODEL,
          });
        } catch {
          toast({ title: "Error", description: "Failed to analyze images", variant: "destructive" });
          await addMessage({
            content: "Sorry, I couldn't analyze these images. Please try again.",
            role: "assistant",
            type: "text",
            sourceModel: "cloud-vision",
            modelUsed: LUNA_MODEL,
          });
        }
        return;
      }

      // Canvas mode - let the regular text flow handle it via AI's update_canvas tool
      // The AI will be instructed to use update_canvas and the response will add a canvas message inline

      // Text-to-video. Checked before the image branch so a video request
      // isn't swallowed by the broader image matcher.
      if (wasVideoMode) {
        const videoPrompt = extractVideoPrompt(finalMessage || "") || "a short cinematic clip";
        await runVideoGeneration(finalMessage || videoPrompt, videoPrompt);
        return;
      }

      // No images: Banana => generate; else text
      if (wasImageMode) {
        // Resolve conversational follow-ups against the concept Arc just
        // described. Sending literal "go for it"/"that" to the image model
        // used to discard the conversation and produce an unrelated generic.
        const contextualPrompt = isContextualImagePrompt(finalMessage || "");
        const priorVisualContext = contextualPrompt ? findRecentVisualContext(messages) : null;
        if (contextualPrompt && !priorVisualContext) {
          await addMessage({ content: finalMessage, role: "user", type: "text" });
          await addMessage({
            content: "What should I make? Give me the subject or scene and I’ll generate it.",
            role: "assistant",
            type: "text",
            sourceModel: "cloud-chat",
            modelUsed: LUNA_MODEL,
          });
          setLoading(false);
          return;
        }

        const strippedPrompt = extractPrefixPrompt(finalMessage || "");
        const imagePrompt = priorVisualContext || extractImagePrompt(strippedPrompt) || "a beautiful image";
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
          const requestedCount = Math.max(1, Math.min(3, imageGenCount || 1));
          const genUrls = await ai.generateImage(apiPrompt, imageGenModel, imageGenAspect, requestedCount);

          // Replace placeholder with a single message containing all generated images
          // (renders as an inline grid via MessageBubble's imageUrls path)
          await replaceLastMessage({
            content: genUrls.length > 1
              ? `Generated ${genUrls.length} images: ${imagePrompt}`
              : `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: genUrls[0],
            imageUrls: genUrls,
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

      // Auto-detect "animate this" on the last generated still. Checked ahead
      // of the edit path because "make this move" reads as an edit directive
      // too, and animating is what was actually asked for.
      if (canGenerateVideo && !wasCanvasMode && !wasCodingMode && !wasSearchMode) {
        const lastMsg = messages[messages.length - 1];
        if (
          lastMsg?.role === "assistant" &&
          lastMsg.type === "image" &&
          (lastMsg.imageUrl || (lastMsg.imageUrls && lastMsg.imageUrls.length > 0)) &&
          isAnimateImageRequest(finalMessage)
        ) {
          const sourceImageUrl = lastMsg.imageUrls?.[0] || lastMsg.imageUrl!;
          const videoPrompt = extractVideoPrompt(finalMessage) || "Bring this image to life with subtle natural motion";
          await runVideoGeneration(finalMessage, videoPrompt, sourceImageUrl);
          return;
        }
      }

      // Auto-detect follow-up image edit: if last assistant message was an image
      // and the user's message looks like an edit directive, route to image edit
      if (!wasCanvasMode && !wasCodingMode && !wasSearchMode) {
        const lastMsg = messages[messages.length - 1];
        if (
          lastMsg?.role === "assistant" &&
          lastMsg.type === "image" &&
          (lastMsg.imageUrl || (lastMsg.imageUrls && lastMsg.imageUrls.length > 0)) &&
          isImageEditRequest(finalMessage)
        ) {
          const sourceImageUrls = lastMsg.imageUrls && lastMsg.imageUrls.length > 0
            ? lastMsg.imageUrls
            : [lastMsg.imageUrl!];
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
            const finalUrls = await ai.editImage(finalMessage, sourceImageUrls, imageEditModel, imageEditAspect, Math.max(1, Math.min(3, imageGenCount || 1)));
            const fallbackModel = ((): string | null => { try { const v = (window as any).__lastImageFallback || null; (window as any).__lastImageFallback = null; return v; } catch { return null; } })();
            await replaceLastMessage({
              content: finalUrls.length > 1 ? `Edited ${finalUrls.length} images: ${finalMessage}` : `Edited image: ${finalMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrls[0],
              imageUrls: finalUrls,
              sourceModel: fallbackModel ? "cloud-image-edit-fallback" : "cloud-image-edit",
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


        // Strip the code/ prefix if present
        const isCodingRequest = wasCodingMode;

        const canvasState = useCanvasStore.getState();

        // CODE MODE: /code produces inline code blocks via the normal AI flow.
        // The App Builder IDE is paused, so /build is handled as coming soon.
        // The isCodingRequest flag flows through to forceCode below

        // When writing canvas is open, default to routing there unless the message
        // is clearly conversational (e.g. "nice!", "thanks", "how does this work?")
        const hasCanvasReferenceIntent =
          looksLikeCanvasEditRequest(finalMessage) || referencesCanvasSurface(finalMessage);
        const shouldRouteToCanvas =
          wasCanvasMode ||
          (canvasState.isOpen &&
            canvasState.canvasType === "writing" &&
            (hasCanvasReferenceIntent || !isConversationalMessage(finalMessage)));

        // Check if code canvas is open and keep it as active context.
        // Also auto-open the canvas from the last code message in chat if it isn't open yet,
        // so follow-up messages work without requiring the user to click the code card first.
        let isCodeCanvasOpen = canvasState.isOpen && canvasState.canvasType === "code";
        const hasCodeReferenceIntent = looksLikeCodeEditRequest(finalMessage) || referencesCodeSurface(finalMessage);

        if (!isCodeCanvasOpen && (isCodingRequest || hasCodeReferenceIntent)) {
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
        const shouldUseCodeContext = isCodeCanvasOpen;

        // Re-read canvas state after potential openWithContent call above
        const freshCanvasState = useCanvasStore.getState();
        const liveCanvasContent =
          typeof window !== "undefined" && typeof (window as any).__arcaiLiveCanvasContent === "string"
            ? (window as any).__arcaiLiveCanvasContent
            : "";
        const freshestCanvasContent =
          liveCanvasContent.trim().length > 0 ? liveCanvasContent : freshCanvasState.content;

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

        if (isCodingRequest && freshestCanvasContent) {
          // Explicit /code request with existing code: force a code update.
          const existingCode = freshestCanvasContent;
          const language = freshCanvasState.codeLanguage || "html";
          const userReq = cleanedMessage || finalMessage;
          // Budget: 15000 total - instructions (~500) - user request - safety margin
          const codeBudget = Math.max(4000, 14000 - userReq.length - 500);
          const safeCode = truncateForContext(existingCode, codeBudget);
          messageToSend = `CRITICAL INSTRUCTION - UPDATE THE EXISTING CODE ONLY: The user has existing ${language} code (${existingCode.split("\n").length} lines). Modify THIS code based on their request using the update_code tool. Preserve the current app/page/product concept, content, structure, and core behavior unless the user explicitly asks to replace them. Do not invent a different app, demo, game, topic, or brand. You MUST output the COMPLETE, FULL modified code - do NOT truncate, summarize, or cut off mid-way. Write EVERY line.

EXISTING CODE TO MODIFY:
\`\`\`${language}
${safeCode}
\`\`\`

USER'S REQUEST: ${userReq}

MANDATORY: Output the COMPLETE updated code for the SAME existing project. Never stop mid-sentence or mid-function. Include ALL code from start to finish.`;
        } else if (shouldRouteToCanvas && freshCanvasState.isOpen && freshestCanvasContent) {
          // Writing canvas is open with existing content - include it for modification
          const existingContent = freshestCanvasContent;
          const userReq = cleanedMessage || finalMessage;
          const canvasBudget = Math.max(4000, 14000 - userReq.length - 500);
          const safeContent = truncateForContext(existingContent, canvasBudget);
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: The user has existing writing open in the canvas. The canvas content below is the latest source of truth, including any text the user manually typed before sending this chat message. Modify it based on their request using the update_canvas tool. You MUST output the COMPLETE, FULL modified markdown content - do NOT truncate, summarize, or cut off mid-way. Write EVERY paragraph.

If the canvas is an intake form, questionnaire, outline, or partially filled draft and the user says they filled something in, updated the canvas, wants you to "go", "fill the rest", "finish it", or similar: use the filled-in canvas details exactly, infer reasonable remaining content, and produce a complete polished result. Do not ask them to paste the canvas text again.

EXISTING CANVAS CONTENT TO MODIFY:
${safeContent}

USER'S REQUEST: ${userReq}

MANDATORY: Output the COMPLETE updated content. Never stop mid-sentence or mid-paragraph. Include ALL content from start to finish.`;
        } else if (shouldRouteToCanvas) {
          // New canvas request (no existing content)
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: Use the update_canvas tool to write COMPLETE, FULL markdown content for this request. Do NOT truncate, summarize, or cut short. Write the ENTIRE piece from beginning to end - every paragraph, every section, complete thoughts. Never stop mid-sentence:\n\n${cleanedMessage || finalMessage}`;
        } else if (wasSearchMode) {
          messageToSend = `Search the web for: ${cleanedMessage || finalMessage}`;
        } else if (shouldUseCodeContext && freshestCanvasContent) {
          // Any request while code is open is grounded in that code. The model
          // can answer, explain, search, or choose the code tool if an edit is needed.
          const existingCode = freshestCanvasContent;
          const language = freshCanvasState.codeLanguage || "html";
          const userReq = cleanedMessage || finalMessage;
          const contextBudget = Math.max(4000, 14000 - userReq.length - 500);
          const safeCode = truncateForContext(existingCode, contextBudget);
          messageToSend = `${userReq}

[ACTIVE CODE WORKSPACE: The user currently has ${language} code open (${existingCode.split("\n").length} lines). Treat the user's request as being about this open code unless they clearly say otherwise.
- If they are asking for an edit, produce a code update for this same project.
- If they are asking a question, answer about this code without changing it.
- If current external facts, APIs, libraries, or docs are needed, use available research/search tools before answering or changing code.
- Preserve the current app/page/product concept unless the user explicitly asks to replace it.]

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
        // Determine explicit mode flags to pass to backend
        // This ensures the AI uses the correct tool without confusion
        const shouldForceCode = isCodingRequest;
        const shouldForceCanvas = shouldRouteToCanvas && !shouldForceCode;
        const shouldSearchForVideo = shouldForceVideoSearch(finalMessage);
        const codeContextModelOverride =
          shouldUseCodeContext && !shouldForceCode
            ? getModelForTask('code', getQueryComplexity(finalMessage))
            : undefined;

        console.log("🎯 Canvas/Code mode detection:", {
          isCodingRequest,
          shouldUseCodeContext,
          shouldRouteToCanvas,
          shouldForceCode,
          shouldForceCanvas,
          codeContextModelOverride,
          wasSearchMode,
          shouldSearchForVideo,
        });

        // For canvas/code: use streaming with auto-continuation
        // For regular text chat: use non-streaming (handles web search properly)
        if (shouldForceCode || shouldForceCanvas) {
          // STREAMING MODE - for canvas/code generation
          let streamedContent = "";
          let streamMode: "canvas" | "code" | "text" = shouldForceCode ? "code" : "canvas";
          // Tell the thinking indicator which long-form job this turned into so
          // it can show the code or writing animation instead of the generic one.
          useArcStore.getState().setActiveTask(shouldForceCode ? "code" : "writing");

          // Create AbortController for this request
          currentAbortController = new AbortController();
          const abortSignal = currentAbortController.signal;

          await streamWithContinuation({
            messages: aiMessages,
            profile,
            forceCanvas: shouldForceCanvas,
            forceCode: shouldForceCode,
            sessionId: requestSessionId || undefined,
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
                  updated[idx] = { ...updated[idx], sourceModel: "cloud-code", modelUsed: result.modelUsed } as any;
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
                  updated[idx] = { ...updated[idx], sourceModel: "cloud-canvas", modelUsed: result.modelUsed } as any;
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
              const { updateSessionCanvasContent, chatSessions, generateChatTitle } = useArcStore.getState();
              if (requestSessionId) {
                await updateSessionCanvasContent(requestSessionId, streamedContent || result.content);
                const session = chatSessions.find((s) => s.id === requestSessionId);
                if (session && (session.title === "New Chat" || session.messages.length <= 2)) {
                  await generateChatTitle(requestSessionId);
                }
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
            const route = shouldUseCodeContext ? "cloud-chat" : routeRequest({
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

                // Intelligently generate a title if it's the first assistant message or still has default title.
                // Name the session this response belongs to, NOT whatever chat
                // happens to be open now — the user may have clicked away while
                // the model was working.
                const { chatSessions: cSessions, generateChatTitle } = useArcStore.getState();
                if (requestSessionId) {
                  const session = cSessions.find((s) => s.id === requestSessionId);
                  if (session && (session.title === "New Chat" || session.messages.length <= 2)) {
                    await generateChatTitle(requestSessionId);
                  }
                }

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
                  requestSessionId || undefined,
                  false,
                  false,
                  false,
                  false,
                  isGuestMode,
                  codeContextModelOverride,
                );
                if (cancelRequested) return;
                await addMessage({
                  content: result.content,
                  role: "assistant",
                  type: "text",
                  sourceModel: "cloud-chat",
                  modelUsed: result.modelUsed,
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
                requestSessionId || undefined,
                wasSearchMode || shouldSearchForVideo, // forceWebSearch
                false, // forceCanvas
                false, // forceCode
                false, // forceResearch
                isGuestMode, // guestMode
                codeContextModelOverride,
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
                useSearchResultsModalStore.getState().show({
                  query: userMessage,
                  content: result.content,
                  sources: result.webSources,
                });
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
                searchImages: result.searchImages,
                sourceModel: didSearchWeb
                  ? result.searchProvider === "tavily"
                    ? "cloud-search-tavily"
                    : "cloud-search"
                  : "cloud-chat",
                modelUsed: result.modelUsed,
              });

              // Intelligently generate a title if it's the first assistant message or still has default title.
              // Keyed to the session that was answered, not the one on screen.
              const { chatSessions: cSessions, generateChatTitle } = useArcStore.getState();
              if (requestSessionId) {
                const session = cSessions.find((s) => s.id === requestSessionId);
                if (session && (session.title === "New Chat" || session.messages.length <= 2)) {
                  await generateChatTitle(requestSessionId);
                }
              }

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
      // The predicted activity is set before the request and there is no other
      // clear on this path, so it must be released here or a memory/web query
      // would leave its indicator latched on for the rest of the session.
      setSearchingChats(false);
      setAccessingMemory(false);
      setSearchingWeb(false);
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
                  <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/6)</span>
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
                      onClick={() => {
                        if (!hasBoost) {
                          toast({
                            title: "Boost Premium Feature",
                            description: "Image editing and combining is only available on the Boost tier. Please upgrade to unlock editing!",
                            variant: "destructive"
                          });
                          openCheckout();
                          return;
                        }
                        setAllImagesEditMode(!allImagesEditMode);
                      }}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-all bg-black text-white hover:bg-black/80"
                    >
                      {allImagesEditMode ? `Mode: Edit ✏️` : `Mode: Analyze 🔍`}
                    </button>
                    {canGenerateVideo && (
                      <button
                        type="button"
                        onClick={() => setAnimateAttachmentOpen(true)}
                        disabled={isGeneratingImage}
                        className="mt-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        <Clapperboard className="w-3.5 h-3.5" />
                        Animate{selectedImages.length > 1 ? " an image" : ""}
                      </button>
                    )}
                  </div>
                )}
                {(shouldShowBanana || allImagesEditMode) && (
                  <div className="mt-3 pt-2 border-t border-border/30">
                    <ImageOptionsContent editMode={allImagesEditMode} />
                  </div>
                )}
              </div>
            </div>,
            portalRoot,
          );
        })()}

      {/* Prompt enhancer chip — floats above input (portal) */}
      {!isVoiceActive &&
        inputValue.trim().split(/\s+/).filter(Boolean).length >= 2 &&
        portalRoot &&
        (() => {
          const rect = inputBarRef.current?.getBoundingClientRect();
          const bottom = rect
            ? `${Math.max(12, window.innerHeight - rect.top + 8)}px`
            : `calc(120px + env(safe-area-inset-bottom, 0px))`;
          const anchored = rect ? { left: `${rect.left}px`, width: `${rect.width}px`, bottom } : { bottom };
          return createPortal(
            <div
              className={rect ? "fixed z-[50] pointer-events-none" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[50] pointer-events-none"}
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

      <div
        ref={inputBarRef}
        className={cn(
          "relative flex max-h-[360px] origin-bottom flex-col gap-2 p-0.5 transition-all duration-300 ease-out cursor-text",
          isActive ? "opacity-100" : "opacity-95",
          isVoiceActive && "max-h-0 translate-y-3 scale-95 overflow-hidden p-0 opacity-0 pointer-events-none select-none",
        )}
        aria-hidden={isVoiceActive}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) return;
          textareaRef.current?.focus();
        }}
      >
        <div className="flex items-end gap-2 relative">
          {/* Main Input Wrapper */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Mode indicators removed — single-tool indication is handled inline elsewhere */}
            {/* Model picker moved to header (see MobileChatApp header buttons) */}



            <div className="relative flex items-center gap-2">
              {/* Add/Attachment Menu */}
              <div className="relative">
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => {
                    if (isGuestMode) {
                      requireAuth("tools");
                      return;
                    }
                    setShowMenu(!showMenu);
                  }}
                  className={cn(
                    "ci-menu-btn flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-muted/15 active:scale-95 shrink-0 overflow-hidden",
                    (shouldShowSearchMode || shouldShowBanana || shouldShowCodeMode || shouldShowBuildMode || showCanvasIndicator) && !showMenu && "text-primary"
                  )}
                  aria-label="Add content"
                >
                  {showMenu ? (
                    <X className="h-4 w-4 transition-transform duration-300" />
                  ) : shouldShowSearchMode ? (
                    <Globe className="h-4 w-4 text-indigo-400" />
                  ) : shouldShowBanana ? (
                    <ImagePlus className="h-4 w-4 text-amber-500" />
                  ) : shouldShowCodeMode ? (
                    <Code2 className="h-4 w-4 text-emerald-500" />
                  ) : shouldShowBuildMode ? (
                    <Hammer className="h-4 w-4 text-purple-400" />
                  ) : showCanvasIndicator ? (
                    <PenLine className="h-4 w-4 text-pink-400" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>

                {/* Clear active tool badge */}
                {!showMenu && (shouldShowSearchMode || shouldShowBanana || shouldShowCodeMode || shouldShowCanvasMode || shouldShowBuildMode) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForceImageMode(false);
                      setForceSearchMode(false);
                      setForceCodingMode(false);
                      setForceCanvasMode(false);
                      setForceBuildMode(false);
                      setInputValue((v) =>
                        v.replace(/^\s*(image|search|code|write|build)\/\s*/i, "")
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
                        }}
                        className="pointer-events-auto w-[min(92vw,440px)] max-h-[85vh] overflow-y-auto p-5 rounded-[28px] shadow-2xl bg-neutral-950/80 backdrop-blur-xl border border-black/10 dark:border-white/10"
                      >
                        <div className="flex items-center justify-between mb-4 px-1">
                          <span className="text-sm font-semibold tracking-wide text-foreground">Tools & Actions</span>
                          <button
                            onClick={() => setShowMenu(false)}
                            className="p-1 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                            aria-label="Close"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Featured Banners: Deep Search & App Builder IDE (At the Top!) */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <button
                            onClick={() => {
                              setShowMenu(false);
                              openSearchMode();
                            }}
                            className="flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 group border border-indigo-500/20 hover:border-indigo-500/35 bg-indigo-500/5 hover:bg-indigo-500/10 shadow-[0_0_20px_-5px_rgba(99,102,241,0.1)]"
                          >
                            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/30 transition-colors">
                              <Search className="h-4.5 w-4.5 text-indigo-400 group-hover:scale-110 transition-transform duration-200" />
                            </div>
                            <div className="flex flex-col items-start text-left min-w-0">
                              <span className="text-xs font-semibold text-foreground tracking-wide truncate w-full">Deep Search™</span>
                              <span className="text-[9px] text-muted-foreground font-normal leading-tight mt-0.5 line-clamp-2">Scan the live web with citations</span>
                            </div>
                          </button>

                          <button
                            onClick={() => {
                              setShowMenu(false);
                              toast({
                                title: "App Builder is coming soon",
                                description: "Use /code for single-file prototypes while the IDE workspace is offline.",
                              });
                            }}
                            className="flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 group border border-amber-500/20 bg-amber-500/5 shadow-[0_0_20px_-5px_rgba(245,158,11,0.1)] cursor-not-allowed opacity-80"
                            aria-disabled="true"
                          >
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                              <Hammer className="h-4.5 w-4.5 text-amber-400" />
                            </div>
                            <div className="flex flex-col items-start text-left min-w-0">
                              <span className="text-xs font-semibold text-foreground tracking-wide truncate w-full">App Builder</span>
                              <span className="text-[9px] text-amber-500 font-semibold leading-tight mt-0.5 line-clamp-2">Coming soon</span>
                            </div>
                          </button>
                        </div>

                        {/* Grid of Core Tools - Sleek unified look */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowMenu(false);
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.01] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all group border border-black/10 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10"
                          >
                            <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] group-hover:bg-blue-500/10 flex items-center justify-center transition-colors">
                              <Paperclip className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400 group-hover:text-blue-400 transition-colors" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-xs font-semibold text-foreground">Attach</span>
                              <span className="text-[9px] text-muted-foreground font-normal mt-0.5">Files, PDFs, Docs</span>
                            </div>
                          </button>

                          <button
                            onClick={() => {
                              setForceImageMode(true);
                              setInputValue("image/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.01] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all group border border-black/10 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10"
                          >
                            <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] group-hover:bg-amber-500/10 flex items-center justify-center transition-colors">
                              <ImagePlus className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400 group-hover:text-amber-400 transition-colors" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-xs font-semibold text-foreground">Generate</span>
                              <span className="text-[9px] text-muted-foreground font-normal mt-0.5">AI Image Creation</span>
                            </div>
                          </button>

                          {canGenerateVideo && (
                            <button
                              onClick={() => {
                                setInputValue("video/ ");
                                setShowMenu(false);
                                textareaRef.current?.focus();
                              }}
                              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.01] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all group border border-black/10 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10"
                            >
                              <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] group-hover:bg-violet-500/10 flex items-center justify-center transition-colors">
                                <Clapperboard className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400 group-hover:text-violet-400 transition-colors" />
                              </div>
                              <div className="flex flex-col items-center text-center">
                                <span className="text-xs font-semibold text-foreground">Video</span>
                                <span className="text-[9px] text-muted-foreground font-normal mt-0.5">AI Video Creation</span>
                              </div>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setForceSearchMode(true);
                              setInputValue("search/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.01] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all group border border-black/10 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10"
                          >
                            <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] group-hover:bg-indigo-500/10 flex items-center justify-center transition-colors">
                              <Globe className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400 group-hover:text-indigo-400 transition-colors" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-xs font-semibold text-foreground">Search</span>
                              <span className="text-[9px] text-muted-foreground font-normal mt-0.5">Live Web Results</span>
                            </div>
                          </button>

                          <button
                            onClick={() => {
                              setForceCodingMode(true);
                              setInputValue("code/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.01] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all group border border-black/10 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10"
                          >
                            <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] group-hover:bg-emerald-500/10 flex items-center justify-center transition-colors">
                              <Code2 className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400 group-hover:text-emerald-400 transition-colors" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-xs font-semibold text-foreground">Code</span>
                              <span className="text-[9px] text-muted-foreground font-normal mt-0.5">Scripting & logic</span>
                            </div>
                          </button>

                          <button
                            onClick={() => {
                              setForceCanvasMode(true);
                              setInputValue("write/ ");
                              setShowMenu(false);
                              textareaRef.current?.focus();
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.01] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all group border border-black/10 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10"
                          >
                            <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] group-hover:bg-pink-500/10 flex items-center justify-center transition-colors">
                              <PenLine className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400 group-hover:text-pink-400 transition-colors" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-xs font-semibold text-foreground">Draft</span>
                              <span className="text-[9px] text-muted-foreground font-normal mt-0.5">Writing & Layouts</span>
                            </div>
                          </button>

                          <button
                            onClick={() => {
                              setShowPromptLibrary(true);
                              setShowMenu(false);
                            }}
                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.01] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-all group border border-black/10 dark:border-white/5 hover:border-black/15 dark:hover:border-white/10"
                          >
                            <div className="w-10 h-10 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] group-hover:bg-neutral-500/20 flex items-center justify-center transition-colors">
                              <ListPlus className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400 group-hover:text-foreground transition-colors" />
                            </div>
                            <div className="flex flex-col items-center text-center">
                              <span className="text-xs font-semibold text-foreground">Prompts</span>
                              <span className="text-[9px] text-muted-foreground font-normal mt-0.5">Template library</span>
                            </div>
                          </button>
                        </div>


                      </motion.div>
                      </div>
                    </>
                  )}
                </AnimatePresence>,
                  document.body
                )}
              </div>







              {/* Input Field.
                  Padding is written as an explicit 4px/4px rather than py-1 so
                  the optical centring stays tunable in one place. It landed back
                  at dead centre after trying 3px and 1px down, both of which
                  read as too low. The 8px vertical total is what matters: it
                  keeps scrollHeight, the autosize height and the pill's height
                  unchanged no matter how the 8px is split. */}
              <Textarea
                ref={textareaRef}
                data-arc-composer="true"
                value={inputValue}
                onChange={(e) => {
                  if (isVoiceActive) return;
                  setInputValue(e.target.value);
                }}
                onKeyDown={handleKeyPress}
                onPaste={handlePaste}
                onFocus={handleInputFocus}
                disabled={isVoiceActive}
                placeholder={isVoiceActive ? "Voice mode is listening..." : isLoading ? "Thinking..." : "Message Arc..."}
                className="flex-1 min-h-[28px] max-h-[200px] border-0 bg-transparent pt-[4px] pb-[4px] pr-4 focus-visible:ring-0 resize-none text-base placeholder:text-muted-foreground/60 scrollbar-hide"
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
                  if (isGuestMode) {
                    requireAuth("voice");
                    return;
                  }
                  const arc = useArcStore.getState();
                  const sessionId = arc.currentSessionId || arc.createNewSession();
                  const targetPath = `/chat/${sessionId}`;

                  if (window.location.pathname !== targetPath) {
                    navigate(targetPath);
                  }

                  // Let the route/session settle before opening the realtime
                  // socket. Starting voice while the welcome route is still
                  // morphing into a chat route can drop the first connection.
                  setTimeout(() => activateVoiceMode(), 180);
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

      {/* Detailed Limits Modal */}
      {createPortal(
        <AnimatePresence>
          {showLimitsModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-md"
                onClick={() => setShowLimitsModal(false)}
              />
              <div className="fixed inset-0 z-[501] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  className="pointer-events-auto w-[min(90vw,420px)] rounded-3xl border border-black/10 dark:border-white/10 bg-background/95 backdrop-blur-2xl shadow-2xl p-6 flex flex-col gap-5 text-foreground relative overflow-hidden"
                >
                  {/* Close button */}
                  <button
                    onClick={() => setShowLimitsModal(false)}
                    className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-primary/15 text-primary border border-primary/20">
                      <Sparkles className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">Image Quotas & Limits</h3>
                      <p className="text-[10px] text-muted-foreground">Daily limits reset at 00:00 UTC</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 py-1">
                    {/* Active Model Progress Card */}
                    <div className="space-y-2.5 p-4 rounded-2xl bg-white/5 border border-black/10 dark:border-white/5 backdrop-blur-md">
                      <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                        <span>Active model: <strong className="text-foreground">{imageGenModel === 'gpt-image-1-mini' ? 'GPT Image 1 Mini (Quick)' : 'GPT Image 2'}</strong></span>
                        <span className="tabular-nums text-foreground">{dailyImagesUsed} / {limit} used</span>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden border border-black/10 dark:border-white/5 p-0.5">
                        <motion.div
                          className="bg-primary h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (dailyImagesUsed / (limit || 1)) * 100)}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    {/* Reference Table */}
                    <div className="space-y-1 text-xs">
                      <div className="text-muted-foreground font-semibold px-1 mb-1 text-[11px] uppercase tracking-wider">Model Limits Reference</div>
                      <div className="flex justify-between items-center px-1 py-2 border-b border-black/10 dark:border-white/5 text-muted-foreground">
                        <span>GPT Image 1 (Default)</span>
                        <span className="font-semibold text-foreground">10 daily</span>
                      </div>
                      <div className="flex justify-between items-center px-1 py-2 border-b border-black/10 dark:border-white/5 text-muted-foreground">
                        <span>GPT Image 1 Mini (Budget)</span>
                        <span className="font-semibold text-foreground">40 daily</span>
                      </div>
                      <div className="flex justify-between items-center px-1 py-2 border-b border-black/10 dark:border-white/5 text-muted-foreground">
                        <span>GPT Image 2 (Premium)</span>
                        <span className="font-semibold text-foreground">3 free (Boost: 20)</span>
                      </div>
                      <div className="flex justify-between items-center px-1 py-2 text-muted-foreground">
                        <span>Image Editing (Merge & Edit)</span>
                        <span className="font-semibold text-foreground">Boost Only</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-1">
                    <button
                      onClick={() => {
                        setShowLimitsModal(false);
                        navigate("/dashboard/settings");
                      }}
                      className="flex-1 h-11 rounded-xl text-xs font-medium border border-black/10 dark:border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Detailed Settings
                    </button>
                    {!hasBoost && (
                      <button
                        onClick={() => {
                          setShowLimitsModal(false);
                          openCheckout();
                        }}
                        className="flex-1 h-11 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-colors cursor-pointer"
                      >
                        Upgrade to Boost
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {canGenerateVideo && (
        <AnimateAttachmentModal
          isOpen={animateAttachmentOpen}
          onClose={() => setAnimateAttachmentOpen(false)}
          images={selectedImages.map((file, i) => ({ file, previewUrl: imagePreviewUrls[i] }))
            .filter((c) => !!c.previewUrl)}
          onAnimate={handleAnimateAttachment}
        />
      )}
    </div>
  );
});
