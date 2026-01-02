import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Share, Copy, Check, Globe } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

interface SearchResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  sources: WebSource[];
  query?: string;
}

export function SearchResultsModal({
  isOpen,
  onClose,
  content,
  sources,
  query,
}: SearchResultsModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: query || "Search Results",
          text: content,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopy();
      toast({ title: "Copied to clipboard" });
    }
  };

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative w-full max-w-3xl mx-4 max-h-[90vh] md:max-h-[85vh]",
              "bg-background/95 backdrop-blur-2xl",
              "border border-border/50 rounded-2xl shadow-2xl",
              "overflow-hidden flex flex-col",
              // Safe area padding for PWA
              "pb-[env(safe-area-inset-bottom,0px)]"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Search Results</h2>
                  {query && (
                    <p className="text-sm text-muted-foreground truncate max-w-[200px] md:max-w-[400px]">
                      "{query}"
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Share className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 px-6 py-6">
              <article className="prose prose-lg prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }) => (
                      <p className="text-foreground/90 leading-relaxed mb-4 text-base md:text-lg" {...props} />
                    ),
                    h1: ({ node, ...props }) => (
                      <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-6 mb-4" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2 className="text-xl md:text-2xl font-semibold text-foreground mt-5 mb-3" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3 className="text-lg md:text-xl font-semibold text-foreground mt-4 mb-2" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol className="list-decimal pl-6 mb-4 space-y-2" {...props} />
                    ),
                    li: ({ node, children, ...props }) => (
                      <li className="text-foreground/90 leading-relaxed" {...props}>
                        {children}
                      </li>
                    ),
                    strong: ({ node, ...props }) => (
                      <strong className="font-semibold text-foreground" {...props} />
                    ),
                    em: ({ node, ...props }) => <em className="italic" {...props} />,
                    blockquote: ({ node, ...props }) => (
                      <blockquote
                        className="border-l-4 border-primary/50 pl-4 my-4 italic text-muted-foreground"
                        {...props}
                      />
                    ),
                    a: ({ node, href, children, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                    code: ({ node, className, children, ...props }: any) => {
                      const isInline = !className;
                      if (isInline) {
                        return (
                          <code
                            className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-sm"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code
                          className="block p-4 rounded-lg bg-muted/50 text-foreground font-mono text-sm overflow-x-auto"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>
            </ScrollArea>

            {/* Sources Section */}
            {sources.length > 0 && (
              <div className="border-t border-border/50 px-6 py-4 bg-muted/20">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Sources ({sources.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sources.map((source, index) => {
                    const favicon = getFaviconUrl(source.url);
                    return (
                      <a
                        key={index}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg",
                          "bg-background/50 border border-border/30",
                          "hover:bg-background/80 hover:border-border/50",
                          "transition-all duration-200 group"
                        )}
                      >
                        {favicon && (
                          <img
                            src={favicon}
                            alt=""
                            className="w-5 h-5 rounded flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {source.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {new URL(source.url).hostname}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
