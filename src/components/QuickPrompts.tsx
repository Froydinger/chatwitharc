import { useRef, useEffect, useState, useCallback } from "react";

interface QuickPromptsProps {
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
}

export function QuickPrompts({ quickPrompts, onTriggerPrompt }: QuickPromptsProps) {
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
    speed?: number; // px/s
    edgeFade?: number; // px
  }> = ({ items, speed = 24, edgeFade = 48 }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    // motion
    const xRef = useRef(0);
    const dirRef = useRef<1 | -1>(1);
    const rafRef = useRef<number | null>(null);
    const lastTsRef = useRef<number | null>(null);

    // bounds
    const singleWRef = useRef(0);
    const minXRef = useRef(0);
    const maxXRef = useRef(0);

    // drag
    const draggingRef = useRef(false);
    const wasDragRef = useRef(false); // blocks click after drag
    const [dragUI, setDragUI] = useState(false);

    // visibility + glow
    const childBtns = useRef<HTMLButtonElement[]>([]);
    const visibleSetRef = useRef<Set<number>>(new Set());
    const [visibleTick, setVisibleTick] = useState(0);
    const [glowIndex, setGlowIndex] = useState(-1);
    const [glowColor, setGlowColor] = useState("");

    const glowColors = [
      "hsl(0, 84%, 60%)",
      "hsl(221, 83%, 53%)",
      "hsl(142, 76%, 36%)",
      "hsl(24, 95%, 53%)",
      "hsl(329, 73%, 60%)",
    ];

    // build tripled list
    const tripled = [...items, ...items, ...items];

    // collect refs
    childBtns.current = [];
    const setChildRef = (el: HTMLButtonElement | null) => {
      if (el) childBtns.current.push(el);
    };

    // measure single-copy width and travel bounds inside middle copy only
    const computeBounds = useCallback(() => {
      const c = containerRef.current;
      const t = trackRef.current;
      if (!c || !t) return;

      // reset transform to measure
      const prev = t.style.transform;
      t.style.transform = "translate3d(0,0,0)";

      // width of the first N children spans one copy
      const nodes = Array.from(t.children) as HTMLElement[];
      if (nodes.length === 0) return;
      const first = nodes[0].getBoundingClientRect();
      const last = nodes[items.length - 1].getBoundingClientRect();
      const singleW = Math.max(0, last.right - first.left);
      singleWRef.current = singleW;

      const containerW = c.offsetWidth;
      const travel = Math.max(0, singleW - containerW); // how far we can move within B

      // keep motion within the middle copy [B] only
      // allowed range = [-singleW - travel, -singleW]
      minXRef.current = -singleW - travel;
      maxXRef.current = -singleW;

      // start at the center of that range
      xRef.current = (minXRef.current + maxXRef.current) / 2;

      t.style.transform = `translate3d(${xRef.current}px,0,0)`;

      // back to previous if needed
      if (prev) t.style.transform = prev;
    }, [items.length]);

    // visibility calc against container rect
    const updateVisible = useCallback(() => {
      const c = containerRef.current;
      if (!c) return;
      const cRect = c.getBoundingClientRect();
      const set = new Set<number>();
      childBtns.current.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const overlap = Math.min(r.right, cRect.right) - Math.max(r.left, cRect.left);
        if (overlap > 8) set.add(i);
      });
      visibleSetRef.current = set;
      setVisibleTick(v => v + 1);
    }, []);

    // raf loop
    const tick = useCallback((ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      if (!draggingRef.current) {
        const px = (speed * dt) / 1000;
        let x = xRef.current + dirRef.current * px;

        if (x >= maxXRef.current) {
          x = maxXRef.current;
          dirRef.current = -1;
        } else if (x <= minXRef.current) {
          x = minXRef.current;
          dirRef.current = 1;
        }

        xRef.current = x;
        if (trackRef.current) {
          trackRef.current.style.transform = `translate3d(${x}px,0,0)`;
        }
      }

      // light throttle for visibility checks
      if ((ts % 120) < 16) updateVisible();

      rafRef.current = requestAnimationFrame(tick);
    }, [speed, updateVisible]);

    useEffect(() => {
      computeBounds();
      updateVisible();
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);

      const onResize = () => { computeBounds(); updateVisible(); };
      window.addEventListener("resize", onResize);

      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        window.removeEventListener("resize", onResize);
      };
    }, [computeBounds, tick, updateVisible]);

    // pointer drag without preventDefault so clicks still work
    useEffect(() => {
      const c = containerRef.current;
      if (!c) return;

      let startX = 0;
      let startPos = 0;
      let moved = false;

      const move = (clientX: number) => {
        const dx = clientX - startX;
        if (!moved && Math.abs(dx) > 5) {
          moved = true;
          draggingRef.current = true;
          setDragUI(true);
        }
        if (moved) {
          const nx = Math.max(minXRef.current, Math.min(maxXRef.current, startPos + dx));
          xRef.current = nx;
          if (trackRef.current) trackRef.current.style.transform = `translate3d(${nx}px,0,0)`;
          updateVisible();
        }
      };

      const onPointerDown = (e: PointerEvent) => {
        startX = e.clientX;
        startPos = xRef.current;
        moved = false;
        wasDragRef.current = false;
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp, { once: true });
      };
      const onPointerMove = (e: PointerEvent) => move(e.clientX);
      const onPointerUp = () => {
        // set direction to head back across the middle nicely
        const mid = (minXRef.current + maxXRef.current) / 2;
        dirRef.current = xRef.current >= mid ? -1 : 1;

        draggingRef.current = false;
        setDragUI(false);
        if (moved) {
          wasDragRef.current = true;
          setTimeout(() => { wasDragRef.current = false; }, 0); // clear after click phase
        }
        window.removeEventListener("pointermove", onPointerMove);
      };

      c.addEventListener("pointerdown", onPointerDown);
      return () => c.removeEventListener("pointerdown", onPointerDown);
    }, [updateVisible]);

    // slow breathing glow only from visible
    useEffect(() => {
      let root: number | null = null;

      const schedule = () => {
        const delay = 2500 + Math.random() * 4000; // longer delay between glows
        root = window.setTimeout(() => {
          const visible = Array.from(visibleSetRef.current);
          if (visible.length) {
            const idx = visible[Math.floor(Math.random() * visible.length)];
            const color = glowColors[Math.floor(Math.random() * glowColors.length)];
            setGlowIndex(idx);
            setGlowColor(color);
            // Keep the glow on and let CSS handle the breathing animation
            // After a long duration, pick a new one
            root = window.setTimeout(() => {
              schedule();
            }, 5000); // 5 seconds of slow breathing
          } else {
            root = window.setTimeout(schedule, 600);
          }
        }, delay);
      };

      schedule();
      return () => {
        if (root) window.clearTimeout(root);
      };
    }, [visibleTick]);

    return (
      <div
        ref={containerRef}
        className="pong-marquee"
        style={{
          position: "relative",
          overflow: "hidden",
          userSelect: "none",
          cursor: dragUI ? "grabbing" : "grab",
          touchAction: "pan-y",
          WebkitMaskImage: `linear-gradient(to right, rgba(0,0,0,0) 0, rgba(0,0,0,1) ${edgeFade}px, rgba(0,0,0,1) calc(100% - ${edgeFade}px), rgba(0,0,0,0) 100%)`,
          maskImage: `linear-gradient(to right, rgba(0,0,0,0) 0, rgba(0,0,0,1) ${edgeFade}px, rgba(0,0,0,1) calc(100% - ${edgeFade}px), rgba(0,0,0,0) 100%)`,
        }}
      >
        <div
          ref={trackRef}
          style={{
            display: "flex",
            gap: "12px",
            whiteSpace: "nowrap",
            willChange: "transform",
            paddingLeft: "20px",
            paddingRight: "20px",
            transform: "translate3d(0,0,0)",
          }}
        >
          {tripled.map((p, i) => (
            <button
              key={`${p.label}-${i}`}
              ref={setChildRef}
              onClick={(e) => {
                if (wasDragRef.current) return; // ignore click right after drag
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent("quickPromptSelected", { detail: { prompt: p.prompt } }));
                // or use callback if you prefer:
                // onTriggerPrompt(p.prompt);
              }}
              className="prompt-pill"
              style={{
                flexShrink: 0,
                transition: "none",
                animation: glowIndex === i ? "breathe-glow 5s ease-in-out infinite" : "none",
                boxShadow:
                  glowIndex === i
                    ? `inset 0 0 0 1px ${glowColor}, 0 0 6px ${glowColor}`
                    : "none",
                "--glow-color": glowColor,
              } as React.CSSProperties & { "--glow-color": string }}
            >
              <span className="font-medium text-sm">{p.label}</span>
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