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
  speed = 15, // Smooth, readable typing speed (15ms per batch)
  className = "",
  shouldAnimate = true,
  onTyping
}: TypewriterTextProps) => {
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? "" : text);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayedText(text);
      return;
    }

    // Reset to start
    setDisplayedText("");
    let currentIndex = 0;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Type characters smoothly
    intervalRef.current = setInterval(() => {
      if (currentIndex >= text.length) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        return;
      }

      // Add 2 characters at a time for smooth, readable typing
      const charsToAdd = Math.min(2, text.length - currentIndex);
      currentIndex += charsToAdd;
      setDisplayedText(text.slice(0, currentIndex));

      // Trigger scroll callback during typing
      onTyping?.();
    }, speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [text, speed, shouldAnimate, onTyping]);

  return (
    <div className={`relative z-10 text-foreground whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {displayedText}
    </div>
  );
};