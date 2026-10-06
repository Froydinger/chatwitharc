import { getExecutionModelChoices } from '@/store/useExecutionModelStore';
import { AppBuilderModelChoice } from '@/components/app-builder/AppBuilderModelChoice';
import { useComposerDictation } from "@/hooks/chat-input/useComposerDictation";
import { createComposerActivity } from "@/lib/chat-input/activity";
import { useComposerSubmission } from "@/hooks/chat-input/useComposerSubmission";
import { ComposerView } from "@/components/chat-input/ComposerView";
import { ComposerSubmitControls } from "@/components/chat-input/ComposerSubmitControls";
import { ComposerActions } from "@/components/chat-input/ComposerActions";
import { ComposerOverlays } from "@/components/chat-input/ComposerOverlays";
import { AttachmentTray } from "@/components/chat-input/AttachmentTray";
import { TransitionPart } from "@/components/transitions/TransitionPart";
import { ConditionalTransition } from "@/components/transitions/ConditionalTransition";
import { shouldForceVideoSearch, inferPromptMode, isImageEditRequest, checkForImageRequest, checkForVideoRequest, isAnimateImageRequest, extractVideoPrompt, extractSubjectForImageRequest, analyzeImageRequestIntent, checkForCodingRequest, checkForCanvasRequest, checkForSearchRequest, checkForGitRequest, isConversationalMessage, looksLikeNaturalCodeRequest, looksLikeNaturalCanvasRequest, looksLikeCanvasEditRequest, referencesCanvasSurface, looksLikeCodeEditRequest, referencesCodeSurface, extractPrefixPrompt, extractImagePrompt, isContextualImagePrompt, findRecentVisualContext } from "@/lib/chat-input/intent";
export { inferPromptMode } from "@/lib/chat-input/intent";
export type { PromptMode } from "@/lib/chat-input/intent";
// src/components/ChatInput.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  X,
  Paperclip,
  Sparkles,
  Plus,
  ImagePlus,
  AudioWaveform,
  Mic,
  MicOff,
  Check,
  Code2,
  PenLine,
  Search,
  Globe,
  Lightbulb,
  Rocket,
  Smartphone,
  ListPlus,
  Clapperboard,
} from "lucide-react";
import { ComposerTextarea } from "@/components/chat-input/ComposerTextarea";
import { useComposerViewport, composerDockStyle } from "@/hooks/chat-input/useComposerViewport";
import { useAttachmentPreviews } from "@/hooks/chat-input/useAttachmentPreviews";
import { useArcStore, type Message } from "@/store/useArcStore";
import { useIDEStore } from "@/store/useIDEStore";
import { captureCloudWorkspaceContext, type CloudWorkspaceContext } from "@/services/cloudRuns";
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
import { isLocalChatPreview } from "@/lib/localPreview";
import { useStreamingWithContinuation } from "@/hooks/useStreamingWithContinuation";
import { detectMemoryCommand, addToMemoryBank } from "@/utils/memoryDetection";
import { addContextBlockDirect, useContextBlocks } from "@/hooks/useContextBlocks";
import { PromptLibrary } from "@/components/PromptLibrary";
import { getAllPromptsFlat } from "@/utils/promptGenerator";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useSearchStore } from "@/store/useSearchStore";
import { useVoiceModeStore, prewarmMicrophone } from "@/store/useVoiceModeStore";
import type { VoiceName } from "@/store/useVoiceModeStore";
import { REALTIME_VOICES, VOICE_AVATARS } from "@/constants/voices";
import { cn } from "@/lib/utils";
import { ownsComposerRequest, snapshotComposerRequest, type ComposerRequestSnapshot } from "@/lib/chat-input/types";
import { useComposerQueue } from "@/hooks/chat-input/useComposerQueue";
import { useMessageQueueStore } from "@/store/useMessageQueueStore";
import { APP_BUILDER_ENABLED } from "@/lib/features";
import { routeRequest } from "@/utils/routeRequest";
import { streamLocalChat } from "@/services/localAI";
import { buildLocalSystemPrompt } from "@/utils/localSystemPrompt";
import { findFirstToolCall, executeLocalToolCall, stripToolTags, hasPartialOpenTag } from "@/utils/localToolProtocol";
import { ImageOptionsDock, ImageOptionsContent } from "@/components/ImageOptionsDock";
import { PromptEnhancer } from "@/components/PromptEnhancer";
import { ChatVoicePicker } from "@/components/ChatVoicePicker";
// ChatModelPicker now lives in the chat header (MobileChatApp), not the input bar.
import { UsageMeter } from "@/components/UsageMeter";
import { useImageGenStore, useResolvedImageModel, useEditImageModel } from "@/store/useImageGenStore";
import { useVideoGenStore, orientationForDimensions } from "@/store/useVideoGenStore";
import { useVideoAccess } from "@/hooks/useVideoAccess";
import { AnimateAttachmentModal } from "@/components/AnimateAttachmentModal";
import { useImageQuota } from "@/hooks/useImageQuota";
import { detectsLocationIntent, getCachedLocation, getUserLocation, requestsCurrentLocation } from "@/lib/userLocation";
import { GitHubMark, GitModeDock } from "@/components/GitModeDock";
import { parseSubagentDirective, runChatSubagents, type SubagentDirective, type SubagentStreamEvent } from "@/services/subagents";
import { useSubagentStore } from "@/store/useSubagentStore";
import { getAppBuilderIntent, resolveAppBuilderProject } from "@/utils/appBuilderIntent";
import { listOwnedAppBuilderProjects, reopenOwnedAppBuilderProject } from "@/services/openAppBuilderProject";
import { makePrivateImageReference } from "@/lib/privateImages";

// Global cancellation flag and AbortController
let cancelRequested = false;
let activeForegroundRequestId: string | null = null;
let currentAbortController: AbortController | null = null;

export const cancelCurrentRequest = () => {
  // Pause before clearing loading: becoming idle otherwise drains the queue.
  useMessageQueueStore.getState().pause();
  cancelRequested = true;
  activeForegroundRequestId = null;
  // Abort any ongoing fetch request FIRST to prevent more data arriving
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  const activeSubagentRun = useSubagentStore.getState().run;
  if (activeSubagentRun) {
    useSubagentStore.getState().setPhase(activeSubagentRun.id, "cancelled");
    window.setTimeout(() => useSubagentStore.getState().clearRun(activeSubagentRun.id), 1800);
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
  /** Arc Work sends the complete request to the durable worker so Luna can
   * choose the tools and order of operations instead of the composer routing
   * natural-language requests through legacy image/search UI. */
  cloudExecutionMode?: 'ask' | 'auto';
  /** Text-only durable submission. Parent owns observation across composer mounts.
   * Omitted until the cloud rollout is enabled; never used by voice delegation. */
  onCloudTextSubmit?: (submission: CloudTextSubmitIntent) => Promise<void>;
  /** Claim a newly created Work session before the route can remount its owner. */
  onWorkSessionCreated?: (sessionId: string) => void;
};

export interface CloudTextSubmitIntent {
  reasoningSelection?: import('@/store/useModelStore').LunaReasoningSelection;
  sessionId: string;
  userMessageId: string;
  userContent: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Files are captured before the composer clears. They are uploaded to the
   * private cloud-input bucket by the parent, never serialized into the run. */
  attachments?: File[];
  workspaceContext?: CloudWorkspaceContext;
  forceWebSearch: boolean;
  forceCanvas: boolean;
  forceCode: boolean;
  forceGit: boolean;
  modelOverride?: string;
  gitModelMode?: 'normal' | 'pro';
}

export interface ChatInputRef {
  handleImageUploadFiles: (files: File[]) => void;
  focusInput: () => void;
  sendMessage: (content: string) => void;
  sendQueuedRequest: (request: ComposerRequestSnapshot) => void;
  retryRequest: (request: ComposerRequestSnapshot) => void;
  /** Drop text into the composer without sending, so the user can edit it. */
  prefillInput: (content: string) => void;
}

export const ChatInput = forwardRef<ChatInputRef, Props>(function ChatInput(
  { onImagesChange, rightPanelOpen = false, inline = false, cloudExecutionMode = 'ask', onCloudTextSubmit, onWorkSessionCreated },
  ref,
) {
  const portalRoot = useSafePortalRoot();
  const { toast } = useToast();
  const openBugReport = useBugReport((state) => state.openBugReport);
  const showPopup = useFingerPopup((state) => state.showPopup);
  const { user, isAnonymous } = useAuth();
  // The local preview can exercise shell interactions without authenticating,
  // but all real service calls still fail closed when credentials are absent.
  const isGuestMode = (!user || isAnonymous) && !isLocalChatPreview();
  const requireAuth = useRequireAuth();
  const { hasBoost, isAdmin, loading: subscriptionLoading, canStartVoiceConversation, openCheckout } = useSubscription();
  const isArcWorkMode = cloudExecutionMode === 'auto' && !!onCloudTextSubmit && !isGuestMode && !isLocalChatPreview();

  const {
    messages,
    addMessage,
    replaceLastMessage,
    isLoading,
    setLoading,
    isGeneratingImage,
    setGeneratingImage,
    setSearchingChats,
    setAccessingMemory,
    setSearchingWeb,
    upsertCanvasMessage,
    upsertCodeMessage,
    createNewSession,
    markSessionAsGit,
    currentSessionId,
    chatSessions,
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
  const corporateModeEnabled = useCorporateModeStore(state => state.enabled);
  const isWriteCanvasOpen = useCanvasStore((s) => s.isOpen && s.canvasType === "writing");

  const [inputValue, setInputValue] = useState("");
  const dictation = useComposerDictation({
    enabled: cloudExecutionMode === 'auto' && !isLoading && !isGeneratingImage,
    ownerKey: `${user?.id ?? 'guest'}:${currentSessionId ?? 'new'}`,
    draft: inputValue,
    onText: setInputValue,
    onError: (description) => toast({ title: 'Dictation', description }),
  });
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [animateAttachmentOpen, setAnimateAttachmentOpen] = useState(false);
  const imagePreviewUrls = useAttachmentPreviews(selectedImages);
  const [allImagesEditMode, setAllImagesEditMode] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const { usagePercent: imageUsagePercent, remainingCredits: imageRemainingCredits } = useImageQuota();
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
  const [menuOrigin, setMenuOrigin] = useState<{ x: number; y: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const modelLabelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const composerRect = useComposerViewport(inputBarRef);

  // Prompt library
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const quickPrompts = getAllPromptsFlat();

  // Mode toggles for image, coding, canvas, search, and app building
  const [forceImageMode, setForceImageMode] = useState(false);
  const [forceCodingMode, setForceCodingMode] = useState(false);
  const [forceCanvasMode, setForceCanvasMode] = useState(false);
  const [forceSearchMode, setForceSearchMode] = useState(false);
  const [forceGitMode, setForceGitMode] = useState(false);
  const [forceRegularChatMode, setForceRegularChatMode] = useState(false);
  const appProjectId = useIDEStore((state) => state.ideProjectId);
  const appFiles = useIDEStore((state) => state.ideFiles);
  const isCurrentSessionGit = useMemo(() => {
    if (!currentSessionId) return false;
    const current = chatSessions.find((s) => s.id === currentSessionId);
    return current?.isGit === true;
  }, [currentSessionId, chatSessions]);
  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));
  const shouldShowCodeMode = forceCodingMode || (!!inputValue && checkForCodingRequest(inputValue));
  const shouldShowCanvasMode = forceCanvasMode || (!!inputValue && checkForCanvasRequest(inputValue));
  const shouldShowSearchMode = forceSearchMode || (!!inputValue && checkForSearchRequest(inputValue));
  const shouldShowGitMode = isCurrentSessionGit || forceGitMode || (!!inputValue && checkForGitRequest(inputValue));
  const shouldShowAppMode = APP_BUILDER_ENABLED && !forceRegularChatMode && !!getAppBuilderIntent(inputValue, !!appProjectId && !!appFiles);

  // Persisted user-chosen image options (for /image, "draw…", etc.)
  const {
    aspectRatio: imageGenAspect,
    editAspectRatio: imageEditAspect,
    count: imageGenCount,
  } = useImageGenStore();
  const isBoostTier = Boolean(hasBoost || isAdmin);
  const imageGenModel = useResolvedImageModel(isBoostTier);
  const imageEditModel = useEditImageModel(isBoostTier);

  // Video is allowlisted by email rather than sold with Boost — see
  // useVideoAccess for why. The server enforces the same list.
  const { seconds: videoSeconds, orientation: videoOrientation } = useVideoGenStore();
  // Video is switched off in the UI for now — the provider is being retired and
  // it is not worth the surface area. Access and the generation path are left
  // intact underneath; flip this back on to bring the entry points back.
  const VIDEO_UI_ENABLED = false;
  const { canGenerateVideo: hasVideoAccess } = useVideoAccess();
  const canGenerateVideo = VIDEO_UI_ENABLED && hasVideoAccess;

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
    } else if (val === "/git") {
      setForceGitMode(true);
      setInputValue("git/ ");
    }
  }, [inputValue, openSearchMode]);

  // Voice mode store
  const { activateVoiceMode, isActive: isVoiceActive, selectedVoice, setSelectedVoice } = useVoiceModeStore();
  const currentVoice = REALTIME_VOICES.find((voice) => voice.id === selectedVoice) ?? REALTIME_VOICES[0];

  const handleVoiceSelection = useCallback(async (voice: VoiceName) => {
    setSelectedVoice(voice);
    try {
      await updateProfile({ preferred_voice: voice });
    } catch (error) {
      console.error("Failed to persist voice preference:", error);
    }
  }, [setSelectedVoice, updateProfile]);
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
      sendQueuedRequest: (request) => {
        sendQueuedRequest(request);
      },
      retryRequest: (request) => { retryRequest(request); },
      prefillInput: (content: string) => {
        setInputValue(content);
        textareaRef.current?.focus();
      },
    }),
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

  // Notify user when browser/OS denies location access
  useEffect(() => {
    const handleLocationDenied = () => {
      toast({
        title: "Location access required",
        description: "Please allow location access in your browser or device settings to find places near you.",
        variant: "default",
      });
    };
    window.addEventListener("arc:location-permission-denied", handleLocationDenied);
    return () => {
      window.removeEventListener("arc:location-permission-denied", handleLocationDenied);
    };
  }, [toast]);

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
    setAllImagesEditMode(false);
    setSelectedDocuments([]);
  };

  // Voice can dismiss the same temporary image/attachment preview while the
  // composer is mounted underneath the voice overlay.
  useEffect(() => {
    const handleVoiceImageDismiss = () => {
      setSelectedImages([]);
      setAllImagesEditMode(false);
      setSelectedDocuments([]);
    };
    window.addEventListener('arc-close-image-preview', handleVoiceImageDismiss);
    return () => window.removeEventListener('arc-close-image-preview', handleVoiceImageDismiss);
  }, []);

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
        enqueueComposerRequest(newContent, false, true);
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

        const applyActivity = (activity: string) => {
          useArcStore.getState().setActiveStatusDetails(activity === "browser" ? "Opening or checking the browser..." : null);
          if (activity === "browser" || activity === "thinking") {
            setAccessingMemory(false);
            setSearchingChats(false);
            setSearchingWeb(false);
          }
          if (activity === "web") {
            setSearchingWeb(true);
            setSearchingChats(false);
            setAccessingMemory(false);
            didSearchWeb = true;
          } else if (activity === "chats") {
            setSearchingChats(true);
            setSearchingWeb(false);
            setAccessingMemory(false);
            didSearchChats = true;
          } else if (activity === "memory") {
            setAccessingMemory(true);
            setSearchingWeb(false);
            setSearchingChats(false);
          } else if (activity === "code" || activity === "testing") {
            useArcStore.getState().setActiveTask("code");
          } else if (activity === "writing") {
            useArcStore.getState().setActiveTask("writing");
          }
        };

        const result = await ai.sendMessage(
          aiMessages,
          undefined,
          (tools) => {
            console.log("🔧 Tools used:", tools);

            // Set indicators when we detect tool usage
            if (tools.includes("search_past_chats")) {
              console.log("✅ Setting searchingChats indicator");
              applyActivity("chats");
            }
            if (tools.includes("web_search") || tools.includes("get_weather")) {
              applyActivity("web");
            }
            if (tools.includes("save_memory")) {
              applyActivity("memory");
            }
            if (tools.includes("update_code")) {
              applyActivity("code");
            }
            if (tools.includes("update_canvas")) {
              applyActivity("writing");
            }
          },
          currentSessionId || undefined,
          shouldSearchForVideo,
          false,
          false,
          false,
          false,
          undefined,
          (status) => {
            if (status.activity) {
              applyActivity(status.activity);
            }
            if (status.details) {
              useArcStore.getState().setActiveStatusDetails(status.details);
            }
          },
        );

        // Clear the loading state
        setLoading(false);
        setSearchingChats(false);
        setAccessingMemory(false);
        setSearchingWeb(false);
        useArcStore.getState().setActiveTask(null);

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
          browserSession: result.browserSession,
          memoryAction,
          webSources: result.webSources,
          sourceModel: didSearchWeb
            ? result.searchProvider === "tavily"
              ? "cloud-search-tavily"
              : "cloud-search"
            : "cloud-chat",
          modelUsed: result.modelUsed,
          reasoningEffortUsed: result.reasoningEffortUsed,
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
        quality?: string;
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
        e.detail.quality,
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
    quality: string = "low",
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
        modelUsed: imageModel || imageEditModel,
      });

      const effectiveCount = Math.max(1, Math.min(3, Math.floor(Number(countOverride ?? imageGenCount) || 1)));
      const editResult = await ai.editImage(editInstruction, allImageUrls, imageModel, aspectRatio, effectiveCount, quality);
      const finalUrls = editResult.imageUrls;

      const fallbackModel = ((): string | null => { try { const v = (window as any).__lastImageFallback || null; (window as any).__lastImageFallback = null; return v; } catch { return null; } })();
      await replaceLastMessage({
        content: finalUrls.length > 1 ? `Edited ${finalUrls.length} images: ${editInstruction}` : `Edited image: ${editInstruction}`,
        role: "assistant",
        type: "image",
        imageUrl: finalUrls[0],
        imageUrls: finalUrls,
        sourceModel: fallbackModel ? "cloud-image-edit-fallback" : "cloud-image-edit",
        modelUsed: editResult.modelUsed,
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
      const { error } = await supabase.storage.from("private-user-images").upload(name, file, {
        contentType: file.type || "image/png",
        upsert: false,
      });
      if (error) throw error;
      sourceUrl = makePrivateImageReference(name);
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

  // Only bypass the browser queue for ordinary cloud text. Specialized image,
  // app and on-device paths still own their existing busy-state behavior.
  const canSubmitCloudTextWhileBusy = (text: string) => {
    // Only explicit Arc Work may bypass the browser queue. Keep this check
    // defensive even if a parent accidentally supplies the callback in Chat.
    if (cloudExecutionMode !== 'auto' || !onCloudTextSubmit || !user || isAnonymous || isGuestMode
      || isLocalChatPreview() || useCorporateModeStore.getState().enabled || !text.trim()) return false;
    // Keep the whole request, including files, together for the durable worker
    // even while an earlier turn is running.
    return true;
  };

  const runSubagentChat = async (directive: SubagentDirective, requestSessionId: string) => {
    const runId = crypto.randomUUID();
    useSubagentStore.getState().startRun(runId);
    const abortController = new AbortController();
    currentAbortController = abortController;

    const handleSubagentEvent = (event: SubagentStreamEvent) => {
      if (event.runId && event.runId !== runId) return;
      const store = useSubagentStore.getState();
      if (event.type === "plan") {
        store.setPlan(runId, event.tasks);
      } else if (event.type === "worker_started") {
        store.setTaskStatus(runId, event.id, "working");
      } else if (event.type === "worker_completed") {
        store.setTaskStatus(runId, event.id, "complete");
      } else if (event.type === "worker_failed") {
        store.setTaskStatus(runId, event.id, "failed");
      } else if (event.type === "synthesis_started") {
        store.setPhase(runId, "synthesizing");
      }
    };

    try {
      const history = useArcStore.getState().messages
        .filter((message) => (message.role === "user" || message.role === "assistant") && message.type === "text")
        .slice(-16)
        .map((message) => ({ role: message.role, content: message.content }));
      const result = await runChatSubagents({
        prompt: directive.prompt,
        messages: history,
        maxSubagents: directive.maxSubagents,
        signal: abortController.signal,
        onEvent: handleSubagentEvent,
      });

      if (cancelRequested) return;
      await addMessage({
        content: result.content,
        role: "assistant",
        type: "text",
        sourceModel: "cloud-chat",
        modelUsed: result.modelUsed || LUNA_MODEL,
      });
      useSubagentStore.getState().completeRun(runId);
      window.setTimeout(() => useSubagentStore.getState().clearRun(runId), 6000);

      const { chatSessions: currentSessions, generateChatTitle } = useArcStore.getState();
      const session = currentSessions.find((item) => item.id === requestSessionId);
      if (session && (session.title === "New Chat" || session.messages.length <= 2)) {
        await generateChatTitle(requestSessionId);
      }
    } catch (error) {
      if (cancelRequested) return;
      const message = error instanceof Error ? error.message : "Parallel Chat help failed.";
      useSubagentStore.getState().failRun(runId, message);
      window.setTimeout(() => useSubagentStore.getState().clearRun(runId), 6000);
      throw error;
    } finally {
      if (currentAbortController === abortController) currentAbortController = null;
    }
  };

  function clearComposer() {
    textareaRef.current?.blur();
    setInputValue("");
    setSelectedImages([]);
    setSelectedDocuments([]);
    setForceImageMode(false);
    setForceCodingMode(false);
    setForceCanvasMode(false);
    setForceSearchMode(false);
    setForceGitMode(false);
    setShowMenu(false);
  }

  function captureComposerRequest(content: string, editedTextOnly = false, originalSessionId?: string): ComposerRequestSnapshot | null {
    if (!user || isAnonymous) return null;
    const images = editedTextOnly ? [] : selectedImages;
    const documents = editedTextOnly ? [] : selectedDocuments;
    if (!content.trim() && !images.length && !documents.length) return null;
    const sessionId = originalSessionId || useArcStore.getState().currentSessionId || createNewSession();
    return snapshotComposerRequest({
      content: content.trim(), ownerId: user.id, sessionId, executionMode: cloudExecutionMode,
      images, documents,
      modes: {
        image: !editedTextOnly && (forceImageMode || checkForImageRequest(content)),
        code: !editedTextOnly && (forceCodingMode || checkForCodingRequest(content)),
        canvas: !editedTextOnly && (forceCanvasMode || checkForCanvasRequest(content)),
        search: !editedTextOnly && (forceSearchMode || checkForSearchRequest(content)),
        git: isCurrentSessionGit || (!editedTextOnly && forceGitMode) || checkForGitRequest(content),
        regularChat: forceRegularChatMode, editImages: !editedTextOnly && allImagesEditMode,
      },
      corporateMode: useCorporateModeStore.getState().enabled,
      hasExistingApp: !!useIDEStore.getState().ideProjectId && !!useIDEStore.getState().ideFiles,
      workspace: (() => {
        const canvas = useCanvasStore.getState();
        const live = typeof (window as any).__arcaiLiveCanvasContent === 'string' ? (window as any).__arcaiLiveCanvasContent : '';
        return { isOpen: canvas.isOpen, canvasType: canvas.canvasType,
          content: live.trim() ? live : canvas.content, codeLanguage: canvas.codeLanguage };
      })(),
      ...getExecutionModelChoices(user.id, hasBoost || isAdmin),
      reasoningSelection: useModelStore.getState().reasoningEffort,
      imageOptions: { aspect: imageGenAspect, editAspect: imageEditAspect, count: imageGenCount, generationModel: imageGenModel, editModel: imageEditModel, quality: useImageGenStore.getState().imageMode === "low" ? "low" : "medium" },
    });
  }

  function enqueueComposerRequest(content: string, clearDraft: boolean, editedTextOnly = false) {
    if (!user || isAnonymous) { requireAuth("generic"); return; }
    const request = captureComposerRequest(content, editedTextOnly);
    if (!request) return;
    useMessageQueueStore.getState().addToQueue(request);
    if (clearDraft) clearComposer();
  }

  const executeRequest = async (messageOverride?: string, captured?: ComposerRequestSnapshot): Promise<false | void> => {
    const messageToSend = captured?.content ?? messageOverride ?? inputValue;
    const requestImages = captured?.images ?? selectedImages;
    const requestDocuments = captured?.documents ?? selectedDocuments;
    const requestModes = captured?.modes;
    const requestImageMode = requestModes?.image ?? shouldShowBanana;
    const requestCodeMode = requestModes?.code ?? shouldShowCodeMode;
    const requestCanvasMode = requestModes?.canvas ?? shouldShowCanvasMode;
    const requestSearchMode = requestModes?.search ?? shouldShowSearchMode;
    const requestGitMode = requestModes?.git ?? shouldShowGitMode;
    const requestRegularChatMode = requestModes?.regularChat ?? forceRegularChatMode;
    const requestEditImages = requestModes?.editImages ?? allImagesEditMode;
    const requestImageAspect = captured?.imageOptions.aspect ?? imageGenAspect;
    const requestEditAspect = captured?.imageOptions.editAspect ?? imageEditAspect;
    const requestImageModel = captured?.imageOptions.generationModel ?? imageGenModel;
    const requestEditModel = captured?.imageOptions.editModel ?? imageEditModel;
    const requestQuality = captured?.imageOptions.quality ?? (useImageGenStore.getState().imageMode === "low" ? "low" : "medium");
    const requestImageCount = captured?.imageOptions.count ?? imageGenCount;
    let handedOffToCloudRun = false;
    const activity = createComposerActivity({
      work: isArcWorkMode,
      store: useArcStore.getState,
      getActiveId: () => activeForegroundRequestId,
      setActiveId: id => { activeForegroundRequestId = id; },
      getCancelled: () => cancelRequested,
      setCancelled: value => { cancelRequested = value; },
      clearController: () => { currentAbortController = null; },
    });
    const { beginRequest, requestIsCancelled, setLoading, setGeneratingImage, setSearchingChats, setAccessingMemory, setSearchingWeb } = activity;
    let acceptedRequest = captured;
    const retainFailedRequest = (error: unknown) => {
      if (requestIsCancelled() || isArcWorkMode || wasCloudHandoff || !user || user.id !== dispatchScopeRef.current.ownerId) return;
      acceptedRequest ||= captureComposerRequest(messageToSend, false, owningSessionId) || undefined;
      if (acceptedRequest) useMessageQueueStore.getState().retainFailure(acceptedRequest,
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Request failed.');
    };
    let wasCloudHandoff = false;
    const clearSubmittedComposer = () => {
      beginRequest();
      // A queued request/retry owns its snapshot, not the newer visible draft.
      if (captured) return;
      acceptedRequest ||= captureComposerRequest(messageToSend, false, owningSessionId) || undefined;
      if (acceptedRequest) owningSessionId = acceptedRequest.sessionId;
      clearComposer();
    };
    if (captured && (!ownsComposerRequest(captured, dispatchScopeRef.current)
      || captured.corporateMode !== useCorporateModeStore.getState().enabled)) return false;
    let owningSessionId = captured?.sessionId ?? useArcStore.getState().currentSessionId;
    const originalOwnerId = captured?.ownerId ?? user?.id;
    const addMessage: ReturnType<typeof useArcStore.getState>['addMessage'] = (message, options) => {
      if ((activity.started && requestIsCancelled()) || (originalOwnerId && originalOwnerId !== dispatchScopeRef.current.ownerId)) return Promise.resolve("");
      owningSessionId ||= createNewSession();
      return useArcStore.getState().addMessage(message, { ...options, sessionId: owningSessionId });
    };
    const canShowWorkspace = () => !requestIsCancelled() && owningSessionId === useArcStore.getState().currentSessionId;
    const patchResponseMessage = async (id: string, patch: Parameters<ReturnType<typeof useArcStore.getState>['patchOwnedMessage']>[2], persist = false) => {
      if (requestIsCancelled() || originalOwnerId !== dispatchScopeRef.current.ownerId || !owningSessionId) return;
      await useArcStore.getState().patchOwnedMessage(owningSessionId, id, patch, persist);
    };
    const replaceLastMessage: ReturnType<typeof useArcStore.getState>['replaceLastMessage'] = (message) => requestIsCancelled()
      ? Promise.resolve() : useArcStore.getState().replaceLastMessage(message, { sessionId: owningSessionId });
    const upsertCanvasMessage: ReturnType<typeof useArcStore.getState>['upsertCanvasMessage'] = (content, label, memoryAction) => requestIsCancelled()
      ? Promise.resolve('') : useArcStore.getState().upsertCanvasMessage(content, label, memoryAction, { sessionId: owningSessionId });
    const upsertCodeMessage: ReturnType<typeof useArcStore.getState>['upsertCodeMessage'] = (content, language, label, memoryAction) => requestIsCancelled()
      ? Promise.resolve('') : useArcStore.getState().upsertCodeMessage(content, language, label, memoryAction, { sessionId: owningSessionId });
    try {
    if (!messageToSend.trim() && requestImages.length === 0 && requestDocuments.length === 0) return false;

    // Local preview mode deliberately stays offline: send a normal-looking
    // turn, then attach representative search data so the chat layout and
    // image carousel can be inspected without provider credentials.
    if (isLocalChatPreview() && messageToSend.trim()) {
      clearSubmittedComposer();
      setLoading(true);
      await addMessage({ content: messageToSend.trim(), role: "user", type: "text" });
      await new Promise((resolve) => setTimeout(resolve, 700));
      await addMessage({
        content: `Arc is now using a smooth staggered reveal animation to present responses without teleprompting or typing.

Every paragraph and content block enters with an optical de-blur and upward drift, allowing you to begin reading the first line immediately while the rest gracefully cascades into place.

Here is what makes this flow so smooth:
- **Instant text parsing**: No dangling tokens or unclosed markdown tags.
- **Buttery cascade**: Staggered 35ms timing between paragraphs with a 360ms ease.
- **Zero layout shift**: Complete structured elements settle cleanly into the conversation.

Feel free to send another message or test a prompt to see the animation again!`,
        role: "assistant",
        type: "text",
        sourceModel: "cloud-chat",
      });
      setLoading(false);
      return;
    }

    if (!user || isAnonymous) {
      if (messageToSend.trim()) {
        sessionStorage.setItem("pending-prompt", messageToSend.trim());
      }
      requireAuth("generic");
      return false;
    }

    // If Arc is currently thinking, queue the message instead of blocking
    // Check both React state AND direct store state to avoid stale closure races
    const storeIsLoading = useArcStore.getState().isLoading;
    const storeIsGenerating = useArcStore.getState().isGeneratingImage;
    if ((isLoading || storeIsLoading || storeIsGenerating) && !canSubmitCloudTextWhileBusy(messageToSend)) {
      if (messageToSend.trim() || requestImages.length || requestDocuments.length) {
        if (captured) return false;
        enqueueComposerRequest(messageToSend, !messageOverride);
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
    const builderStore = useIDEStore.getState();
    const hasExistingApp = captured?.hasExistingApp ?? (!!builderStore.ideProjectId && !!builderStore.ideFiles);
    const appIntent = !requestRegularChatMode && !requestGitMode && !checkForGitRequest(userMessage)
      ? getAppBuilderIntent(userMessage, hasExistingApp)
      : null;
    if (appIntent) {
      if (subscriptionLoading) return false;
      if (!hasBoost && !isAdmin) {
        openCheckout();
        toast({ title: "ArcAI Boost required", description: "App Builder is available to Boost subscribers and admins." });
        return false;
      }
      if (requestImages.length || requestDocuments.length) {
        toast({ title: "Text prompts only for now", description: "Remove attachments, then ask Arc to build or edit the app." });
        return false;
      }
      const initialPrompt = appIntent.prompt;
      const clearAppBuilderComposer = () => {
        clearSubmittedComposer();
      };

      if (appIntent.action === 'edit') {
        clearAppBuilderComposer();
        setLoading(true);
        let userMessageRecorded = false;
        try {
          // Chat sees only the signed-in user's app labels and descriptions.
          // Source files are loaded only after a single app has been selected.
          const projects = await listOwnedAppBuilderProjects();
          const resolution = resolveAppBuilderProject(initialPrompt, projects);
          await addMessage({ content: userMessage, role: "user", type: "text" });
          userMessageRecorded = true;

          if (resolution.kind === 'choose') {
            await addMessage({
              content: "I found a few saved apps that could match. Which one should I edit?",
              role: "assistant",
              type: "text",
              appChoices: resolution.projects,
              appChoicePrompt: initialPrompt,
            });
          } else if (resolution.kind === 'not-found') {
            await addMessage({
              content: "I couldn't find a saved app that matches that request. Open your Apps page to choose an existing app, or tell me to build a new one.",
              role: "assistant",
              type: "text",
            });
          } else {
            const project = await reopenOwnedAppBuilderProject(resolution.project.id, initialPrompt);
            await addMessage({
              content: `I found one clear match: **${project.title || resolution.project.title}**. I’m opening that saved app and applying your request.`,
              role: "assistant",
              type: "ide",
              ideProjectId: project.id,
              ideTitle: project.title,
              idePrompt: project.prompt,
              ideFileCount: Object.keys(project.files || {}).length,
            });
            navigate(`/build/${encodeURIComponent(project.id)}`);
          }
        } catch (error) {
          retainFailedRequest(error);
          const description = error instanceof Error ? error.message : "Try again from your Apps page.";
          if (userMessageRecorded) {
            await addMessage({
              content: `I couldn't safely open an app, so I made no changes. ${description}`,
              role: "assistant",
              type: "text",
            });
          } else {
            toast({ title: "Couldn't check your saved apps", description });
          }
        } finally {
          setLoading(false);
        }
        return;
      } else {
        builderStore.openIDECanvas(initialPrompt, undefined, !!initialPrompt);
      }
      clearAppBuilderComposer();
      setLoading(false);
      return;
    }
    const subagentDirective = parseSubagentDirective(userMessage);
    // Run location permission from the send interaction, before profile/tool
    // work introduces a delay that can prevent iOS from showing its sheet.
    // Do not await here: the shared location promise is awaited later by the
    // AI service, while the composer can clear and show the sent message now.
    if (requestsCurrentLocation(userMessage) && !getCachedLocation()) {
      void getUserLocation();
    }
    let images = [...requestImages];
    let documents = [...requestDocuments];

    // Check if the user is asking to change models in chat
    const lowerMsg = userMessage.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, "").trim();
    const isModelSwitchQuery =
      lowerMsg === "use a better model" || lowerMsg === "use better model" || lowerMsg === "go better" || lowerMsg === "better model" ||
      lowerMsg === "use the best model" || lowerMsg === "use best model" || lowerMsg === "go best" || lowerMsg === "best model" ||
      lowerMsg === "use a faster model" || lowerMsg === "use faster model" || lowerMsg === "go faster" || lowerMsg === "use a faster" || lowerMsg === "faster model" ||
      lowerMsg === "use a smarter model" || lowerMsg === "use smarter model" || lowerMsg === "go smarter" || lowerMsg === "use a smarter" || lowerMsg === "smarter model" ||
      lowerMsg === "switch models" || lowerMsg === "upgrade model" || lowerMsg === "change model" || lowerMsg === "change models" || lowerMsg === "switch model";

    if (isModelSwitchQuery) {
      clearSubmittedComposer();
      setLoading(true);
      // Add user message to UI
      await addMessage({ content: userMessage, role: "user", type: "text" });
      
      // Get the current model in use to display as the tag on the helper message
      const currentModel = useModelStore.getState().chatModel;

      // Add assistant prompt instructing model picker usage
      await addMessage({
        content: "Choose Arc Think or Arc Flash using the chat picker. Arc Think adjusts its reasoning to your request automatically.",
        role: "assistant",
        type: "text",
        sourceModel: "cloud-chat",
        modelUsed: currentModel,
      });

      setLoading(false);
      return;
    }

    let finalMessage = userMessage;

    // Capture mode states BEFORE clearing UI (they're needed in handleSendMessage)
    let wasCanvasMode = requestCanvasMode || checkForCanvasRequest(finalMessage);
    let wasCodingMode = requestCodeMode || checkForCodingRequest(finalMessage);
    // Video is checked before image so "make a video of a cat" doesn't get
    // claimed by the (much broader) image matcher. Gated on access up front so
    // the feature is genuinely invisible to everyone else — a video request
    // from another account falls through to normal chat rather than getting
    // told about a feature it can't use.
    let wasVideoMode = canGenerateVideo && checkForVideoRequest(finalMessage);
    let wasImageMode = !wasVideoMode && (requestImageMode || checkForImageRequest(finalMessage));
    let wasSearchMode = requestSearchMode || checkForSearchRequest(finalMessage);
    let wasGitMode = requestGitMode || checkForGitRequest(finalMessage);

    // Natural language image generation/search routing when no slash command and no UI toggles are active
    const isSlashOrOverride = finalMessage.trim().startsWith("/") ||
                              requestCanvasMode || requestCodeMode || requestImageMode || requestSearchMode || requestGitMode;

    if (!isArcWorkMode && !isSlashOrOverride && !documents.length && !images.length) {
      const intent = analyzeImageRequestIntent(finalMessage);
      if (intent === 'generate') {
        wasImageMode = true;
      } else if (intent === 'search') {
        wasSearchMode = true;
      } else if (intent === 'ask') {
        clearSubmittedComposer();
        setLoading(true);
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
        
        // Settle without replacing a draft typed during persistence.
        setLoading(false);
        return;
      }
    }

    if (subagentDirective.requested) {
      const isUnsupportedSubagentMode =
        isArcWorkMode ||
        useCorporateModeStore.getState().enabled ||
        isWriteCanvasOpen ||
        documents.length > 0 ||
        images.length > 0 ||
        wasCanvasMode ||
        wasCodingMode ||
        wasVideoMode ||
        wasImageMode ||
        wasSearchMode ||
        wasGitMode;

      if (isUnsupportedSubagentMode) {
        toast({
          title: "Parallel help is Chat-only for now",
          description: "Switch back to a plain Chat request without tools or attachments, then try again.",
        });
        return false;
      }

      if (!hasBoost && !isAdmin) {
        openCheckout();
        toast({
          title: "ArcAI Boost required",
          description: "Parallel Chat help is available to Boost subscribers and admins for now.",
        });
        return false;
      }
    }

    // Arc Work is intentionally a planner, not another set of composer
    // shortcuts. The worker receives the raw request and decides whether to
    // search, generate, write, code, build, or combine those tools.
    if (isArcWorkMode) {
      wasCanvasMode = false;
      wasCodingMode = false;
      wasVideoMode = false;
      wasImageMode = false;
      wasSearchMode = false;
    }

    // Reject before clearing or uploading; keep the draft/files on entitlement failure.
    if (!isArcWorkMode && images.length > 0 && !hasBoost
      && (requestEditImages || isImageEditRequest(finalMessage) || images.length > 1)) {
      toast({ title: "Boost Premium Feature", description: "Image editing and combining is only available on the Boost tier. Please upgrade to unlock editing!", variant: "destructive" });
      openCheckout();
      return false;
    }

    // Clear UI promptly
    clearSubmittedComposer();

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
        wasGitMode
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
      wasGitMode = false;
    }

    // Search mode (/search) - now does a regular web search in chat (NOT Deep Search Mode)
    // Deep Search Mode is opened separately via the button
    // We set forceWebSearch flag so the chat API always does a web search

    // Accepted foreground ownership already began before any preparation.
    beginRequest();
    const existingSessionId = owningSessionId;
    const requestSessionId = existingSessionId || createNewSession();
    owningSessionId = requestSessionId;
    if (!existingSessionId && isArcWorkMode) onWorkSessionCreated?.(requestSessionId);
    if (wasGitMode && requestSessionId) {
      void markSessionAsGit(requestSessionId);
    }
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
      const ai = new AIService(acceptedRequest?.reasoningSelection);

      // Guest mode restrictions: only basic text chat
      if (
        isGuestMode &&
        (images.length > 0 || documents.length > 0 || wasCanvasMode || wasCodingMode || wasImageMode || wasGitMode)
      ) {
        await addMessage({ content: finalMessage || "Sent message", role: "user", type: "text" });
        await addMessage({
          content:
            "✨ Image generation, code canvas, and document analysis features are available when you create a free account! Sign up to unlock all of Arc's capabilities.",
          role: "assistant",
          type: "text",
          sourceModel: "cloud-chat",
        });
        setLoading(false);
        return;
      }

      // With Documents -> analyze
      if (!isArcWorkMode && documents.length > 0) {
        await addMessage({
          content:
            finalMessage ||
            `Analyzing ${documents.length} document${documents.length > 1 ? "s" : ""}: ${documents.map((d) => d.name).join(", ")}`,
          role: "user",
          type: "text",
        });

        try {
          for (const doc of documents) {
            if (requestIsCancelled()) return;
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
          retainFailedRequest(err);
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
      if (!isArcWorkMode && images.length > 0) {
        // upload images or fallback
        let imageUrls: string[] = [];
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");
          const uploadPromises = images.map(async (file) => {
            const name = `${user.id}/user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage.from("private-user-images").upload(name, file, {
              contentType: file.type,
              upsert: false,
            });
            if (error) throw error;
            return makePrivateImageReference(name);
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
          requestEditImages ||
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
            modelUsed: requestEditModel,
          });
          setGeneratingImage(true);

          try {
            const editResult = await ai.editImage(finalMessage, imageUrls, requestEditModel, requestEditAspect, Math.max(1, Math.min(3, requestImageCount || 1)), requestQuality);
            const finalUrls = editResult.imageUrls;
            const fallbackModel = ((): string | null => { try { const v = (window as any).__lastImageFallback || null; (window as any).__lastImageFallback = null; return v; } catch { return null; } })();
            await replaceLastMessage({
              content: finalUrls.length > 1 ? `Edited ${finalUrls.length} images: ${finalMessage}` : `Edited image: ${finalMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrls[0],
              imageUrls: finalUrls,
              sourceModel: fallbackModel ? "cloud-image-edit-fallback" : "cloud-image-edit",
              modelUsed: editResult.modelUsed,
            });
          } catch (err: any) {
            retainFailedRequest(err);
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
          retainFailedRequest('Failed to analyze images');
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
      if (!isArcWorkMode && wasVideoMode) {
        const videoPrompt = extractVideoPrompt(finalMessage || "") || "a short cinematic clip";
        await runVideoGeneration(finalMessage || videoPrompt, videoPrompt);
        return;
      }

      // No images: Banana => generate; else text
      if (!isArcWorkMode && wasImageMode) {
        // Resolve conversational follow-ups against the concept Arc just
        // described (e.g. user just said "generate that" or "do it" without an explicit prefix).
        // If the user explicitly used image/, /image, draw/, etc., or typed a prompt, generate it directly!
        const hasExplicitImagePrefix = /^(image|draw|create)\//i.test(finalMessage.trim()) || /^\/(image|draw|create)\b/i.test(finalMessage.trim());
        const contextualPrompt = !hasExplicitImagePrefix && isContextualImagePrompt(finalMessage || "");
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
        const imagePrompt = (!hasExplicitImagePrefix && priorVisualContext) || extractImagePrompt(strippedPrompt) || strippedPrompt || "a beautiful image";

        await addMessage({ content: finalMessage || imagePrompt, role: "user", type: "text" });
        await addMessage({
          content: `Generating image: ${imagePrompt}`,
          role: "assistant",
          type: "image-generating",
          imagePrompt,
          sourceModel: "cloud-image",
          modelUsed: requestImageModel,
        });
        setGeneratingImage(true);

        try {
          const apiPrompt = `Generate an image: ${imagePrompt}`;
          const requestedCount = Math.max(1, Math.min(3, requestImageCount || 1));
          const generationResult = await ai.generateImage(apiPrompt, requestImageModel, requestImageAspect, requestedCount, requestQuality);
          const genUrls = generationResult.imageUrls;

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
            modelUsed: generationResult.modelUsed,
          });
        } catch (err: any) {
          retainFailedRequest(err);
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
            modelUsed: requestEditModel,
          });
          setGeneratingImage(true);

          try {
            const editResult = await ai.editImage(finalMessage, sourceImageUrls, requestEditModel, requestEditAspect, Math.max(1, Math.min(3, requestImageCount || 1)), requestQuality);
            const finalUrls = editResult.imageUrls;
            const fallbackModel = ((): string | null => { try { const v = (window as any).__lastImageFallback || null; (window as any).__lastImageFallback = null; return v; } catch { return null; } })();
            await replaceLastMessage({
              content: finalUrls.length > 1 ? `Edited ${finalUrls.length} images: ${finalMessage}` : `Edited image: ${finalMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: finalUrls[0],
              imageUrls: finalUrls,
              sourceModel: fallbackModel ? "cloud-image-edit-fallback" : "cloud-image-edit",
              modelUsed: editResult.modelUsed,
            });
          } catch (err: any) {
            retainFailedRequest(err);
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
      }, { deferCloudPersistence: !!onCloudTextSubmit && (isArcWorkMode || wasGitMode) && !subagentDirective.requested });

      if (subagentDirective.requested) {
        await runSubagentChat(subagentDirective, requestSessionId);
        return;
      }

      // Memory detection is now handled server-side via the AI's save_memory tool
      // The AI dynamically decides what to remember and saves to context_blocks

      try {
        const aiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> =
          messages.filter((m) => m.type === "text").map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        // Prepend persona system prompt so the AI behaves as the locked persona


        // Strip the code/ prefix if present
        const isCodingRequest = !wasGitMode && wasCodingMode;

        let queuedWorkspace = acceptedRequest?.workspace;
        const canvasState = queuedWorkspace ?? useCanvasStore.getState();

        // CODE MODE: /code produces inline code blocks via the normal AI flow.
        // The isCodingRequest flag flows through to forceCode below

        // When writing canvas is open, default to routing there unless the message
        // is clearly conversational (e.g. "nice!", "thanks", "how does this work?")
        const hasCanvasReferenceIntent =
          !wasGitMode && (looksLikeCanvasEditRequest(finalMessage) || referencesCanvasSurface(finalMessage));
        const shouldRouteToCanvas =
          !wasGitMode && (wasCanvasMode ||
          (canvasState.isOpen &&
            canvasState.canvasType === "writing" &&
            (hasCanvasReferenceIntent || !isConversationalMessage(finalMessage))));

        // Check if code canvas is open and keep it as active context.
        // Also auto-open the canvas from the last code message in chat if it isn't open yet,
        // so follow-up messages work without requiring the user to click the code card first.
        let isCodeCanvasOpen = !wasGitMode && canvasState.isOpen && canvasState.canvasType === "code";
        const hasCodeReferenceIntent = !wasGitMode && (looksLikeCodeEditRequest(finalMessage) || referencesCodeSurface(finalMessage));

        if (!wasGitMode && !isCodeCanvasOpen && (isCodingRequest || hasCodeReferenceIntent)) {
          const recentMsgs = useArcStore.getState().messages;
          // First: look for a dedicated code tile message (type === 'code')
          const lastCodeMsg = [...recentMsgs].reverse().find((m) => (m as any).type === "code");
          if (lastCodeMsg) {
            const codeContent = (lastCodeMsg as any).codeContent || "";
            const codeLang = (lastCodeMsg as any).codeLanguage || "html";
            if (canShowWorkspace()) useCanvasStore.getState().openWithContent(codeContent, "code", codeLang);
            if (acceptedRequest) queuedWorkspace = { isOpen: true, canvasType: "code", content: codeContent, codeLanguage: codeLang };
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
                  if (canShowWorkspace()) useCanvasStore.getState().openWithContent(codeContent, "code", codeLang);
                  if (acceptedRequest) queuedWorkspace = { isOpen: true, canvasType: "code", content: codeContent, codeLanguage: codeLang };
                  isCodeCanvasOpen = true;
                  break;
                }
              }
            }
          }
        }
        const shouldUseCodeContext = !wasGitMode && isCodeCanvasOpen;

        // Re-read canvas state after potential openWithContent call above
        const freshCanvasState = queuedWorkspace ?? useCanvasStore.getState();
        const liveCanvasContent = acceptedRequest ? queuedWorkspace?.content || "" :
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

        if (!wasGitMode && isCodingRequest && freshestCanvasContent) {
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
        } else if (!wasGitMode && shouldRouteToCanvas && freshCanvasState.isOpen && freshestCanvasContent) {
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
        } else if (!wasGitMode && shouldRouteToCanvas) {
          // New canvas request (no existing content)
          messageToSend = `CRITICAL INSTRUCTION - OUTPUT COMPLETE CONTENT: Use the update_canvas tool to write COMPLETE, FULL markdown content for this request. Do NOT truncate, summarize, or cut short. Write the ENTIRE piece from beginning to end - every paragraph, every section, complete thoughts. Never stop mid-sentence:\n\n${cleanedMessage || finalMessage}`;
        } else if (wasSearchMode) {
          messageToSend = `Search the web for: ${cleanedMessage || finalMessage}`;
        } else if (!wasGitMode && shouldUseCodeContext && freshestCanvasContent) {
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
        if (requestIsCancelled()) {
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

        const durableCloudSubmit = onCloudTextSubmit && !isGuestMode && !corporateMode && !isLocalChatPreview()
          && (cloudExecutionMode === 'auto' || wasGitMode);
        const durableRoute = durableCloudSubmit ? 'cloud-chat' : (cloudExecutionMode === 'auto' ? 'cloud-chat' : routeRequest({
          forceWebSearch: wasSearchMode || shouldSearchForVideo,
          forceCanvas: shouldForceCanvas,
          forceCode: shouldForceCode,
          forceGit: wasGitMode,
          hasImageAttachment: false,
          isImageGenerationRequest: false,
        }));
        if (durableCloudSubmit && durableRoute !== 'local') {
          // Capture the answered session and user identity, not whatever session
          // is selected when the worker finishes. Never append a second assistant
          // here: the server saves the stable reply and the parent reloads it.
          try {
            // Durable text only: capture the actual current editor, including a
            // deliberately cleared live draft. The legacy augmented prose above
            // remains unchanged and is not used as cloud execution context.
            const workspaceKind = !wasGitMode && (shouldUseCodeContext || (isCodingRequest && freshestCanvasContent))
              ? 'code' : !wasGitMode && shouldRouteToCanvas && freshCanvasState.isOpen ? 'canvas' : undefined;
            const currentWorkspaceContent = typeof window !== 'undefined'
              && typeof (window as any).__arcaiLiveCanvasContent === 'string'
              ? (window as any).__arcaiLiveCanvasContent : freshCanvasState.content;
            const workspaceContext = workspaceKind ? captureCloudWorkspaceContext({
              kind: workspaceKind, content: currentWorkspaceContent,
              ...(workspaceKind === 'code' ? {language: freshCanvasState.codeLanguage || 'html'} : {}),
            }) : undefined;
            wasCloudHandoff = true;
            await onCloudTextSubmit({
              reasoningSelection: acceptedRequest?.reasoningSelection ?? useModelStore.getState().reasoningEffort,
              sessionId: requestSessionId,
              userMessageId,
              userContent: finalMessage,
              messages: [...aiMessages.slice(0, -1).filter((m): m is { role: 'user' | 'assistant'; content: string } =>
                m.role === 'user' || m.role === 'assistant'), {role: 'user', content: finalMessage}],
              ...((images.length || documents.length) ? {attachments: [...images, ...documents]} : {}),
              ...(workspaceContext ? {workspaceContext} : {}),
              forceWebSearch: cloudExecutionMode === 'auto' ? false : wasSearchMode || shouldSearchForVideo,
              forceCanvas: cloudExecutionMode === 'auto' ? false : shouldForceCanvas,
              forceCode: cloudExecutionMode === 'auto' ? false : shouldForceCode,
              forceGit: wasGitMode,
              gitModelMode: acceptedRequest?.gitModelMode ?? getExecutionModelChoices(user?.id ?? null, hasBoost || isAdmin).gitModelMode,
              modelOverride: codeContextModelOverride,
            });
            // The accepted run is still working after this acknowledgement.
            // Keep the composer stop state until the cloud observer loads its terminal result.
            // The cloud progress card owns the waiting indicator after handoff.
            handedOffToCloudRun = true;
          } catch (error) {
            // An acknowledgement may be lost after acceptance. Do not fall back
            // to /chat or manufacture an assistant failure message in that case.
            setLoading(false);
            toast({ title: 'Cloud request needs a check', description: error instanceof Error
              ? error.message : 'Reconnect to check this request before sending it again.', variant: 'destructive' });
          }
          return;
        }

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
            reasoningSelection: acceptedRequest?.reasoningSelection,
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
              if (requestIsCancelled() || abortSignal.aborted) return; // Stop accumulating if cancelled
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
              if (requestIsCancelled() || abortSignal.aborted) return;
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
                await patchResponseMessage(codeMsgId, { sourceModel: "cloud-code", modelUsed: result.modelUsed, reasoningEffortUsed: result.reasoningEffortUsed }, true);

                // Read content back from saved message (same source as tile click)
                const messages = useArcStore.getState().messages;
                const lastCodeMsg = [...messages].reverse().find((m) => m.type === "code");
                const verifiedContent = (lastCodeMsg as any)?.codeContent || finalContent;
                const verifiedLang = (lastCodeMsg as any)?.codeLanguage || lang;

                console.log(`📦 Opening canvas with verified content: ${verifiedContent.length} chars`);

                // Open canvas with verified content from saved message
                const { openWithContent } = useCanvasStore.getState();
                if (canShowWorkspace()) openWithContent(verifiedContent, "code", verifiedLang);

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
                await patchResponseMessage(canvasMsgId, { sourceModel: "cloud-canvas", modelUsed: result.modelUsed, reasoningEffortUsed: result.reasoningEffortUsed }, true);

                // Read content back from saved message
                const messages = useArcStore.getState().messages;
                const lastCanvasMsg = [...messages].reverse().find((m) => m.type === "canvas");
                const verifiedContent = (lastCanvasMsg as any)?.canvasContent || finalContent;

                // Open canvas with verified content
                const { openWithContent } = useCanvasStore.getState();
                if (canShowWorkspace()) openWithContent(verifiedContent, "writing");
              }

              // Persist to session for canvas/code (use streamedContent, not result.content)
              const { updateSessionCanvasContent, chatSessions, generateChatTitle } = useArcStore.getState();
              if (requestSessionId) {
                await updateSessionCanvasContent(requestSessionId, streamedContent || result.content);
                const session = chatSessions.find((s) => s.id === requestSessionId);
                if (session && (session.title === "New Chat" || session.messages.length <= 2)) {
                  void generateChatTitle(requestSessionId);
                }
              }
            },

            // onError - just show toast, canvas isn't open yet
            onError: (errorMsg) => {
              retainFailedRequest(errorMsg);
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
            const route = shouldUseCodeContext || cloudExecutionMode === 'auto' ? "cloud-chat" : routeRequest({
              forceWebSearch: wasSearchMode,
              forceCanvas: false,
              forceCode: false,
              forceGit: wasGitMode,
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
                  if (requestIsCancelled() || currentAbortController?.signal.aborted) break;

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
                    await patchResponseMessage(id, { content: next });
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

                // Final commit stays with the submitting chat and awaits persistence.
                // User editMessage intentionally truncates later messages, so
                // provider completion uses the non-destructive owned patch.
                const id = await ensurePlaceholder();
                const finalContent = displayed || "I couldn't generate a response locally.";
                await patchResponseMessage(id, {
                  content: finalContent,
                  sourceModel: "local",
                  ...(pendingMemoryAction ? { memoryAction: pendingMemoryAction as any } : {}),
                }, true);
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

                if (requestIsCancelled()) return;
              } catch (localErr: any) {
                console.warn("Local model failed, falling back to cloud:", localErr);
                toast({ title: "Local model error", description: "Falling back to cloud.", variant: "default" });
                // Fall through to cloud path below
                const ai = new AIService(acceptedRequest?.reasoningSelection);
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
                if (requestIsCancelled()) return;
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
              const ai = new AIService(acceptedRequest?.reasoningSelection);
              currentAbortController = new AbortController();

              const applyActivity = (activity: string) => {
                if (requestIsCancelled()) return;
          useArcStore.getState().setActiveStatusDetails(activity === "browser" ? "Opening or checking the browser..." : null);
          if (activity === "browser" || activity === "thinking") {
            setAccessingMemory(false);
            setSearchingChats(false);
            setSearchingWeb(false);
          }
                if (activity === "web") {
                  didSearchWeb = true;
                  setSearchingWeb(true);
                  setSearchingChats(false);
                  setAccessingMemory(false);
                } else if (activity === "chats") {
                  setSearchingChats(true);
                  setSearchingWeb(false);
                  setAccessingMemory(false);
                } else if (activity === "memory") {
                  setAccessingMemory(true);
                  setSearchingWeb(false);
                  setSearchingChats(false);
                } else if (activity === "code" || activity === "testing") {
                  useArcStore.getState().setActiveTask("code");
                } else if (activity === "writing") {
                  useArcStore.getState().setActiveTask("writing");
                }
              };

              const result = await ai.sendMessage(
                aiMessages,
                profile,
                (tools) => {
                  if (tools.includes("web_search") || tools.includes("get_weather")) {
                    applyActivity("web");
                  }
                  if (tools.includes("search_past_chats")) {
                    applyActivity("chats");
                  }
                  if (tools.includes("save_memory")) {
                    applyActivity("memory");
                  }
                  if (tools.includes("update_code")) {
                    applyActivity("code");
                  }
                  if (tools.includes("update_canvas")) {
                    applyActivity("writing");
                  }
                },
                requestSessionId || undefined,
                wasSearchMode || shouldSearchForVideo, // forceWebSearch
                false, // forceCanvas
                false, // forceCode
                false, // forceResearch
                isGuestMode, // guestMode
                codeContextModelOverride,
                (status) => {
                  if (requestIsCancelled()) return;
                  const subagentEvent = status.subagent as SubagentStreamEvent | undefined;
                  if (subagentEvent?.type) {
                    const eventRunId = subagentEvent.runId;
                    const currentRun = useSubagentStore.getState().run;
                    if (eventRunId && subagentEvent.type === "plan") {
                      if (currentRun?.id !== eventRunId) useSubagentStore.getState().startRun(eventRunId);
                      useSubagentStore.getState().setPlan(eventRunId, Array.isArray(subagentEvent.tasks) ? subagentEvent.tasks : []);
                    } else if (eventRunId && subagentEvent.type === "worker_started") {
                      useSubagentStore.getState().setTaskStatus(eventRunId, subagentEvent.id, "working");
                    } else if (eventRunId && subagentEvent.type === "worker_completed") {
                      useSubagentStore.getState().setTaskStatus(eventRunId, subagentEvent.id, "complete");
                    } else if (eventRunId && subagentEvent.type === "worker_failed") {
                      useSubagentStore.getState().setTaskStatus(eventRunId, subagentEvent.id, "failed");
                    } else if (eventRunId && subagentEvent.type === "synthesis_started") {
                      useSubagentStore.getState().setPhase(eventRunId, "synthesizing");
                    } else if (eventRunId && subagentEvent.type === "done") {
                      useSubagentStore.getState().completeRun(eventRunId);
                      window.setTimeout(() => useSubagentStore.getState().clearRun(eventRunId), 6000);
                    } else if (subagentEvent.type === "error") {
                      const failedRunId = eventRunId || useSubagentStore.getState().run?.id;
                      if (failedRunId) {
                        useSubagentStore.getState().failRun(failedRunId, subagentEvent.message || "Parallel help failed.");
                        window.setTimeout(() => useSubagentStore.getState().clearRun(failedRunId), 6000);
                      }
                    }
                  }
                  if (status.activity) {
                    applyActivity(status.activity);
                  }
                  if (status.details) {
                    useArcStore.getState().setActiveStatusDetails(status.details);
                  }
                },
                currentAbortController.signal,
                cloudExecutionMode === 'auto' ? 'work' : 'chat',
                wasGitMode,
              );

              // CRITICAL: If cancelled while waiting for response, discard everything
              if (requestIsCancelled()) return;

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

              // Add the authoritative complete response with source tag
              await addMessage({
                streamedAnswer: result.streamedAnswer,
                content: result.content,
                role: "assistant",
                type: "text",
                browserSession: result.browserSession,
                memoryAction,
                webSources: result.webSources,
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
                toolsUsed: result.toolsUsed,
                reasoningEffortUsed: result.reasoningEffortUsed,
              });

              // Intelligently generate a title if it's the first assistant message or still has default title.
              // Keyed to the session that was answered, not the one on screen.
              const { chatSessions: cSessions, generateChatTitle } = useArcStore.getState();
              if (requestSessionId) {
                const session = cSessions.find((s) => s.id === requestSessionId);
                if (session && (session.title === "New Chat" || session.messages.length <= 2)) {
                  void generateChatTitle(requestSessionId);
                }
              }

              // Handle canvas/code updates if the AI decided to use those tools
              if (result.codeUpdate) {
                const { openCodeCanvas } = useCanvasStore.getState();
                if (canShowWorkspace()) openCodeCanvas(result.codeUpdate.code, result.codeUpdate.language || "html", result.codeUpdate.label);
                const codeMsgId = await upsertCodeMessage(
                  result.codeUpdate.code,
                  result.codeUpdate.language || "html",
                  result.codeUpdate.label,
                );
                await patchResponseMessage(codeMsgId, { sourceModel: "cloud-code" }, true);
              } else if (result.canvasUpdate) {
                const { openCanvas } = useCanvasStore.getState();
                if (canShowWorkspace()) openCanvas(result.canvasUpdate.content);
                const canvasMsgId = await upsertCanvasMessage(result.canvasUpdate.content, result.canvasUpdate.label);
                await patchResponseMessage(canvasMsgId, { sourceModel: "cloud-canvas" }, true);
              }
            }
          } catch (err: any) {
            throw err; // Re-throw to be caught by outer catch
          }
        }
      } catch (err: any) {
        // Check if request was cancelled
        if (requestIsCancelled()) {
          return;
        }
        retainFailedRequest(err);
        const errorMsg = err?.message || "Failed to get AI response";
        toast({ title: "Error", description: errorMsg, variant: "destructive" });
        await addMessage({
          content: `Sorry, I encountered an error: ${errorMsg}`,
          role: "assistant",
          type: "text",
          sourceModel: "cloud-chat",
        });
      }
    } finally {
      // Terminal cleanup is owned by the common request lifetime below.
    }
    } catch (error) {
      if (!requestIsCancelled()) {
        retainFailedRequest(error);
        toast({ title: 'Request failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      }
    } finally {
      activity.finish(handedOffToCloudRun);
    }
  };

  const { handleSend, foregroundSubmissionRef } = useComposerSubmission({
    ownerId: user?.id ?? null,
    inputValue,
    canSubmitWork: canSubmitCloudTextWhileBusy,
    execute: executeRequest,
    enqueue: enqueueComposerRequest,
    cancel: cancelCurrentRequest,
  });

  const dispatchScopeRef = useRef({ ownerId: user?.id ?? null, sessionId: currentSessionId, executionMode: cloudExecutionMode });
  dispatchScopeRef.current = { ownerId: user?.id ?? null, sessionId: currentSessionId, executionMode: cloudExecutionMode };
  const { sendQueuedRequest, retryRequest } = useComposerQueue({
    scope: dispatchScopeRef.current,
    corporateMode: corporateModeEnabled,
    busy: isLoading || isGeneratingImage,
    isBusy: () => foregroundSubmissionRef.current || useArcStore.getState().isLoading || useArcStore.getState().isGeneratingImage,
    dispatch: request => handleSend(undefined, request),
  });

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter confirms an IME candidate; it must not submit that unfinished draft.
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && !canSubmitCloudTextWhileBusy(inputValue)) {
        // Ctrl/Cmd+Enter = always explicitly add to queue
        enqueueComposerRequest(inputValue, true);
      } else {
        // Enter = send (or auto-queue if Arc is thinking)
        handleSend();
      }
    }
  };

  const createActions = [
    { id: "attach", label: "Attach File", description: "Add files or images", keywords: "upload file image document", icon: Paperclip, tileClass: "border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/10", iconClass: "bg-blue-500/15 text-blue-500 dark:text-blue-400", run: () => { fileInputRef.current?.click(); setShowMenu(false); } },
    { id: "generate", label: "Create Image", description: "Create or edit an image", keywords: "image draw picture art", icon: ImagePlus, tileClass: "border-rose-500/20 hover:border-rose-500/40 hover:bg-rose-500/10", iconClass: "bg-rose-500/15 text-rose-500 dark:text-rose-400", run: () => { setForceImageMode(true); setInputValue("image/ "); setShowMenu(false); textareaRef.current?.focus(); } },
    { id: "write", label: "Writing Canvas", description: "Open a live writing canvas", keywords: "canvas prose draft document", icon: PenLine, tileClass: "border-sky-500/20 hover:border-sky-500/40 hover:bg-sky-500/10", iconClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400", run: () => { setForceCanvasMode(true); setInputValue("write/ "); setShowMenu(false); textareaRef.current?.focus(); } },
    { id: "prompts", label: "Prompts & Ideas", description: "Browse saved prompt starters", keywords: "prompt library templates starters", icon: ListPlus, tileClass: "border-sky-500/20 hover:border-sky-500/40 hover:bg-sky-500/10", iconClass: "bg-sky-500/15 text-sky-500 dark:text-sky-400", run: () => { setShowPromptLibrary(true); setShowMenu(false); } },
    { id: "app", label: "Build an app", description: "Create or edit a web app with Arc", keywords: "app builder website web app", icon: Smartphone, tileClass: "border-white/15 hover:border-white/25 hover:bg-white/10", iconClass: "bg-white/10 text-white/75", run: () => { setForceRegularChatMode(false); setInputValue("/app "); setShowMenu(false); textareaRef.current?.focus(); } },
    { id: "code", label: "Code Canvas", description: "Work in a code canvas", keywords: "programming developer code editor", icon: Code2, tileClass: "border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10", iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", run: () => { setForceCodingMode(true); setInputValue("code/ "); setShowMenu(false); textareaRef.current?.focus(); } },
    { id: "git", label: "Github Mode", description: "Update a remote repo via a pull request", keywords: "github git repository pull request branch", icon: GitHubMark, tileClass: "border-zinc-500/20 hover:border-zinc-500/40 hover:bg-zinc-500/10", iconClass: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300", run: () => { setForceGitMode(true); setInputValue("git/ "); setShowMenu(false); textareaRef.current?.focus(); } },
    { id: "search", label: "Instant Web Search", description: "Search the web inline", keywords: "web browse lookup sources", icon: Globe, tileClass: "border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10", iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", run: () => { setForceSearchMode(true); setInputValue("search/ "); setShowMenu(false); textareaRef.current?.focus(); } },
    { id: "deep-search", label: "Deep Search & Research", description: "Run a deeper research pass", keywords: "research investigate browse sources", icon: Search, tileClass: "border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/10", iconClass: "bg-blue-500/20 text-blue-400", run: () => { setShowMenu(false); openSearchMode(); } },
  ];
  // Keep the Bencho Create treatment, but retain the complete Arc action set.
  // The panel caps its height and scrolls on short mobile viewports.
  const createMenuActions = createActions;

  const menuPanelWidth = typeof window !== "undefined" ? Math.min(312, window.innerWidth - 24) : 312;
  const menuPanelHeight = Math.min(520, 28 + createMenuActions.length * 44);
  const menuPosition = menuOrigin && typeof window !== "undefined"
    ? {
        left: `${Math.min(
          Math.max(menuPanelWidth / 2 + 12, menuOrigin.x),
          window.innerWidth - menuPanelWidth / 2 - 12,
        )}px`,
        top: `${Math.min(
          Math.max(menuPanelHeight / 2 + 12, menuOrigin.y),
          window.innerHeight - menuPanelHeight / 2 - 12,
        )}px`,
      }
    : { left: "50%", top: "50%" };

  /* ---------------- Render ---------------- */
  return (
    <div className="space-y-2 relative">
      {/* Drag overlay — portaled to body so it escapes any transformed parent */}
      {portalRoot &&
        createPortal(
          <>
            <ConditionalTransition preset="fade">{isDragOver && (
              <div
                style={{ position: "fixed", inset: 0, zIndex: 9999 }}
                className="flex items-center justify-center bg-background/90 backdrop-blur-md"
              >
                <TransitionPart><div
                  style={{ position: "absolute", inset: 24 }}
                  className="rounded-3xl border-2 border-dashed border-primary/60 bg-primary/5 flex flex-col items-center justify-center gap-4 pointer-events-none"
                >
                  <div className="rounded-2xl bg-primary/10 p-5">
                    <Paperclip className="h-14 w-14 text-primary" />
                  </div>
                  <p className="text-2xl font-semibold text-foreground">Drop files here</p>
                  <p className="text-base text-muted-foreground">Images, PDFs, DOCX, PPTX, and more</p>
                </div></TransitionPart>
              </div>
            )}</ConditionalTransition>
          </>,
          portalRoot,
        )}

      {/* Image options dock — visible whenever the user is in image-gen mode.
          Stacked above any selected-images / selected-documents previews. */}
      {!inline &&
        shouldShowBanana &&
        selectedImages.length === 0 &&
        (() => {
          const hasDocs = selectedDocuments.length > 0;
          const rect = composerRect;
          const previewStack = hasDocs ? 100 : 0;
          const dockBottom = composerDockStyle(rect, window.innerHeight, 12 + previewStack, 110 + previewStack).bottom;
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
          const rect = composerRect;
          const imgStack = selectedImages.length > 0 ? 220 : 0;
          const anchored = composerDockStyle(rect, window.innerHeight, 12 + imgStack, 110 + imgStack);
          return createPortal(
            <div className={rect ? "fixed z-[33]" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"} style={anchored}>
              <AttachmentTray kind="documents" files={selectedDocuments} onClear={() => setSelectedDocuments([])} onRemove={removeDocument} />
            </div>,
            portalRoot,
          );
        })()}

      {/* Selected Images preview - for non-inline, portal anchored above input */}
      {!inline &&
        selectedImages.length > 0 &&
        portalRoot &&
        (() => {
          const rect = composerRect;
          const anchored = composerDockStyle(rect, window.innerHeight, 12, 110);
          return createPortal(
            <div className={rect ? "fixed z-[33]" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"} style={anchored}>
              <AttachmentTray kind="images" files={selectedImages} previewUrls={imagePreviewUrls} onClear={clearSelected} onRemove={removeImage}>
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
</AttachmentTray>
            </div>,
            portalRoot,
          );
        })()}

      {/* Prompt enhancer / Plan chip — floats above input and Git bar (portal) */}
      {!isVoiceActive &&
        inputValue.trim().split(/\s+/).filter(Boolean).length >= 2 &&
        portalRoot &&
        (() => {
          const hasDocs = selectedDocuments.length > 0;
          const hasImages = selectedImages.length > 0;
          const previewStack = (hasDocs ? 80 : 0) + (hasImages ? 90 : 0);
          const gitOffset = shouldShowGitMode ? 54 : 0;
          const imageDockOffset = (shouldShowBanana && !hasImages) ? 116 : 0;
          const rect = composerRect;
          const anchored = composerDockStyle(rect, window.innerHeight, 8 + previewStack + gitOffset + imageDockOffset, 120 + previewStack + gitOffset + imageDockOffset);
          const enhancerKind = shouldShowGitMode ? "git_plan" : (shouldShowBanana ? "image" : "chat");
          return createPortal(
            <div
              className={rect ? "fixed z-[70] pointer-events-none" : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[70] pointer-events-none"}
              style={anchored}
            >
              <div className="px-4 flex justify-end mx-auto max-w-[760px]">
                <PromptEnhancer
                  text={inputValue}
                  kind={enhancerKind}
                  onAccept={(improved) => {
                    setInputValue(improved);
                    toast({
                      title: shouldShowGitMode ? "Git Plan formulated 📋" : "Prompt enhanced ✨",
                      duration: 2000,
                    });
                  }}
                  className="pointer-events-auto shadow-lg"
                />
              </div>
            </div>,
            portalRoot,
          );
        })()}

      {/* Git mode dock — floats outside and directly above the input bar */}
      {!inline &&
        shouldShowGitMode &&
        portalRoot &&
        (() => {
          const hasDocs = selectedDocuments.length > 0;
          const hasImages = selectedImages.length > 0;
          const previewStack = (hasDocs ? 80 : 0) + (hasImages ? 90 : 0);
          const rect = composerRect;
          const anchored = composerDockStyle(rect, window.innerHeight, 10 + previewStack, 100 + previewStack);
          return createPortal(
            <div
              className={
                rect
                  ? "fixed z-[60] pointer-events-auto"
                  : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[60] pointer-events-auto"
              }
              style={anchored}
            >
              <GitModeDock />
            </div>,
            portalRoot,
          );
        })()}

      {inline && shouldShowGitMode && <GitModeDock />}
      {shouldShowAppMode && (hasBoost || isAdmin) && <div className="mb-2 flex justify-center"><AppBuilderModelChoice ownerId={user?.id ?? null} disabled={isLoading} /></div>}
      <ComposerView
        inputBarRef={inputBarRef}
        active={isActive}
        voiceActive={isVoiceActive}
        onFocusRequest={() => textareaRef.current?.focus()}
        menu={(
              <div className="relative">
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => {
                    if (isGuestMode) {
                      requireAuth("tools");
                      return;
                    }
                    const anchor = menuButtonRef.current?.getBoundingClientRect();
                    if (anchor) {
                      setMenuOrigin({
                        x: anchor.left + anchor.width / 2,
                        y: anchor.top + anchor.height / 2,
                      });
                    }
                    setShowMenu(!showMenu);
                  }}
                  className={cn(
                    "ci-menu-btn flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-muted/15 active:scale-95 shrink-0 overflow-hidden",
                    (shouldShowSearchMode || shouldShowBanana || shouldShowCodeMode || shouldShowGitMode || shouldShowAppMode || showCanvasIndicator) && !showMenu && "text-primary"
                  )}
                  aria-label={shouldShowAppMode ? "Build an app mode" : "Add content"}
                >
                  {showMenu ? (
                    <X className="h-4 w-4 transition-transform duration-300" />
                  ) : shouldShowSearchMode ? (
                    <Globe className="h-4 w-4 text-blue-400" />
                  ) : shouldShowGitMode ? (
                    <GitHubMark className="h-4 w-4 text-zinc-500 dark:text-zinc-300" />
                  ) : shouldShowAppMode ? (
                    <Smartphone className="h-4 w-4 text-primary" />
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

                {/* Clear active tool badge (cannot clear if session is permanently Git) */}
                {!showMenu && !isCurrentSessionGit && (shouldShowSearchMode || shouldShowBanana || shouldShowCodeMode || shouldShowCanvasMode || shouldShowGitMode || shouldShowAppMode) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForceImageMode(false);
                      setForceSearchMode(false);
                      setForceCodingMode(false);
                      setForceCanvasMode(false);
                      setForceGitMode(false);
                      if (shouldShowAppMode) setForceRegularChatMode(true);
                      setInputValue((v) =>
                        v.replace(/^\s*(image|search|code|write|git)\/\s*/i, "")
                          .replace(/^\s*(?:\/(?:app|build)\b|(?:app|build)\/)\s*/i, "")
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

                <ComposerActions showMenu={showMenu} position={menuPosition} actions={createMenuActions} onClose={() => setShowMenu(false)} />
              </div>
        )}
        field={(
              <ComposerTextarea
                ref={textareaRef}
                voiceActive={isVoiceActive}
                workMode={cloudExecutionMode === 'auto'}
                dictating={dictation.active}
                loading={isLoading}
                data-arc-composer="true"
                value={inputValue}
                onChange={(e) => {
                  if (isVoiceActive) return;
                  dictation.stop();
                  setForceRegularChatMode(false);
                  setInputValue(e.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) dictation.stop();
                  handleKeyPress(event);
                }}
                onPaste={(event) => { dictation.stop(); handlePaste(event); }}
                onFocus={handleInputFocus}
              />
        )}
        actions={(
          <ComposerSubmitControls
            busy={isLoading || isGeneratingImage}
            hasContent={!!inputValue.trim() || selectedImages.length > 0 || selectedDocuments.length > 0}
            showVoice={cloudExecutionMode !== 'auto'}
            showDictation={cloudExecutionMode === 'auto'}
            onStop={cancelCurrentRequest}
            onSend={() => { dictation.stop(); handleSend(); }}
          >
              {cloudExecutionMode === 'auto' ? (
                <button type="button" onClick={() => void dictation.toggle()}
                  aria-label={dictation.active ? 'Stop dictation' : 'Dictate into Work'}
                  aria-pressed={dictation.active}
                  title={dictation.active ? 'Stop dictation' : 'Dictate'}
                  className={cn('arc-composer-press flex items-center justify-center w-9 h-9 rounded-full text-foreground transition-all', dictation.active ? 'bg-primary/20 ring-1 ring-primary/50' : 'bg-muted/40 hover:bg-primary/15')}>
                  {dictation.active ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              ) : <div className="flex items-center gap-1 shrink-0">
                {/* Keep voice selection beside the waveform control. */}
                <ChatVoicePicker name={currentVoice?.name ?? "Marina"} selectedVoice={selectedVoice}
                  onSelect={(voice) => void handleVoiceSelection(voice)} />
                <button
                onClick={() => {
                  if (isGuestMode) {
                    requireAuth("voice");
                    return;
                  }
                  if (!hasBoost && !isAdmin && !canStartVoiceConversation) {
                    toast({
                      title: "Daily voice limit reached",
                      description: "Free accounts get 3 voice sessions per UTC day, up to 10 minutes each. Upgrade to Boost for unlimited live voice sessions up to 2 hours each.",
                      variant: "destructive",
                    });
                    openCheckout(undefined, "voice_daily_limit");
                    return;
                  }
                  // Start mic acquisition immediately within the user gesture event frame
                  // so Safari/WebKit and Chrome associate permission with direct user interaction.
                  prewarmMicrophone();

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
                className="arc-composer-press ci-voice-button flex items-center justify-center w-9 h-9 rounded-full bg-muted/40 hover:bg-primary/15 text-foreground hover:text-primary transition-all"
                title="Voice mode"
              >
                <AudioWaveform className="ci-voice-icon h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>}
          </ComposerSubmitControls>
        )}
      />

      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />

      <PromptLibrary
        isOpen={showPromptLibrary}
        onClose={() => setShowPromptLibrary(false)}
        prompts={quickPrompts}
        onSelectPrompt={(p) => {
          // Image presets are complete as written — send them. Everything else
          // waits in the composer, already switched into its mode, to be edited.
          if (inferPromptMode(p) === 'image') {
            handleSend(p);
            return;
          }
          setInputValue(p);
          textareaRef.current?.focus();
        }}
      />

      <ComposerOverlays
        imageUnlimited={imageRemainingCredits === Infinity}
        showLimitsModal={showLimitsModal}
        isBoostTier={isBoostTier}
        hasBoost={hasBoost}
        imageUsagePercent={imageUsagePercent}
        onClose={() => setShowLimitsModal(false)}
        onSettings={() => navigate("/dashboard/settings")}
        onUpgrade={() => openCheckout()}
      />

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
