import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Globe,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
  Plus,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  ArrowLeft,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchStore, SearchResult, SearchSession, SourceMessage } from "@/store/useSearchStore";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function SearchCanvas() {
  const {
    sessions,
    activeSessionId,
    isSearching,
    lists,
    pendingSearchQuery,
    closeSearch,
    setActiveSession,
    addSession,
    removeSession,
    clearAllSessions,
    setSearching,
    saveLink,
    createList,
    removeLink,
    setPendingSearchQuery,
    syncFromSupabase,
    sendSummaryMessage,
  } = useSearchStore();

  const { toast } = useToast();
  const isMobile = useIsMobile();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const followUpInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [pendingSaveResult, setPendingSaveResult] = useState<SearchResult | null>(null);

  // Track if running as PWA or Electron app for traffic lights spacing
  const [isPWAMode, setIsPWAMode] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);

  useEffect(() => {
    const checkPWA = window.matchMedia('(display-mode: standalone)').matches ||
                     (window.navigator as any).standalone === true;
    const checkElectron = /electron/i.test(navigator.userAgent);
    setIsPWAMode(checkPWA);
    setIsElectronApp(checkElectron);
  }, []);

  // Get active session
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Track which links are already saved
  const savedUrlsMap = useMemo(() => {
    const map = new Map<string, { listId: string; linkId: string }>();
    lists.forEach((list) => {
      list.links.forEach((link) => {
        map.set(link.url, { listId: list.id, linkId: link.id });
      });
    });
    return map;
  }, [lists]);

  const savedUrls = useMemo(() => new Set(savedUrlsMap.keys()), [savedUrlsMap]);

  // Sync from Supabase on mount
  useEffect(() => {
    syncFromSupabase().catch(console.error);
  }, []);

  // Focus search input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-search if there's a pending query
  useEffect(() => {
    if (pendingSearchQuery && pendingSearchQuery.trim()) {
      setSearchQuery(pendingSearchQuery);
      handleSearch(pendingSearchQuery);
      setPendingSearchQuery(null);
    }
  }, [pendingSearchQuery]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSearch]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (activeSession?.summaryConversation?.length) {
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [activeSession?.summaryConversation?.length]);

  const handleSearch = async (query: string) => {
    if (!query.trim() || isSearching) return;

    setSearching(true);
    setSearchQuery("");
    setShowHistory(false);

    try {
      const { data, error } = await supabase.functions.invoke("perplexity-search", {
        body: {
          query: query,
          model: 'sonar-pro',
        },
      });

      if (error) throw error;

      const results: SearchResult[] =
        data?.sources?.map((source: any, index: number) => ({
          id: `result-${index}`,
          title: source.title || `Source ${index + 1}`,
          url: source.url,
          snippet: source.snippet || "",
        })) || [];

      const formattedContent = data?.content || `No results found for "${query}".`;

      addSession(query, results, formattedContent, undefined);

      toast({
        title: `Found ${results.length} sources`,
        description: "Powered by Perplexity AI"
      });
    } catch (error: any) {
      console.error("Search error:", error);

      if (error.message?.includes('Rate limit') || error.message?.includes('429')) {
        toast({
          title: "Rate limit exceeded",
          description: "Please wait a moment and try again",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Search failed",
          description: error.message || "Please try again",
          variant: "destructive",
        });
      }
    } finally {
      setSearching(false);
    }
  };

  const handleCopy = async () => {
    if (!activeSession?.formattedContent) return;
    try {
      await navigator.clipboard.writeText(activeSession.formattedContent);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleToggleSave = (result: SearchResult) => {
    const savedInfo = savedUrlsMap.get(result.url);

    if (savedInfo) {
      removeLink(savedInfo.listId, savedInfo.linkId);
      toast({ title: "Removed from saved" });
    } else {
      const defaultList = lists.find((l) => l.id === 'default') || lists[0];
      if (defaultList) {
        saveLink({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          listId: defaultList.id,
        });
        toast({ title: "Saved for later" });
      }
    }
  };

  const handleFollowUp = async () => {
    if (!followUpInput.trim() || !activeSessionId) return;

    const message = followUpInput;
    setFollowUpInput("");

    await sendSummaryMessage(activeSessionId, message);
  };

  const handleCreateListAndSave = () => {
    if (!newListName.trim()) return;
    const newListId = createList(newListName.trim());

    if (pendingSaveResult) {
      saveLink({
        title: pendingSaveResult.title,
        url: pendingSaveResult.url,
        snippet: pendingSaveResult.snippet,
        listId: newListId,
      });
      toast({ title: `Saved to ${newListName.trim()}` });
      setPendingSaveResult(null);
    } else {
      toast({ title: "List created" });
    }

    setNewListName("");
    setShowNewListDialog(false);
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

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-background",
        (isPWAMode || isElectronApp) && "pt-[34px]"
      )}
    >
      {/* Minimal Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeSearch}
            className="h-9 w-9 p-0 rounded-full hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Research</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "h-9 gap-2 text-sm",
                showHistory && "bg-muted"
              )}
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
              <span className="text-xs text-muted-foreground">({sessions.length})</span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
      >
        <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">

          {/* Search Input - Always visible at top */}
          <div className="mb-8">
            <div className="relative">
              <div className={cn(
                "relative rounded-2xl border transition-all duration-200",
                "bg-muted/30 border-border/50",
                "focus-within:border-primary/50 focus-within:bg-background focus-within:shadow-lg focus-within:shadow-primary/5"
              )}>
                <div className="flex items-center gap-3 px-4">
                  <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch(searchQuery);
                    }}
                    placeholder="Ask anything..."
                    className="flex-1 border-0 bg-transparent h-12 sm:h-14 text-base sm:text-lg placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isSearching}
                  />
                  {searchQuery && !isSearching && (
                    <Button
                      onClick={() => handleSearch(searchQuery)}
                      size="sm"
                      className="h-8 px-4 rounded-xl"
                    >
                      Search
                    </Button>
                  )}
                </div>
              </div>

              {/* Searching Indicator */}
              <AnimatePresence>
                {isSearching && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute left-0 right-0 -bottom-10 flex justify-center"
                  >
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Globe className="w-4 h-4" />
                      </motion.div>
                      <span>Searching the web...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* History Dropdown */}
          <AnimatePresence>
            {showHistory && sessions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-8 overflow-hidden"
              >
                <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Recent Searches</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        clearAllSessions();
                        setShowHistory(false);
                      }}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    >
                      Clear all
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {sessions.slice().reverse().slice(0, 10).map((session) => (
                      <motion.button
                        key={session.id}
                        onClick={() => {
                          setActiveSession(session.id);
                          setShowHistory(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg transition-colors",
                          "hover:bg-muted/50",
                          session.id === activeSessionId && "bg-primary/10 text-primary"
                        )}
                        whileHover={{ x: 4 }}
                      >
                        <p className="text-sm font-medium line-clamp-1">{session.query}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{session.results.length} sources</span>
                          <span>·</span>
                          <span>{formatTimestamp(session.timestamp)}</span>
                          {session.summaryConversation && session.summaryConversation.length > 0 && (
                            <>
                              <span>·</span>
                              <span>{Math.floor(session.summaryConversation.length / 2)} follow-ups</span>
                            </>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active Session Content */}
          {activeSession ? (
            <motion.div
              key={activeSession.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Query Title - Blog Style */}
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground leading-tight mb-3">
                  {activeSession.query}
                </h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatTimestamp(activeSession.timestamp)}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4" />
                    {activeSession.results.length} sources
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 gap-1.5 text-xs ml-auto"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              {/* Sources - Collapsible Pills */}
              {activeSession.results.length > 0 && (
                <div className="mb-8">
                  <button
                    onClick={() => setShowSources(!showSources)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
                  >
                    <span>Sources</span>
                    {showSources ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  <AnimatePresence>
                    {showSources && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-wrap gap-2">
                          {activeSession.results.map((result, index) => {
                            const isSaved = savedUrls.has(result.url);
                            return (
                              <motion.div
                                key={result.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.03 }}
                                className="group flex items-center gap-2 px-3 py-2 rounded-full border border-border/50 bg-card/50 hover:bg-card hover:border-border transition-all"
                              >
                                <div className="flex-shrink-0 w-4 h-4">
                                  {getFaviconUrl(result.url) ? (
                                    <img
                                      src={getFaviconUrl(result.url)!}
                                      alt=""
                                      className="w-4 h-4 rounded"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <Globe className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>
                                <span className="text-sm text-foreground max-w-[150px] truncate">
                                  {getHostname(result.url)}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleSave(result);
                                    }}
                                    className={cn(
                                      "p-1 rounded hover:bg-muted transition-colors",
                                      isSaved && "text-primary"
                                    )}
                                  >
                                    {isSaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                                  </button>
                                  <a
                                    href={result.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Collapsed preview */}
                  {!showSources && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {activeSession.results.slice(0, 5).map((result) => (
                        <a
                          key={result.id}
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors text-xs"
                        >
                          {getFaviconUrl(result.url) && (
                            <img
                              src={getFaviconUrl(result.url)!}
                              alt=""
                              className="w-3.5 h-3.5 rounded"
                            />
                          )}
                          <span className="text-muted-foreground">{getHostname(result.url)}</span>
                        </a>
                      ))}
                      {activeSession.results.length > 5 && (
                        <span className="text-xs text-muted-foreground px-2">
                          +{activeSession.results.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Main Answer - Blog Style */}
              <article className="mb-8">
                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ node, ...props }) => (
                        <p className="text-base sm:text-lg leading-relaxed mb-4 text-foreground/90" {...props} />
                      ),
                      h1: ({ node, ...props }) => (
                        <h1 className="text-2xl sm:text-3xl font-bold mt-8 mb-4 text-foreground" {...props} />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2 className="text-xl sm:text-2xl font-semibold mt-6 mb-3 text-foreground" {...props} />
                      ),
                      h3: ({ node, ...props }) => (
                        <h3 className="text-lg sm:text-xl font-semibold mt-5 mb-2 text-foreground" {...props} />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-5 mb-4 space-y-2" {...props} />
                      ),
                      ol: ({ node, ...props }) => (
                        <ol className="list-decimal pl-5 mb-4 space-y-2" {...props} />
                      ),
                      li: ({ node, ...props }) => (
                        <li className="text-base sm:text-lg leading-relaxed text-foreground/90" {...props} />
                      ),
                      strong: ({ node, ...props }) => (
                        <strong className="font-semibold text-foreground" {...props} />
                      ),
                      a: ({ node, href, ...props }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline underline-offset-2"
                          {...props}
                        />
                      ),
                      code: ({ node, className, ...props }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className="px-1.5 py-0.5 bg-muted rounded text-sm font-mono" {...props} />
                        ) : (
                          <code className="block p-4 bg-muted rounded-lg text-sm font-mono overflow-x-auto" {...props} />
                        );
                      },
                      blockquote: ({ node, ...props }) => (
                        <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-4" {...props} />
                      ),
                    }}
                  >
                    {activeSession.formattedContent}
                  </ReactMarkdown>
                </div>
              </article>

              {/* Follow-up Conversation Thread */}
              {activeSession.summaryConversation && activeSession.summaryConversation.length > 0 && (
                <div className="mb-8 border-t border-border/30 pt-8">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-primary" />
                    Follow-up Questions
                  </h3>
                  <div className="space-y-6">
                    {activeSession.summaryConversation.reduce((acc: JSX.Element[], msg, idx, arr) => {
                      // Group user message with assistant response
                      if (msg.role === 'user') {
                        const response = arr[idx + 1];
                        acc.push(
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="rounded-xl border border-border/50 bg-card/30 overflow-hidden"
                          >
                            {/* User Question */}
                            <div className="px-4 py-3 bg-primary/5 border-b border-border/30">
                              <p className="font-medium text-foreground">{msg.content}</p>
                            </div>

                            {/* Assistant Response */}
                            {response && response.role === 'assistant' && (
                              <div className="px-4 py-4">
                                <div className="prose prose-neutral dark:prose-invert prose-sm max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {response.content}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        );
                      }
                      return acc;
                    }, [])}
                  </div>
                </div>
              )}

              {/* Follow-up Input */}
              <div className="sticky bottom-4 z-10">
                <div className={cn(
                  "relative rounded-2xl border transition-all duration-200",
                  "bg-background/95 backdrop-blur-lg border-border/50 shadow-lg",
                  "focus-within:border-primary/50"
                )}>
                  <div className="flex items-center gap-3 px-4">
                    <Input
                      ref={followUpInputRef}
                      value={followUpInput}
                      onChange={(e) => setFollowUpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && followUpInput.trim()) {
                          e.preventDefault();
                          handleFollowUp();
                        }
                      }}
                      placeholder="Ask a follow-up question..."
                      className="flex-1 border-0 bg-transparent h-12 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Button
                      onClick={handleFollowUp}
                      disabled={!followUpInput.trim()}
                      size="sm"
                      className="h-9 w-9 p-0 rounded-xl"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-primary" />
                </div>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                Ask anything
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Get instant answers with real-time web search powered by Perplexity AI
              </p>

              {/* Suggestion Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                {[
                  "What's new in AI today?",
                  "How does quantum computing work?",
                  "Best practices for productivity",
                  "Future of renewable energy",
                ].map((suggestion) => (
                  <motion.button
                    key={suggestion}
                    onClick={() => {
                      setSearchQuery(suggestion);
                      handleSearch(suggestion);
                    }}
                    className="text-left px-4 py-3 rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-border transition-all group"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm text-foreground">{suggestion}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* New List Dialog */}
      <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {pendingSaveResult ? "Create List & Save Link" : "Create New List"}
            </DialogTitle>
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
            <Button variant="outline" onClick={() => {
              setShowNewListDialog(false);
              setPendingSaveResult(null);
              setNewListName("");
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateListAndSave} disabled={!newListName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              {pendingSaveResult ? "Create & Save" : "Create List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
