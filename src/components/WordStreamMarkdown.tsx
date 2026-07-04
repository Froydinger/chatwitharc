import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CodeBlock } from "@/components/CodeBlock";
import { FileAttachment } from "@/components/FileAttachment";
import { MediaEmbed, getYouTubeVideoId, isImageUrl } from "@/components/MediaEmbed";
import { SvgArtifact } from "@/components/SvgArtifact";
import { MermaidDiagram } from "@/components/MermaidDiagram";

interface WordStreamMarkdownProps {
  text: string;
  className?: string;
  /** When false, all words are immediately revealed (no per-word animation) */
  shouldAnimate?: boolean;
  onTyping?: () => void;
  onComplete?: () => void;
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
 * Keep partially-streamed inline markdown rendering smoothly: instead of
 * hiding the dangling tail (which causes formatted words to "pop in" once
 * the closer arrives), append a synthetic closer so the text renders
 * already-formatted while the real closer is still on its way. The synthetic
 * closer is silently replaced once the real one streams in — no visual jump.
 * Unclosed link/image syntax is still trimmed because we can't fabricate an
 * href.
 */
const hideUnclosedMarkdownTail = (input: string): string => {
  if (!input) return input;

  // Don't touch fenced code blocks while open — let them stream raw.
  const fenceCount = (input.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) return input;

  let out = input;

  // Unclosed link/image: only strip genuinely unfinished syntax. Completed
  // bracket text like citations (`[1]`) must stay visible while streaming.
  const lastOpenBracket = out.lastIndexOf("[");
  if (lastOpenBracket !== -1) {
    const tail = out.slice(lastOpenBracket);
    const closeBracketIndex = tail.indexOf("]");
    const hasOpenParenAfterBracket = closeBracketIndex !== -1 && tail[closeBracketIndex + 1] === "(";
    const hasClosedParen = hasOpenParenAfterBracket && tail.indexOf(")", closeBracketIndex + 2) !== -1;

    if (closeBracketIndex === -1 || (hasOpenParenAfterBracket && !hasClosedParen)) {
      out = out.slice(0, lastOpenBracket);
    }
  }

  const appendCloserForDelimiter = (s: string, delim: "**" | "__" | "~~" | "`" | "*" | "_"): string => {
    const canOpen = (index: number) => {
      const before = s[index - 1] ?? " ";
      const after = s[index + delim.length] ?? "";
      return after !== "" && !/\s/.test(after) && (delim === "`" || !/\w/.test(before));
    };

    const canClose = (index: number) => {
      const before = s[index - 1] ?? "";
      const after = s[index + delim.length] ?? " ";
      return before !== "" && !/\s/.test(before) && (delim === "`" || !/\w/.test(after));
    };

    let openIndex = -1;
    for (let i = 0; i < s.length;) {
      if (delim.length === 1 && s.startsWith(delim + delim, i)) {
        i += 2;
        continue;
      }
      if (!s.startsWith(delim, i) || (delim === "_" && s.startsWith("__", i))) {
        i += 1;
        continue;
      }

      if (openIndex !== -1 && canClose(i)) openIndex = -1;
      else if (openIndex === -1 && canOpen(i)) openIndex = i;
      i += delim.length;
    }

    if (openIndex === -1) return s;
    const tailAfter = s.slice(openIndex + delim.length);
    if (tailAfter.length === 0) return s.slice(0, openIndex);
    return s + delim;
  };

  for (const delim of ["**", "__", "~~", "`", "*", "_"] as const) {
    out = appendCloserForDelimiter(out, delim);
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
  onComplete,
}: WordStreamMarkdownProps) => {
  const tokens = useMemo(() => tokenizeText(text), [text]);
  const totalWords = useMemo(() => countWords(tokens), [tokens]);
  const animateWords = shouldAnimate && totalWords <= 6000;

  const [revealedCount, setRevealedCount] = useState<number>(() => (animateWords ? 0 : totalWords));
  const completedWordCountRef = useRef(-1);
  const cursorRef = useRef(0);

  useEffect(() => {
    if (!animateWords) {
      setRevealedCount(totalWords);
      return;
    }

    setRevealedCount((count) => Math.min(count, totalWords));
  }, [animateWords, totalWords]);

  useEffect(() => {
    if (!animateWords || revealedCount >= totalWords) return;

    const behind = totalWords - revealedCount;
    // Slightly slower cadence so each word's glow-in finishes before the next starts.
    const interval = behind > 240 ? 32 : behind > 120 ? 48 : behind > 48 ? 64 : 80;

    const id = window.setTimeout(() => {
      setRevealedCount((count) => Math.min(totalWords, count + 1));
      onTyping?.();
    }, interval);

    return () => window.clearTimeout(id);
  }, [animateWords, onTyping, revealedCount, totalWords]);

  useEffect(() => {
    if (!animateWords || totalWords === 0 || revealedCount < totalWords) return;
    if (completedWordCountRef.current === totalWords) return;
    completedWordCountRef.current = totalWords;
    onComplete?.();
  }, [animateWords, onComplete, revealedCount, totalWords]);

  const visibleText = useMemo(
    () => hideUnclosedMarkdownTail(animateWords ? getPrefixByWords(tokens, revealedCount) : text),
    [animateWords, revealedCount, text, tokens]
  );

  const renderTextWithWords = useCallback((children: any): any => {
    if (!animateWords) return children;

    const wrap = (str: string, keyPrefix: string) => {
      const parts = str.split(/(\s+)/);
      return parts.map((p, i) => {
        if (/^\s+$/.test(p) || p === "") {
          return <span key={`${keyPrefix}-${i}`}>{p}</span>;
        }
        const idx = cursorRef.current;
        cursorRef.current += 1;
        // Class stays constant after mount (keys are stable), so the fade
        // animation runs exactly once — when this word is first revealed.
        return (
          <span key={`arc-word-${idx}`} className="arc-word arc-word-entering">
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
      if (isValidElement(node)) {
        const tagName = typeof (node as any).type === "string" ? (node as any).type : (node as any).props?.node?.tagName;
        if (!["strong", "em", "a", "del"].includes(tagName)) return node;
        return cloneElement(node as any, null, walk((node as any).props.children, `${keyPrefix}-inline`));
      }
      return node;
    };

    return walk(children, "w");
  }, [animateWords]);

  const components = useMemo(() => {
    return {
      p: ({ node, children, ...props }: any) => (
        <p className="text-base leading-relaxed mb-3 last:mb-0 text-foreground/90" {...props}>
          {renderTextWithWords(children)}
        </p>
      ),
      li: ({ node, children, ...props }: any) => (
        <li className="text-base leading-relaxed text-foreground/90" {...props}>
          {renderTextWithWords(children)}
        </li>
      ),
      h1: ({ node, children, ...props }: any) => (
        <h1 className="text-2xl font-bold mt-5 mb-2.5 text-foreground" {...props}>
          {renderTextWithWords(children)}
        </h1>
      ),
      h2: ({ node, children, ...props }: any) => (
        <h2 className="text-xl font-semibold mt-4 mb-2 text-foreground" {...props}>
          {renderTextWithWords(children)}
        </h2>
      ),
      h3: ({ node, children, ...props }: any) => (
        <h3 className="text-lg font-semibold mt-3 mb-1.5 text-foreground" {...props}>
          {renderTextWithWords(children)}
        </h3>
      ),
      h4: ({ node, children, ...props }: any) => (
        <h4 className="text-base font-semibold mt-3 mb-1.5 text-foreground" {...props}>
          {renderTextWithWords(children)}
        </h4>
      ),
      strong: ({ node, children, ...props }: any) => (
        <strong className="font-semibold text-foreground" {...props}>
          {children}
        </strong>
      ),
      em: ({ node, children, ...props }: any) => (
        <em className="italic text-foreground/85" {...props}>
          {children}
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
          if (match[1].toLowerCase() === "mermaid") {
            return <MermaidDiagram chart={codeContent} />;
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

  // Reset the word cursor Ref before ReactMarkdown starts rendering children
  cursorRef.current = 0;

  return (
    <div className={`relative z-10 text-foreground break-words ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]} rehypePlugins={[rehypeKatex]} components={components}>
        {visibleText}
      </ReactMarkdown>
    </div>
  );
};
