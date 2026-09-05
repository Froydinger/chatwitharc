import { ExternalLink, Globe2, Search, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { SmoothImage } from "@/components/ui/smooth-image";
import { ImageModal } from "@/components/ImageModal";
import { useState } from "react";

interface SearchSource {
  title?: string;
  url: string;
  /** The chat function returns per-source text as `content`; older stored
   *  messages use `snippet`. Read both so saved chats keep their snippets. */
  snippet?: string;
  content?: string;
}

interface SearchResultsCardProps {
  content: string;
  sources: SearchSource[];
  query?: string;
  images?: string[];
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SearchResultsCard({ content, sources, query, images = [] }: SearchResultsCardProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const visibleImages = images.slice(0, 4).filter((url) => !failedImages.has(url));

  // A finished search must never render as an empty box. If the model came back
  // with nothing, show the retrieved snippets instead of a blank card — that
  // blank card is what read as "the search never landed in chat".
  const body = content.trim()
    ? content
    : sources
        .slice(0, 5)
        .map((source) => {
          const title = (source.title || sourceHost(source.url)).trim();
          const snippet = (source.snippet || source.content || "").trim().replace(/\s+/g, " ").slice(0, 220);
          return snippet ? `- **${title}** — ${snippet}` : `- **${title}**`;
        })
        .join("\n") || "The search finished but returned nothing to summarize.";

  return (
    <>
    <div
      className={cn(
        "w-[min(46rem,calc(100vw-2.5rem))] max-w-full overflow-hidden rounded-3xl",
        "border border-primary/20 bg-background/80 shadow-[0_18px_60px_-28px_hsl(var(--primary)/0.45)] ring-1 ring-foreground/[0.04] backdrop-blur-2xl",
      )}
    >
      <div className="flex items-center gap-3 border-b border-border/45 bg-muted/15 px-4 py-3 sm:px-5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/35" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
          <Search className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{query || "Arc Search"}</span>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Complete</span>
      </div>

      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="mt-0.5 rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary shadow-inner">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Search result</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Synthesized from {sources.length} source{sources.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:pb-5">
        <div className="search-result-copy rounded-2xl border border-border/40 bg-background/45 px-4 py-4 text-foreground/90 sm:px-5">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ node, ...props }) => <p className="mb-3 text-base leading-relaxed last:mb-0" {...props} />,
              h1: ({ node, ...props }) => <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0" {...props} />,
              h2: ({ node, ...props }) => <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0" {...props} />,
              h3: ({ node, ...props }) => <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0" {...props} />,
              ul: ({ node, ...props }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
              ol: ({ node, ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
              li: ({ node, ...props }) => <li className="text-base leading-relaxed" {...props} />,
              strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
              a: ({ node, ...props }) => (
                <a
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                />
              ),
            }}
          >
            {body}
          </ReactMarkdown>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="border-t border-border/45 bg-muted/20 px-4 py-4 sm:px-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sources used
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sources.slice(0, 6).map((source, index) => (
              <a
                key={`${source.url}-${index}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-border/45 bg-background/65 px-3 py-2.5 transition-colors hover:border-primary/35 hover:bg-background"
              >
                <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {source.title || sourceHost(source.url)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{sourceHost(source.url)}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 group-hover:text-primary" />
              </a>
            ))}
          </div>
        </div>
      )}

      {visibleImages.length > 0 && (
        <div className="border-t border-border/45 bg-muted/10 px-4 py-4 sm:px-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Images</p>
          <div className="grid grid-cols-2 gap-2">
            {visibleImages.map((url, index) => (
              <button key={url} type="button" onClick={() => setSelectedImage(url)} className="aspect-video overflow-hidden rounded-xl border border-border/45 bg-muted/20">
                <SmoothImage src={url} alt={`Search result ${index + 1}`} thumbnail className="h-full w-full" imageClassName="transition-transform duration-300 hover:scale-105" onError={() => setFailedImages((current) => new Set(current).add(url))} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    <ImageModal isOpen={selectedImage !== null} onClose={() => setSelectedImage(null)} imageUrl={selectedImage || ""} alt="Search result" />
    </>
  );
}
