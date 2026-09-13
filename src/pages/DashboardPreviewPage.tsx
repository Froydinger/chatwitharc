import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Brain,
  Check,
  CalendarClock,
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
  Sun,
  Moon,
  Monitor,
  Users,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemedLogo } from "@/components/ThemedLogo";
import { useAccentStore } from "@/store/useAccentStore";

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

const statCards = [
  { label: "Chats", value: "24", detail: "+6 this month", icon: MessageSquare, tint: "text-blue-300", glow: "from-blue-500/18" },
  { label: "Apps", value: "08", detail: "2 published", icon: FolderKanban, tint: "text-violet-300", glow: "from-violet-500/20" },
  { label: "Images", value: "136", detail: "+18 this week", icon: ImageIcon, tint: "text-fuchsia-300", glow: "from-fuchsia-500/18" },
  { label: "Reminders", value: "03", detail: "Next in 2 hours", icon: CalendarClock, tint: "text-amber-200", glow: "from-amber-500/16" },
];

const recentChats = [
  { title: "Restore Mac dashboard", detail: "Arc Work · 8 minutes ago", tone: "from-violet-500/35 via-indigo-500/15 to-transparent" },
  { title: "The good news digest", detail: "Arc Chat · Yesterday", tone: "from-emerald-500/30 via-cyan-500/12 to-transparent" },
  { title: "Landing page directions", detail: "Arc Work · Tuesday", tone: "from-amber-500/28 via-orange-500/12 to-transparent" },
];

const previewNotifications = [
  { title: "Cloud run complete", detail: "Restore Mac dashboard is ready.", time: "8 min ago", unread: true },
  { title: "Reminder due soon", detail: "Review your latest image set.", time: "1 hr ago", unread: false },
  { title: "Arc saved your chat", detail: "The good news digest is synced.", time: "Yesterday", unread: false },
];
type PreviewNotification = (typeof previewNotifications)[number];

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
    if (!itemWidth || isDragging) return;
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
      damping: 24,
      mass: 0.58,
      onUpdate: (focus) => setHoverIndex(indexForCenter(focus)),
    });
    animate(bubbleCX, targetCenter, {
      type: "spring",
      stiffness: 360,
      damping: 24,
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
        onChange(id);
      },
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!itemWidth || event.button !== 0) return;
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
    setHoverIndex(targetIndex);
    // Move the magnified strip to the landing slot first, then let the lens
    // collapse. This keeps the label/icon from leaving a second ghost behind.
    lensFocusX.set(targetCenter);
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
    animate(bubbleCX, targetCenter, {
      type: "spring",
      stiffness: 380,
      damping: 26,
      mass: 0.6,
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

function DashboardOverview({ activeTab, onNavigate, onTaskComplete, canRunWork, onBoostRequired, isNotificationsOpen, notifications }: { activeTab: DashboardTab; onNavigate: (tab: DashboardTab) => void; onTaskComplete: (title: string) => void; canRunWork: boolean; onBoostRequired: () => void; isNotificationsOpen: boolean; notifications: PreviewNotification[] }) {
  const [query, setQuery] = useState("");
  const [taskStates, setTaskStates] = useState<Record<string, "idle" | "running" | "complete">>({});
  const taskTimersRef = useRef<number[]>([]);
  const visibleChats = useMemo(() => recentChats.filter((chat) => chat.title.toLowerCase().includes(query.toLowerCase())), [query]);

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
              <button type="button" onClick={() => onNavigate("chats")} className="group flex w-fit items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"><Plus className="h-4 w-4" /> New chat <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></button>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="dashboard-preview-sync-badge rounded-full border px-2.5 py-1">Cloud synced</span><span>Just now</span></div>
            </div>
          </div>
          <div className="dashboard-preview-recent-panel rounded-[24px] border p-4 lg:border-l-white/[0.12]">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Recent chats</p><p className="mt-1 text-[11px] text-muted-foreground">Pick up where you left off.</p></div><div className="relative hidden sm:block"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="dashboard-preview-search h-8 w-28 rounded-full border pl-8 pr-3 text-[11px] outline-none placeholder:text-muted-foreground focus:border-primary/50" /></div></div>
            <div className="mt-3 space-y-1">
              {visibleChats.slice(0, 3).map((chat, index) => (
                <button key={chat.title} type="button" onClick={() => onNavigate("chats")} className="dashboard-preview-chat-tile group flex w-full items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-0.5">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br", chat.tone)}><MessageSquare className="h-3.5 w-3.5 text-white/75" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{chat.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{chat.detail}</p></div>
                  {index === 0 && <span className="hidden rounded-full border border-primary/20 bg-primary/[0.08] px-2 py-1 text-[9px] text-primary sm:inline">Resume</span>}
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {isNotificationsOpen && (
                <motion.div initial={{ opacity: 0, height: 0, y: -4 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -4 }} transition={{ duration: 0.2 }} className="mt-3 overflow-hidden border-t border-border/40 pt-3">
                  <div className="flex items-center justify-between px-2"><div><p className="text-xs font-semibold">Recent notifications</p><p className="mt-0.5 text-[10px] text-muted-foreground">Pushes Arc sent you.</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">{notifications.filter((notification) => notification.unread).length} new</span></div>
                  <div className="mt-2 space-y-1">{notifications.map((notification) => <button key={`${notification.title}-${notification.time}`} type="button" className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"><span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", notification.unread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}><Bell className="h-3 w-3" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-[10px] font-medium">{notification.title}</span>{notification.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{notification.detail}</span></span><span className="shrink-0 text-[9px] text-muted-foreground">{notification.time}</span></button>)}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ label, value, detail, icon: Icon, tint, glow }) => (
          <button key={label} type="button" onClick={() => onNavigate(label === "Chats" ? "chats" : label === "Apps" ? "apps" : label === "Images" ? "images" : "overview")} className="dashboard-preview-tile group relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-white/[0.055]">
            <div className={cn("pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl opacity-80", glow)} />
            <div className="relative flex items-start justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className={cn("h-4 w-4", tint)} /></div>
            <div className="relative mt-5 flex items-end justify-between"><span className="text-2xl font-semibold tracking-tight">{value}</span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
            <p className="relative mt-1 text-[10px] text-muted-foreground">{detail}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5">
        <section className="dashboard-preview-tile rounded-[30px] border border-white/[0.08] bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Your workspace</p><p className="mt-1 text-xs text-muted-foreground">A quiet snapshot of Arc at work.</p></div><button type="button" className="rounded-full p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground" aria-label="More workspace actions"><MoreHorizontal className="h-4 w-4" /></button></div>
          <div className="mt-5 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.13] via-white/[0.03] to-transparent p-4"><div className="flex items-center justify-between"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15"><WandSparkles className="h-4 w-4 text-primary" /></div><span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{canRunWork ? "Boost" : "Arc Work"}</span></div><p className="mt-7 text-sm font-medium">3 things Arc can keep moving</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{workspaceTasks.map((task) => { const status = taskStates[task.id] ?? "idle"; return <button key={task.id} type="button" onClick={() => runWorkspaceTask(task)} disabled={status === "running"} className="group rounded-xl border border-white/[0.08] bg-white/[0.035] p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-white/[0.08] disabled:cursor-wait"><span className="flex items-center gap-2"><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", status === "complete" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.07] text-muted-foreground")} >{status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : status === "complete" ? <Check className="h-3 w-3" /> : <span className={cn("h-1.5 w-1.5 rounded-full", task.tone)} />}</span><span className="min-w-0"><span className="block truncate text-[10px] font-medium">{task.title}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{status === "running" ? "Running in cloud!" : status === "complete" ? "Complete!" : "Run in Arc Work"}</span></span></span></button>; })}</div></div>
        </section>
      </div>
    </motion.div>
  );
}

export function DashboardPreviewPage() {
  const [layout, setLayout] = useState<LayoutMode>("dock");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isBoostGateOpen, setIsBoostGateOpen] = useState(false);
  const [notifications, setNotifications] = useState<PreviewNotification[]>(previewNotifications);
  const themeMode = useAccentStore((state) => state.themeMode);
  const cycleThemeMode = useAccentStore((state) => state.cycleThemeMode);
  const cleanPreview = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("clean") === "1";
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "system" ? Monitor : Moon;
  const themeLabel = themeMode === "light" ? "Light" : themeMode === "system" ? "System" : "Dark";
  const previewHasBoost = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("boost") !== "0";
  const handleTaskComplete = (title: string) => {
    setNotifications((current) => [{ title: "Cloud run complete", detail: `${title} is ready. Push + email sent.`, time: "Just now", unread: true }, ...current].slice(0, 4));
  };
  const returnToChat = () => { window.location.assign("/?preview=chat"); };

  return (
    <div className="dashboard-preview-shell min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-36 top-[-180px] h-[480px] w-[480px] rounded-full bg-primary/[0.09] blur-[120px]" />
        <div className="absolute -right-40 bottom-[-220px] h-[560px] w-[560px] rounded-full bg-violet-500/[0.07] blur-[140px]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.035] to-transparent" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-5 pt-5 sm:px-7 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:pt-8">
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-1.5"><button type="button" onClick={returnToChat} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" aria-label="Back to Arc chat" title="Back to Arc chat"><ArrowLeft className="h-4 w-4" /></button><ArcMark onClick={returnToChat} /></div>{!cleanPreview && <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">Dashboard preview</span>}</div>
        {!cleanPreview && <LayoutSwitcher mode={layout} onChange={setLayout} />}
        <div className="flex items-center gap-2 self-end lg:self-auto"><button type="button" onClick={cycleThemeMode} className="dashboard-preview-control flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground" aria-label={`Theme: ${themeLabel}`} title={`Theme: ${themeLabel}`}><motion.span key={themeMode} initial={{ rotate: -90, opacity: 0, scale: 0.7 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", damping: 14, stiffness: 320 }} className="inline-flex"><ThemeIcon className="h-4 w-4" /></motion.span></button><div className="relative"><button type="button" onClick={() => setIsNotificationsOpen((open) => !open)} className="dashboard-preview-control relative flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground" aria-label="Recent push notifications" aria-expanded={isNotificationsOpen}><Bell className="h-4 w-4" /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" /></button></div><button type="button" className="dashboard-preview-control flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] py-1.5 pl-1.5 pr-3 text-xs transition-colors hover:bg-white/[0.08]"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-300 to-fuchsia-500 text-[10px] font-bold text-black">JF</div><span className="hidden sm:inline">Jake Freudinger</span><ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" /></button></div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] gap-5 px-4 pb-8 sm:px-7 lg:px-10">
        {layout === "sidebar" && <PreviewSidebar activeTab={activeTab} onChange={setActiveTab} onHome={returnToChat} />}
        <main className="min-w-0 flex-1"><div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Overview</p>{!cleanPreview && <p className="mt-1 text-xs text-muted-foreground/70">A signed-in look at your Arc workspace</p>}</div><div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex"><CircleUserRound className="h-3.5 w-3.5" /> Personal space</div></div><DashboardOverview activeTab={activeTab} onNavigate={setActiveTab} onTaskComplete={handleTaskComplete} canRunWork={previewHasBoost} onBoostRequired={() => setIsBoostGateOpen(true)} isNotificationsOpen={isNotificationsOpen} notifications={notifications} /></main>
      </div>

      <AnimatePresence mode="wait">
        {layout === "dock" && <motion.div key="bottom-dock" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}><BottomShelf activeTab={activeTab} onChange={setActiveTab} /></motion.div>}
        {layout === "sidebar" && <motion.div key="mobile-dock-fallback" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }}><BottomShelf activeTab={activeTab} onChange={setActiveTab} mobileOnly /></motion.div>}
      </AnimatePresence>
      <AnimatePresence>
        {isBoostGateOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBoostGateOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby="dashboard-preview-boost-title" className="w-full max-w-sm rounded-[28px] border border-primary/25 bg-card p-6 text-card-foreground shadow-[0_24px_90px_rgba(0,0,0,0.3)]" initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} onClick={(event) => event.stopPropagation()}>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Sparkles className="h-5 w-5" /></div>
              <h2 id="dashboard-preview-boost-title" className="mt-5 text-xl font-semibold tracking-tight">Keep it moving with Boost</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Arc Work can run these tasks in the cloud, save the completed chat to your account, and notify you by push and email when it’s done.</p>
              <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsBoostGateOpen(false)} className="rounded-full border border-border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted">Maybe later</button><button type="button" onClick={() => setIsBoostGateOpen(false)} className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5">See Boost</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
