import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { ChatInput } from "@/components/ChatInput";

const navigationItems = [
  { id: "chat", icon: MessageCircle, label: "Chat" },
  { id: "history", icon: History, label: "History" },
  { id: "settings", icon: Settings, label: "Settings" },
] as const;

export function BottomNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();
  const [isDragging, setIsDragging] = useState(false);
  const bubbleControls = useAnimation();

  const railRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const measureRef = useRef<HTMLDivElement>(null);

  const BUBBLE = 72;
  const TAB_RAIL_HEIGHT = 64;
  const PAD_TOP_COLLAPSED = 12;
  const PAD_TOP_EXPANDED = 16;
  const PAD_BOTTOM = 12;
  const CONTAINER_WIDTH = 320;
  const GAP_ABOVE_RAIL = 8;

  // measure natural input height
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

  // Bubble position helper
  const getBubblePosition = () => {
    const idx = navigationItems.findIndex(i => i.id === currentTab);
    const tabEl = tabRefs.current[idx];
    if (!tabEl) {
      const CELL = CONTAINER_WIDTH / navigationItems.length;
      return { x: idx * CELL + (CELL - BUBBLE) / 2, y: -4 };
    }
    const tabCenterX = tabEl.offsetLeft + tabEl.offsetWidth / 2;
    return { x: tabCenterX - BUBBLE / 2, y: -4 };
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
        {/* Glass container: flex column, rail is a fixed-height footer */}
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
            ["--bubble-blue" as any]: "hsl(200, 100%, 60%)",
            willChange: "transform",
          }}
        >
          <style>{`
            /* Focus visuals */
            .chat-input-scope input:focus,
            .chat-input-scope input:focus-visible,
            .chat-input-scope textarea:focus,
            .chat-input-scope textarea:focus-visible {
              outline-color: var(--bubble-blue) !important;
              box-shadow: 0 0 0 3px color-mix(in oklab, var(--bubble-blue) 35%, transparent) !important;
              border-color: var(--bubble-blue) !important;
            }

            /* --- REMOVE ANY LEFT ATTACH/PREFIX --- */
            .chat-input-scope [aria-label*="attach" i],
            .chat-input-scope [title*="attach" i],
            .chat-input-scope [data-attach],
            .chat-input-scope [data-icon="paperclip"],
            .chat-input-scope svg[class*="paperclip" i],
            .chat-input-scope .attach,
            .chat-input-scope .attachment,
            .chat-input-scope .leading,
            .chat-input-scope .leading-icon,
            .chat-input-scope .input-prefix,
            .chat-input-scope [data-slot="prefix"],
            .chat-input-scope .start,
            .chat-input-scope .left,
            .chat-input-scope .adornment {
              display: none !important;
              width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              pointer-events: none !important;
              visibility: hidden !important;
            }
            /* Also hide any element immediately before the field */
            .chat-input-scope :where(button,a,div,span,svg)[role="button"]:has(+ :where(input,textarea,[contenteditable="true"])),
            .chat-input-scope :where(button,a,div,span,svg):has(+ :where(input,textarea,[contenteditable="true"])) {
              display: none !important;
              width: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            /* If a grid reserved a left column, collapse it */
            .chat-input-scope :where(.grid,[class*="grid"]) {
              grid-template-columns: 1fr auto !important;
            }

            /* --- EXACT 10px GUTTERS --- */
            .chat-input-scope {
              padding-left: 10px !important;
              padding-right: 10px !important;
            }

            /* Normalize to "input | send", no centering */
            .chat-input-scope form,
            .chat-input-scope .row,
            .chat-input-scope .input-row,
            .chat-input-scope .wrapper,
            .chat-input-scope .controls,
            .chat-input-scope .toolbar {
              display: flex !important;
              align-items: center !important;
              justify-content: flex-start !important;
              gap: 8px !important;
              width: 100% !important;
              padding-left: 0 !important;
              padding-right: 0 !important;
              margin: 0 !important;
            }

            /* Force the pill wrapper to truly stretch */
            .chat-input-scope .pill,
            .chat-input-scope [class*="pill" i],
            .chat-input-scope .input-wrapper,
            .chat-input-scope [class*="input-wrapper" i],
            .chat-input-scope .field,
            .chat-input-scope [class*="field" i],
            .chat-input-scope .textbox,
            .chat-input-scope [role="textbox"] {
              flex: 1 1 auto !important;
              align-self: stretch !important;
              width: 100% !important;
              max-width: none !important;
              min-width: 0 !important;
              margin: 0 !important;
              padding-left: 0 !important;
            }
            /* Nuke stray max-widths/margins that keep it short */
            .chat-input-scope *[style*="max-width"] { max-width: none !important; }
            .chat-input-scope [class^="ml-"],
            .chat-input-scope [class*=" ml-"],
            .chat-input-scope *[style*="margin-left"] { margin-left: 0 !important; }

            /* Input element: guarantee 16px to avoid iOS zoom + small left pad for placeholder */
            .chat-input-scope :where(input, textarea, [contenteditable="true"]) {
              font-size: 16px !important;   /* <= required for mobile */
              line-height: 1.4;
              flex: 1 1 auto !important;
              width: 100% !important;
              max-width: none !important;
              min-width: 0 !important;
              margin: 0 !important;
              padding-left: 10px !important; /* slight internal left pad for placeholder */
              text-indent: 0 !important;
            }

            /* Send button hugs right gutter */
            .chat-input-scope [aria-label*="send" i],
            .chat-input-scope button[type="submit"],
            .chat-input-scope button[class*="send" i] {
              margin-left: 8px !important;
              margin-right: 0 !important;
              flex: 0 0 auto !important;
              align-self: center !important;
            }
          `}</style>

          {/* Animated input slot */}
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
            {/* Measured content with strict 10px gutters */}
            <div
              ref={measureRef}
              className="w-full chat-input-scope"
              style={{ paddingBottom: GAP_ABOVE_RAIL, paddingLeft: 10, paddingRight: 10 }}
            >
              <ChatInput />
            </div>
          </motion.div>

          {/* Rail footer: fixed height, never moves */}
          <div style={{ height: TAB_RAIL_HEIGHT, position: "relative" }}>
            <div
              ref={railRef}
              className="absolute inset-0 flex justify-between items-center px-4"
              style={{ width: CONTAINER_WIDTH, height: TAB_RAIL_HEIGHT }}
            >
              {navigationItems.map((item, index) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <div
                    key={item.id}
                    ref={(el) => (tabRefs.current[index] = el)}
                    className="flex flex-col items-center justify-center cursor-pointer select-none px-4 py-2"
                    onClick={() => setCurrentTab(item.id)}
                  >
                    <Icon
                      className={`h-6 w-6 transition-colors duration-300 ${
                        isActive
                          ? "text-primary-foreground drop-shadow-lg"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Bubble */}
            <motion.div
              drag="x"
              dragMomentum
              dragElastic={0.4}
              dragConstraints={railRef}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              animate={bubbleControls}
              initial={getBubblePosition()}
              whileHover={{ scale: 1.05, transition: { type: "spring", damping: 10, stiffness: 400 } }}
              whileDrag={{
                scale: 1.3,
                zIndex: 1000,
                filter:
                  "drop-shadow(0 0 40px hsla(200, 100%, 60%, 0.9)) drop-shadow(0 0 80px hsla(200, 100%, 40%, 0.6))",
                transition: { type: "spring", damping: 5, stiffness: 300 },
              }}
              className="absolute left-0 top-0 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto w-[72px] h-[72px]"
              style={{
                background:
                  "radial-gradient(circle at center, hsla(200, 100%, 80%, 0.2) 0%, hsla(200, 100%, 80%, 0.3) 40%, hsla(200, 100%, 50%, 0.6) 100%)",
                backdropFilter: "blur(20px)",
                border: "2px solid hsla(200, 100%, 70%, 0.7)",
                boxShadow: `
                  0 0 40px hsla(200, 100%, 60%, 0.5),
                  0 8px 32px hsla(200, 100%, 50%, 0.3),
                  inset 0 2px 0 hsla(200, 100%, 90%, 0.6),
                  inset 0 -2px 0 hsla(200, 100%, 30%, 0.4)
                `,
              }}
            >
              <div className="absolute inset-1 rounded-full overflow-hidden">
                <div className="absolute top-1 left-2 w-6 h-0.5 bg-white opacity-70 blur-sm rounded-full" />
                <div className="absolute bottom-2 right-1 w-4 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}