import { FileAttachment } from "@/components/FileAttachment";
import { MediaEmbed, getYouTubeVideoId, isImageUrl } from "@/components/MediaEmbed";
import { CodeBlock } from "@/components/CodeBlock";
import { SvgArtifact } from "@/components/SvgArtifact";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { InlineHumidityWheel, InlineProgressChart, type ProgressPoint } from "@/components/InlineDataVisual";
import { useSandboxStore } from "@/store/useSandboxStore";

/**
 * The one markdown renderer for assistant prose.
 *
 * This used to live inside MessageBubble, so anything rendering markdown
 * elsewhere — SearchResultsCard most of all — hand-rolled a cut-down component
 * map with no table, code or diagram handling. Search answers therefore got
 * unstyled cramped tables, and a chart written as a fenced block was dumped as
 * raw source instead of being drawn. Both renderers now share this map, so a
 * chart is a chart wherever it appears, and never the code beside it.
 */
function parseInlineVisual(code: string) {
  try {
    return JSON.parse(code) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isProgressPointArray(value: unknown): value is ProgressPoint[] {
  return Array.isArray(value) && value.every((point) => {
    if (!point || typeof point !== "object") return false;
    const candidate = point as Record<string, unknown>;
    return typeof candidate.label === "string" && typeof candidate.value === "number" && Number.isFinite(candidate.value);
  });
}

export function renderInlineVisual(language: string | undefined, code: string) {
  const normalizedLanguage = language?.toLowerCase();
  const visual = parseInlineVisual(code);
  if (!visual) return null;

  if ((normalizedLanguage === "progress" || normalizedLanguage === "arc-progress") && isProgressPointArray(visual.data)) {
    return (
      <InlineProgressChart
        data={visual.data}
        max={typeof visual.max === "number" && Number.isFinite(visual.max) ? visual.max : undefined}
        unit={typeof visual.unit === "string" ? visual.unit : ""}
        title={typeof visual.title === "string" ? visual.title : "Progress"}
        compact
      />
    );
  }

  if ((normalizedLanguage === "humidity" || normalizedLanguage === "arc-humidity") && typeof visual.value === "number" && Number.isFinite(visual.value)) {
    return (
      <InlineHumidityWheel
        value={visual.value}
        label={typeof visual.label === "string" ? visual.label : "Humidity"}
        unit={typeof visual.unit === "string" ? visual.unit : "%"}
        title={typeof visual.title === "string" ? visual.title : "Humidity"}
        compact
      />
    );
  }

  return null;
}

// Stable module-level constant — never recreated on re-render, so iframes never remount
export const richMarkdownComponents = {
  p: ({node, ...props}: any) => <p className="text-base leading-relaxed mb-3 last:mb-0 text-foreground/90" {...props} />,
  strong: ({node, ...props}: any) => <strong className="font-semibold text-foreground" {...props} />,
  em: ({node, ...props}: any) => <em className="italic text-foreground/85" {...props} />,
  a: ({node, href, children, ...props}: any) => {
    if (href && href.includes('/storage/v1/object/public/generated-files/')) {
      const urlParts = href.split('/');
      const fullFileName = urlParts[urlParts.length - 1];
      const fileName = fullFileName.replace(/^generated-\d+-/, '');
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'file';
      return (
        <div className="my-4">
          <FileAttachment fileName={fileName} fileUrl={href} fileType={fileExt} className="max-w-md" />
        </div>
      );
    }
    if (href && getYouTubeVideoId(href)) {
      const linkText = typeof children === 'string' ? children : (Array.isArray(children) ? children.join('') : String(children));
      return (
        <div className="my-4">
          <MediaEmbed url={href} title={linkText !== href ? linkText : undefined} />
        </div>
      );
    }
    if (href && isImageUrl(href)) {
      const linkText = typeof children === 'string' ? children : (Array.isArray(children) ? children.join('') : String(children));
      return (
        <div className="my-4">
          <MediaEmbed url={href} title={linkText !== href ? linkText : undefined} />
        </div>
      );
    }
    let targetUrl = href;
    const isE2b = Boolean(href && (href.includes('.e2b.app') || href.includes('.e2b.dev')));
    const isLocalhostPort = Boolean(href && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/.test(href));

    if (isLocalhostPort && !isE2b) {
      const currentPreview = useSandboxStore.getState().previewUrl;
      if (currentPreview) {
        const portMatch = href?.match(/:(\d+)/);
        const portNum = portMatch ? portMatch[1] : null;
        if (portNum) {
          targetUrl = currentPreview.replace(/https?:\/\/\d+-/, `https://${portNum}-`);
        } else {
          targetUrl = currentPreview;
        }
      }
    }

    return <a href={href} className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" {...props}>{children}</a>;
  },
  ul: ({node, ...props}: any) => <ul className="list-disc pl-5 mb-3 space-y-1 marker:text-primary/60" {...props} />,
  ol: ({node, ...props}: any) => <ol className="list-decimal pl-5 mb-3 space-y-1 marker:text-primary/60" {...props} />,
  li: ({node, ...props}: any) => <li className="text-base leading-relaxed text-foreground/90" {...props} />,
  h1: ({node, ...props}: any) => <h1 className="text-2xl font-bold mt-5 mb-2.5 text-foreground" {...props} />,
  h2: ({node, ...props}: any) => <h2 className="text-xl font-semibold mt-4 mb-2 text-foreground" {...props} />,
  h3: ({node, ...props}: any) => <h3 className="text-lg font-semibold mt-3 mb-1.5 text-foreground" {...props} />,
  h4: ({node, ...props}: any) => <h4 className="text-base font-semibold mt-3 mb-1.5 text-foreground" {...props} />,
  blockquote: ({node, ...props}: any) => (
    <blockquote className="border-l-[3px] border-primary/40 pl-4 py-1 my-3.5 bg-primary/5 rounded-r-lg italic text-muted-foreground" {...props} />
  ),
  hr: ({node, ...props}: any) => <hr className="my-4 border-t border-border/50" {...props} />,
  table: ({node, ...props}: any) => (
    <div className="arc-md-wide my-2.5 overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full min-w-[22rem] text-sm" {...props} />
    </div>
  ),
  thead: ({node, ...props}: any) => <thead className="bg-muted/50 border-b border-border/50" {...props} />,
  tbody: ({node, ...props}: any) => <tbody className="divide-y divide-border/30" {...props} />,
  tr: ({node, ...props}: any) => <tr className="hover:bg-muted/30 transition-colors" {...props} />,
  th: ({node, ...props}: any) => <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-foreground sm:px-4" {...props} />,
  td: ({node, ...props}: any) => <td className="px-3 py-2 align-top text-foreground/90 sm:px-4" {...props} />,
  code: ({node, className, children, ...props}: any) => {
    const match = /language-([\w-]+)/.exec(className || '');
    const codeContent = String(children).replace(/\n$/, '');
    const isInline = !className && !match;
    if (!isInline && match) {
      if (match[1].toLowerCase() === 'svg') {
        return <SvgArtifact svgCode={codeContent} />;
      }
      if (match[1].toLowerCase() === 'mermaid') {
        return <MermaidDiagram chart={codeContent} />;
      }
      const inlineVisual = renderInlineVisual(match[1], codeContent);
      if (inlineVisual) return inlineVisual;
      return <CodeBlock code={codeContent} language={match[1]} />;
    }
    return (
      <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-sm" {...props}>
        {children}
      </code>
    );
  },
};
