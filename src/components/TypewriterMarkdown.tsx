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
  const [displayedText, setDisplayedText] = useState("");
  const currentIndexRef = useRef(0);
  const fullTextRef = useRef(text);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onTypingRef = useRef(onTyping);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  useEffect(() => {
    // Update the full text reference
    fullTextRef.current = text;

    if (!shouldAnimate) {
      setDisplayedText(text);
      currentIndexRef.current = text.length;
      return;
    }

    // If no interval is running, start typing
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        const targetText = fullTextRef.current;
        const currentIndex = currentIndexRef.current;

        if (currentIndex >= targetText.length) {
          // Finished typing
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }

        // Type multiple characters for speed
        const charsToAdd = Math.min(4, targetText.length - currentIndex);
        currentIndexRef.current += charsToAdd;
        setDisplayedText(targetText.slice(0, currentIndexRef.current));

        onTypingRef.current?.();
      }, speed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
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
