import { useState, useEffect } from "react";

interface TypewriterTextProps {
  text: string;
  speed?: number;
  className?: string;
  shouldAnimate?: boolean;
}

export const TypewriterText = ({ text, speed = 7, className = "", shouldAnimate = true }: TypewriterTextProps) => {
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? "" : text);
  const [currentIndex, setCurrentIndex] = useState(shouldAnimate ? 0 : text.length);

  useEffect(() => {
    if (shouldAnimate && currentIndex < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timer);
    }
  }, [currentIndex, text, speed, shouldAnimate]);

  // Reset when text changes
  useEffect(() => {
    if (shouldAnimate) {
      setDisplayedText("");
      setCurrentIndex(0);
    } else {
      setDisplayedText(text);
      setCurrentIndex(text.length);
    }
  }, [text, shouldAnimate]);

  return (
    <p className={`relative z-10 text-foreground whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {displayedText}
      {shouldAnimate && currentIndex < text.length && (
        <span className="animate-pulse">|</span>
      )}
    </p>
  );
};