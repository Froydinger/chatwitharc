import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/CodeBlock";
import { FileAttachment } from "@/components/FileAttachment";
import { MediaEmbed, getYouTubeVideoId, isImageUrl } from "@/components/MediaEmbed";

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
          p: ({ node, ...props }) => <p className="text-base leading-relaxed mb-4 last:mb-0 text-foreground/90" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-foreground/85" {...props} />,
          a: ({ node, href, children, ...props }: any) => {
            // Detect file URLs from Supabase storage - check multiple patterns
            const isGeneratedFile = href && (
              href.includes('/storage/v1/object/public/generated-files/') ||
              href.includes('.supabase.co/storage/') ||
              href.includes('generated-files/')
            );

            if (isGeneratedFile) {
              const urlParts = href.split('/');
              const fullFileName = urlParts[urlParts.length - 1];
              // Remove URL encoding and the generated- prefix with timestamp
              const decodedFileName = decodeURIComponent(fullFileName);
              const fileName = decodedFileName.replace(/^generated-\d+-/, '');
              const fileExt = fileName.split('.').pop()?.toLowerCase() || 'file';

              return (
                <div className="my-4">
                  <FileAttachment
                    fileName={fileName}
                    fileUrl={href}
                    fileType={fileExt}
                    className="max-w-md"
                  />
                </div>
              );
            }

            // Detect YouTube links and embed them
            if (href && getYouTubeVideoId(href)) {
              const linkText = typeof children === 'string' ? children :
                (Array.isArray(children) ? children.join('') : String(children));
              return (
                <div className="my-4">
                  <MediaEmbed
                    url={href}
                    title={linkText !== href ? linkText : undefined}
                  />
                </div>
              );
            }

            // Detect direct image URLs and embed them
            if (href && isImageUrl(href)) {
              const linkText = typeof children === 'string' ? children :
                (Array.isArray(children) ? children.join('') : String(children));
              return (
                <div className="my-4">
                  <MediaEmbed
                    url={href}
                    title={linkText !== href ? linkText : undefined}
                  />
                </div>
              );
            }

            return <a href={href} className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
          },
          ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-4 space-y-2.5 marker:text-primary/60" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-6 mb-4 space-y-2.5 marker:text-primary/60" {...props} />,
          li: ({ node, ...props }) => (
            <li className="text-base leading-relaxed text-foreground/90 pl-1" {...props} />
          ),
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-3 text-foreground" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mt-5 mb-2.5 text-foreground" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-base font-semibold mt-3 mb-1.5 text-foreground" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-[3px] border-primary/40 pl-4 py-1 my-4 bg-primary/5 rounded-r-lg italic text-muted-foreground" {...props} />
          ),
          hr: ({ node, ...props }) => <hr className="my-6 border-t border-border/50" {...props} />,
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-muted/50 border-b border-border/50" {...props} />,
          tbody: ({ node, ...props }) => <tbody className="divide-y divide-border/30" {...props} />,
          tr: ({ node, ...props }) => <tr className="hover:bg-muted/30 transition-colors" {...props} />,
          th: ({ node, ...props }) => <th className="px-4 py-2.5 text-left font-semibold text-foreground" {...props} />,
          td: ({ node, ...props }) => <td className="px-4 py-2.5 text-foreground/90" {...props} />,
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
