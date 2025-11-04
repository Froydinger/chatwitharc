import { useState, useEffect, useRef } from "react";

interface TypewriterTextProps {
  text: string;
  speed?: number;
  className?: string;
  shouldAnimate?: boolean;
  onTyping?: () => void; // Callback during typing for scroll
}

export const TypewriterText = ({ 
  text, 
  speed = 1, // Faster default speed
  className = "", 
  shouldAnimate = true,
  onTyping
}: TypewriterTextProps) => {
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? "" : text);
  const [currentIndex, setCurrentIndex] = useState(shouldAnimate ? 0 : text.length);
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayedText(text);
      setCurrentIndex(text.length);
      return;
    }

    if (currentIndex >= text.length) return;

    // Use requestAnimationFrame for smoother animation
    const animate = (timestamp: number) => {
      if (lastUpdateRef.current === 0) {
        lastUpdateRef.current = timestamp;
      }

      const elapsed = timestamp - lastUpdateRef.current;

      // Add characters based on elapsed time and speed
      if (elapsed >= speed) {
        const charsToAdd = Math.max(1, Math.min(5, Math.floor(elapsed / speed)));
        const newIndex = Math.min(currentIndex + charsToAdd, text.length);
        
        setDisplayedText(text.slice(0, newIndex));
        setCurrentIndex(newIndex);
        lastUpdateRef.current = timestamp;
        
        // Trigger scroll callback during typing
        onTyping?.();
      }

      if (currentIndex < text.length) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [currentIndex, text, speed, shouldAnimate, onTyping]);

  // Reset when text changes
  useEffect(() => {
    if (shouldAnimate) {
      setDisplayedText("");
      setCurrentIndex(0);
      lastUpdateRef.current = 0;
    } else {
      setDisplayedText(text);
      setCurrentIndex(text.length);
    }
  }, [text, shouldAnimate]);

  return (
    <p className={`relative z-10 text-foreground whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {displayedText}
      {shouldAnimate && currentIndex < text.length && (
        <span className="inline-block w-[2px] h-5 bg-primary animate-pulse ml-0.5" />
      )}
    </p>
  );
};