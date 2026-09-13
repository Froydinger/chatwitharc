import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Brain,
  Check,
  CalendarClock,
  Crown,
  ChevronRight,
  CircleUserRound,
  Code2,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Smartphone,
  Sun,
  Trash2,
  Moon,
  Monitor,
  Users,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemedLogo } from "@/components/ThemedLogo";
import { useAccentStore } from "@/store/useAccentStore";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useChatSync } from "@/hooks/useChatSync";
import { useArcStore } from "@/store/useArcStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useImageQuota } from "@/hooks/useImageQuota";
import { useContextBlocks } from "@/hooks/useContextBlocks";
import { useIDEStore } from "@/store/useIDEStore";
import { supabase } from "@/integrations/supabase/client";
import { DashboardPageInner } from "@/pages/DashboardPage";

type LayoutMode = "dock" | "sidebar";
type DashboardTab = "overview" | "chats" | "apps" | "images" | "canvases" | "memory";

const navItems: Array<{ id: DashboardTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Dash", icon: LayoutDashboard },
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "apps", label: "Apps", icon: FolderKanban },
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "canvases", label: "Canvases", icon: Code2 },
  { id: "memory", label: "Memory", icon: Brain },
];

type DashboardStat = { label: string; value: string | number | null; detail: string; icon: typeof MessageSquare; tint: string; glow: string };

const statCards: DashboardStat[] = [
  { label: "Chats", value: "24", detail: "+6 this month", icon: MessageSquare, tint: "text-blue-300", glow: "from-blue-500/18" },
  { label: "Apps", value: "08", detail: "2 published", icon: FolderKanban, tint: "text-violet-300", glow: "from-violet-500/20" },
  { label: "Images", value: "136", detail: "+18 this week", icon: ImageIcon, tint: "text-fuchsia-300", glow: "from-fuchsia-500/18" },
  { label: "Reminders", value: "03", detail: "Next in 2 hours", icon: CalendarClock, tint: "text-amber-200", glow: "from-amber-500/16" },
];

type DashboardChatPreview = { id: string; title: string; detail: string; tone: string };

const recentChats: DashboardChatPreview[] = [
  { id: "preview-restore", title: "Restore Mac dashboard", detail: "Arc Work · 8 minutes ago", tone: "from-violet-500/35 via-indigo-500/15 to-transparent" },
  { id: "preview-news", title: "The good news digest", detail: "Arc Chat · Yesterday", tone: "from-emerald-500/30 via-cyan-500/12 to-transparent" },
  { id: "preview-landing", title: "Landing page directions", detail: "Arc Work · Tuesday", tone: "from-amber-500/28 via-orange-500/12 to-transparent" },
];

type PreviewNotification = { title: string; detail: string; time: string; unread: boolean; chatId?: string };
const previewNotifications: PreviewNotification[] = [
  { title: "Cloud run complete", detail: "Restore Mac dashboard is ready.", time: "8 min ago", unread: true, chatId: "preview-restore" },
  { title: "Reminder due soon", detail: "Review your latest image set.", time: "1 hr ago", unread: false },
  { title: "Arc saved your chat", detail: "The good news digest is synced.", time: "Yesterday", unread: false, chatId: "preview-news" },
];

const workspaceTasks = [
  { id: "retail-trends", title: "Finish the retail trends canvas", detail: "Research the latest signals and update the canvas.", tone: "bg-emerald-300" },
  { id: "image-set", title: "Review your latest image set", detail: "Check the newest images and call out the strongest ones.", tone: "bg-violet-300" },
  { id: "reminder", title: "Prepare the 7:00 PM reminder", detail: "Draft the reminder and queue it for delivery.", tone: "bg-amber-200" },
];

function ArcMark({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <div className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] shadow-[0_0_28px_rgba(168,85,247,0.16)]",
        compact ? "h-9 w-9" : "h-11 w-11",
      )}>
        <ThemedLogo className={compact ? "h-5 w-5" : "h-6 w-6"} alt="Arc" />
      </div>
      <div>
        <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">ArcAI</p>
        {!compact && <p className="text-[11px] text-muted-foreground">Jake’s workspace</p>}
      </div>
    </>
  );
  const className = cn("flex items-center text-left", compact ? "gap-2" : "gap-3");
  return onClick ? <button type="button" onClick={onClick} className={cn(className, "rounded-2xl transition-opacity hover:opacity-80")} aria-label="Return to chat">{content}</button> : <div className={className}>{content}</div>;
}

function LayoutSwitcher({ mode, onChange }: { mode: LayoutMode; onChange: (mode: LayoutMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.045] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" role="tablist" aria-label="Dashboard layout preview">
      {(["dock", "sidebar"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={mode === option}
          onClick={() => onChange(option)}
          className="relative rounded-full px-3.5 py-2 text-[11px] font-medium transition-colors sm:px-4"
        >
          {mode === option && (
            <motion.span
              layoutId="dashboard-preview-layout"
              className="absolute inset-0 rounded-full bg-white/[0.12] shadow-[0_0_18px_rgba(168,85,247,0.24)]"
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
            />
          )}
          <span className={cn("relative z-10", mode === option ? "text-foreground" : "text-muted-foreground")}>
            {option === "dock" ? "Bottom dock" : "Sidebar desktop"}
          </span>
        </button>
      ))}
    </div>
  );
}

function PreviewSidebar({ activeTab, onChange, onHome }: { activeTab: DashboardTab; onChange: (tab: DashboardTab) => void; onHome: () => void }) {
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col rounded-[28px] border border-white/[0.09] bg-white/[0.035] p-3 shadow-[0_22px_80px_rgba(0,0,0,0.18)] lg:flex">
      <div className="flex items-center gap-1.5 px-2 py-2"><button type="button" onClick={onHome} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" aria-label="Back to Arc chat" title="Back to Arc chat"><ArrowLeft className="h-4 w-4" /></button><ArcMark onClick={onHome} /></div>
      <div className="my-5 h-px bg-white/[0.07]" />
      <nav className="space-y-1" aria-label="Dashboard preview navigation">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm transition-colors",
                active ? "bg-white/[0.10] text-foreground shadow-[0_0_24px_rgba(168,85,247,0.12)]" : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              {active && <motion.span layoutId="dashboard-preview-side-active" className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />}
              <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              <span>{label}</span>
              {id === "chats" && <span className="ml-auto rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-muted-foreground">24</span>}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-primary/15 bg-primary/[0.06] p-3">
        <div className="flex items-center gap-2 text-xs font-medium"><Sparkles className="h-3.5 w-3.5 text-primary" /> Boost active</div>
        <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">Unlimited reasoning for the work that needs more room.</p>
        <button type="button" className="mt-3 text-[11px] font-medium text-primary hover:underline">Manage plan</button>
      </div>
    </aside>
  );
}

function BottomShelf({ activeTab, onChange, mobileOnly = false }: { activeTab: DashboardTab; onChange: (tab: DashboardTab) => void; mobileOnly?: boolean }) {
  const navRef = useRef<HTMLDivElement>(null);
  const [trackSize, setTrackSize] = useState({ width: 0, height: 46 });
  const [isCompact, setIsCompact] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(navItems.findIndex((item) => item.id === activeTab));
  const bubbleCX = useMotionValue(-1);
  const lensFocusX = useMotionValue(0);
  const lensScale = useMotionValue(1);
  const springLensScale = useSpring(lensScale, { stiffness: 320, damping: 20, mass: 0.4 });
  const rawSX = useMotionValue(1);
  const rawSY = useMotionValue(1);
  const springSX = useSpring(rawSX, { stiffness: 260, damping: 22, mass: 0.45 });
  const springSY = useSpring(rawSY, { stiffness: 260, damping: 22, mass: 0.45 });
  const rawBase = useMotionValue(1);
  const springBase = useSpring(rawBase, { stiffness: 320, damping: 24, mass: 0.5 });
  const bubbleScaleX = useTransform([springBase, springSX] as const, ([base, sx]) => (base as number) * (sx as number));
  const bubbleScaleY = useTransform([springBase, springSY] as const, ([base, sy]) => (base as number) * (sy as number));
  const navGap = 4;
  const itemWidth = Math.max(0, (trackSize.width - navGap * (navItems.length - 1)) / navItems.length);
  const bubbleWidth = Math.min(trackSize.width, itemWidth * (isCompact ? 1.04 : 1.12));
  const ActiveIcon = navItems.find((item) => item.id === activeTab)?.icon ?? LayoutDashboard;
  const bubbleLeft = useTransform(bubbleCX, (cx) => cx - bubbleWidth / 2);
  const lensLeft = useTransform([lensFocusX, springLensScale] as const, ([focus, scale]) => bubbleWidth / 2 - (focus as number) * (scale as number));
  const lensTop = useTransform(springLensScale, (scale) => trackSize.height / 2 - (trackSize.height / 2) * (scale as number));
  const dragRef = useRef({ pointerX: 0, startCX: 0, lastX: 0, lastTime: 0 });
  const slideLockRef = useRef(false);

  const centerForIndex = (index: number) => (itemWidth + navGap) * index + itemWidth / 2;
  const clampCenter = (center: number) => Math.min(trackSize.width - bubbleWidth / 2, Math.max(bubbleWidth / 2, center));
  const indexForCenter = (center: number) => Math.min(navItems.length - 1, Math.max(0, Math.round((center - itemWidth / 2) / (itemWidth + navGap))));

  useEffect(() => {
    const updateBreakpoint = () => setIsCompact(window.innerWidth < 640);
    updateBreakpoint();
    window.addEventListener("resize", updateBreakpoint);
    return () => window.removeEventListener("resize", updateBreakpoint);
  }, []);

  useEffect(() => {
    const element = navRef.current;
    if (!element) return;
    const updateSize = () => setTrackSize({ width: element.clientWidth, height: element.clientHeight || 46 });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!itemWidth || isDragging || slideLockRef.current) return;
    const index = Math.max(0, navItems.findIndex((item) => item.id === activeTab));
    const center = (itemWidth + navGap) * index + itemWidth / 2;
    setHoverIndex(index);
    bubbleCX.set(center);
    lensFocusX.set(center);
  }, [activeTab, bubbleCX, isDragging, itemWidth, lensFocusX]);

  const selectTab = (id: DashboardTab) => {
    if (slideLockRef.current || isDragging || !itemWidth) return;
    const targetIndex = Math.max(0, navItems.findIndex((item) => item.id === id));
    const startIndex = Math.max(0, navItems.findIndex((item) => item.id === activeTab));
    if (targetIndex === startIndex) return;
    const startCenter = centerForIndex(startIndex);
    const targetCenter = centerForIndex(targetIndex);
    slideLockRef.current = true;
    setIsDragging(true);
    setHoverIndex(startIndex);
    lensFocusX.set(startCenter);
    animate(lensScale, 1.42, { type: "spring", stiffness: 320, damping: 20, mass: 0.4 });
    rawBase.set(1.1);
    animate(rawSX, [1, 0.92, 1.07, 0.97, 1.02, 1], { duration: 0.38 });
    animate(rawSY, [1, 1.07, 0.94, 1.04, 0.98, 1], { duration: 0.38 });
    animate(lensFocusX, targetCenter, {
      type: "spring",
      stiffness: 360,
      damping: 32,
      mass: 0.58,
      onUpdate: (focus) => setHoverIndex(indexForCenter(focus)),
    });
    onChange(id);
    animate(bubbleCX, targetCenter, {
      type: "spring",
      stiffness: 360,
      damping: 32,
      mass: 0.58,
      onComplete: () => {
        animate(lensScale, 1, {
          type: "spring",
          stiffness: 320,
          damping: 20,
          mass: 0.4,
          delay: 0.08,
          onComplete: () => {
            setIsDragging(false);
            setHoverIndex(-1);
          },
        });
        rawBase.set(1);
        animate(rawSX, 1, { type: "spring", stiffness: 260, damping: 22, mass: 0.45 });
        animate(rawSY, 1, { type: "spring", stiffness: 260, damping: 22, mass: 0.45 });
        slideLockRef.current = false;
      },
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!itemWidth || event.button !== 0 || slideLockRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    const startCenter = bubbleCX.get() < 0 ? centerForIndex(Math.max(0, navItems.findIndex((item) => item.id === activeTab))) : bubbleCX.get();
    dragRef.current = { pointerX: event.clientX, startCX: startCenter, lastX: event.clientX, lastTime: performance.now() };
    setHoverIndex(indexForCenter(startCenter));
    lensFocusX.set(startCenter);
    animate(lensScale, 1.42, { type: "spring", stiffness: 320, damping: 20, mass: 0.4 });
    rawBase.set(1.12);
    animate(rawSX, [1, 0.92, 1.08, 0.97, 1.02, 1], { duration: 0.42 });
    animate(rawSY, [1, 1.08, 0.93, 1.04, 0.98, 1], { duration: 0.42 });
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging || !navRef.current) return;
    const nextCenter = clampCenter(dragRef.current.startCX + event.clientX - dragRef.current.pointerX);
    bubbleCX.set(nextCenter);
    const nextIndex = indexForCenter(nextCenter);
    setHoverIndex(nextIndex);
    // Keep the lens tied to the actual pointer position. The strip travels in
    // the opposite direction inside the pill instead of snapping between items.
    lensFocusX.set(nextCenter);
    const now = performance.now();
    const elapsed = Math.max(1, now - dragRef.current.lastTime);
    const velocity = (event.clientX - dragRef.current.lastX) / elapsed;
    dragRef.current.lastX = event.clientX;
    dragRef.current.lastTime = now;
    const stretch = Math.min(0.28, Math.abs(velocity) * 0.045);
    rawSX.set(1 + stretch);
    rawSY.set(1 / (1 + stretch));
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging || !itemWidth) return;
    const releaseCenter = clampCenter(dragRef.current.startCX + event.clientX - dragRef.current.pointerX);
    bubbleCX.set(releaseCenter);
    const targetIndex = indexForCenter(releaseCenter);
    const target = navItems[targetIndex];
    const targetCenter = centerForIndex(targetIndex);
    slideLockRef.current = true;
    setHoverIndex(targetIndex);
    // Move the magnified strip to the landing slot first, then let the lens
    // collapse. This keeps the label/icon from leaving a second ghost behind.
    lensFocusX.set(targetCenter);
    let lensSettled = false;
    let bubbleSettled = false;
    const finishDragSettle = () => {
      if (!lensSettled || !bubbleSettled) return;
      setIsDragging(false);
      setHoverIndex(-1);
      slideLockRef.current = false;
    };
    animate(lensScale, 1, {
      type: "spring",
      stiffness: 320,
      damping: 26,
      mass: 0.4,
      delay: 0.08,
      onComplete: () => {
        lensSettled = true;
        finishDragSettle();
      },
    });
    rawBase.set(1);
    animate(rawSX, 1, { type: "spring", stiffness: 260, damping: 22, mass: 0.45 });
    animate(rawSY, 1, { type: "spring", stiffness: 260, damping: 22, mass: 0.45 });
    animate(bubbleCX, targetCenter, {
      type: "spring",
      stiffness: 380,
      damping: 32,
      mass: 0.6,
      onComplete: () => {
        bubbleSettled = true;
        finishDragSettle();
      },
    });
    onChange(target.id);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:px-6", mobileOnly && "lg:hidden")}>
      <div className="dashboard-preview-dock pointer-events-auto flex w-full max-w-[850px] items-center gap-2 rounded-[26px] border border-white/[0.12] bg-[#111113]/92 p-2 shadow-[0_20px_70px_rgba(0,0,0,0.55),0_0_38px_rgba(168,85,247,0.08)] backdrop-blur-2xl">
        <div className="hidden shrink-0 items-center pl-2 pr-3 sm:flex"><ArcMark compact /></div>
        <div className="hidden h-8 w-px bg-white/[0.09] sm:block" />
        <div ref={navRef} className="relative flex min-w-0 flex-1 items-center" style={{ touchAction: "none" }}>
          <nav className="flex h-full min-w-0 flex-1 items-center justify-between gap-1" aria-label="Bottom dock preview navigation">
            {navItems.map(({ id, label, icon: Icon }, index) => {
              const active = activeTab === id;
              const hiddenUnderLens = isDragging ? hoverIndex === index : active;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  className={cn(
                    "relative flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] px-2 py-3 text-[12px] font-medium transition-colors sm:px-3.5",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  style={{ opacity: hiddenUnderLens ? 0 : 1 }}
                >
                  <Icon className={cn("relative z-10 h-[17px] w-[17px] shrink-0", active ? "text-primary drop-shadow-[0_0_10px_rgba(168,85,247,0.55)]" : "")} />
                  <span className="relative z-10 hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </nav>
          {itemWidth > 0 && (
            <motion.button
              type="button"
              aria-label={`Drag dashboard navigation, currently ${navItems.find((item) => item.id === activeTab)?.label ?? "Dashboard"}`}
              className="absolute top-1/2 touch-none select-none overflow-hidden rounded-[18px] border border-primary/75 bg-white/[0.11] shadow-[0_0_0_1px_rgba(168,85,247,0.3),0_0_22px_rgba(168,85,247,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]"
              style={{ left: bubbleLeft, width: bubbleWidth, height: trackSize.height, translateY: "-50%", scaleX: bubbleScaleX, scaleY: bubbleScaleY, transformOrigin: "center", borderRadius: trackSize.height / 2, background: "hsl(var(--background) / 0.78)", backdropFilter: "blur(10px) saturate(140%)", WebkitBackdropFilter: "blur(10px) saturate(140%)", zIndex: 20, cursor: isDragging ? "grabbing" : "grab" }}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <motion.div
                aria-hidden="true"
                className="relative z-10 flex h-full items-center justify-center gap-2 text-primary"
                animate={{ opacity: isDragging ? 0 : 1 }}
                transition={{ duration: 0.1 }}
              >
                <ActiveIcon className="h-[17px] w-[17px]" />
                <span className="hidden text-[12px] font-medium sm:inline">{navItems.find((item) => item.id === activeTab)?.label}</span>
              </motion.div>
              <motion.div animate={{ opacity: isDragging ? 1 : 0 }} transition={{ duration: 0.12 }} className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-full bg-background/[0.88]">
                <motion.div style={{ position: "absolute", left: lensLeft, top: lensTop, width: trackSize.width, height: trackSize.height, gap: navGap, scale: springLensScale, transformOrigin: "0 0", display: "flex" }}>
                  {navItems.map(({ label, icon: Icon }) => (
                    <div key={label} className="flex shrink-0 items-center justify-center gap-2 px-2 text-[12px] font-medium text-primary" style={{ width: itemWidth, height: trackSize.height }}>
                      <Icon className="h-[17px] w-[17px] shrink-0 drop-shadow-[0_0_10px_rgba(168,85,247,0.7)]" />
                      <span className="hidden sm:inline">{label}</span>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                animate={{ opacity: isDragging ? 1 : 0.72 }}
                transition={{ duration: 0.16 }}
                style={{
                  background: "linear-gradient(90deg, rgba(168,85,247,0.28) 0%, rgba(255,255,255,0.12) 8%, transparent 18%, transparent 82%, rgba(255,255,255,0.12) 92%, rgba(168,85,247,0.28) 100%)",
                  boxShadow: "inset 8px 0 12px -10px rgba(168,85,247,0.95), inset -8px 0 12px -10px rgba(168,85,247,0.95), inset 0 1px 0 rgba(255,255,255,0.34)",
                  mixBlendMode: "screen",
                }}
              />
            </motion.button>
          )}
        </div>
        <button type="button" className="dashboard-preview-control hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.09] text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground sm:ml-3 sm:flex" aria-label="Settings">
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function NotificationTray({ notifications, onClear, onOpen }: { notifications: PreviewNotification[]; onClear: () => void; onOpen: (notification: PreviewNotification) => void }) {
  const unreadCount = notifications.filter((notification) => notification.unread).length;

  return (
    <motion.div
      id="dashboard-preview-notification-tray"
      role="dialog"
      aria-label="Recent notifications"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.55 }}
      className="dashboard-preview-notification-tray absolute right-0 top-[calc(100%+0.75rem)] z-[60] w-[min(88vw,360px)] overflow-hidden rounded-[24px] border p-3 shadow-[0_24px_70px_rgba(0,0,0,0.35),0_0_32px_rgba(168,85,247,0.12)] backdrop-blur-2xl"
    >
      <div className="flex items-start justify-between gap-3 px-2 pb-2">
        <div>
          <p className="text-sm font-semibold">Recent notifications</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Pushes Arc sent you.</p>
        </div>
        {unreadCount > 0 && <span className="dashboard-preview-notification-count rounded-full px-2 py-1 text-[10px] font-medium">{unreadCount} new</span>}
      </div>
      {notifications.length > 0 ? (
        <div className="space-y-1">
          {notifications.map((notification) => (
            <button key={`${notification.title}-${notification.time}`} type="button" onClick={() => onOpen(notification)} className="dashboard-preview-notification-row flex w-full items-start gap-2.5 rounded-xl border px-2 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.06]">
              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", notification.unread ? "dashboard-preview-notification-unread-icon" : "bg-muted text-muted-foreground")}>
                <Bell className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[10px] font-medium">{notification.title}</span>
                  {notification.unread && <span className="dashboard-preview-notification-unread-dot h-1.5 w-1.5 shrink-0 rounded-full" />}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{notification.detail}</span>
              </span>
              <span className="shrink-0 text-[9px] text-muted-foreground">{notification.time}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="dashboard-preview-notification-empty rounded-xl border px-3 py-4 text-center text-[11px] text-muted-foreground">You’re all caught up.</p>
      )}
      <button type="button" onClick={onClear} disabled={notifications.length === 0} className="mt-2 w-full rounded-xl border px-3 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50">
        Clear notifications
      </button>
    </motion.div>
  );
}

function DashboardOverview({ activeTab, onNavigate, onTaskComplete, canRunWork, onBoostRequired, chatItems = recentChats, stats = statCards, onOpenChat, onNewChat, onViewAll, onDeleteChat, onOpenReminders }: { activeTab: DashboardTab; onNavigate: (tab: DashboardTab) => void; onTaskComplete: (title: string) => void; canRunWork: boolean; onBoostRequired: () => void; chatItems?: DashboardChatPreview[]; stats?: DashboardStat[]; onOpenChat?: (id: string) => void; onNewChat?: () => void; onViewAll?: () => void; onDeleteChat?: (id: string, title: string) => void; onOpenReminders?: () => void }) {
  const [query, setQuery] = useState("");
  const [taskStates, setTaskStates] = useState<Record<string, "idle" | "running" | "complete">>({});
  const taskTimersRef = useRef<number[]>([]);
  const visibleChats = useMemo(() => chatItems.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())), [chatItems, query]);

  useEffect(() => () => taskTimersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  const runWorkspaceTask = (task: (typeof workspaceTasks)[number]) => {
    if (!canRunWork) {
      onBoostRequired();
      return;
    }
    if (taskStates[task.id] === "running") return;
    setTaskStates((current) => ({ ...current, [task.id]: "running" }));
    const timer = window.setTimeout(() => {
      setTaskStates((current) => ({ ...current, [task.id]: "complete" }));
      onTaskComplete(task.title);
    }, 1800);
    taskTimersRef.current.push(timer);
  };

  if (activeTab !== "overview") {
    const item = navItems.find((nav) => nav.id === activeTab) ?? navItems[0];
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[520px] flex-col items-center justify-center rounded-[32px] border border-white/[0.08] bg-white/[0.025] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/20 bg-primary/[0.08] shadow-[0_0_32px_rgba(168,85,247,0.14)]"><item.icon className="h-7 w-7 text-primary" /></div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">{item.label}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">This is a working nav state in the dashboard preview. The selected bubble stays locked to whichever layout you choose above.</p>
        <button type="button" onClick={() => onNavigate("overview")} className="mt-6 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium transition-colors hover:bg-white/[0.1]">Back to dashboard</button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 pb-28 lg:space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/[0.09] bg-gradient-to-br from-white/[0.075] via-white/[0.025] to-primary/[0.07] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.16)] sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[1fr_1.05fr] lg:gap-8">
          <div className="flex flex-col justify-between">
            <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />Signed in</div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Good evening, Jake.</h1>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Everything you’ve been making, thinking about, and asking Arc to keep moving.</p>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => onNewChat ? onNewChat() : onNavigate("chats")} className="group flex w-fit items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"><Plus className="h-4 w-4" /> New chat <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></button>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="dashboard-preview-sync-badge rounded-full border px-2.5 py-1">Cloud synced</span><span>Just now</span></div>
            </div>
          </div>
          <div className="dashboard-preview-recent-panel rounded-[24px] border p-4 lg:border-l-white/[0.12]">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Recent chats</p><p className="mt-1 text-[11px] text-muted-foreground">Pick up where you left off.</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => onViewAll ? onViewAll() : onNavigate("chats")} className="inline-flex items-center rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-1.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/[0.14]">View all <ChevronRight className="ml-0.5 h-3 w-3" /></button><div className="relative hidden sm:block"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="dashboard-preview-search h-8 w-28 rounded-full border pl-8 pr-3 text-[11px] outline-none placeholder:text-muted-foreground focus:border-primary/50" /></div></div></div>
            <div className="mt-3 space-y-1">
              {visibleChats.slice(0, 3).map((chat, index) => (
                <div key={chat.id || chat.title} role="button" tabIndex={0} onClick={() => { if (onOpenChat) onOpenChat(chat.id); else onNavigate("chats"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (onOpenChat) onOpenChat(chat.id); else onNavigate("chats"); } }} className="dashboard-preview-chat-tile group flex w-full items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-0.5">
                  <div className={cn("dashboard-preview-chat-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br", chat.tone)}><MessageSquare className="h-3.5 w-3.5 text-white/90" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{chat.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{chat.detail}</p></div>
                  {index === 0 && <span className="hidden rounded-full border border-primary/20 bg-primary/[0.08] px-2 py-1 text-[9px] text-primary sm:inline">Resume</span>}
                  {onDeleteChat && <button type="button" aria-label={`Delete ${chat.title}`} title="Delete chat" onClick={(event) => { event.stopPropagation(); onDeleteChat(chat.id, chat.title); }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-70 transition-colors hover:bg-red-500/10 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              ))}
              {visibleChats.length === 0 && <p className="rounded-2xl border border-dashed border-border/60 px-3 py-5 text-center text-[11px] text-muted-foreground">No recent chats yet. Start a new one and it’ll appear here.</p>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, detail, icon: Icon, tint, glow }) => (
          <button key={label} type="button" onClick={() => { if (label === "Reminders" && onOpenReminders) onOpenReminders(); else onNavigate(label === "Chats" ? "chats" : label === "Apps" ? "apps" : label === "Images" ? "images" : "overview"); }} className="dashboard-preview-tile group relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.055]">
            <div className={cn("pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl opacity-80", glow)} />
            <div className="relative flex items-start justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className={cn("h-4 w-4", tint)} /></div>
            <div className="relative mt-5 flex items-end justify-between"><span className="text-2xl font-semibold tracking-tight">{value}</span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
            <p className="relative mt-1 text-[10px] text-muted-foreground">{detail}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5">
        <section className="dashboard-preview-tile rounded-[30px] border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6 lg:p-5">
          <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Your workspace</p><p className="mt-1 text-xs text-muted-foreground">A quiet snapshot of Arc at work.</p></div><button type="button" className="rounded-full p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground" aria-label="More workspace actions"><MoreHorizontal className="h-4 w-4" /></button></div>
          <div className="mt-4 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.13] via-white/[0.03] to-transparent p-3 sm:p-4 lg:mt-3 lg:p-3"><div className="flex items-center justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 lg:h-8 lg:w-8"><WandSparkles className="h-4 w-4 text-primary lg:h-3.5 lg:w-3.5" /></div><span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{canRunWork ? "Boost" : "Arc Work"}</span></div><p className="mt-5 text-sm font-medium lg:mt-3">3 things Arc can keep moving</p><div className="mt-3 grid gap-2 lg:mt-2 sm:grid-cols-3">{workspaceTasks.map((task) => { const status = taskStates[task.id] ?? "idle"; return <button key={task.id} type="button" onClick={() => runWorkspaceTask(task)} disabled={status === "running"} className="group rounded-xl border border-white/[0.08] bg-white/[0.035] p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-white/[0.08] disabled:cursor-wait lg:p-2"><span className="flex items-center gap-2"><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", status === "complete" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.07] text-muted-foreground")} >{status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : status === "complete" ? <Check className="h-3 w-3" /> : <span className={cn("h-1.5 w-1.5 rounded-full", task.tone)} />}</span><span className="min-w-0"><span className="block truncate text-[10px] font-medium">{task.title}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{status === "running" ? "Running in cloud!" : status === "complete" ? "Complete!" : "Run in Arc Work"}</span></span></span></button>; })}</div></div>
        </section>
      </div>
    </motion.div>
  );
}

export function DashboardPreviewPage({ live = false }: { live?: boolean }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile: authProfile } = useAuth();
  const { profile: fetchedProfile } = useProfile();
  const { isLoaded } = useChatSync();
  const { chatSessions, createNewSession, loadSession, deleteSession } = useArcStore();
  const { hasBoost, isAdmin, openCheckout } = useSubscription();
  const { dailyImagesUsed } = useImageQuota();
  const { blocks: contextBlocks } = useContextBlocks();
  const openIDECanvas = useIDEStore((state) => state.openIDECanvas);
  const queryTab = searchParams.get("tab");
  const initialTab: DashboardTab = queryTab === "memories" ? "memory" : (navItems.some((item) => item.id === queryTab) ? queryTab as DashboardTab : "overview");
  const [layout, setLayout] = useState<LayoutMode>("dock");
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isBoostGateOpen, setIsBoostGateOpen] = useState(false);
  const [notifications, setNotifications] = useState<PreviewNotification[]>(previewNotifications);
  const [previewChatItems, setPreviewChatItems] = useState<DashboardChatPreview[]>(recentChats);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [liveCounts, setLiveCounts] = useState({ apps: 0, images: 0, reminders: 0 });
  const unreadNotificationCount = notifications.filter((notification) => notification.unread).length;
  const themeMode = useAccentStore((state) => state.themeMode);
  const cycleThemeMode = useAccentStore((state) => state.cycleThemeMode);
  const cleanPreview = live || (typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("clean") === "1");
  const liveDisplayName = fetchedProfile?.display_name || authProfile?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";
  const accountName = live ? liveDisplayName : "Jake Freudinger";
  const avatarUrl = live ? fetchedProfile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null : null;
  const accountInitials = accountName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "JF";
  const canRunWork = live ? hasBoost || isAdmin : typeof window !== "undefined" && new URLSearchParams(window.location.search).get("boost") !== "0";
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "system" ? Monitor : Moon;
  const themeLabel = themeMode === "light" ? "Light" : themeMode === "system" ? "System" : "Dark";
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    if (!live || !user) return;
    let cancelled = false;
    (async () => {
      const [appsResult, imagesResult, remindersResult] = await Promise.all([
        supabase.from("ide_projects").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.rpc("count_user_images", { target_user_id: user.id } as unknown as never),
        supabase.from("scheduled_tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
      ]);
      if (cancelled) return;
      setLiveCounts({
        apps: appsResult.count ?? 0,
        images: typeof imagesResult.data === "number" ? imagesResult.data : dailyImagesUsed,
        reminders: remindersResult.count ?? 0,
      });
    })().catch(() => {
      if (!cancelled) setLiveCounts((current) => ({ ...current, images: dailyImagesUsed }));
    });
    return () => { cancelled = true; };
  }, [dailyImagesUsed, live, user]);

  const formatTimeAgo = (value: unknown) => {
    const date = value instanceof Date ? value : new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) return "recently";
    const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const liveChatItems = useMemo<DashboardChatPreview[]>(() => (chatSessions || []).slice(0, 6).map((session, index) => ({
    id: session.id,
    title: session.title || "Untitled chat",
    detail: `Arc Chat · ${formatTimeAgo(session.lastMessageAt || session.createdAt)}`,
    tone: ["from-violet-500/35 via-indigo-500/15 to-transparent", "from-emerald-500/30 via-cyan-500/12 to-transparent", "from-amber-500/28 via-orange-500/12 to-transparent"][index % 3],
  })), [chatSessions]);

  const liveStats: DashboardStat[] = useMemo(() => [
    { label: "Chats", value: chatSessions?.length ?? 0, detail: "Saved to your account", icon: MessageSquare, tint: "text-blue-300", glow: "from-blue-500/18" },
    { label: "Apps", value: liveCounts.apps, detail: "Published projects", icon: FolderKanban, tint: "text-violet-300", glow: "from-violet-500/20" },
    { label: "Images", value: liveCounts.images, detail: "Generated with Arc", icon: ImageIcon, tint: "text-fuchsia-300", glow: "from-fuchsia-500/18" },
    { label: "Reminders", value: liveCounts.reminders, detail: "Active scheduled tasks", icon: CalendarClock, tint: "text-amber-200", glow: "from-amber-500/16" },
  ], [chatSessions, liveCounts]);

  const handleTaskComplete = (title: string) => {
    setNotifications((current) => [{ title: "Cloud run complete", detail: `${title} is ready. Push + email sent.`, time: "Just now", unread: true }, ...current].slice(0, 4));
  };
  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    if (tab === "overview") nextParams.delete("tab");
    else nextParams.set("tab", tab === "memory" ? "memories" : tab);
    setSearchParams(nextParams);
  };
  const handleNewChat = () => {
    if (live) {
      const id = createNewSession();
      navigate(`/chat/${id}`);
      return;
    }
    handleTabChange("chats");
  };
  const handleOpenChat = (id: string) => {
    if (live) {
      loadSession(id);
      navigate(`/chat/${id}`);
      return;
    }
    handleTabChange("chats");
  };
  const handleOpenNotification = (notification: PreviewNotification) => {
    setNotifications((items) => items.map((item) => item.title === notification.title && item.time === notification.time ? { ...item, unread: false } : item));
    setIsNotificationsOpen(false);
    const availableChats = live ? liveChatItems : previewChatItems;
    const notificationText = `${notification.title} ${notification.detail}`.toLowerCase();
    const chat = availableChats.find((item) => item.id === notification.chatId)
      || availableChats.find((item) => notificationText.includes(item.title.toLowerCase()));
    if (chat) handleOpenChat(chat.id);
    else handleTabChange("chats");
  };
  const requestDeleteChat = (id: string, title: string) => setPendingDeleteChat({ id, title });
  const confirmDeleteChat = async () => {
    if (!pendingDeleteChat) return;
    setIsDeletingChat(true);
    try {
      if (live) {
        await (deleteSession(pendingDeleteChat.id) as unknown as Promise<void>);
      } else {
        setPreviewChatItems((items) => items.filter((item) => item.id !== pendingDeleteChat.id));
      }
      setPendingDeleteChat(null);
    } finally {
      setIsDeletingChat(false);
    }
  };
  const handleAppBuilder = () => {
    if (!canRunWork) {
      setIsBoostGateOpen(true);
      return;
    }
    openIDECanvas("New App", undefined, false);
    navigate("/build");
  };
  const handleSignOut = async () => {
    setIsAccountOpen(false);
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };
  const returnToChat = () => { if (live) navigate("/"); else window.location.assign("/?preview=chat"); };

  return (
    <div className="dashboard-preview-shell min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-36 top-[-180px] h-[480px] w-[480px] rounded-full bg-primary/[0.09] blur-[120px]" />
        <div className="absolute -right-40 bottom-[-220px] h-[560px] w-[560px] rounded-full bg-violet-500/[0.07] blur-[140px]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.035] to-transparent" />
      </div>

      <header className="relative z-50 mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-5 pt-5 sm:px-7 md:flex-row md:items-center md:justify-between md:px-10 md:pt-8">
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-1.5"><button type="button" onClick={returnToChat} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" aria-label="Back to Arc chat" title="Back to Arc chat"><ArrowLeft className="h-4 w-4" /></button><ArcMark onClick={returnToChat} /></div>{!cleanPreview && <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">Dashboard preview</span>}</div>
        {!live && !cleanPreview && <LayoutSwitcher mode={layout} onChange={setLayout} />}
        <div className="relative flex items-center gap-2 self-end md:self-auto">
          <button type="button" onClick={handleAppBuilder} className="dashboard-preview-control hidden h-10 items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.08] px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/[0.14] sm:flex" aria-label={canRunWork ? "Open App Builder" : "Unlock App Builder with Boost"} title={canRunWork ? "Open App Builder" : "Unlock App Builder with Boost"}>
            {canRunWork ? <Smartphone className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
            <span>App Builder</span>
            {!canRunWork && <span className="rounded-full border border-primary/20 bg-primary/[0.1] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]">Boost</span>}
          </button>
          <button type="button" onClick={handleAppBuilder} className="dashboard-preview-control flex h-10 w-10 items-center justify-center rounded-full border border-primary/25 bg-primary/[0.08] text-primary transition-colors hover:bg-primary/[0.14] sm:hidden" aria-label={canRunWork ? "Open App Builder" : "Unlock App Builder with Boost"} title={canRunWork ? "Open App Builder" : "Unlock App Builder with Boost"}>
            {canRunWork ? <Smartphone className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
          </button>
          <button type="button" onClick={cycleThemeMode} className="dashboard-preview-control flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground" aria-label={`Theme: ${themeLabel}`} title={`Theme: ${themeLabel}`}><motion.span key={themeMode} initial={{ rotate: -90, opacity: 0, scale: 0.7 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", damping: 14, stiffness: 320 }} className="inline-flex"><ThemeIcon className="h-4 w-4" /></motion.span></button>
          <button type="button" onClick={() => { setIsNotificationsOpen((open) => !open); setIsAccountOpen(false); }} className="dashboard-preview-control relative flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground" aria-label="Recent push notifications" aria-expanded={isNotificationsOpen} aria-controls="dashboard-preview-notification-tray"><Bell className="h-4 w-4" />{unreadNotificationCount > 0 && <span className="dashboard-preview-notification-unread-dot absolute right-1 top-1 h-1.5 w-1.5 rounded-full" />}</button>
          <div className="relative" data-account-menu>
            <button type="button" onClick={() => { setIsAccountOpen((open) => !open); setIsNotificationsOpen(false); }} className="dashboard-preview-control flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] py-1.5 pl-1.5 pr-3 text-xs transition-colors hover:bg-white/[0.08]" aria-label="Account menu" aria-expanded={isAccountOpen} aria-haspopup="menu"><div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-300 to-fuchsia-500 text-[10px] font-bold text-black">{avatarUrl && !avatarFailed ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setAvatarFailed(true)} /> : accountInitials}</div><span className="hidden sm:inline">{accountName}</span><ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" /></button>
            <AnimatePresence>
              {isAccountOpen && (
                <motion.div initial={{ opacity: 0, y: -5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} className="dashboard-preview-account-menu absolute right-0 top-[calc(100%+0.75rem)] z-[65] w-52 overflow-hidden rounded-[20px] border p-2 shadow-[0_24px_70px_rgba(0,0,0,0.35)]" role="menu">
                  <div className="border-b px-3 pb-2 pt-1"><p className="truncate text-xs font-semibold">{accountName}</p>{live && user?.email && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{user.email}</p>}</div>
                  <button type="button" role="menuitem" onClick={() => { setIsAccountOpen(false); navigate("/dashboard/settings"); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.08]"><Settings2 className="h-3.5 w-3.5" /> Account settings</button>
                  <button type="button" role="menuitem" onClick={() => { setIsAccountOpen(false); navigate("/dashboard/settings?section=appearance"); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.08]"><Sun className="h-3.5 w-3.5" /> Appearance</button>
                  {live && <button type="button" role="menuitem" onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs text-red-300 transition-colors hover:bg-red-500/10"><ArrowLeft className="h-3.5 w-3.5 rotate-180" /> Sign out</button>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>{isNotificationsOpen && <NotificationTray notifications={notifications} onClear={() => setNotifications([])} onOpen={handleOpenNotification} />}</AnimatePresence>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] gap-5 px-4 pb-8 sm:px-7 lg:px-10">
        {layout === "sidebar" && <PreviewSidebar activeTab={activeTab} onChange={handleTabChange} onHome={returnToChat} />}
        <main className="min-w-0 flex-1"><div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Overview</p>{!cleanPreview && <p className="mt-1 text-xs text-muted-foreground/70">A signed-in look at your Arc workspace</p>}</div><div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"><CircleUserRound className="h-3.5 w-3.5" /> Personal space</div></div>{activeTab !== "overview" ? <DashboardPageInner embedded key={activeTab} activeTabOverride={activeTab === "memory" ? "memories" : activeTab} /> : <DashboardOverview activeTab={activeTab} onNavigate={handleTabChange} onTaskComplete={handleTaskComplete} canRunWork={canRunWork} onBoostRequired={() => setIsBoostGateOpen(true)} chatItems={live ? (isLoaded ? liveChatItems : []) : previewChatItems} stats={live ? liveStats : statCards} onOpenChat={handleOpenChat} onNewChat={handleNewChat} onViewAll={() => handleTabChange("chats")} onDeleteChat={requestDeleteChat} onOpenReminders={() => navigate("/tasks")} />}</main>
      </div>

      <AnimatePresence mode="wait">
        {layout === "dock" && <motion.div key="bottom-dock" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}><BottomShelf activeTab={activeTab} onChange={handleTabChange} /></motion.div>}
        {layout === "sidebar" && <motion.div key="mobile-dock-fallback" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}><BottomShelf activeTab={activeTab} onChange={handleTabChange} mobileOnly /></motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {pendingDeleteChat && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!isDeletingChat) setPendingDeleteChat(null); }}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby="dashboard-preview-delete-title" className="w-full max-w-sm rounded-[28px] border border-border bg-background p-6 text-foreground shadow-[0_24px_90px_rgba(0,0,0,0.35)]" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} onClick={(event) => event.stopPropagation()}>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-400"><Trash2 className="h-5 w-5" /></div>
              <h2 id="dashboard-preview-delete-title" className="mt-5 text-xl font-semibold tracking-tight">Delete this chat?</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">“{pendingDeleteChat.title}”</span> will be removed from your recent chats and account.</p>
              <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={isDeletingChat} onClick={() => setPendingDeleteChat(null)} className="rounded-full border border-border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50">Keep chat</button><button type="button" disabled={isDeletingChat} onClick={confirmDeleteChat} className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-wait disabled:opacity-60">{isDeletingChat ? "Deleting…" : "Delete chat"}</button></div>
            </motion.div>
          </motion.div>
        )}
        {isBoostGateOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBoostGateOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby="dashboard-preview-boost-title" className="w-full max-w-sm rounded-[28px] border border-primary/25 bg-card p-6 text-card-foreground shadow-[0_24px_90px_rgba(0,0,0,0.3)]" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} onClick={(event) => event.stopPropagation()}>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Sparkles className="h-5 w-5" /></div>
              <h2 id="dashboard-preview-boost-title" className="mt-5 text-xl font-semibold tracking-tight">Keep it moving with Boost</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Arc Work can run these tasks in the cloud, save the completed chat to your account, and notify you by push and email when it’s done.</p>
              <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsBoostGateOpen(false)} className="rounded-full border border-border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted">Maybe later</button><button type="button" onClick={() => { setIsBoostGateOpen(false); if (live) openCheckout(); }} className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5">See Boost</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
