import { useState, useEffect, useRef } from "react";
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
  const fullTextRef = useRef(text);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
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

    // Use requestAnimationFrame for smoother, more performant typing
    const animate = (currentTime: number) => {
      const targetText = fullTextRef.current;
      const currentIndex = currentIndexRef.current;

      if (currentIndex >= targetText.length) {
        // Finished typing
        animationFrameRef.current = null;
        return;
      }

      // Only update every `speed` milliseconds for controlled speed
      if (currentTime - lastUpdateTimeRef.current >= speed) {
        // Type multiple characters for speed (more = faster)
        const charsToAdd = Math.min(6, targetText.length - currentIndex);
        currentIndexRef.current += charsToAdd;
        setDisplayedText(targetText.slice(0, currentIndexRef.current));
        lastUpdateTimeRef.current = currentTime;
        onTypingRef.current?.();
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation if not already running
    if (!animationFrameRef.current) {
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
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
      {shouldAnimate && displayedText.length < text.length && (
        <span className="inline-block w-[2px] h-5 bg-primary animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
};
