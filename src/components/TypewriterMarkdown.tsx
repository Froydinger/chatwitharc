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
  speed = 8,
  className = "",
  shouldAnimate = true,
  onTyping,
}: TypewriterMarkdownProps) => {
  const [displayedText, setDisplayedText] = useState("");
  const currentIndexRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onTypingRef = useRef(onTyping);
  const isAnimatingRef = useRef(false);
  const textRef = useRef(text);

  // Keep text ref updated for interval access
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  // Dynamic speed calculation based on REMAINING text - called every tick
  const getTickParams = useCallback((currentIdx: number, totalLength: number) => {
    const remaining = totalLength - currentIdx;
    
    // Catchup mode - if we're very behind, burst more characters
    if (remaining > 500) {
      return { speed: 3, chars: 10 }; // Very fast catchup
    }
    if (remaining > 300) {
      return { speed: 4, chars: 8 }; // Fast catchup
    }
    if (remaining > 150) {
      return { speed: 5, chars: 5 }; // Moderate catchup
    }
    if (remaining > 80) {
      return { speed: 6, chars: 4 }; // Slight catchup
    }
    if (remaining > 40) {
      return { speed: 8, chars: 3 }; // Normal fast
    }
    // Near the end - smooth readable finish
    return { speed: 12, chars: 2 };
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
    if (isAnimatingRef.current && intervalRef.current) {
      return;
    }

    // Start fresh animation with adaptive speed
    isAnimatingRef.current = true;
    
    const tick = () => {
      const currentIndex = currentIndexRef.current;
      const currentText = textRef.current;

      if (currentIndex >= currentText.length) {
        // Text might still be streaming - keep interval alive but wait
        return;
      }

      // Get dynamic params based on how much is remaining
      const { chars } = getTickParams(currentIndex, currentText.length);
      
      const newIndex = Math.min(currentIndex + chars, currentText.length);
      currentIndexRef.current = newIndex;
      setDisplayedText(currentText.slice(0, newIndex));
      onTypingRef.current?.();
    };

    // Use a base interval but process multiple chars per tick based on remaining
    intervalRef.current = setInterval(tick, 6);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isAnimatingRef.current = false;
    };
  }, [shouldAnimate, getTickParams]);

  // Handle text updates during animation
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
