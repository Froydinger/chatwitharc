import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/CodeBlock";

interface TypewriterMarkdownProps {
  text: string;
  speed?: number;
  className?: string;
  shouldAnimate?: boolean;
  onTyping?: () => void;
}

export const TypewriterMarkdown = ({
  text,
  speed = 8, // Faster base speed for longer messages
  className = "",
  shouldAnimate = true,
  onTyping,
}: TypewriterMarkdownProps) => {
  const [displayedText, setDisplayedText] = useState("");
  const currentIndexRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onTypingRef = useRef(onTyping);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  // Calculate dynamic speed based on text length - faster for longer messages
  const getDynamicSpeed = useCallback((textLength: number) => {
    if (textLength > 2000) return 4; // Very long: super fast
    if (textLength > 1000) return 6; // Long: fast
    if (textLength > 500) return 8;  // Medium: normal-fast
    return 10; // Short: readable speed
  }, []);

  // Calculate chars per tick based on text length
  const getCharsPerTick = useCallback((textLength: number) => {
    if (textLength > 2000) return 6; // Very long: 6 chars at a time
    if (textLength > 1000) return 4; // Long: 4 chars
    if (textLength > 500) return 3;  // Medium: 3 chars
    return 2; // Short: 2 chars for smooth effect
  }, []);

  useEffect(() => {
    if (!shouldAnimate) {
      // Immediately show full text if animation disabled
      setDisplayedText(text);
      currentIndexRef.current = text.length;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isAnimatingRef.current = false;
      return;
    }

    // If we're already animating, just let it continue with the new text target
    // Don't restart the interval - just update what we're typing towards
    if (isAnimatingRef.current && intervalRef.current) {
      // The interval will naturally pick up the new text length
      return;
    }

    // Start fresh animation
    const dynamicSpeed = getDynamicSpeed(text.length);
    const charsPerTick = getCharsPerTick(text.length);
    
    isAnimatingRef.current = true;
    
    intervalRef.current = setInterval(() => {
      const currentIndex = currentIndexRef.current;

      if (currentIndex >= text.length) {
        // Check if text might still be growing (streaming)
        // Keep interval alive but don't increment
        return;
      }

      // Add multiple characters at a time based on text length
      const newIndex = Math.min(currentIndex + charsPerTick, text.length);
      currentIndexRef.current = newIndex;
      setDisplayedText(text.slice(0, newIndex));

      onTypingRef.current?.();
    }, dynamicSpeed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isAnimatingRef.current = false;
    };
  }, [shouldAnimate]); // Only restart on shouldAnimate change, not text

  // Separate effect to handle text updates during animation
  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayedText(text);
      currentIndexRef.current = text.length;
    }
    // If animating, the interval will naturally catch up to new text length
  }, [text, shouldAnimate]);

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
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
          code: ({ node, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeContent = String(children).replace(/\n$/, '');
            const isInline = !className && !match;

            // Block code - use CodeBlock component
            if (!isInline && match) {
              return (
                <CodeBlock
                  code={codeContent}
                  language={match[1]}
                />
              );
            }

            // Inline code - use styled span
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-sm" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {displayedText}
      </ReactMarkdown>
    </div>
  );
};
