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

  // ---------------- Placeholder cycling (unchanged visuals) ----------------
  const placeholders = [
    "What's on your mind?",
    "Type a thought or idea…",
    "Need advice? Start typing…",
    "Tell me your story…",
  ];
  const phIndexRef = useRef(0);
  const currentPHRef = useRef(placeholders[0]);
  const phIntervalRef = useRef<number | null>(null);
  const phObserverRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const getField = () =>
      scopeRef.current?.querySelector("input,textarea") as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;

    const setPlaceholder = (text: string) => {
      const f = getField();
      if (f) {
        f.placeholder = text;
        (f as HTMLElement).style.setProperty("--ph-opacity", "1");
      }
      currentPHRef.current = text;
    };

    const killDefaultGhosts = () => {
      const root = scopeRef.current;
      if (!root) return;
      root.querySelectorAll('[data-placeholder], .placeholder, .Placeholder').forEach((el) => {
        const n = el as HTMLElement;
        n.style.visibility = "hidden";
        n.textContent = "";
      });
    };

    killDefaultGhosts();
    setPlaceholder(placeholders[phIndexRef.current]);

    if (!phObserverRef.current) {
      const obs = new MutationObserver(() => {
        const f = getField();
        if (!f) return;
        if (f.placeholder !== currentPHRef.current) f.placeholder = currentPHRef.current;
        killDefaultGhosts();
      });
      if (scopeRef.current) {
        obs.observe(scopeRef.current, { childList: true, subtree: true, attributes: true });
      }
      phObserverRef.current = obs;
    }

    const startCycle = () => {
      const f = getField();
      if (!f) return;
      (f as HTMLElement).style.setProperty("--ph-opacity", "0");
      window.setTimeout(() => {
        f.placeholder = "";
        requestAnimationFrame(() => {
          phIndexRef.current = (phIndexRef.current + 1) % placeholders.length;
          const next = placeholders[phIndexRef.current];
          currentPHRef.current = next;
          f.placeholder = next;
          requestAnimationFrame(() => {
            (f as HTMLElement).style.setProperty("--ph-opacity", "1");
          });
        });
      }, 600);
    };

    phIntervalRef.current = window.setInterval(startCycle, 6000) as unknown as number;

    return () => {
      if (phIntervalRef.current) clearInterval(phIntervalRef.current);
      phIntervalRef.current = null;
      if (phObserverRef.current) phObserverRef.current.disconnect();
      phObserverRef.current = null;
    };
  }, []);

  // ---------------- Bubble geometry helpers ----------------
  const rectBubbleXForTab = (tabId: typeof navigationItems[number]["id"]) => {
    const idx = navigationItems.findIndex((i) => i.id === tabId);
    const rail = railRef.current;
    if (!rail) return 0;

    const railRect = rail.getBoundingClientRect();
    const tabEl = tabRefs.current[idx];

    if (!tabEl) {
      const cell = railRect.width / navigationItems.length;
      const center = cell * idx + cell / 2;
      return Math.round(center - BUBBLE / 2);
    }

    const r = tabEl.getBoundingClientRect();
    const centerWithinRail = (r.left + r.width / 2) - railRect.left;
    return Math.round(centerWithinRail - BUBBLE / 2);
  };

  // ---------------- Absolute freeze during Android IME ----------------
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [freezeBubble, setFreezeBubble] = useState(false);
  const frozenXRef = useRef<number>(0);

  // On focus: lock to chat and FREEZE at exact x, no animation.
  useEffect(() => {
    const root = scopeRef.current;
    if (!root) return;

    const onFocusIn = () => {
      setIsInputFocused(true);
      if (currentTab !== "chat") setCurrentTab("chat");
      const x = rectBubbleXForTab("chat");
      frozenXRef.current = x;
      setFreezeBubble(true);
      bubbleControls.set({ x }); // no animation
    };

    const onFocusOut = () => {
      setIsInputFocused(false);
      // Unfreeze after a tiny delay to let viewport settle
      const x = rectBubbleXForTab(currentTab);
      frozenXRef.current = x;
      bubbleControls.set({ x }); // still no animation
      setTimeout(() => {
        setFreezeBubble(false);
        // One measured, animated settle back to active tab
        const nx = rectBubbleXForTab(currentTab);
        bubbleControls.start({ x: nx, transition: { type: "spring", damping: 14, stiffness: 260, mass: 0.7 } });
      }, 80);
    };

    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, [currentTab, setCurrentTab, bubbleControls]);

  // While frozen, ignore ALL visualViewport and resize changes.
  useEffect(() => {
    let raf = 0;
    const syncWhileUnfrozen = () => {
      if (freezeBubble) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = rectBubbleXForTab(isInputFocused ? "chat" : currentTab);
        bubbleControls.set({ x }); // use set() to avoid spring on resize
      });
    };

    const ro = new ResizeObserver(syncWhileUnfrozen);
    if (railRef.current) ro.observe(railRef.current);

    const onResize = syncWhileUnfrozen;
    const onVis = syncWhileUnfrozen;

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.addEventListener("visibilitychange", onVis);

    const vv = (window as any).visualViewport as VisualViewport | undefined;
    if (vv) {
      vv.addEventListener("resize", onResize);
      vv.addEventListener("scroll", onResize);
    }

    // initial snap
    syncWhileUnfrozen();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.removeEventListener("visibilitychange", onVis);
      if (vv) {
        vv.removeEventListener("resize", onResize);
        vv.removeEventListener("scroll", onResize);
      }
      cancelAnimationFrame(raf);
    };
  }, [currentTab, isInputFocused, freezeBubble, bubbleControls]);

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

  // Remove paperclip and any wrapper cells that reserve space (unchanged)
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

  // Animate to tab (only when not frozen)
  useEffect(() => {
    if (isDragging || freezeBubble) return;
    const x = rectBubbleXForTab(isInputFocused ? "chat" : currentTab);
    bubbleControls.start({
      x,
      transition: { type: "spring", damping: 14, stiffness: 260, mass: 0.7 },
    });
  }, [currentTab, isDragging, isInputFocused, freezeBubble, bubbleControls]);

  const onNavItemClick = (id: typeof navigationItems[number]["id"]) => {
    if (isInputFocused) return; // block nav while keyboard up
    setCurrentTab(id);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    if (isInputFocused || freezeBubble) {
      // snap back to locked x with no animation
      bubbleControls.set({ x: frozenXRef.current });
      return;
    }
    const dropXViewport = info.point.x;
    let best = 0;
    let bestDist = Infinity;
    tabRefs.current.forEach((el, i) => {
      if (!el) return;
      const b = el.getBoundingClientRect();
      const center = b.left + b.width / 2;
      const d = Math.abs(center - dropXViewport);
      if (d < bestDist) {
        bestDist = d;
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
            @keyframes neonAuraOpacity { 0%, 100% { opacity: .20; } 50% { opacity: .10; } }
            .chat-input-scope input,
            .chat-input-scope textarea,
            .chat-input-scope [contenteditable="true"] { caret-color: var(--neon-blue)!important; accent-color: var(--neon-blue)!important; }
            .chat-input-scope input:focus,
            .chat-input-scope textarea:focus,
            .chat-input-scope [contenteditable="true"]:focus {
              outline-color: var(--neon-blue)!important; border-color: var(--neon-blue)!important;
              box-shadow: 0 0 0 3px color-mix(in oklab, var(--neon-blue) 40%, transparent)!important;
            }
            .chat-input-scope :where(input,textarea,[contenteditable="true"]) { --ph-opacity: 1; }
            .chat-input-scope input::placeholder, .chat-input-scope textarea::placeholder {
              opacity: var(--ph-opacity,1)!important; transition: opacity 600ms ease!important; will-change: opacity!important;
            }
            .chat-input-scope { display:flex!important; align-items:center!important; justify-content:flex-start!important; gap:8px!important; padding-left:10px!important; padding-right:10px!important; width:100%!important; box-sizing:border-box!important; margin:0!important; }
            .chat-input-scope form, .chat-input-scope .row, .chat-input-scope .input-row, .chat-input-scope .wrapper, .chat-input-scope .controls, .chat-input-scope .toolbar { display:flex!important; align-items:center!important; justify-content:flex-start!important; gap:8px!important; width:100%!important; padding:0!important; margin:0!important; flex:1 1 auto!important; }
            .chat-input-scope .pill, .chat-input-scope .input-wrapper, .chat-input-scope .field, .chat-input-scope .textbox, .chat-input-scope [role="textbox"] {
              flex:1 1 auto!important; align-self:stretch!important; width:100%!important; max-width:none!important; min-width:0!important; margin-left:0!important; padding-left:0!important; box-sizing:border-box!important; position:relative!important; border-radius:16px!important; overflow:visible!important; border-color:var(--neon-blue)!important;
            }
            .chat-input-scope .pill::before, .chat-input-scope .input-wrapper::before, .chat-input-scope .field::before, .chat-input-scope .textbox::before, .chat-input-scope [role="textbox"]::before {
              content:""!important; position:absolute!important; inset:-2px!important; border-radius:inherit!important; background:hsla(200,100%,60%,.20)!important; filter:blur(12px)!important; pointer-events:none!important; z-index:0!important; animation: neonAuraOpacity 3.2s ease-in-out infinite;
            }
            .chat-input-scope :where(input,textarea,[contenteditable="true"]) {
              position:relative!important; z-index:1!important; font-size:16px!important; line-height:1.4; flex:1 1 auto!important; width:100%!important; margin:0!important; padding-left:10px!important; text-indent:0!important; box-sizing:border-box!important; top:-2px!important; border-color:var(--neon-blue)!important; background:transparent!important;
            }
            .chat-input-scope [aria-label*="send" i],
            .chat-input-scope button[type="submit"],
            .chat-input-scope button[class*="send" i] { margin:0!important; flex:0 0 auto!important; align-self:center!important; position:relative!important; z-index:1!important; top:1px!important; left:5px!important; }
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
            <div ref={measureRef} className="w-full" style={{ paddingBottom: GAP_ABOVE_RAIL }}>
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
                    onClick={() => onNavItemClick(item.id)}
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
              drag={isInputFocused ? false : "x"}
              dragMomentum
              dragElastic={0.4}
              dragConstraints={railRef}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              animate={bubbleControls}
              // keep initial snap deterministic
              initial={{ x: rectBubbleXForTab(currentTab), y: 0 }}
              whileHover={{ scale: 1.05, transition: { type: "spring", damping: 10, stiffness: 400 } }}
              whileDrag={{
                scale: 1.3,
                zIndex: 1000,
                filter:
                  "drop-shadow(0 0 40px hsla(200, 100%, 60%, 0.9)) drop-shadow(0 0 80px hsla(200, 100%, 40%, 0.6))",
                transition: { type: "spring", damping: 5, stiffness: 300 },
              }}
              className="absolute left-0 top-0 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
              style={{
                width: BUBBLE,
                height: BUBBLE,
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