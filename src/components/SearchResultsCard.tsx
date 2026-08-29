import { ExternalLink, Globe2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface SearchSource {
  title?: string;
  url: string;
  snippet?: string;
}

interface SearchResultsCardProps {
  content: string;
  sources: SearchSource[];
  query?: string;
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SearchResultsCard({ content, sources, query }: SearchResultsCardProps) {
  return (
    <div
      className={cn(
        "w-[min(42rem,calc(100vw-2.5rem))] max-w-full overflow-hidden rounded-2xl",
        "border border-border/55 bg-background/75 shadow-sm backdrop-blur-xl",
      )}
    >
      <div className="flex items-start gap-3 border-b border-border/45 px-4 py-3.5 sm:px-5">
        <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
          <Globe2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Web results</p>
          {query && <p className="mt-0.5 truncate text-xs text-muted-foreground">{query}</p>}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="search-result-copy text-foreground/90">
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
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="border-t border-border/45 bg-muted/20 px-4 py-3.5 sm:px-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sources
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
    </div>
  );
}
