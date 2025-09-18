import { useRef, useEffect, useState, useCallback } from "react";

interface QuickPromptsProps {
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
}

export function QuickPrompts({ quickPrompts, onTriggerPrompt }: QuickPromptsProps) {
  // Text conversation prompts
  const textPrompts = [
    { label: "📅 Plan my day", prompt: "Help me plan my day effectively" },
    { label: "🧠 Explain concept", prompt: "Explain a complex concept in simple terms" },
    { label: "✉️ Write email", prompt: "Help me write a professional email" },
    { label: "💡 Brainstorm ideas", prompt: "Let's brainstorm creative ideas together" },
    { label: "🔧 Solve problem", prompt: "Help me solve a challenging problem" },
    { label: "📚 Learn something", prompt: "Teach me something interesting today" },
    { label: "💭 Get advice", prompt: "I need some thoughtful advice" },
    { label: "🎯 Make decision", prompt: "Help me make an important decision" }
  ];

  // Detailed image generation prompts (16:9 aspect ratio)
  const imagePrompts = [
    { label: "🌌 Cosmic landscape", prompt: "Generate a 16:9 image of a breathtaking photorealistic cosmic landscape with swirling galaxies, nebulae in vibrant purples and blues, distant planets, and ethereal lighting effects" },
    { label: "🏙️ Futuristic city", prompt: "Generate a 16:9 image of a stunning photorealistic futuristic cityscape at sunset with towering glass spires, flying vehicles, neon lights, and advanced architecture reflecting golden hour lighting" },
    { label: "🌲 Mystical forest", prompt: "Generate a 16:9 image of a photorealistic enchanted mystical forest with ancient towering trees, glowing mushrooms, magical fireflies, misty atmosphere, and dappled sunlight filtering through leaves" },
    { label: "🌊 Ocean depths", prompt: "Generate a 16:9 image of a photorealistic underwater scene in the deep ocean with bioluminescent creatures, coral reefs, schools of tropical fish, and rays of sunlight penetrating the water" },
    { label: "⛰️ Mountain vista", prompt: "Generate a 16:9 image of a photorealistic majestic mountain landscape at dawn with snow-capped peaks, alpine lakes, wildflower meadows, and dramatic cloud formations in the sky" },
    { label: "🏜️ Desert oasis", prompt: "Generate a 16:9 image of a photorealistic beautiful desert oasis with palm trees, crystal clear water, sand dunes, cacti, and a stunning sunset sky with warm golden and orange tones" },
    { label: "🏰 Fantasy castle", prompt: "Generate a 16:9 image of a photorealistic magnificent fantasy castle on a cliff with multiple towers, flowing banners, a waterfall, surrounding clouds, and magical aurora in the night sky" },
    { label: "🎨 Abstract art", prompt: "Generate a 16:9 image of an abstract artistic composition with flowing organic shapes, vibrant color gradients, dynamic patterns, and harmonious geometric elements" }
  ];

  const PongMarquee: React.FC<{
    items: Array<{ label: string; prompt: string }>;
    speed?: number; // px per second
  }> = ({ items, speed = 24 }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Hot path refs
    const xRef = useRef(0);                       // current translate X
    const dirRef = useRef<1 | -1>(1);             // 1 = right, -1 = left
    const rafRef = useRef<number | null>(null);
    const lastTsRef = useRef<number | null>(null);
    const draggingRef = useRef(false);

    // Geometry refs
    const singleWidthRef = useRef(0);             // width of one copy
    const centerXRef = useRef(0);                 // translateX at exact center
    const maxFromCenterRef = useRef(0);           // travel range from center
    const childrenRefs = useRef<HTMLButtonElement[]>([]);

    // Visible index tracking for glow
    const visibleSetRef = useRef<Set<number>>(new Set());
    const [visibleVersion, setVisibleVersion] = useState(0); // bump to drive glow picking
    const [glowIndex, setGlowIndex] = useState<number>(-1);
    const [glowColor, setGlowColor] = useState<string>("");

    // Fades at edges
    const EdgeFades = () => (
      <div aria-hidden style={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, left: 0, width: "48px",
          background: "linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0))"
        }} />
        <div style={{
          position: "absolute", top: 0, bottom: 0, right: 0, width: "48px",
          background: "linear-gradient(to left, rgba(0,0,0,1), rgba(0,0,0,0))"
        }} />
      </div>
    );

    // Triple items so edges never show
    const tripled = [...items, ...items, ...items];

    // Build child refs array length
    childrenRefs.current = [];
    const setChildRef = (el: HTMLButtonElement | null) => {
      if (el) childrenRefs.current.push(el);
    };

    // Compute geometry and center
    const computeBounds = useCallback(() => {
      const c = containerRef.current;
      const content = contentRef.current;
      if (!c || !content) return;

      // Measure one copy width by summing first N nodes equal to items.length
      let w = 0;
      const nodes = Array.from(content.children) as HTMLElement[];
      for (let i = 0; i < items.length && i < nodes.length; i++) {
        w += nodes[i].offsetWidth;
        // add gaps
        if (i < items.length - 1) {
          const gap = parseFloat(getComputedStyle(content).columnGap || "0") || 0;
          w += gap;
        }
      }
      const paddingLeft = parseFloat(getComputedStyle(content).paddingLeft || "0") || 0;
      const paddingRight = parseFloat(getComputedStyle(content).paddingRight || "0") || 0;
      const contentGap = parseFloat(getComputedStyle(content).gap || "0") || 0; // tailwind uses gap not columnGap
      // Better gap estimation: use gap
      w = 0;
      for (let i = 0; i < items.length && i < nodes.length; i++) {
        w += nodes[i].offsetWidth;
        if (i < items.length - 1) w += contentGap;
      }

      singleWidthRef.current = w;
      // Place center so that the middle copy is exactly aligned
      // tripled = [copyA][copyB][copyC]
      // We want to start inside copyB
      centerXRef.current = -w; // shift left by exactly one copy width to show copyB
      const containerWidth = c.offsetWidth;

      // We restrict travel to stay within copyB only
      // So from center we can move left until the container right edge touches copyB left edge
      // That gives range = singleWidth - containerWidth, but never below 0
      maxFromCenterRef.current = Math.max(0, singleWidthRef.current - containerWidth);

      // Clamp current x into new range around center
      const minX = centerXRef.current - maxFromCenterRef.current;
      const maxX = centerXRef.current + maxFromCenterRef.current;
      xRef.current = Math.min(maxX, Math.max(minX, xRef.current));

      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${xRef.current}px,0,0)`;
      }
    }, [items.length]);

    useEffect(() => {
      computeBounds();
      const onResize = () => computeBounds();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [computeBounds, tripled.length]);

    // Only pick glow from visible items
    const updateVisibleSet = useCallback(() => {
      const c = containerRef.current;
      if (!c) return;
      const cRect = c.getBoundingClientRect();
      const visible = new Set<number>();

      childrenRefs.current.forEach((el, idx) => {
        const r = el.getBoundingClientRect();
        const overlap = Math.min(r.right, cRect.right) - Math.max(r.left, cRect.left);
        if (overlap > 8) visible.add(idx); // small threshold
      });
      visibleSetRef.current = visible;
      setVisibleVersion(v => v + 1); // drive glow scheduler
    }, []);

    // RAF loop for back and forth
    const tick = useCallback((ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;

      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      if (!draggingRef.current) {
        const px = (speed * dt) / 1000;
        const minX = centerXRef.current - maxFromCenterRef.current;
        const maxX = centerXRef.current + maxFromCenterRef.current;

        let x = xRef.current + dirRef.current * px;

        if (x >= maxX) {
          x = maxX;
          dirRef.current = -1; // go left
        } else if (x <= minX) {
          x = minX;
          dirRef.current = 1; // go right
        }

        xRef.current = x;
        if (contentRef.current) {
          contentRef.current.style.transform = `translate3d(${x}px,0,0)`;
        }
      }

      // Visibility check at a light interval
      if ((ts % 120) < 16) updateVisibleSet();

      rafRef.current = requestAnimationFrame(tick);
    }, [speed, updateVisibleSet]);

    useEffect(() => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      };
    }, [tick]);

    // Pointer drag
    useEffect(() => {
      const c = containerRef.current;
      if (!c) return;

      let startClientX = 0;
      let startX = 0;
      let moved = false;

      const onPointerDown = (e: PointerEvent) => {
        c.setPointerCapture(e.pointerId);
        startClientX = e.clientX;
        startX = xRef.current;
        moved = false;
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!startClientX) return;
        const dx = e.clientX - startClientX;
        if (!moved && Math.abs(dx) > 5) moved = true;
        if (moved) {
          draggingRef.current = true;
          const minX = centerXRef.current - maxFromCenterRef.current;
          const maxX = centerXRef.current + maxFromCenterRef.current;
          const nx = Math.min(maxX, Math.max(minX, startX + dx));
          xRef.current = nx;
          if (contentRef.current) {
            contentRef.current.style.transform = `translate3d(${nx}px,0,0)`;
          }
          updateVisibleSet();
        }
      };
      const onPointerUp = (e: PointerEvent) => {
        try { c.releasePointerCapture(e.pointerId); } catch {}
        // pick a direction based on where we ended so it naturally crosses center again
        const mid = centerXRef.current;
        dirRef.current = xRef.current >= mid ? -1 : 1;
        draggingRef.current = false;
        startClientX = 0;
        startX = 0;
      };

      c.addEventListener("pointerdown", onPointerDown);
      c.addEventListener("pointermove", onPointerMove);
      c.addEventListener("pointerup", onPointerUp);
      c.addEventListener("pointercancel", onPointerUp);

      return () => {
        c.removeEventListener("pointerdown", onPointerDown);
        c.removeEventListener("pointermove", onPointerMove);
        c.removeEventListener("pointerup", onPointerUp);
        c.removeEventListener("pointercancel", onPointerUp);
      };
    }, [updateVisibleSet]);

    // Glow scheduler that picks only from visible set inside the middle copy window
    const glowColors = [
      "hsl(0, 84%, 60%)",
      "hsl(221, 83%, 53%)",
      "hsl(142, 76%, 36%)",
      "hsl(24, 95%, 53%)",
      "hsl(329, 73%, 60%)",
    ];

    useEffect(() => {
      let rootTimer: number | null = null;
      let clearTimer: number | null = null;

      const schedule = () => {
        const delay = 1800 + Math.random() * 3200;
        rootTimer = window.setTimeout(() => {
          const visible = Array.from(visibleSetRef.current);
          if (visible.length) {
            const idx = visible[Math.floor(Math.random() * visible.length)];
            const color = glowColors[Math.floor(Math.random() * glowColors.length)];
            setGlowIndex(idx);
            setGlowColor(color);
            clearTimer = window.setTimeout(() => {
              setGlowIndex(-1);
              schedule();
            }, 2400);
          } else {
            // nothing visible yet, retry soon
            rootTimer = window.setTimeout(schedule, 600);
          }
        }, delay);
      };

      schedule();
      return () => {
        if (rootTimer) window.clearTimeout(rootTimer);
        if (clearTimer) window.clearTimeout(clearTimer);
      };
    }, [visibleVersion]);

    // Initial compute after first paint
    useEffect(() => {
      // small delay to allow layout
      const t = setTimeout(() => {
        computeBounds();
        updateVisibleSet();
      }, 0);
      return () => clearTimeout(t);
    }, [computeBounds, updateVisibleSet]);

    return (
      <div
        ref={containerRef}
        className="pong-marquee"
        style={{
          position: "relative",
          overflow: "hidden",
          userSelect: "none",
          cursor: draggingRef.current ? "grabbing" : "grab",
          minHeight: "48px",
        }}
      >
        <EdgeFades />
        <div
          ref={contentRef}
          className="pong-marquee-content"
          style={{
            display: "flex",
            gap: "12px",
            whiteSpace: "nowrap",
            willChange: "transform",
            paddingLeft: "20px",
            paddingRight: "20px",
            transform: "translate3d(0,0,0)",
          }}
          onPointerDown={(e) => e.preventDefault()}
        >
          {tripled.map((prompt, i) => (
            <button
              key={`${prompt.label}-${i}`}
              ref={setChildRef}
              onClick={(e) => {
                e.stopPropagation();
                if (!draggingRef.current) {
                  window.dispatchEvent(
                    new CustomEvent("quickPromptSelected", {
                      detail: { prompt: prompt.prompt },
                    })
                  );
                }
              }}
              className="prompt-pill"
              style={{
                flexShrink: 0,
                boxShadow:
                  glowIndex === i
                    ? `inset 0 0 0 1px ${glowColor}, 0 0 10px ${glowColor}`
                    : "none",
                transition: "box-shadow 200ms ease",
              } as React.CSSProperties}
            >
              <span className="font-medium text-sm">{prompt.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6 mb-16">
      <PongMarquee items={textPrompts} speed={24} />
      <PongMarquee items={imagePrompts} speed={20} />
    </div>
  );
}