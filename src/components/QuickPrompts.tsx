import { useRef, useEffect, useState, useCallback } from "react";

interface QuickPromptsProps {
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
}

export function QuickPrompts({ quickPrompts, onTriggerPrompt }: QuickPromptsProps) {
  // Text conversation prompts
  const textPrompts = [
    { label: "Plan my day", prompt: "Help me plan my day effectively" },
    { label: "Explain concept", prompt: "Explain a complex concept in simple terms" },
    { label: "Write email", prompt: "Help me write a professional email" },
    { label: "Brainstorm ideas", prompt: "Let's brainstorm creative ideas together" },
    { label: "Solve problem", prompt: "Help me solve a challenging problem" },
    { label: "Learn something", prompt: "Teach me something interesting today" },
    { label: "Get advice", prompt: "I need some thoughtful advice" },
    { label: "Make decision", prompt: "Help me make an important decision" }
  ];

  // Detailed image generation prompts
  const imagePrompts = [
    { label: "Cosmic landscape", prompt: "Create a breathtaking cosmic landscape with swirling galaxies, nebulae in vibrant purples and blues, distant planets, and ethereal lighting effects" },
    { label: "Futuristic city", prompt: "Generate a stunning futuristic cityscape at sunset with towering glass spires, flying vehicles, neon lights, and advanced architecture reflecting golden hour lighting" },
    { label: "Mystical forest", prompt: "Design an enchanted mystical forest with ancient towering trees, glowing mushrooms, magical fireflies, misty atmosphere, and dappled sunlight filtering through leaves" },
    { label: "Ocean depths", prompt: "Create an underwater scene in the deep ocean with bioluminescent creatures, coral reefs, schools of tropical fish, and rays of sunlight penetrating the water" },
    { label: "Mountain vista", prompt: "Generate a majestic mountain landscape at dawn with snow-capped peaks, alpine lakes, wildflower meadows, and dramatic cloud formations in the sky" },
    { label: "Desert oasis", prompt: "Design a beautiful desert oasis with palm trees, crystal clear water, sand dunes, cacti, and a stunning sunset sky with warm golden and orange tones" },
    { label: "Fantasy castle", prompt: "Create a magnificent fantasy castle on a cliff with multiple towers, flowing banners, a waterfall, surrounding clouds, and magical aurora in the night sky" },
    { label: "Abstract art", prompt: "Generate an abstract artistic composition with flowing organic shapes, vibrant color gradients, dynamic patterns, and harmonious geometric elements" }
  ];

  const PongMarquee: React.FC<{
    items: Array<{ label: string; prompt: string }>;
    speed?: number;
    initialDirection?: 'left' | 'right';
  }> = ({ items, speed = 30, initialDirection = 'left' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [currentX, setCurrentX] = useState(0);
    const [maxScroll, setMaxScroll] = useState(0);
    const [direction, setDirection] = useState<'left' | 'right'>(initialDirection);
    const animationRef = useRef<number>();
    const lastTimeRef = useRef<number>();

    // Calculate boundaries
    const updateBoundaries = useCallback(() => {
      if (!containerRef.current || !contentRef.current) return;
      
      const containerWidth = containerRef.current.offsetWidth;
      const contentWidth = contentRef.current.scrollWidth;
      const maxScrollValue = Math.max(0, contentWidth - containerWidth);
      setMaxScroll(maxScrollValue);
    }, []);

    useEffect(() => {
      updateBoundaries();
      window.addEventListener('resize', updateBoundaries);
      return () => window.removeEventListener('resize', updateBoundaries);
    }, [updateBoundaries, items]);

    // Animation loop with ping-pong behavior
    const animate = useCallback((timestamp: number) => {
      if (!isDragging && maxScroll > 0) {
        if (lastTimeRef.current) {
          const deltaTime = timestamp - lastTimeRef.current;
          const distance = (speed * deltaTime) / 1000;
          
          setCurrentX(prev => {
            let newX = prev;
            
            if (direction === 'left') {
              newX = prev - distance;
              // Hit left boundary - bounce to right
              if (newX <= -maxScroll) {
                setDirection('right');
                return -maxScroll;
              }
            } else {
              newX = prev + distance;
              // Hit right boundary - bounce to left
              if (newX >= 0) {
                setDirection('left');
                return 0;
              }
            }
            
            return newX;
          });
        }
      }

      lastTimeRef.current = timestamp;
      animationRef.current = requestAnimationFrame(animate);
    }, [isDragging, speed, direction, maxScroll]);

    useEffect(() => {
      lastTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(animate);
      
      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }, [animate]);

    // Apply transform
    useEffect(() => {
      if (contentRef.current) {
        const constrainedX = Math.max(-maxScroll, Math.min(0, currentX));
        contentRef.current.style.transform = `translate3d(${constrainedX}px, 0, 0)`;
      }
    }, [currentX, maxScroll]);

    // Drag handlers with direction setting
    const handleStart = useCallback((clientX: number) => {
      setIsDragging(true);
      const startX = clientX - (containerRef.current?.offsetLeft || 0);
      let lastMoveX = startX;
      
      const handleMove = (moveX: number) => {
        const x = moveX - (containerRef.current?.offsetLeft || 0);
        const walk = x - startX;
        const newX = Math.max(-maxScroll, Math.min(0, currentX + walk));
        setCurrentX(newX);
        
        // Track drag direction for when user releases
        if (moveX !== lastMoveX) {
          setDirection(moveX > lastMoveX ? 'right' : 'left');
          lastMoveX = moveX;
        }
      };

      const handleEnd = () => {
        setIsDragging(false);
        
        // Set direction based on current position when released
        setCurrentX(prev => {
          if (prev <= -maxScroll * 0.9) {
            setDirection('right'); // Near left edge, move right
          } else if (prev >= -maxScroll * 0.1) {
            setDirection('left'); // Near right edge, move left
          }
          // Otherwise keep current direction
          return prev;
        });
        
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
      };

      const handleMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        handleMove(e.pageX);
      };

      const handleTouchMove = (e: TouchEvent) => {
        handleMove(e.touches[0].pageX);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleEnd);
    }, [currentX, maxScroll]);

    return (
      <div 
        ref={containerRef}
        className="pong-marquee"
        onMouseDown={(e) => handleStart(e.pageX)}
        onTouchStart={(e) => handleStart(e.touches[0].pageX)}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflow: 'hidden',
          position: 'relative',
          minHeight: '48px',
          maskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)'
        }}
      >
        <div 
          ref={contentRef}
          className="pong-marquee-content"
          style={{
            display: 'flex',
            gap: '12px',
            whiteSpace: 'nowrap',
            willChange: 'transform',
            paddingLeft: '20px',
            paddingRight: '20px'
          }}
        >
          {items.map((prompt, i) => (
            <button 
              key={i}
              onClick={() => onTriggerPrompt(prompt.prompt)}
              className="prompt-pill"
              style={{
                pointerEvents: isDragging ? 'none' : 'auto',
                flexShrink: 0
              }}
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