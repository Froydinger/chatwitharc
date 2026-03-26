import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  MessageSquare, Image, Rocket, Brain,
  Plus, Clock, Settings, Search,
  Trash2, Download, LayoutDashboard, ChevronLeft, ChevronRight,
  Globe, Code2, Eye, Sparkles, Zap, ArrowRight, Music, Edit2, Check, X,
  Layers, PenLine, FileCode, MessageCircle
} from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, animate } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";
import { useArcStore } from "@/store/useArcStore";
import { useProfile } from "@/hooks/useProfile";
import { useChatSync } from "@/hooks/useChatSync";
import { useContextBlocks } from "@/hooks/useContextBlocks";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SmoothImage } from "@/components/ui/smooth-image";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";
import { getFaviconByLabel } from "@/constants/faviconOptions";
import { useAdminBanner } from "@/components/AdminBanner";
import { useAccentColor } from "@/hooks/useAccentColor";
import { useToast } from "@/hooks/use-toast";
import { ChatInput } from "@/components/ChatInput";
import { MusicPopup } from "@/components/MusicPopup";
import { useMusicStore } from "@/store/useMusicStore";
import { PaymentFailureBanner } from "@/components/PaymentFailureBanner";
import { CodePreview } from "@/components/CodePreview";
import { canPreview, getLanguageDisplay, getLanguageColor } from "@/utils/codeUtils";
import { useCanvasStore } from "@/store/useCanvasStore";
import { DeploysPanel } from "@/components/DeploysPanel";

type DashboardTab = "overview" | "chats" | "images" | "canvases" | "memories";
type CanvasDetailTab = "canvas" | "deployed";

interface GeneratedImage {
  url: string;
  prompt: string;
  sessionId: string;
  messageId: string;
  timestamp: Date;
}

interface RecentApp {
  id: string;
  title: string;
  prompt: string;
  favicon_label: string | null;
  netlify_url: string | null;
  netlify_subdomain: string | null;
  updated_at: string;
  created_at: string;
  version: number;
}

function toDate(ts: unknown): Date | null {
  if (ts instanceof Date) return ts;
  if (typeof ts === "number" || typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

interface CanvasItem {
  id: string;
  type: 'code' | 'writing';
  content: string;
  language?: string;
  sessionId: string;
  sessionTitle: string;
  timestamp: Date;
  label?: string;
}

function extractCodeBlocks(content: string): Array<{ code: string; language: string }> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: Array<{ code: string; language: string }> = [];
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({ language: match[1] || "text", code: match[2].trim() });
  }
  return blocks;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as DashboardTab) || "overview";
  const { user, loading: authLoading } = useAuth();
  const { isSubscribed, subscriptionEnd, openCheckout } = useSubscription();
  const { profile } = useProfile();
  const { isLoaded } = useChatSync();
  const {
    chatSessions, createNewSession, loadSession, deleteSession,
    hydrateAllSessions, allSessionsHydrated, isHydratingAll,
    syncFromSupabase, currentSessionId, messages
  } = useArcStore();
  const { blocks: contextBlocks, loading: blocksLoading, deleteBlock, updateBlock, addBlock } = useContextBlocks();
  const isAdminBannerActive = useAdminBanner();

// Detect desktop standalone (PWA/Electron) for traffic light safe area
const [isDesktopStandalone, setIsDesktopStandalone] = useState(false);
useEffect(() => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  const isElectron = /electron/i.test(navigator.userAgent);
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  setIsDesktopStandalone((isStandalone || isElectron) && !isMobileDevice);
}, []);
  const { accentColor } = useAccentColor();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 12;
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [isMusicPopupOpen, setIsMusicPopupOpen] = useState(false);
  const { isPlaying: isMusicPlaying } = useMusicStore();
  const [recentApps, setRecentApps] = useState<RecentApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [chatSearch, setChatSearch] = useState("");
  const [imageSearch, setImageSearch] = useState("");
  const [appSearch, setAppSearch] = useState("");
  const [memorySearch, setMemorySearch] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemoryContent, setEditMemoryContent] = useState("");
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [chatPage, setChatPage] = useState(1);
  const [imagePage, setImagePage] = useState(1);
  // Lazy DB-driven image state (replaces full-hydration approach)
  const [dbImages, setDbImages] = useState<GeneratedImage[]>([]);
  const [dbImagesLoading, setDbImagesLoading] = useState(false);
  const [dbSessionOffset, setDbSessionOffset] = useState(0);
  const [dbHasMoreSessions, setDbHasMoreSessions] = useState(true);
  const DB_SESSION_BATCH = 30;
  const [totalImageCount, setTotalImageCount] = useState<number | null>(() => {
    // Read synchronously so the count shows on the very first render
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('arc_image_count_')) {
        const val = Number(localStorage.getItem(key));
        if (!isNaN(val)) return val;
      }
    }
    return null;
  });
  const [quickCounts, setQuickCounts] = useState<{ chats: number | null; memories: number | null }>({
    chats: null,
    memories: null,
  });
  const [appPage, setAppPage] = useState(1);
  const [memoryPage, setMemoryPage] = useState(1);
  const [canvasSearch, setCanvasSearch] = useState("");
  const [canvasPage, setCanvasPage] = useState(1);
  const [selectedCanvas, setSelectedCanvas] = useState<CanvasItem | null>(null);
  const [canvasDetailTab, setCanvasDetailTab] = useState<CanvasDetailTab>("canvas");
  const imageFetchStartedRef = useRef(false);
  const { openWithContent } = useCanvasStore();

  // Jelly nav bubble
  const BUBBLE_R = 28;
  const PILL_PAD = 8; // px-2 = 8px each side
  const NAV_EDGE_INSET = 8; // minimal inset — icons fill the full width
  const navPillRef = useRef<HTMLDivElement>(null);
  const [isBubbleDragging, setIsBubbleDragging] = useState(false);
  const [bubbleHoverIdx, setBubbleHoverIdx] = useState(-1);
  const [pillDims, setPillDims] = useState({ w: 0, h: 64 });
  const LENS_SCALE = 2.0;
  const bubbleCX = useMotionValue(-999); // -999 = not yet initialized
  const bubbleLeft = useTransform(bubbleCX, cx => cx - BUBBLE_R);
  // Lens left: positions the scaled content so the pill's pixel at bubbleCX maps to bubble center at BUBBLE_R
  // With scale(LENS_SCALE) from transform-origin:0 0, we need: left = BUBBLE_R - bubbleCX * LENS_SCALE
  const lensLeft = useTransform(bubbleCX, cx => BUBBLE_R - cx * LENS_SCALE);
  const bubbleDragStartRef = useRef({ pointerX: 0, startCX: 0 });
  const lastPtrXRef = useRef(0);
  const lastPtrTRef = useRef(0);
  // Jelly deformation springs
  const rawSX = useMotionValue(1);
  const rawSY = useMotionValue(1);
  const springSX = useSpring(rawSX, { stiffness: 260, damping: 18, mass: 0.45 });
  const springSY = useSpring(rawSY, { stiffness: 260, damping: 18, mass: 0.45 });
  // Base scale spring for pickup (bigger) / putdown (normal)
  const rawBase = useMotionValue(1);
  const springBase = useSpring(rawBase, { stiffness: 320, damping: 20, mass: 0.5 });
  // Combined: base scale × deformation
  const springScaleX = useTransform([springBase, springSX] as const, ([b, sx]) => (b as number) * (sx as number));
  const springScaleY = useTransform([springBase, springSY] as const, ([b, sy]) => (b as number) * (sy as number));
  // Lens magnification scale - animates from 1 to LENS_SCALE smoothly
  const lensScale = useMotionValue(1);
  const springLensScale = useSpring(lensScale, { stiffness: 320, damping: 20, mass: 0.4 });
  // Lens positioning - keeps the icon at bubbleCX centered as we magnify
  const lensLeftPos = useTransform([bubbleCX, springLensScale], ([cx, scale]) => BUBBLE_R - (cx as number) * (scale as number));
  const lensTopPos = useTransform(springLensScale, (scale) => BUBBLE_R - (pillDims.h / 2) * (scale as number));

  // Callback ref — initializes bubble as soon as pill mounts
  const setPillRef = (el: HTMLDivElement | null) => {
    (navPillRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (el && bubbleCX.get() === -999) {
      const contentW = el.offsetWidth - PILL_PAD * 2;
      const trackStart = PILL_PAD + NAV_EDGE_INSET;
      const trackW = Math.max(0, contentW - NAV_EDGE_INSET * 2);
      const tabW = trackW / tabs.length;
      const idx = tabs.findIndex(t => t.key === activeTab);
      bubbleCX.set(trackStart + idx * tabW + tabW / 2);
    }
  };

  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const sessionId = currentSessionId;
      if (sessionId) navigate(`/chat/${sessionId}`);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, currentSessionId, navigate]);

  // Reset pages on search changes
  useEffect(() => { setChatPage(1); }, [chatSearch]);
  useEffect(() => { setImagePage(1); }, [imageSearch]);
  useEffect(() => { setAppPage(1); }, [appSearch]);
  useEffect(() => { setMemoryPage(1); }, [memorySearch]);
  useEffect(() => { setCanvasPage(1); }, [canvasSearch]);

  // Animate lens scale when dragging
  useEffect(() => {
    animate(lensScale, isBubbleDragging ? LENS_SCALE : 1, { type: 'spring', stiffness: 320, damping: 20, mass: 0.4 });
  }, [isBubbleDragging]);

  const switchTab = (tab: DashboardTab) => {
    const tabIndex = tabs.findIndex(t => t.key === tab);
    if (tabIndex === -1) return;

    // Animate bubble like it's being grabbed and dropped
    // Pickup animation
    rawBase.set(1.22);
    animate(rawSX, [1, 0.85, 1.18, 0.93, 1.08, 1], { duration: 0.42 });
    animate(rawSY, [1, 1.18, 0.86, 1.09, 0.94, 1], { duration: 0.42 });

    // Move bubble to new tab position
    if (navPillRef.current) {
      const contentW = navPillRef.current.offsetWidth - PILL_PAD * 2;
      const trackStart = PILL_PAD + NAV_EDGE_INSET;
      const trackW = Math.max(0, contentW - NAV_EDGE_INSET * 2);
      const tabW = trackW / tabs.length;
      animate(bubbleCX, trackStart + tabIndex * tabW + tabW / 2, { type: 'spring', stiffness: 420, damping: 20, mass: 0.7 });
    }

    // Drop animation (delayed to happen after movement)
    setTimeout(() => {
      rawBase.set(1.0);
      animate(rawSX, [1.15, 0.86, 1.08, 0.96, 1], { duration: 0.5 });
      animate(rawSY, [0.88, 1.16, 0.93, 1.04, 1], { duration: 0.5 });
    }, 0);

    setActiveTab(tab);
    setSearchParams(tab === "overview" ? {} : { tab });
    setViewingImageIndex(null);
    setSelectedAppId(null);
    setSelectedCanvas(null);
    setChatPage(1); setImagePage(1); setAppPage(1); setMemoryPage(1); setCanvasPage(1);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  // Wait for sessions to be loaded before hydrating so hydrateAllSessions
  // doesn't see an empty chatSessions array and bail out early.
  useEffect(() => {
    if (user && isLoaded) hydrateAllSessions();
  }, [user, isLoaded, hydrateAllSessions]);

  // Optimized image fetching: only fetch sessions that actually contain images
  const fetchMoreImages = async (reset = false) => {
    if (dbImagesLoading) return;
    if (!reset && !dbHasMoreSessions) return;
    setDbImagesLoading(true);
    const offset = reset ? 0 : dbSessionOffset;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      
      // Use a more targeted query to find sessions with images
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id, messages, updated_at')
        .eq('user_id', session.user.id)
        .filter('messages', 'cs', '[{"type": "image", "role": "assistant"}]')
        .order('updated_at', { ascending: false })
        .range(offset, offset + DB_SESSION_BATCH - 1);
        
      if (error) throw error;
      
      const newImages: GeneratedImage[] = [];
      (data || []).forEach(s => {
        ((s.messages as any[]) || []).forEach(msg => {
          if (msg?.type === 'image' && msg?.imageUrl && msg?.role === 'assistant') {
            const ts = toDate(msg?.timestamp);
            if (!ts) return;
            newImages.push({
              url: msg.imageUrl,
              prompt: typeof msg?.content === 'string' ? msg.content.replace('Generated image: ', '') : '',
              sessionId: s.id,
              messageId: msg.id,
              timestamp: ts,
            });
          }
        });
      });
      
      newImages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setDbImages(prev => reset ? newImages : [...prev, ...newImages]);
      setDbSessionOffset(offset + DB_SESSION_BATCH);
      setDbHasMoreSessions((data || []).length === DB_SESSION_BATCH);
    } catch (e) {
      console.error('Failed to load images from DB:', e);
    } finally {
      setDbImagesLoading(false);
    }
  };

  // Kick off one eager image load on mount — use a ref so this never re-triggers
  useEffect(() => {
    if (user && isLoaded && !imageFetchStartedRef.current) {
      imageFetchStartedRef.current = true;
      fetchMoreImages(true);
    }
  }, [user, isLoaded]);

  useEffect(() => {
    if (!user) return;

    const cachedChats = Number(localStorage.getItem(`arc_chat_count_${user.id}`));
    const cachedMemories = Number(localStorage.getItem(`arc_memory_count_${user.id}`));
    const cachedImages = Number(localStorage.getItem(`arc_image_count_${user.id}`));

    setQuickCounts({
      chats: Number.isNaN(cachedChats) ? null : cachedChats,
      memories: Number.isNaN(cachedMemories) ? null : cachedMemories,
    });
    if (!Number.isNaN(cachedImages)) {
      setTotalImageCount(cachedImages);
    }

    (async () => {
      try {
        const [chatsRes, memoriesRes, imagesResWithArg] = await Promise.all([
          supabase
            .from('chat_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('context_blocks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase.rpc('count_user_images', { target_user_id: user.id } as any),
        ]);

        const imageCountResult =
          typeof imagesResWithArg.data === 'number'
            ? imagesResWithArg
            : await supabase.rpc('count_user_images');

        if (typeof chatsRes.count === 'number') {
          setQuickCounts(prev => ({ ...prev, chats: chatsRes.count ?? 0 }));
          localStorage.setItem(`arc_chat_count_${user.id}`, String(chatsRes.count ?? 0));
        }

        if (typeof memoriesRes.count === 'number') {
          setQuickCounts(prev => ({ ...prev, memories: memoriesRes.count ?? 0 }));
          localStorage.setItem(`arc_memory_count_${user.id}`, String(memoriesRes.count ?? 0));
        }

        if (typeof imageCountResult.data === 'number') {
          setTotalImageCount(imageCountResult.data);
          localStorage.setItem(`arc_image_count_${user.id}`, String(imageCountResult.data));
        }
      } catch (error) {
        console.error('Failed to load quick dashboard counts:', error);
      }
    })();
  }, [user]);

  // Reusable: snap bubble to active tab position (instant or animated)
  const snapBubble = (instant = false) => {
    if (!navPillRef.current) return;
    const contentW = navPillRef.current.offsetWidth - PILL_PAD * 2;
    const trackStart = PILL_PAD + NAV_EDGE_INSET;
    const trackW = Math.max(0, contentW - NAV_EDGE_INSET * 2);
    const tabW = trackW / tabs.length;
    const idx = tabs.findIndex(t => t.key === activeTab);
    const cx = trackStart + idx * tabW + tabW / 2;
    if (instant || bubbleCX.get() === -999) {
      bubbleCX.set(cx);
    } else {
      animate(bubbleCX, cx, { type: 'spring', stiffness: 380, damping: 26, mass: 0.65 });
      animate(rawSX, [1.12, 0.9, 1.05, 0.98, 1], { duration: 0.45 });
      animate(rawSY, [0.9, 1.12, 0.95, 1.02, 1], { duration: 0.45 });
    }
  };

  // Sync on tab change
  useEffect(() => {
    if (!isBubbleDragging) snapBubble();
  }, [activeTab, isBubbleDragging]);

  // Re-snap instantly on resize so bubble never sits outside the pill
  useEffect(() => {
    if (!navPillRef.current) return;
    const ro = new ResizeObserver(() => {
      if (navPillRef.current) setPillDims({ w: navPillRef.current.offsetWidth, h: navPillRef.current.offsetHeight });
      if (!isBubbleDragging) snapBubble(true);
    });
    ro.observe(navPillRef.current);
    return () => ro.disconnect();
  }, [activeTab, isBubbleDragging]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoadingApps(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase
          .from('ide_projects')
          .select('id, title, prompt, favicon_label, netlify_url, netlify_subdomain, updated_at, created_at, version')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false });
        if (data) setRecentApps(data as RecentApp[]);
      } catch (e) {
        console.error('Failed to load apps:', e);
      } finally {
        setLoadingApps(false);
      }
    })();
  }, [user]);

  const allChats = useMemo(() => {
    return [...chatSessions].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }, [chatSessions]);

  const filteredChats = useMemo(() => {
    if (!chatSearch.trim()) return allChats;
    const q = chatSearch.toLowerCase();
    return allChats.filter(s => s.title.toLowerCase().includes(q));
  }, [allChats, chatSearch]);

  const filteredImages = useMemo(() => {
    if (!imageSearch.trim()) return dbImages;
    const q = imageSearch.toLowerCase();
    return dbImages.filter(img => img.prompt.toLowerCase().includes(q));
  }, [dbImages, imageSearch]);

  const filteredApps = useMemo(() => {
    if (!appSearch.trim()) return recentApps;
    const q = appSearch.toLowerCase();
    return recentApps.filter(app => app.title.toLowerCase().includes(q));
  }, [recentApps, appSearch]);

  const filteredMemories = useMemo(() => {
    if (!memorySearch.trim()) return contextBlocks;
    const q = memorySearch.toLowerCase();
    return contextBlocks.filter(b => b.content.toLowerCase().includes(q));
  }, [contextBlocks, memorySearch]);

  const filteredCanvases = useMemo(() => {
    const items: CanvasItem[] = [];
    chatSessions.forEach(s => {
      s.messages.forEach(m => {
        if (m.type === 'code' || m.type === 'canvas') {
          items.push({
            id: m.id,
            type: m.type === 'canvas' ? 'writing' : 'code',
            content: typeof m.content === 'string' ? m.content : '',
            language: m.codeLanguage,
            sessionId: s.id,
            sessionTitle: s.title,
            timestamp: toDate(m.timestamp) || new Date(),
            label: m.codeLabel || m.canvasLabel || (m.type === 'code' ? 'Code Block' : 'Writing')
          });
        }
      });
    });
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (!canvasSearch.trim()) return items;
    const q = canvasSearch.toLowerCase();
    return items.filter(i => i.label?.toLowerCase().includes(q) || i.content.toLowerCase().includes(q));
  }, [chatSessions, canvasSearch]);

  const timeAgo = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  const insightTip = useMemo(() => {
    const tips = [
      allChats.length > 0 ? `You've had ${allChats.length} conversations with Arc.` : null,
      totalImageCount != null && totalImageCount > 0 ? `You've generated ${totalImageCount} image${totalImageCount === 1 ? '' : 's'} with Arc so far.` : null,
      contextBlocks.length > 0 ? `Arc is remembering ${contextBlocks.length} key details about you.` : null,
      "Start a new chat to brainstorm your next big idea.",
      "Use /build to create a web app from a single prompt.",
    ].filter(Boolean) as string[];
    return tips[Math.floor(Math.random() * tips.length)];
  }, [allChats.length, totalImageCount, contextBlocks.length]);

  if (authLoading) return null;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const tabs: { key: DashboardTab; label: string; icon: typeof MessageSquare }[] = [
    { key: "canvases", label: "Canvases", icon: Layers },
    { key: "chats", label: "Chats", icon: MessageSquare },
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "images", label: "Images", icon: Image },
    { key: "memories", label: "Memories", icon: Brain },
  ];

  const currentImage = viewingImageIndex !== null ? filteredImages[viewingImageIndex] : null;

  // Stats for overview
  const stats = [
    { label: "Chats", tab: "chats" as DashboardTab, value: allChats.length > 0 ? allChats.length : quickCounts.chats, icon: MessageSquare, color: "210 100% 66%", tw: "text-blue-400" },
    { label: "Images", tab: "images" as DashboardTab, value: totalImageCount, icon: Image, color: "270 80% 65%", tw: "text-purple-400" },
    { label: "Canvases", tab: "canvases" as DashboardTab, value: filteredCanvases.length, icon: Layers, color: "35 90% 60%", tw: "text-orange-400" },
    { label: "Memories", tab: "memories" as DashboardTab, value: contextBlocks.length > 0 ? contextBlocks.length : quickCounts.memories, icon: Brain, color: "155 70% 50%", tw: "text-emerald-400" },
  ];

  const getIdxFromCX = (cx: number) => {
    if (!navPillRef.current) return 0;
    const contentW = navPillRef.current.offsetWidth - PILL_PAD * 2;
    const trackStart = PILL_PAD + NAV_EDGE_INSET;
    const trackW = Math.max(0, contentW - NAV_EDGE_INSET * 2);
    const tabW = trackW / tabs.length;
    return Math.min(tabs.length - 1, Math.max(0, Math.floor((cx - trackStart) / tabW)));
  };

  const onBubblePtrDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    setIsBubbleDragging(true);
    setBubbleHoverIdx(getIdxFromCX(bubbleCX.get()));
    bubbleDragStartRef.current = { pointerX: e.clientX, startCX: bubbleCX.get() };
    lastPtrXRef.current = e.clientX;
    lastPtrTRef.current = performance.now();
    // Scale up on pickup + jiggle
    rawBase.set(1.22);
    animate(rawSX, [1, 0.85, 1.18, 0.93, 1.08, 1], { duration: 0.42 });
    animate(rawSY, [1, 1.18, 0.86, 1.09, 0.94, 1], { duration: 0.42 });
  };
  const onBubblePtrMove = (e: React.PointerEvent) => {
    if (!isBubbleDragging || !navPillRef.current) return;
    const contentW = navPillRef.current.offsetWidth - PILL_PAD * 2;
    const trackStart = PILL_PAD + NAV_EDGE_INSET;
    const trackW = Math.max(0, contentW - NAV_EDGE_INSET * 2);
    const dx = e.clientX - bubbleDragStartRef.current.pointerX;
    const newCX = bubbleDragStartRef.current.startCX + dx;
    bubbleCX.set(newCX);
    setBubbleHoverIdx(getIdxFromCX(newCX));
    // Velocity-based jelly deformation
    const now = performance.now();
    const dt = now - lastPtrTRef.current;
    const vel = dt > 0 ? (e.clientX - lastPtrXRef.current) / dt : 0; // px/ms
    lastPtrXRef.current = e.clientX;
    lastPtrTRef.current = now;
    const stretch = Math.min(0.45, Math.abs(vel) * 0.06);
    rawSX.set(1 + stretch);
    rawSY.set(1 / (1 + stretch));
  };
  const onBubblePtrUp = (e: React.PointerEvent) => {
    if (!isBubbleDragging || !navPillRef.current) return;
    setIsBubbleDragging(false);
    setBubbleHoverIdx(-1);
    const contentW = navPillRef.current.offsetWidth - PILL_PAD * 2;
    const trackStart = PILL_PAD + NAV_EDGE_INSET;
    const trackW = Math.max(0, contentW - NAV_EDGE_INSET * 2);
    const tabW = trackW / tabs.length;
    const cx = bubbleCX.get() - trackStart;
    const idx = Math.min(tabs.length - 1, Math.max(0, Math.floor(cx / tabW)));
    const target = tabs[idx]?.key || activeTab;
    animate(bubbleCX, trackStart + idx * tabW + tabW / 2, { type: 'spring', stiffness: 420, damping: 20, mass: 0.7 });
    // Scale back down on putdown + landing jiggle
    rawBase.set(1.0);
    animate(rawSX, [1.15, 0.86, 1.08, 0.96, 1], { duration: 0.5 });
    animate(rawSY, [0.88, 1.16, 0.93, 1.04, 1], { duration: 0.5 });
    switchTab(target);
  };

  const downloadImage = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arc-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div
      className="min-h-screen overflow-y-auto scrollbar-hide relative z-10"
      style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'} + ${isDesktopStandalone ? '30px' : '0px'})`,
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px) + 15px)',
      }}
    >
      <PaymentFailureBanner />
      <div className="w-full px-4 sm:px-6 pt-3 sm:pt-4 pb-8 sm:pb-12 space-y-6 sm:space-y-8">

        {/* ═══ HEADER with ambient glow ═══ */}
        <div className="relative">
          {/* Ambient glow behind greeting */}
          <div className="absolute -top-12 left-1/4 w-48 h-48 rounded-full bg-primary/8 blur-[80px] pointer-events-none" />
          <div className="absolute -top-8 right-1/3 w-32 h-32 rounded-full bg-primary/5 blur-[60px] pointer-events-none" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate("/")}
                className="rounded-full glass-shimmer"
                title="Back to chat"
              >
                <MessageSquare className="h-4.5 w-4.5 text-primary" />
              </Button>
              <ThemedLogo className="h-9 w-9" />
              <div>
                <h1 className="text-base sm:text-2xl font-light text-foreground tracking-tight">
                  {greeting}{profile?.display_name ? `, ${profile.display_name}` : ""}.
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsMusicPopupOpen(!isMusicPopupOpen)}
                className={cn(
                  "rounded-full glass-shimmer",
                  isMusicPlaying && "border-primary/30 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
                )}
                title="Music Player"
              >
                <Music className="h-4.5 w-4.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate("/dashboard/settings")}
                className="rounded-full glass-shimmer"
                title="Settings"
              >
                <Settings className="h-4.5 w-4.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>

        {/* ═══ CHAT INPUT ═══ */}
        <div className="glass-dock" data-has-images={false}>
          <ChatInput inline />
        </div>
        {/* Portal target for inline image preview — outside glass-dock */}
        <div id="dashboard-image-preview-target" />

        {/* ═══ SUBSCRIPTION BADGE / CTA ═══ */}
        <div>
          {isSubscribed ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/25 bg-primary/8 text-primary text-xs font-medium">
              <Zap className="h-3.5 w-3.5" />
              <span>Pro Plan{subscriptionEnd ? ` · renews ${new Date(subscriptionEnd).toLocaleDateString()}` : ''}</span>
            </div>
          ) : (
            <button
              onClick={() => openCheckout()}
              className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent hover:from-primary/18 hover:via-primary/10 hover:to-primary/5 text-primary text-xs font-medium transition-all hover:border-primary/35 hover:shadow-[0_0_20px_hsl(var(--primary)/0.1)] active:scale-[0.98]"
            >
              <div className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span>Upgrade to Pro — $8/mo for unlimited everything</span>
              <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>
          )}
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        <AnimatePresence mode="wait" initial={false}>
          {/* ====== OVERVIEW ====== */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-6">

              {/* Stat cards — code-block style */}
              <div className="grid grid-cols-2 gap-2">
                {stats.map(({ label, tab, icon: Icon, color, tw, value }) => {
                  const isImages = label === "Images";
                  return (
                    <div
                      key={label}
                      className="relative overflow-hidden rounded-xl cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.97] group"
                      style={{ border: `1px solid hsl(${color} / 0.25)`, background: `linear-gradient(160deg, hsl(${color} / 0.08) 0%, hsl(var(--background) / 0.9) 100%)` }}
                      onClick={() => switchTab(tab)}
                    >
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b" style={{ borderColor: `hsl(${color} / 0.2)`, background: `hsl(${color} / 0.06)` }}>
                        <div className="h-1.5 w-1.5 rounded-full opacity-70" style={{ background: `hsl(${color})` }} />
                        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">{label}.arc</span>
                      </div>
                      <div className="p-3 font-mono">
                        <Icon className={cn("absolute bottom-1 right-1 h-12 w-12 opacity-[0.06]", tw)} />
                        <p className="text-[10px] text-muted-foreground/60 mb-0.5">const {label.toLowerCase()} =</p>
                        {isImages ? (
                          <>
                            {value !== null && <p className={cn("text-2xl font-bold leading-none", tw)}>{value}</p>}
                            <div className={value !== null ? "mt-2" : "mt-1"}>
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-[10px] text-primary font-medium hover:bg-primary/20 transition-colors">
                                <Icon className="h-2.5 w-2.5" />
                                View all images
                                <ArrowRight className="h-2.5 w-2.5" />
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className={cn("text-2xl font-bold leading-none", tw)}>{value ?? 0}</p>
                            <div className="mt-2">
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-[10px] text-primary font-medium hover:bg-primary/20 transition-colors">
                                <Icon className="h-2.5 w-2.5" />
                                View all
                                <ArrowRight className="h-2.5 w-2.5" />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Insight tip */}
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-primary/15 bg-primary/5">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-foreground/80">{insightTip}</p>
              </div>

              {/* Recent Chats */}
              <Section title="Recent Chats" icon={MessageSquare} action={() => switchTab("chats")} actionLabel="See all">
                {!isLoaded ? <SkeletonGrid cols={3} /> : allChats.length === 0 ? (
                  <EmptyState icon={MessageSquare} text="No chats yet" sub="Start a conversation above!" />
                ) : (
                  <div className="space-y-1.5">
                    {allChats.slice(0, 3).map((session, i) => (
                      <ChatCard key={session.id} session={session} timeAgo={timeAgo} onClick={() => { loadSession(session.id); navigate(`/chat/${session.id}`); }} index={i} />
                    ))}
                  </div>
                )}
              </Section>


              {/* Memories */}
              <div className="grid grid-cols-1 gap-4">
                <Section title="Memories" icon={Brain} action={() => switchTab("memories")} actionLabel="See all" count={contextBlocks.length}>
                  {blocksLoading ? <SkeletonList count={3} /> : contextBlocks.length === 0 ? (
                    <EmptyState icon={Brain} text="No memories yet" sub='Say "remember that..."' />
                  ) : (
                    <div className="space-y-1.5">
                      {contextBlocks.slice(0, 3).map((block, i) => (
                        <div
                          key={block.id}
                          className="group p-3 rounded-xl border border-border/30 bg-muted/20 hover:border-primary/20 hover:bg-primary/5 transition-all"
                        >
                          <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed">{block.content}</p>
                          <span className="text-[10px] text-muted-foreground mt-1.5 block uppercase tracking-wider">{timeAgo(block.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            </motion.div>
          )}

          {/* ====== FULL CHATS ====== */}
          {activeTab === "chats" && (
            <motion.div key="chats" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search chats..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { const id = createNewSession(); navigate(`/chat/${id}`); }}
                  className="rounded-full glass-shimmer"
                  title="New chat"
                >
                  <Plus className="h-4.5 w-4.5 text-primary" />
                </Button>
              </div>

              {!isLoaded ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="p-4 rounded-xl border border-border/30 bg-muted/20"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></div>)}</div>
              ) : filteredChats.length === 0 ? (
                <EmptyState icon={MessageSquare} text={chatSearch ? "No matching chats" : "No chats yet"} sub="Start a conversation to see history here" />
              ) : (
                <>
                <div className="space-y-1.5">
                  {filteredChats.slice((chatPage - 1) * ITEMS_PER_PAGE, chatPage * ITEMS_PER_PAGE).map((session, i) => (
                    <div
                      key={session.id}
                      className={cn(
                        "p-4 cursor-pointer group transition-all rounded-xl border",
                        currentSessionId === session.id
                          ? "border-primary/40 bg-primary/8 shadow-[0_0_15px_hsl(var(--primary)/0.08)]"
                          : "border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5"
                      )}
                      onClick={() => { loadSession(session.id); navigate(`/chat/${session.id}`); }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                            currentSessionId === session.id ? "bg-primary/20" : "bg-muted/30"
                          )}>
                            <MessageSquare className={cn("h-5 w-5", currentSessionId === session.id ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground truncate">{session.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">{timeAgo(session.lastMessageAt)}</span>
                              <span className="text-muted-foreground/30">·</span>
                              <span className="text-xs text-muted-foreground">{session.messageCount ?? session.messages.length} messages</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationBar current={chatPage} total={Math.ceil(filteredChats.length / ITEMS_PER_PAGE)} onChange={setChatPage} />
                </>
              )}
            </motion.div>
          )}

          {/* ====== IMAGES ====== */}
          {activeTab === "images" && (
            <motion.div key="images" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {viewingImageIndex !== null && currentImage ? (
                  <motion.div key="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <button onClick={() => setViewingImageIndex(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft className="h-4 w-4" /> Back to gallery
                      </button>
                      <span className="text-xs text-muted-foreground font-medium">{viewingImageIndex + 1} / {filteredImages.length}</span>
                    </div>

                    <div className="rounded-2xl overflow-hidden border border-border/30 bg-muted/10">
                      <div className="relative flex items-center justify-center bg-black/20 min-h-[300px] sm:min-h-[400px] max-h-[70vh] group">
                        <SmoothImage src={currentImage.url} alt={currentImage.prompt} className="w-full h-full max-h-[70vh] object-contain" />
                        {viewingImageIndex > 0 && (
                          <button onClick={() => setViewingImageIndex(viewingImageIndex - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100">
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                        )}
                        {viewingImageIndex < filteredImages.length - 1 && (
                          <button onClick={() => setViewingImageIndex(viewingImageIndex + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100">
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                      <div className="p-4 sm:p-5 space-y-3 border-t border-border/20">
                        <p className="text-sm text-foreground leading-relaxed">{currentImage.prompt || "Generated image"}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{currentImage.timestamp.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => downloadImage(currentImage)} className="rounded-xl border-border/40 bg-muted/20 hover:bg-muted/40">
                            <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { loadSession(currentImage.sessionId); navigate(`/chat/${currentImage.sessionId}`); }} className="rounded-xl border-border/40 bg-muted/20 hover:bg-muted/40">
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Go to chat
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2">
                      {filteredImages.map((img, i) => (
                        <button
                          key={`thumb-${i}`}
                          onClick={() => setViewingImageIndex(i)}
                          className={cn(
                            "shrink-0 h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden border-2 transition-all",
                            i === viewingImageIndex ? "border-primary ring-1 ring-primary/40 scale-105" : "border-transparent opacity-50 hover:opacity-100"
                          )}
                        >
                          <SmoothImage src={img.url} alt="" className="w-full h-full object-cover" thumbnail />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input value={imageSearch} onChange={e => setImageSearch(e.target.value)} placeholder="Search your generations..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                      </div>
                      {totalImageCount !== null && (
                        <div className="hidden sm:block px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
                          <span className="text-xs font-medium text-primary">{totalImageCount} total</span>
                        </div>
                      )}
                    </div>

                    {dbImagesLoading && dbImages.length === 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {[1,2,3,4,5,6,7,8].map(i => (
                          <div key={i} className="aspect-square rounded-2xl bg-muted/20 animate-pulse border border-border/10" />
                        ))}
                      </div>
                    ) : filteredImages.length === 0 ? (
                      <div className="py-20">
                        <EmptyState 
                          icon={Image} 
                          text={imageSearch ? "No matching images" : "Your gallery is empty"} 
                          sub={imageSearch ? "Try a different search term" : "Images you generate in chat will appear here automatically."} 
                        />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {filteredImages.slice((imagePage - 1) * ITEMS_PER_PAGE, imagePage * ITEMS_PER_PAGE).map((img, i) => {
                            const globalIndex = (imagePage - 1) * ITEMS_PER_PAGE + i;
                            return <ImageCard key={`${img.sessionId}-${globalIndex}`} img={img} onClick={() => setViewingImageIndex(globalIndex)} index={i} />;
                          })}
                        </div>
                        
                        <div className="flex flex-col items-center gap-4 pt-4">
                          <PaginationBar current={imagePage} total={Math.ceil(filteredImages.length / ITEMS_PER_PAGE)} onChange={setImagePage} />
                          
                          {dbHasMoreSessions && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => fetchMoreImages()} 
                              disabled={dbImagesLoading}
                              className="text-xs text-muted-foreground hover:text-primary"
                            >
                              {dbImagesLoading ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                  Loading more...
                                </span>
                              ) : "Load more from history"}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}


          {/* ====== FULL CANVASES ====== */}
          {activeTab === "canvases" && (
            <motion.div key="canvases" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {selectedCanvas ? (
                  <motion.div key="canvas-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <button onClick={() => { setSelectedCanvas(null); setCanvasDetailTab("canvas"); }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronLeft className="h-4 w-4" /> Back to canvases
                      </button>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-border/30 bg-muted/10">
                      <div className="p-4 border-b border-border/20 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {selectedCanvas.type === 'code' ? <FileCode className="h-4 w-4 text-primary shrink-0" /> : <PenLine className="h-4 w-4 text-primary shrink-0" />}
                            <p className="font-semibold text-foreground truncate text-sm">{selectedCanvas.label}</p>
                            {selectedCanvas.language && selectedCanvas.language !== 'text' && (
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", getLanguageColor(selectedCanvas.language))}>{getLanguageDisplay(selectedCanvas.language)}</span>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="sm" className="rounded-xl border-border/40 bg-muted/20" onClick={() => { loadSession(selectedCanvas.sessionId); navigate(`/chat/${selectedCanvas.sessionId}`); openWithContent(selectedCanvas.content, selectedCanvas.type, selectedCanvas.language || 'text'); }}>
                              <Eye className="h-3.5 w-3.5 mr-1.5" /> Open
                            </Button>
                            <Button variant="outline" size="sm" className="rounded-xl border-border/40 bg-muted/20" onClick={() => { loadSession(selectedCanvas.sessionId); navigate(`/chat/${selectedCanvas.sessionId}`); }}>
                              <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Chat
                            </Button>
                          </div>
                        </div>
                        {/* Canvas detail tabs */}
                        <div className="flex gap-1 -mx-4 px-4">
                          <button onClick={() => setCanvasDetailTab("canvas")} className={cn("px-3 py-2 text-sm font-medium rounded-lg transition-colors", canvasDetailTab === "canvas" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>
                            Canvas
                          </button>
                          <button onClick={() => setCanvasDetailTab("deployed")} className={cn("px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5", canvasDetailTab === "deployed" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>
                            <Globe className="h-3.5 w-3.5" /> Live Sites
                          </button>
                        </div>
                      </div>
                      {/* Canvas view */}
                      {canvasDetailTab === "canvas" && (
                        <>
                          {selectedCanvas.type === 'code' && selectedCanvas.language && canPreview(selectedCanvas.language) ? (
                            <div className="relative w-full" style={{ height: '420px' }}>
                              <CodePreview code={selectedCanvas.content} language={selectedCanvas.language} />
                            </div>
                          ) : (
                            <pre className="p-4 text-xs font-mono text-foreground/80 overflow-auto max-h-[420px] whitespace-pre-wrap leading-relaxed">
                              {selectedCanvas.content.slice(0, 3000)}{selectedCanvas.content.length > 3000 ? '\n…' : ''}
                            </pre>
                          )}
                        </>
                      )}
                      {/* Deployed sites view */}
                      {canvasDetailTab === "deployed" && (
                        <div className="max-h-[420px] overflow-y-auto">
                          <DeploysPanel />
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="canvas-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={canvasSearch} onChange={e => setCanvasSearch(e.target.value)} placeholder="Search canvases…" className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                    </div>
                    {!allSessionsHydrated ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {[1,2,3,4].map(i => <div key={i} className="rounded-xl border border-border/30 bg-muted/20 overflow-hidden"><Skeleton className="h-32 w-full" /><div className="p-3"><Skeleton className="h-4 w-3/4 mb-1.5" /><Skeleton className="h-3 w-1/2" /></div></div>)}
                      </div>
                    ) : filteredCanvases.length === 0 ? (
                      <EmptyState icon={Layers} text={canvasSearch ? "No matching canvases" : "No canvases yet"} sub="Ask Arc to write code or use /write" />
                    ) : (
                      <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredCanvases.slice((canvasPage - 1) * ITEMS_PER_PAGE, canvasPage * ITEMS_PER_PAGE).map((item) => (
                          <div
                            key={item.id}
                            className="group p-4 rounded-xl border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all cursor-pointer"
                            onClick={() => setSelectedCanvas(item)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                {item.type === 'code' ? <FileCode className="h-4 w-4 text-primary shrink-0" /> : <PenLine className="h-4 w-4 text-primary shrink-0" />}
                                <p className="font-semibold text-foreground truncate text-sm">{item.label}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.timestamp)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-3 font-mono bg-black/10 p-2 rounded-lg border border-border/10">
                              {item.content.slice(0, 200)}
                            </p>
                            <div className="flex items-center justify-between mt-3">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.sessionTitle}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>
                        ))}
                      </div>
                      <PaginationBar current={canvasPage} total={Math.ceil(filteredCanvases.length / ITEMS_PER_PAGE)} onChange={setCanvasPage} />
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ====== MEMORIES ====== */}
          {activeTab === "memories" && (
            <motion.div key="memories" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={memorySearch} onChange={e => setMemorySearch(e.target.value)} placeholder="Search memories..." className="pl-9 bg-muted/30 border-border/40 rounded-xl" />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { setIsAddingMemory(true); setNewMemoryContent(""); }}
                  className="rounded-full glass-shimmer"
                  title="Add memory"
                >
                  <Plus className="h-4.5 w-4.5 text-primary" />
                </Button>
              </div>

              {isAddingMemory && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
                  <Textarea value={newMemoryContent} onChange={e => setNewMemoryContent(e.target.value)} placeholder="What should Arc remember?" className="bg-background/50 border-border/40 rounded-xl min-h-[100px]" autoFocus />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsAddingMemory(false)} className="rounded-xl">Cancel</Button>
                    <Button size="sm" disabled={!newMemoryContent.trim()} onClick={async () => { await addBlock(newMemoryContent); setIsAddingMemory(false); }} className="rounded-xl">Save Memory</Button>
                  </div>
                </motion.div>
              )}

              {blocksLoading ? (
                <SkeletonList count={5} />
              ) : filteredMemories.length === 0 ? (
                <EmptyState icon={Brain} text={memorySearch ? "No matching memories" : "No memories yet"} sub='Tell Arc "remember that..." to save context' />
              ) : (
                <>
                <div className="space-y-2">
                  {filteredMemories.slice((memoryPage - 1) * ITEMS_PER_PAGE, memoryPage * ITEMS_PER_PAGE).map((block) => (
                    <div key={block.id} className="group p-4 rounded-xl border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all">
                      {editingMemoryId === block.id ? (
                        <div className="space-y-3">
                          <Textarea value={editMemoryContent} onChange={e => setEditMemoryContent(e.target.value)} className="bg-background/50 border-border/40 rounded-xl min-h-[80px]" autoFocus />
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditingMemoryId(null)} className="rounded-xl">Cancel</Button>
                            <Button size="sm" onClick={async () => { await updateBlock(block.id, editMemoryContent); setEditingMemoryId(null); }} className="rounded-xl">Update</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground/90 leading-relaxed">{block.content}</p>
                            <span className="text-[10px] text-muted-foreground mt-2 block uppercase tracking-wider">{timeAgo(block.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => { setEditingMemoryId(block.id); setEditMemoryContent(block.content); }}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => deleteBlock(block.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <PaginationBar current={memoryPage} total={Math.ceil(filteredMemories.length / ITEMS_PER_PAGE)} onChange={setMemoryPage} />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ BOTTOM NAVIGATION ═══ */}
      <div className="fixed bottom-0 left-0 right-0 sm:right-auto z-50 pointer-events-none flex justify-center sm:justify-start" style={{ paddingBottom: '20px' }}>
        <div
          ref={setPillRef}
          className="flex items-center px-2 gap-1 py-3 rounded-full pointer-events-auto relative mx-5 sm:mx-8 sm:w-[420px] md:w-[480px]"
          style={{
            background: 'hsl(var(--background) / 0.85)',
            backdropFilter: 'blur(24px) saturate(120%)',
            WebkitBackdropFilter: 'blur(24px) saturate(120%)',
            border: '1px solid hsl(var(--border) / 0.5)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 hsl(var(--foreground) / 0.08)',
          }}
        >
          {/* Jelly bubble — rendered first so tabs stack above it visually but bubble captures pointer via z-index */}
          <motion.div
            className="absolute top-1/2 rounded-full touch-none select-none"
            style={{
              left: bubbleLeft,
              width: BUBBLE_R * 2,
              height: BUBBLE_R * 2,
              translateY: '-50%',
              scaleX: springScaleX,
              scaleY: springScaleY,
              zIndex: 30,
              cursor: isBubbleDragging ? 'grabbing' : 'grab',
              overflow: 'hidden',
              border: '2px solid hsl(var(--primary))',
              background: 'transparent',
              boxShadow: isBubbleDragging
                ? '0 0 12px 3px hsl(var(--primary) / 0.7), 0 0 32px 6px hsl(var(--primary) / 0.35), inset 0 0 16px 2px hsl(var(--primary) / 0.15)'
                : '0 0 8px 2px hsl(var(--primary) / 0.55), 0 0 22px 4px hsl(var(--primary) / 0.25), inset 0 0 10px 1px hsl(var(--primary) / 0.08)',
              pointerEvents: 'auto',
            }}
            onPointerDown={onBubblePtrDown}
            onPointerMove={onBubblePtrMove}
            onPointerUp={onBubblePtrUp}
            onPointerCancel={onBubblePtrUp}
          >
            {/* True magnification lens — zooms the actual nav icons through the bubble circle */}
            <motion.div
              animate={{ opacity: isBubbleDragging ? 1 : 0 }}
              transition={{ duration: 0.12 }}
              style={{
                position: 'absolute',
                left: lensLeftPos,
                top: lensTopPos,
                width: pillDims.w || navPillRef.current?.offsetWidth || 300,
                height: pillDims.h || 64,
                scale: springLensScale,
                transformOrigin: '0 0',
                pointerEvents: 'none',
              }}
            >
              <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', paddingLeft: PILL_PAD + NAV_EDGE_INSET, paddingRight: PILL_PAD + NAV_EDGE_INSET }}>
                {tabs.map(({ key, icon: Icon }, i) => (
                  <div key={key} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 12, paddingRight: 12 }}>
                    <Icon
                      style={{
                        width: 20,
                        height: 20,
                        color: bubbleHoverIdx === i
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--muted-foreground) / 0.5)',
                        filter: bubbleHoverIdx === i ? 'drop-shadow(0 0 4px hsl(var(--primary)))' : 'none',
                      }}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          <div className="flex flex-1 items-center" style={{ paddingLeft: NAV_EDGE_INSET, paddingRight: NAV_EDGE_INSET }}>
            {tabs.map(({ key, label, icon: Icon }, i) => {
              const isActive = activeTab === key;
              // Hide the icon under the bubble only while dragging (uses reactive bubbleHoverIdx)
              const isHiddenByBubble = isBubbleDragging && bubbleHoverIdx === i;
              return (
                <button
                  key={key}
                  onClick={() => switchTab(key)}
                  className={cn(
                    "flex items-center justify-center px-3 py-3 rounded-lg transition-all min-w-0 flex-1 relative min-h-[48px] touch-manipulation",
                    isActive ? "text-primary" : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                  style={{ zIndex: 20, opacity: isHiddenByBubble ? 0 : 1, transitionProperty: 'opacity', transitionDuration: '0.1s' }}
                >
                  <Icon className={cn(
                    "h-5 w-5 transition-all duration-300",
                    isActive && "drop-shadow-[0_0_12px_hsl(var(--primary)/0.6)]"
                  )} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Music Popup */}
      <MusicPopup
        isOpen={isMusicPopupOpen}
        onClose={() => setIsMusicPopupOpen(false)}
      />
    </div>
  );
}

/* ====== Sub-components ====== */

function Section({ title, icon: Icon, action, actionLabel, count, children }: {
  title: string; icon: typeof MessageSquare; action?: () => void; actionLabel?: string; count?: number; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          {title}
          {count !== undefined && <span className="text-[10px] text-muted-foreground font-normal px-1.5 py-0.5 rounded-md bg-muted/40">{count}</span>}
        </h2>
        {action && (
          <button onClick={action} className="text-[11px] text-muted-foreground hover:text-primary font-medium transition-colors flex items-center gap-1">
            {actionLabel || "View all"}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ChatCard({ session, timeAgo, onClick }: { session: any; timeAgo: (d: any) => string; onClick: () => void; index?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl cursor-pointer border border-border/30 hover:border-primary/25 transition-all group"
      style={{ background: 'linear-gradient(135deg, hsl(var(--muted) / 0.25) 0%, hsl(var(--primary) / 0.04) 100%)' }}
      onClick={onClick}
    >
      {/* Left accent strip */}
      <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary/40 group-hover:bg-primary/70 transition-colors" />
      <div className="flex items-center gap-3 p-3.5 pl-4">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' }}
        >
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate text-sm">{session.title}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-[11px] text-muted-foreground">{timeAgo(session.lastMessageAt)}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[11px] text-muted-foreground">{session.messageCount ?? session.messages.length} msgs</span>
          </div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  );
}

function ImageCard({ img, onClick }: { img: GeneratedImage; onClick: () => void; index?: number }) {
  return (
    <div
      className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group hover:scale-[1.04] hover:-translate-y-0.5 transition-transform"
      style={{
        border: '1px solid hsl(var(--primary) / 0.12)',
        boxShadow: '0 4px 20px hsl(var(--primary) / 0.06)',
      }}
      onClick={onClick}
    >
      <SmoothImage src={img.url} alt={img.prompt} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" thumbnail />
      {/* Shimmer overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2.5">
        <p className="text-white text-xs line-clamp-2 font-medium leading-snug drop-shadow-lg">{img.prompt}</p>
      </div>
      {/* Corner glow */}
      <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-primary/15 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}

function AppIcon({ app, size }: { app: RecentApp; size?: "lg" }) {
  const fav = app.favicon_label ? getFaviconByLabel(app.favicon_label) : null;
  const FavIcon = fav?.icon;
  const s = size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const iconS = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  const radius = size === "lg" ? "rounded-2xl" : "rounded-xl";
  return (
    <div className={cn(s, radius, "bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0")}>
      {FavIcon ? <FavIcon className={iconS} style={{ color: fav?.color }} /> : <Rocket className={cn(iconS, "text-primary/70")} />}
    </div>
  );
}

function AppListCard({ app, timeAgo, onClick }: { app: RecentApp; timeAgo: (d: any) => string; onClick: () => void; index?: number }) {
  return (
    <div
      className="p-3 rounded-xl cursor-pointer flex items-center gap-3 border border-border/30 bg-muted/15 hover:border-primary/20 hover:bg-primary/5 transition-all group"
      onClick={onClick}
    >
      <AppIcon app={app} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate text-sm">{app.title}</p>
        <span className="text-[11px] text-muted-foreground">{timeAgo(app.updated_at)}</span>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary/50 group-hover:translate-x-0.5 transition-all" />
    </div>
  );
}

function EmptyState({ icon: Icon, text, sub }: { icon: typeof MessageSquare; text: string; sub: string }) {
  return (
    <div className="relative p-8 rounded-2xl text-center border border-dashed border-border/30 overflow-hidden"
      style={{ background: 'linear-gradient(145deg, hsl(var(--muted) / 0.15) 0%, hsl(var(--primary) / 0.03) 100%)' }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary/5 rounded-full blur-[50px] pointer-events-none" />
      <div className="relative z-10">
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--primary) / 0.04))' }}
        >
          <Icon className="h-5 w-5 text-primary/40" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">{text}</p>
        <p className="text-xs text-muted-foreground/50 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function SkeletonGrid({ cols, square }: { cols: number; square?: boolean }) {
  return (
    <div className={cn("grid gap-2.5", cols === 3 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
      {Array.from({ length: cols }).map((_, i) => square ? <Skeleton key={i} className="aspect-square rounded-xl" /> : (
        <div key={i} className="p-3.5 rounded-xl border border-border/30 bg-muted/10"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>
      ))}
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div className="space-y-1.5">{Array.from({ length: count }).map((_, i) => <div key={i} className="p-3 rounded-xl border border-border/30 bg-muted/10"><Skeleton className="h-4 w-3/4" /></div>)}</div>
  );
}

function PaginationBar({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;

  const goTo = (p: number) => {
    onChange(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Show max 5 page buttons with ellipsis
  const pages: (number | '...')[] = [];
  if (total <= 5) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
  }

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <button
        onClick={() => goTo(current - 1)}
        disabled={current === 1}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-all"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground/50">…</span>
        ) : (
          <button
            key={p}
            onClick={() => goTo(p)}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all",
              p === current
                ? "bg-primary/15 text-primary border border-primary/25"
                : "text-muted-foreground hover:bg-muted/40"
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => goTo(current + 1)}
        disabled={current === total}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-all"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <span className="ml-2 text-[10px] text-muted-foreground/50">{current}/{total}</span>
    </div>
  );
}
