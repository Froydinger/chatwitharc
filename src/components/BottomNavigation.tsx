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
  const GAP_ABOVE_RAIL = 2; // slight raise

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

  // hard-remove any attach/left-prefix nodes inside ChatInput
  useEffect(() => {
    const root = measureRef.current;
    if (!root) return;

    const killAttach = (scope: ParentNode) => {
      const killers = scope.querySelectorAll(
        [
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
        ].join(",")
      );
      killers.forEach((n) => (n as HTMLElement).remove());

      // remove empty wrappers left behind as first child before the field
      const wrappers = scope.querySelectorAll(
        '.pill-frame > *:first-child, .pill-frame form > *:first-child'
      );
      wrappers.forEach((el) => {
        const next = el.nextElementSibling as HTMLElement | null;
        const isField =
          next &&
          (next.matches('input,textarea,[contenteditable="true"]') ||
            next.querySelector?.('input,textarea,[contenteditable="true"]'));
        // if this first child isn't the field and has no size, nuke it
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (!isField && rect.width < 4) (el as HTMLElement).remove();
      });
    };

    killAttach(root);

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes.length) killAttach(root);
      }
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const expanded = currentTab === "chat";
  const topPad = expanded ? PAD_TOP_EXPANDED : PAD_TOP_COLLAPSED;

  // Bubble position helper
  const getBubblePosition = () => {
    const idx = navigationItems.findIndex((i) => i.id === currentTab);
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
            /* === No container gutters; pill row owns its insets === */
            .chat-input-scope { padding-left: 0 !important; padding-right: 0 !important; }

            /* Pill row provides symmetric 10px insets */
            .pill-frame {
              display: flex !important;
              align-items: center !important;
              gap: 8px !important;
              width: 100% !important;
              padding-left: 10px !important;
              padding-right: 10px !important;
              margin: 0 !important;
            }

            /* Kill centering/margins that cap the pill */
            .pill-frame :where(.justify-center,[class*="justify-center"]) { justify-content: flex-start !important; }
            .pill-frame :where(.mx-auto,[style*="margin-left: auto"],[style*="margin-right: auto"]) {
              margin-left: 0 !important; margin-right: 0 !important;
            }
            .pill-frame [class^="ml-"], .pill-frame [class*=" ml-"], .pill-frame *[style*="margin-left"] {
              margin-left: 0 !important;
            }

            /* Make pill + input stretch from left inset to send button */
            .pill-frame .pill,
            .pill-frame [class*="pill" i],
            .pill-frame .input-wrapper,
            .pill-frame [class*="input-wrapper" i],
            .pill-frame .field,
            .pill-frame [class*="field" i],
            .pill-frame .textbox,
            .pill-frame [role="textbox"],
            .pill-frame :where(input, textarea, [contenteditable="true"]) {
              flex: 1 1 auto !important;
              width: 100% !important;
              max-width: none !important;
              min-width: 0 !important;
              margin: 0 !important;
              padding-left: 0 !important;
              text-indent: 0 !important;
              font-size: 16px !important; /* iOS anti-zoom */
              line-height: 1.4;
            }

            /* Keep send pinned to right inset */
            .pill-frame [aria-label*="send" i],
            .pill-frame button[type="submit"],
            .pill-frame button[class*="send" i] {
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
            {/* Measured content (ref on the padded row) */}
            <div
              ref={measureRef}
              className="chat-input-scope pill-frame"
              style={{ paddingBottom: GAP_ABOVE_RAIL }}
            >
              <div className="flex-1 min-w-0">
                <ChatInput />
              </div>
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