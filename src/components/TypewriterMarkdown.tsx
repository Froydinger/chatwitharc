import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TypewriterMarkdownProps {
  text: string;
  speed?: number;
  className?: string;
  shouldAnimate?: boolean;
  onTyping?: () => void;
}

export const TypewriterMarkdown = ({
  text,
  speed = 2,
  className = "",
  shouldAnimate = true,
  onTyping,
}: TypewriterMarkdownProps) => {
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? "" : text);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onTypingRef = useRef(onTyping);
  const previousTextRef = useRef(text);
  const isTypingRef = useRef(false);

  // Keep the ref updated without triggering re-renders
  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayedText(text);
      previousTextRef.current = text;
      return;
    }

    // Only restart if text actually changed AND we're not currently typing
    // OR if the new text is completely different (not just longer)
    const textChanged = previousTextRef.current !== text;
    const isNewMessage = !text.startsWith(previousTextRef.current) && !previousTextRef.current.startsWith(text);

    if (!textChanged || (isTypingRef.current && !isNewMessage)) {
      return;
    }

    previousTextRef.current = text;

    // Reset to start
    setDisplayedText("");
    let currentIndex = 0;
    isTypingRef.current = true;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Type characters quickly
    intervalRef.current = setInterval(() => {
      if (currentIndex >= text.length) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        isTypingRef.current = false;
        return;
      }

      // Add 4 characters at a time for fast typing
      const charsToAdd = Math.min(4, text.length - currentIndex);
      currentIndex += charsToAdd;
      setDisplayedText(text.slice(0, currentIndex));

      // Trigger scroll callback during typing
      onTypingRef.current?.();
    }, speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [text, speed, shouldAnimate]);

  return (
    <div className={`relative z-10 text-foreground whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          a: ({ node, ...props }) => <a className="text-primary underline hover:text-primary/80" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-2" {...props} />,
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
        }}
      >
        {displayedText}
      </ReactMarkdown>
      {shouldAnimate && displayedText.length < text.length && (
        <span className="inline-block w-[2px] h-5 bg-primary animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
};
