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
    speed?: number;
    initialDirection?: 'left' | 'right';
  }> = ({ items, speed = 30, initialDirection = 'left' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Refs for hot path
    const currentXRef = useRef(0);
    const maxScrollRef = useRef(0);
    const dirRef = useRef<'left' | 'right'>(initialDirection);
    const draggingRef = useRef(false);
    const rafRef = useRef<number | null>(null);
    const lastTsRef = useRef<number | null>(null);

    // Small UI states that can re-render without hurting perf
    const [glowIndex, setGlowIndex] = useState(-1);
    const [glowColor, setGlowColor] = useState("");
    const [isDraggingUI, setIsDraggingUI] = useState(false);

    // timeouts for glow
    const glowRootTimeout = useRef<number | null>(null);
    const glowClearTimeout = useRef<number | null>(null);

    const glowColors = [
      "hsl(0, 84%, 60%)",
      "hsl(221, 83%, 53%)",
      "hsl(142, 76%, 36%)",
      "hsl(24, 95%, 53%)",
      "hsl(329, 73%, 60%)",
    ];

    // Boundaries
    const updateBounds = useCallback(() => {
      const c = containerRef.current;
      const content = contentRef.current;
      if (!c || !content) return;
      const containerWidth = c.offsetWidth;
      const contentWidth = content.scrollWidth;
      maxScrollRef.current = Math.max(0, contentWidth - containerWidth);
      // Clamp position into new bounds
      currentXRef.current = Math.min(0, Math.max(-maxScrollRef.current, currentXRef.current));
      if (contentRef.current) {
        contentRef.current.style.transform = `translate3d(${currentXRef.current}px,0,0)`;
      }
    }, []);

    useEffect(() => {
      updateBounds();
      const onResize = () => updateBounds();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [updateBounds, items.length]);

    // Single RAF loop that never changes identity
    const tick = useCallback((ts: number) => {
      // Stop if not needed
      if (draggingRef.current || maxScrollRef.current <= 0) {
        lastTsRef.current = ts;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (lastTsRef.current != null) {
        const dt = ts - lastTsRef.current;
        const px = (speed * dt) / 1000;

        let x = currentXRef.current;
        if (dirRef.current === "left") {
          x -= px;
          if (x <= -maxScrollRef.current) {
            x = -maxScrollRef.current;
            dirRef.current = "right";
          }
        } else {
          x += px;
          if (x >= 0) {
            x = 0;
            dirRef.current = "left";
          }
        }
        currentXRef.current = x;

        if (contentRef.current) {
          // mutate style directly to avoid re-render per frame
          contentRef.current.style.transform = `translate3d(${x}px,0,0)`;
        }
      }

      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    }, [speed]);

    useEffect(() => {
      // start loop once
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(tick);
      }
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      };
    }, [tick]);

    // Pointer drag
    useEffect(() => {
      const c = containerRef.current;
      if (!c) return;

      let startX = 0;
      let startPos = 0;
      let moved = false;

      const onPointerDown = (e: PointerEvent) => {
        c.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startPos = currentXRef.current;
        moved = false;
        draggingRef.current = false;
        setIsDraggingUI(false);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (startX === 0 && startPos === 0) return;
        const dist = e.clientX - startX;
        if (!moved && Math.abs(dist) > 5) {
          moved = true;
          draggingRef.current = true;
          setIsDraggingUI(true);
        }
        if (moved) {
          const nx = Math.max(-maxScrollRef.current, Math.min(0, startPos + dist));
          currentXRef.current = nx;
          if (contentRef.current) {
            contentRef.current.style.transform = `translate3d(${nx}px,0,0)`;
          }
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        try { c.releasePointerCapture(e.pointerId); } catch {}
        // bias direction a bit based on where we ended
        const x = currentXRef.current;
        if (x <= -maxScrollRef.current * 0.8) dirRef.current = "right";
        else if (x >= -maxScrollRef.current * 0.2) dirRef.current = "left";
        draggingRef.current = false;
        setIsDraggingUI(false);
        startX = 0;
        startPos = 0;
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
    }, []);

    // Random glow, with proper cleanup
    useEffect(() => {
      const schedule = () => {
        const delay = 2000 + Math.random() * 4000;
        glowRootTimeout.current = window.setTimeout(() => {
          const idx = Math.floor(Math.random() * items.length);
          const color = glowColors[Math.floor(Math.random() * glowColors.length)];
          setGlowIndex(idx);
          setGlowColor(color);
          glowClearTimeout.current = window.setTimeout(() => {
            setGlowIndex(-1);
            schedule();
          }, 3000);
        }, delay);
      };
      schedule();
      return () => {
        if (glowRootTimeout.current) window.clearTimeout(glowRootTimeout.current);
        if (glowClearTimeout.current) window.clearTimeout(glowClearTimeout.current);
      };
    }, [items.length]);

    return (
      <div
        ref={containerRef}
        className="pong-marquee"
        style={{
          cursor: isDraggingUI ? "grabbing" : "grab",
          userSelect: "none",
          overflow: "hidden",
          position: "relative",
          minHeight: "48px",
          // Cheaper than masking on some GPUs: overlay fades
          // If you prefer mask, replace with your original
        }}
      >
        {/* Edge fade overlays */}
        <div
          aria-hidden
          style={{
            pointerEvents: "none",
            position: "absolute",
            inset: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "40px",
              background:
                "linear-gradient(to right, rgba(0,0,0,1), rgba(0,0,0,0))",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: "40px",
              background:
                "linear-gradient(to left, rgba(0,0,0,1), rgba(0,0,0,0))",
            }}
          />
        </div>

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
          // stop pointer down from triggering button focus while dragging
          onPointerDown={(e) => e.preventDefault()}
        >
          {items.map((prompt, i) => (
            <button
              key={`${prompt.label}-${i}`}
              onClick={(e) => {
                e.stopPropagation();
                // ignore taps that were drags
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
      <PongMarquee items={textPrompts} speed={25} initialDirection="left" />
      <PongMarquee items={imagePrompts} speed={20} initialDirection="right" />
    </div>
  );
}