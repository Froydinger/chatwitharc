import { useState, useMemo, RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Search,
  Globe,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
  Plus,
  FolderPlus,
  MessageCircle,
} from "lucide-react";
import type { ChatInputRef } from "@/components/ChatInput";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchStore, SearchResult } from "@/store/useSearchStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SearchCanvasProps {
  className?: string;
  chatInputRef?: RefObject<ChatInputRef>;
}

export function SearchCanvas({ className, chatInputRef }: SearchCanvasProps) {
  const {
    query,
    results,
    formattedContent,
    closeSearch,
    lists,
    saveLink,
    createList,
  } = useSearchStore();

  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [pendingSaveResult, setPendingSaveResult] = useState<SearchResult | null>(null);

  // Ask Arc about a search result
  const handleAskAbout = (result: SearchResult) => {
    const prompt = `Tell me more about this: "${result.title}" from ${result.url}\n\nContext from search: ${result.snippet}`;

    // Dispatch event to trigger chat with the prompt
    window.dispatchEvent(
      new CustomEvent("arcai:triggerPrompt", {
        detail: { prompt },
      })
    );

    toast({ title: "Asking Arc..." });
  };

  // Track which links are already saved
  const savedUrls = useMemo(() => {
    const urls = new Set<string>();
    lists.forEach((list) => {
      list.links.forEach((link) => urls.add(link.url));
    });
    return urls;
  }, [lists]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedContent);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleSaveToList = (result: SearchResult, listId: string) => {
    saveLink({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      listId,
    });
    toast({ title: `Saved to ${lists.find((l) => l.id === listId)?.name}` });
  };

  const handleCreateListAndSave = () => {
    if (!newListName.trim() || !pendingSaveResult) return;
    const newListId = createList(newListName.trim());
    handleSaveToList(pendingSaveResult, newListId);
    setNewListName("");
    setShowNewListDialog(false);
    setPendingSaveResult(null);
  };

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  };

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeSearch}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Search Results
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2 hidden sm:block">
            {results.length} sources
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!formattedContent}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
            title="Copy"
          >
            {copied ? (
              <Check className="w-4 h-4 text-primary" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Query Display */}
      {query && (
        <div className="px-4 py-3 border-b border-border/20 bg-muted/20">
          <p className="text-xs text-muted-foreground mb-1">Search query</p>
          <p className="text-sm font-medium text-foreground">{query}</p>
        </div>
      )}

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Formatted Content */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border/20">
          <div className="px-4 py-2 border-b border-border/20 bg-muted/10">
            <p className="text-xs font-medium text-muted-foreground">Summary</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-4 py-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }) => (
                      <p className="mb-3 text-foreground leading-relaxed text-sm" {...props} />
                    ),
                    h1: ({ node, ...props }) => (
                      <h1 className="text-lg font-bold mt-4 mb-2 text-foreground" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2 className="text-base font-semibold mt-3 mb-2 text-foreground" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3 className="text-sm font-semibold mt-2 mb-1.5 text-foreground" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                      <ul className="list-disc pl-4 mb-3 space-y-1" {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol className="list-decimal pl-4 mb-3 space-y-1" {...props} />
                    ),
                    li: ({ node, ...props }) => (
                      <li className="text-sm text-foreground leading-relaxed" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                      <strong className="font-semibold text-foreground" {...props} />
                    ),
                    a: ({ node, href, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        {...props}
                      />
                    ),
                    code: ({ node, ...props }) => (
                      <code className="px-1 py-0.5 bg-muted rounded text-xs" {...props} />
                    ),
                  }}
                >
                  {formattedContent}
                </ReactMarkdown>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right: Sources List */}
        <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-border/20 bg-muted/10">
            <p className="text-xs font-medium text-muted-foreground">Sources</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {results.map((result, index) => {
                const isSaved = savedUrls.has(result.url);
                const isExpanded = selectedResultId === result.id;

                return (
                  <motion.div
                    key={result.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "group rounded-lg border border-border/30 bg-card/50 hover:bg-card/80 transition-all cursor-pointer overflow-hidden",
                      isExpanded && "ring-1 ring-primary/30"
                    )}
                    onClick={() => setSelectedResultId(isExpanded ? null : result.id)}
                  >
                    <div className="p-3">
                      {/* Header with favicon and actions */}
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                          {getFaviconUrl(result.url) ? (
                            <img
                              src={getFaviconUrl(result.url)!}
                              alt=""
                              className="w-5 h-5 rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <Globe className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                            {result.title}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {getHostname(result.url)}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Ask Arc Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAskAbout(result);
                            }}
                            title="Ask Arc about this"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-primary" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isSaved ? (
                                  <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
                                ) : (
                                  <Bookmark className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {lists.map((list) => (
                                <DropdownMenuItem
                                  key={list.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveToList(result, list.id);
                                  }}
                                >
                                  <Bookmark className="w-3.5 h-3.5 mr-2" />
                                  {list.name}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingSaveResult(result);
                                  setShowNewListDialog(true);
                                }}
                              >
                                <FolderPlus className="w-3.5 h-3.5 mr-2" />
                                New List...
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(result.url, "_blank");
                            }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Snippet - show when expanded or on hover */}
                      <AnimatePresence>
                        {(isExpanded || result.snippet) && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{
                              height: isExpanded ? "auto" : 40,
                              opacity: 1,
                            }}
                            exit={{ height: 0, opacity: 0 }}
                            className={cn(
                              "text-xs text-muted-foreground mt-2 overflow-hidden leading-relaxed",
                              !isExpanded && "line-clamp-2"
                            )}
                          >
                            {result.snippet}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* New List Dialog */}
      <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="List name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateListAndSave();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewListDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateListAndSave} disabled={!newListName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Create & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
