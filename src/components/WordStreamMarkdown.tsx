import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/CodeBlock";
import { FileAttachment } from "@/components/FileAttachment";
import { MediaEmbed, getYouTubeVideoId, isImageUrl } from "@/components/MediaEmbed";
import { SvgArtifact } from "@/components/SvgArtifact";

interface WordStreamMarkdownProps {
  text: string;
  className?: string;
  /** When false, all words are immediately revealed (no per-word animation) */
  shouldAnimate?: boolean;
  /** True once no more text is expected for this message */
  isFinal?: boolean;
  onTyping?: () => void;
  onComplete?: () => void;
}

/**
 * Renders assistant markdown with a smooth per-word reveal.
 * Every word is always mounted; visibility is toggled via CSS transition
 * (.arc-word -> .arc-word-shown) which avoids the "blip" of remounts and
 * keeps layout stable.
 */
export const WordStreamMarkdown = ({
  text,
  className = "",
  shouldAnimate = true,
  isFinal = true,
  onTyping,
  onComplete,
}: WordStreamMarkdownProps) => {
  const onTypingRef = useRef(onTyping);
  const onCompleteRef = useRef(onComplete);
  const completedTotalRef = useRef(0);

  useEffect(() => {
    onTypingRef.current = onTyping;
    onCompleteRef.current = onComplete;
  }, [onTyping, onComplete]);

  const totalWords = useMemo(() => {
    const m = text.match(/\S+/g);
    return m ? m.length : 0;
  }, [text]);

  const animateWords = shouldAnimate && totalWords > 0;

  const [revealed, setRevealed] = useState(animateWords ? 0 : totalWords);

  // Steady reveal cadence — paced so it feels like Arc is composing.
  useEffect(() => {
    if (!animateWords) {
      setRevealed(totalWords);
      return;
    }
    if (revealed >= totalWords) return;

    const behind = totalWords - revealed;
    // Manual teleprompter pacing: always one word per tick, even if the
    // complete answer arrived in one chunk.
    const interval = behind > 250 ? 36 : behind > 90 ? 44 : 58;

    const id = window.setTimeout(() => {
      setRevealed((r) => Math.min(totalWords, r + 1));
      onTypingRef.current?.();
    }, interval);
    return () => window.clearTimeout(id);
  }, [revealed, totalWords, animateWords]);

  useEffect(() => {
    if (isFinal && totalWords > 0 && revealed >= totalWords && completedTotalRef.current !== totalWords) {
      completedTotalRef.current = totalWords;
      onCompleteRef.current?.();
    }
  }, [isFinal, revealed, totalWords]);

  // If text shrinks (rare — e.g. message replaced), clamp.
  useEffect(() => {
    if (revealed > totalWords) setRevealed(totalWords);
  }, [totalWords, revealed]);

  const renderTextWithWords = (children: any, cursor: { i: number }): any => {
    if (!animateWords) return children;

    const wrap = (str: string, keyPrefix: string) => {
      const parts = str.split(/(\s+)/);
      return parts.map((p, i) => {
        if (/^\s+$/.test(p) || p === "") {
          return <span key={`${keyPrefix}-${i}`}>{p}</span>;
        }
        const idx = cursor.i;
        cursor.i += 1;
        const shown = idx < revealed;
        return (
          <span
            key={`${keyPrefix}-${i}`}
            className={shown ? "arc-word arc-word-shown" : "arc-word"}
          >
            {p}
          </span>
        );
      });
    };

    const walk = (node: any, keyPrefix: string): any => {
      if (typeof node === "string") {
        return wrap(node, keyPrefix);
      }
      if (Array.isArray(node)) {
        return node.map((c, i) => walk(c, `${keyPrefix}-${i}`));
      }
      return node;
    };

    return walk(children, "w");
  };

  const cursor = { i: 0 };
  const components = {
      p: ({ node, children, ...props }: any) => (
        <p className="text-base leading-relaxed mb-3 last:mb-0 text-foreground/90" {...props}>
          {renderTextWithWords(children, cursor)}
        </p>
      ),
      li: ({ node, children, ...props }: any) => (
        <li className="text-base leading-relaxed text-foreground/90" {...props}>
          {renderTextWithWords(children, cursor)}
        </li>
      ),
      h1: ({ node, children, ...props }: any) => (
        <h1 className="text-2xl font-bold mt-5 mb-2.5 text-foreground" {...props}>
          {renderTextWithWords(children, cursor)}
        </h1>
      ),
      h2: ({ node, children, ...props }: any) => (
        <h2 className="text-xl font-semibold mt-4 mb-2 text-foreground" {...props}>
          {renderTextWithWords(children, cursor)}
        </h2>
      ),
      h3: ({ node, children, ...props }: any) => (
        <h3 className="text-lg font-semibold mt-3 mb-1.5 text-foreground" {...props}>
          {renderTextWithWords(children, cursor)}
        </h3>
      ),
      h4: ({ node, children, ...props }: any) => (
        <h4 className="text-base font-semibold mt-3 mb-1.5 text-foreground" {...props}>
          {renderTextWithWords(children, cursor)}
        </h4>
      ),
      strong: ({ node, children, ...props }: any) => (
        <strong className="font-semibold text-foreground" {...props}>
          {renderTextWithWords(children, cursor)}
        </strong>
      ),
      em: ({ node, children, ...props }: any) => (
        <em className="italic text-foreground/85" {...props}>
          {renderTextWithWords(children, cursor)}
        </em>
      ),
      a: ({ node, href, children, ...props }: any) => {
        const isGeneratedFile = href && (
          href.includes("/storage/v1/object/public/generated-files/") ||
          href.includes(".supabase.co/storage/") ||
          href.includes("generated-files/")
        );
        if (isGeneratedFile) {
          const urlParts = href.split("/");
          const fullFileName = urlParts[urlParts.length - 1];
          const decodedFileName = decodeURIComponent(fullFileName);
          const fileName = decodedFileName.replace(/^generated-\d+-/, "");
          const fileExt = fileName.split(".").pop()?.toLowerCase() || "file";
          return (
            <div className="my-3">
              <FileAttachment fileName={fileName} fileUrl={href} fileType={fileExt} className="max-w-md" />
            </div>
          );
        }
        if (href && getYouTubeVideoId(href)) {
          const linkText = typeof children === "string" ? children : (Array.isArray(children) ? children.join("") : String(children));
          return (
            <div className="my-3">
              <MediaEmbed url={href} title={linkText !== href ? linkText : undefined} />
            </div>
          );
        }
        if (href && isImageUrl(href)) {
          const linkText = typeof children === "string" ? children : (Array.isArray(children) ? children.join("") : String(children));
          return (
            <div className="my-3">
              <MediaEmbed url={href} title={linkText !== href ? linkText : undefined} />
            </div>
          );
        }
        return (
          <a
            href={href}
            className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            {...props}
          >
            {renderTextWithWords(children, cursor)}
          </a>
        );
      },
      ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-3 space-y-1 marker:text-primary/60" {...props} />,
      ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1 marker:text-primary/60" {...props} />,
      blockquote: ({ node, ...props }: any) => (
        <blockquote className="border-l-2 border-primary/40 pl-3 py-0.5 my-3.5 bg-primary/5 rounded-r italic text-muted-foreground" {...props} />
      ),
      hr: ({ node, ...props }: any) => <hr className="my-4 border-t border-border/50" {...props} />,
      table: ({ node, ...props }: any) => (
        <div className="my-2.5 overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-sm" {...props} />
        </div>
      ),
      thead: ({ node, ...props }: any) => <thead className="bg-muted/50 border-b border-border/50" {...props} />,
      tbody: ({ node, ...props }: any) => <tbody className="divide-y divide-border/30" {...props} />,
      tr: ({ node, ...props }: any) => <tr className="hover:bg-muted/30 transition-colors" {...props} />,
      th: ({ node, ...props }: any) => <th className="px-3 py-2 text-left font-semibold text-foreground" {...props} />,
      td: ({ node, ...props }: any) => <td className="px-3 py-2 text-foreground/90" {...props} />,
      code: ({ node, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || "");
        const codeContent = String(children).replace(/\n$/, "");
        const isInline = !className && !match;
        if (!isInline && match) {
          if (match[1].toLowerCase() === "svg") {
            return <SvgArtifact svgCode={codeContent} />;
          }
          return <CodeBlock code={codeContent} language={match[1]} />;
        }
        return (
          <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-sm" {...props}>
            {children}
          </code>
        );
      },
    };

  return (
    <div className={`relative z-10 text-foreground break-words ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
};
