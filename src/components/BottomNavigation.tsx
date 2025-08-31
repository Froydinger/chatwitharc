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
          }}
        >
          <style>{`
            .chat-input-scope {
              display: flex !important;
              align-items: center !important;
              justify-content: flex-start !important;
              gap: 8px !important;
              width: 100% !important;
              padding-left: 10px !important;
              padding-right: 10px !important;
              box-sizing: border-box !important;
              margin: 0 !important;
            }

            /* Kill ONLY external offsets */
            .chat-input-scope .pill,
            .chat-input-scope [class*="pill"],
            .chat-input-scope .input-wrapper,
            .chat-input-scope [class*="input-wrapper"],
            .chat-input-scope .field,
            .chat-input-scope [class*="field"] {
              flex: 1 1 auto !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important; /* external padding gone */
              box-sizing: border-box !important;
            }

            /* Keep placeholder padding inside input itself */
            .chat-input-scope :where(input, textarea, [contenteditable="true"]) {
              font-size: 16px !important;
              line-height: 1.4;
              flex: 1 1 auto !important;
              width: 100% !important;
              margin: 0 !important;
              padding-left: 10px !important; /* <-- internal for placeholder */
              box-sizing: border-box !important;
            }

            .chat-input-scope [aria-label*="send" i],
            .chat-input-scope button[type="submit"],
            .chat-input-scope button[class*="send" i] {
              flex: 0 0 auto !important;
              margin: 0 !important;
              align-self: center !important;
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
              className="w-full chat-input-scope"
              style={{ paddingBottom: GAP_ABOVE_RAIL }}
            >
              <ChatInput />
            </div>
          </motion.div>

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

            <motion.div
              drag="x"
              dragMomentum
              dragElastic={0.4}
              dragConstraints={railRef}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              animate={bubbleControls}
              initial={getBubblePosition()}
              whileHover={{ scale: 1.05 }}
              whileDrag={{ scale: 1.3, zIndex: 1000 }}
              className="absolute left-0 top-0 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto w-[72px] h-[72px]"
              style={{
                background:
                  "radial-gradient(circle at center, hsla(200,100%,80%,0.2) 0%, hsla(200,100%,80%,0.3) 40%, hsla(200,100%,50%,0.6) 100%)",
                backdropFilter: "blur(20px)",
                border: "2px solid hsla(200,100%,70%,0.7)",
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}