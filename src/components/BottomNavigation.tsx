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
  const scopeRef = useRef<HTMLDivElement>(null);

  const BUBBLE = 72;
  const TAB_RAIL_HEIGHT = 64;
  const PAD_TOP_COLLAPSED = 12;
  const PAD_TOP_EXPANDED = 16;
  const PAD_BOTTOM = 12;
  const CONTAINER_WIDTH = 320;

  // *** no vertical gap outside the input bar
  const GAP_ABOVE_RAIL = 0;

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

  // hard DOM fix: remove prefix (paperclip) + dead cells, flatten layout to [input | send]
  useEffect(() => {
    const root = scopeRef.current;
    if (!root) return;

    const prune = () => {
      root.querySelectorAll(`
        [aria-label*="attach" i],
        [title*="attach" i],
        [data-attach],
        [data-icon="paperclip"],
        svg[class*="paperclip" i],
        .attach,.attachment,.leading,.leading-icon,
        .input-prefix,[data-slot="prefix"],.start,.left,.adornment
      `).forEach(n => n.remove());

      const fields = root.querySelectorAll<HTMLElement>('input,textarea,[contenteditable="true"]');
      fields.forEach(field => {
        // nearest row
        const row =
          field.closest<HTMLElement>(
            'form,.row,.input-row,.wrapper,.controls,.toolbar,.grid,[class*="grid"],div'
          ) || field.parentElement;
        if (!row) return;

        // collapse any grid
        const cs = getComputedStyle(row);
        if (cs.display.includes('grid')) {
          row.style.gridTemplateColumns = 'minmax(0,1fr) auto';
          (row.style as any).gap = '8px';
        }

        // remove every sibling before the field
        let guard = 0;
        while (row.firstElementChild && row.firstElementChild !== field && guard++ < 12) {
          row.firstElementChild.remove();
        }
        // hoist if wrapper still sits before field
        if (row.firstElementChild && row.firstElementChild !== field) {
          const first = row.firstElementChild as HTMLElement;
          if (first.contains(field)) {
            first.before(field);
            first.remove();
          }
        }

        // force row: pure flex [input | send], no outside spacing
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'flex-start';
        row.style.gap = '8px';
        row.style.padding = '0';
        row.style.margin = '0';

        // wrappers: expand + kill EXTERNAL padding/margins
        const wrappers = [
          field.parentElement,
          field.closest('.pill') as HTMLElement | null,
          field.closest('.input-wrapper') as HTMLElement | null,
          field.closest('.field') as HTMLElement | null,
        ].filter(Boolean) as HTMLElement[];

        wrappers.forEach(w => {
          w.style.flex = '1 1 auto';
          w.style.width = '100%';
          w.style.maxWidth = 'none';
          w.style.minWidth = '0';
          w.style.padding = '0';
          w.style.margin = '0';
        });

        // field grows
        field.style.flex = '1 1 auto';
        (field.style as any).width = '100%';
      });
    };

    prune();
    const mo = new MutationObserver(prune);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

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
        {/* Glass container */}
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
            paddingTop: expanded ? PAD_TOP_EXPANDED : PAD_TOP_COLLAPSED,
            paddingBottom: PAD_BOTTOM,
            ["--bubble-blue" as any]: "hsl(200, 100%, 60%)",
            ["--edge-gutter" as any]: "15px",
            willChange: "transform",
          }}
        >
          <style>{`
            /* focus visuals */
            .chat-input-scope input:focus,
            .chat-input-scope input:focus-visible,
            .chat-input-scope textarea:focus,
            .chat-input-scope textarea:focus-visible {
              outline-color: var(--bubble-blue) !important;
              box-shadow: 0 0 0 3px color-mix(in oklab, var(--bubble-blue) 35%, transparent) !important;
              border-color: var(--bubble-blue) !important;
            }

            /* scope: ONLY side gutters = 15px, NO vertical gaps */
            .chat-input-scope {
              display: flex !important;
              align-items: center !important;
              justify-content: flex-start !important;
              gap: 8px !important;
              padding-left: var(--edge-gutter) !important;
              padding-right: var(--edge-gutter) !important;
              padding-top: 0 !important;
              padding-bottom: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              box-sizing: border-box !important;
            }

            /* rows normalized; zero vertical spacing */
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
              padding: 0 !important;
              margin: 0 !important;
              flex: 1 1 auto !important;
            }

            /* expand field; NO external padding/margins */
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
              padding: 0 !important;
              box-sizing: border-box !important;
            }

            /* keep INTERNAL placeholder padding at 10px */
            .chat-input-scope :where(input, textarea, [contenteditable="true"]) {
              font-size: 16px !important;
              line-height: 1.4;
              flex: 1 1 auto !important;
              width: 100% !important;
              margin: 0 !important;
              padding-left: 10px !important; /* internal only */
              box-sizing: border-box !important;
            }

            /* send button uses right edge gutter (15px) via scope padding */
            .chat-input-scope [aria-label*="send" i],
            .chat-input-scope button[type="submit"],
            .chat-input-scope button[class*="send" i] {
              margin: 0 !important;
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
            {/* NO extra padding/margins around the input row */}
            <div ref={measureRef} className="w-full" style={{ padding: 0, margin: 0 }}>
              <div ref={scopeRef} className="chat-input-scope">
                <ChatInput />
              </div>
            </div>
          </motion.div>

          {/* Rail footer */}
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