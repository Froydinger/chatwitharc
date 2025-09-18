import { useRef, useEffect, useState, useCallback } from "react";

interface QuickPromptsProps {
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
}

export function QuickPrompts({ quickPrompts, onTriggerPrompt }: QuickPromptsProps) {
  const SmoothMarquee: React.FC<{
    items: typeof quickPrompts;
    speed?: number; // pixels per second
    direction?: 'left' | 'right';
  }> = ({ items, speed = 50, direction = 'left' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [currentX, setCurrentX] = useState(0);
    const animationRef = useRef<number>();
    const lastTimeRef = useRef<number>();

    // Animation loop
    const animate = useCallback((timestamp: number) => {
      if (!containerRef.current || !contentRef.current) return;

      const container = containerRef.current;
      const content = contentRef.current;
      const containerWidth = container.offsetWidth;
      const contentWidth = content.offsetWidth / 3; // Each set is 1/3 of total width

      if (!isDragging) {
        if (lastTimeRef.current) {
          const deltaTime = timestamp - lastTimeRef.current;
          const distance = (speed * deltaTime) / 1000;
          
          if (direction === 'left') {
            setCurrentX(prev => {
              const newX = prev - distance;
              // Reset to seamless loop position when we've moved one full content width
              if (newX <= -contentWidth) {
                return newX + contentWidth;
              }
              return newX;
            });
          } else {
            setCurrentX(prev => {
              const newX = prev + distance;
              // Reset to seamless loop position
              if (newX >= 0) {
                return newX - contentWidth;
              }
              return newX;
            });
          }
        }
      }

      lastTimeRef.current = timestamp;
      animationRef.current = requestAnimationFrame(animate);
    }, [isDragging, speed, direction]);

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
        contentRef.current.style.transform = `translate3d(${currentX}px, 0, 0)`;
      }
    }, [currentX]);

    // Mouse drag handlers
    const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      setStartX(e.pageX - (containerRef.current?.offsetLeft || 0));
      setScrollLeft(currentX);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      const x = e.pageX - (containerRef.current?.offsetLeft || 0);
      const walk = x - startX;
      setCurrentX(scrollLeft + walk);
    }, [isDragging, startX, scrollLeft]);

    const handleMouseUp = useCallback(() => {
      setIsDragging(false);
    }, []);

    // Touch handlers for mobile
    const handleTouchStart = (e: React.TouchEvent) => {
      setIsDragging(true);
      setStartX(e.touches[0].pageX - (containerRef.current?.offsetLeft || 0));
      setScrollLeft(currentX);
    };

    const handleTouchMove = useCallback((e: TouchEvent) => {
      if (!isDragging) return;
      const x = e.touches[0].pageX - (containerRef.current?.offsetLeft || 0);
      const walk = x - startX;
      setCurrentX(scrollLeft + walk);
    }, [isDragging, startX, scrollLeft]);

    const handleTouchEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    // Add global event listeners for drag
    useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleTouchMove);
        document.addEventListener('touchend', handleTouchEnd);
      }

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

    return (
      <div 
        ref={containerRef}
        className="smooth-marquee"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflow: 'hidden',
          position: 'relative',
          minHeight: '48px',
          maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)'
        }}
      >
        <div 
          ref={contentRef}
          className="smooth-marquee-content"
          style={{
            display: 'flex',
            gap: '12px',
            whiteSpace: 'nowrap',
            willChange: 'transform'
          }}
        >
          {/* Triple the content for seamless looping */}
          {[...Array(3)].map((_, setIndex) => (
            <div 
              key={setIndex}
              className="smooth-marquee-set"
              style={{
                display: 'flex',
                gap: '12px',
                flexShrink: 0
              }}
            >
              {items.map((prompt, i) => (
                <button 
                  key={`${setIndex}-${i}`}
                  onClick={() => onTriggerPrompt(prompt.prompt)}
                  className="prompt-pill"
                  style={{
                    pointerEvents: isDragging ? 'none' : 'auto'
                  }}
                >
                  <span className="font-medium text-sm">{prompt.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6 mb-16">
      <SmoothMarquee items={quickPrompts.slice(0, 6)} speed={40} direction="left" />
      <SmoothMarquee items={quickPrompts.slice(6)} speed={35} direction="right" />
    </div>
  );
}