import { useCallback, useEffect, useMemo, useState } from "react";
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
  onTyping?: () => void;
}

interface RevealState {
  count: number;
  enteringFrom: number;
}

const tokenizeText = (value: string) => value.match(/\s+|\S+/g) ?? [];

const countWords = (tokens: string[]) => tokens.reduce((sum, token) => sum + (/^\s+$/.test(token) ? 0 : 1), 0);

const getPrefixByWords = (tokens: string[], wordLimit: number) => {
  if (wordLimit <= 0) return "";

  const visible: string[] = [];
  let words = 0;

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (words > 0 && words < wordLimit) visible.push(token);
      continue;
    }

    if (words >= wordLimit) break;
    visible.push(token);
    words += 1;
  }

  return visible.join("");
};

/**
 * Hide trailing, not-yet-closed markdown delimiters so partially-streamed
 * formatting (e.g. `**bol`, `*ital`, `` `cod ``, `[lin`) doesn't render as
 * literal punctuation and then snap into formatted text once it closes.
 * We trim the dangling tail from the visible slice; it reappears (correctly
 * formatted) on the next tick when the closer arrives.
 */
const hideUnclosedMarkdownTail = (input: string): string => {
  if (!input) return input;

  // Don't touch fenced code blocks while open — let them stream raw.
  const fenceCount = (input.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) return input;

  let out = input;

  // Unclosed link/image: `[text` or `[text](partial`
  const lastOpenBracket = out.lastIndexOf("[");
  if (lastOpenBracket !== -1) {
    const tail = out.slice(lastOpenBracket);
    // Closed link looks like [..](..)
    if (!/^!?\[[^\]]*\]\([^)]*\)/.test(tail)) {
      out = out.slice(0, lastOpenBracket);
    }
  }

  // Unclosed inline tokens at the very tail: **, __, *, _, `, ~~
  // Walk delimiters from longest to shortest.
  const trimDangling = (s: string, delim: string): string => {
    const occurrences = s.split(delim).length - 1;
    if (occurrences % 2 === 0) return s;
    const idx = s.lastIndexOf(delim);
    return idx === -1 ? s : s.slice(0, idx);
  };

  for (const delim of ["**", "__", "~~", "`", "*", "_"]) {
    out = trimDangling(out, delim);
  }

  return out;
};

/**
 * Renders assistant markdown with a real per-word reveal queue.
 * Only the revealed prefix is mounted, so large backend chunks cannot blip the
 * full response into view. Newly released words get a one-shot blur-to-crisp
 * keyframe while already-revealed words stay stable.
 */
export const WordStreamMarkdown = ({
  text,
  className = "",
  shouldAnimate = true,
  onTyping,
}: WordStreamMarkdownProps) => {
  const tokens = useMemo(() => tokenizeText(text), [text]);
  const totalWords = useMemo(() => countWords(tokens), [tokens]);
  const animateWords = shouldAnimate && totalWords <= 6000;

  const [revealState, setRevealState] = useState<RevealState>(() => ({
    count: animateWords ? 0 : totalWords,
    enteringFrom: 0,
  }));

  useEffect(() => {
    if (!animateWords) {
      setRevealState({ count: totalWords, enteringFrom: totalWords });
      return;
    }

    setRevealState((state) => {
      if (state.count <= totalWords) return state;
      return { count: totalWords, enteringFrom: totalWords };
    });
  }, [animateWords, totalWords]);

  useEffect(() => {
    if (!animateWords || revealState.count >= totalWords) return;

    const behind = totalWords - revealState.count;
    // Slightly slower cadence so each word's blur-in finishes before the next starts.
    const interval = behind > 240 ? 32 : behind > 120 ? 48 : behind > 48 ? 64 : 80;

    const id = window.setTimeout(() => {
      setRevealState((state) => {
        const next = Math.min(totalWords, state.count + 1);
        return { count: next, enteringFrom: next - 1 };
      });
      onTyping?.();
    }, interval);

    return () => window.clearTimeout(id);
  }, [animateWords, onTyping, revealState.count, totalWords]);

  const visibleText = useMemo(
    () => hideUnclosedMarkdownTail(animateWords ? getPrefixByWords(tokens, revealState.count) : text),
    [animateWords, revealState.count, text, tokens]
  );

  const renderTextWithWords = useCallback((children: any, cursor: { i: number }): any => {
    if (!animateWords) return children;

    const wrap = (str: string, keyPrefix: string) => {
      const parts = str.split(/(\s+)/);
      return parts.map((p, i) => {
        if (/^\s+$/.test(p) || p === "") {
          return <span key={`${keyPrefix}-${i}`}>{p}</span>;
        }
        const idx = cursor.i;
        cursor.i += 1;
        const isEntering = idx === revealState.count - 1;
        return (
          <span
            key={`arc-word-${idx}`}
            className={isEntering ? "arc-word arc-word-entering" : "arc-word"}
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
  }, [animateWords, revealState.count, revealState.enteringFrom]);

  const components = useMemo(() => {
    const cursor = { i: 0 };
    return {
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
            {children}
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
  }, [renderTextWithWords]);

  return (
    <div className={`relative z-10 text-foreground break-words ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {visibleText}
      </ReactMarkdown>
    </div>
  );
};
