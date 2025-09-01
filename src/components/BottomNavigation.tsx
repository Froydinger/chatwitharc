import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { ChatInput } from "@/components/ChatInput";

const navigationItems = [
  { id: "history", icon: History, label: "History" },
  { id: "chat", icon: MessageCircle, label: "Chat" },
  { id: "settings", icon: Settings, label: "Settings" },
] as const;

export function BottomNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();
  const [isDragging, setIsDragging] = useState(false);
  const bubbleControls = useAnimation();

  const railRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measureRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);

  const BUBBLE = 67;
  const TAB_RAIL_HEIGHT = 64;
  const PAD_TOP_COLLAPSED = 12;
  const PAD_TOP_EXPANDED = 16;
  const PAD_BOTTOM = 12;
  const CONTAINER_WIDTH = 320;
  const GAP_ABOVE_RAIL = 8;

  // --- rotating placeholders (slower, full fade out then fade in)
  const placeholders = [
    "Ask me anything…",
    "What's on your mind?",
    "Type a thought or idea…",
    "Need advice? Start typing…",
    "Tell me your story…",
  ];
  const phIndexRef = useRef(0);

  useEffect(() => {
    const getField = () =>
      scopeRef.current?.querySelector("input,textarea") as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;

    const setPlaceholder = (text: string) => {
      const f = getField();
      if (f) f.placeholder = text;
    };

    setPlaceholder(placeholders[phIndexRef.current]);

    const id = setInterval(() => {
      const f = getField();
      if (!f) return;

      // fade out
      (f as HTMLElement).style.setProperty("--ph-opacity", "0");

      // wait for fade-out, then swap + fade in
      setTimeout(() => {
        phIndexRef.current = (phIndexRef.current + 1) % placeholders.length;
        setPlaceholder(placeholders[phIndexRef.current]);
        (f as HTMLElement).style.setProperty("--ph-opacity", "1");
      }, 600); // slower fade duration
    }, 6000); // slower overall loop

    return () => clearInterval(id);
  }, []);

  const [inputHeight, setInputHeight] = useState(0);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () => setInputHeight(Math.ceil(el.scrollHeight || 0));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const expanded = currentTab === "chat";
  const topPad = expanded ? PAD_TOP_EXPANDED : PAD_TOP_COLLAPSED;

  useEffect(() => {
    const root = scopeRef.current;
    if (!root) return;

    const removeClips = () => {
      const selectors = [
        '[aria-label*="attach" i]',
        '[title*="attach" i]',
        '[data-attach]',
        '[data-icon="paperclip"]',
        'svg[class*="paperclip" i]',
        '.attach',
        '.attachment',
        '.leading',
        '.leading-icon',
        '.input-prefix',
        '[data-slot="prefix"]',
        '.start',
        '.left',
        '.adornment',
      ].join(",");

      root.querySelectorAll(selectors).forEach((n) => n.remove());

      root.querySelectorAll('input,textarea,[contenteditable="true"]').forEach((field) => {
        const prev = field.previousElementSibling as HTMLElement | null;
        if (prev) prev.remove();
        const parent = field.parentElement as HTMLElement | null;
        if (parent && getComputedStyle(parent).display.includes("grid")) {
          parent.style.gridTemplateColumns = "minmax(0,1fr) auto";
        }
      });
    };

    removeClips();

    const mo = new MutationObserver(() => removeClips());
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const getBubblePosition = () => {
    const idx = navigationItems.findIndex((i) => i.id === currentTab);
    const tabEl = tabRefs.current[idx];
    if (!tabEl) {
      const CELL = CONTAINER_WIDTH / navigationItems.length;
      return { x: idx * CELL + (CELL - BUBBLE) / 2, y: 0 };
    }
    const tabCenterX = tabEl.offsetLeft + tabEl.offsetWidth / 2;
    return { x: tabCenterX - BUBBLE / 2, y: 0 };
  };

  useEffect(() => {
    if (isDragging) return;
    const p = getBubblePosition();
    bubbleControls.start({
      x: p.x,
      y: p.y,
      transition: { type: "spring", damping: 14, stiffness: 260, mass: 0.7 },
    });
  }, [currentTab, isDragging, bubbleControls]);

  useEffect(() => {
    const setNow = () => {
      const p = getBubblePosition();
      bubbleControls.set({ x: p.x, y: p.y });
    };
    setNow();
    const t = setTimeout(setNow, 60);
    const onResize = () => setNow();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    let best = 0;
    let dist = Infinity;
    tabRefs.current.forEach((el, i) => {
      if (!el) return;
      const center = el.getBoundingClientRect().left + el.offsetWidth / 2;
      const d = Math.abs(info.point.x - center);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setCurrentTab(navigationItems[best].id);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative"
      >
        <div
          className="relative flex flex-col"
          style={{
            width: CONTAINER_WIDTH,
            minWidth: CONTAINER_WIDTH,
            background:
              "linear-gradient(135deg, hsla(240, 15%, 12%, 0.3) 0%, hsla(240, 20%, 15%, 0.4) 100%)",
            backdropFilter: "blur(20px)",
            borderRadius: "3rem",
            border: "1px solid hsla(240, 25%, 25%, 0.3)",
            boxShadow: `
              0 0 40px hsla(200, 100%, 70%, 0.2),
              0 8px 32px hsla(200, 100%, 60%, 0.15),
              inset 0 1px 0 hsla(200, 100%, 80%, 0.3),
              inset 0 -1px 0 hsla(200, 100%, 30%, 0.2)
            `,
            paddingTop: topPad,
            paddingBottom: PAD_BOTTOM,
            ["--neon-blue" as any]: "hsl(200, 100%, 60%)",
            willChange: "transform",
          }}
        >
          <style>{`
            @keyframes neonAuraOpacity {
              0%, 100% { opacity: 0.20; }
              50%        { opacity: 0.10; }
            }

            .chat-input-scope input,
            .chat-input-scope textarea,
            .chat-input-scope [contenteditable="true"] {
              caret-color: var(--neon-blue) !important;
              accent-color: var(--neon-blue) !important;
            }

            .chat-input-scope input:focus,
            .chat-input-scope input:focus-visible,
            .chat-input-scope textarea:focus,
            .chat-input-scope textarea:focus-visible,
            .chat-input-scope [contenteditable="true"]:focus,
            .chat-input-scope [contenteditable="true"]:focus-visible {
              outline-color: var(--neon-blue) !important;
              border-color: var(--neon-blue) !important;
              box-shadow:
                0 0 0 3px color-mix(in oklab, var(--neon-blue) 40%, transparent) !important;
            }

            .chat-input-scope :where(input, textarea, [contenteditable="true"]) {
              --ph-opacity: 1;
            }

            .chat-input-scope input::placeholder,
            .chat-input-scope textarea::placeholder {
              opacity: var(--ph-opacity, 1) !important;
              transition: opacity 600ms ease !important; /* slower fade */
            }
          `}</style>

          <motion.div
            initial={false}
            animate={{
              maxHeight: expanded ? inputHeight + GAP_ABOVE_RAIL : 0,
              opacity: expanded ? 1 : 0,
              clipPath: expanded
                ? "inset(0% 0% 0% 0% round 24px)"
                : "inset(0% 0% 100% 0% round 24px)",
              y: expanded ? 0 : 4,
            }}
            transition={{
              maxHeight: { type: "spring", stiffness: 220, damping: 26 },
              opacity: { duration: 0.18, ease: "easeOut" },
              y: { type: "spring", stiffness: 260, damping: 22 },
              clipPath: { duration: 0.22, ease: "easeOut" },
            }}
            style={{ overflow: "hidden", pointerEvents: expanded ? "auto" : "none" }}
          >
            <div
              ref={measureRef}
              className="w-full"
              style={{ paddingBottom: GAP_ABOVE_RAIL }}
            >
              <div ref={scopeRef} className="chat-input-scope">
                <ChatInput />
              </div>
            </div>
          </motion.div>

          {/* rest of your component unchanged */}
        </div>
      </motion.div>
    </div>
  );
}