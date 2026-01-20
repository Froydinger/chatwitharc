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
  Trash2,
  Clock,
  ChevronRight,
  MessageSquare,
  Send,
  ArrowLeft,
  History,
  MoreHorizontal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchStore, SearchResult, SearchSession } from "@/store/useSearchStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useArcStore } from "@/store/useArcStore";
import { useNavigate } from "react-router-dom";

export function SearchCanvas() {
  const navigate = useNavigate();
  const { loadSession, addMessage } = useArcStore();
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
    moveLink,
    startSourceChat,
    sendSourceMessage,
    sendSummaryMessage,
    setPendingSearchQuery,
    syncFromSupabase,
  } = useSearchStore();

  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track if running as PWA or Electron app
  const [isPWAMode, setIsPWAMode] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);

  useEffect(() => {
    const checkPWA =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    const checkElectron = /electron/i.test(navigator.userAgent);
    setIsPWAMode(checkPWA);
    setIsElectronApp(checkElectron);
  }, []);

  // Get active session
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Sync from Supabase on mount
  useEffect(() => {
    syncFromSupabase().catch(console.error);
  }, []);

  // Scroll to bottom of chat when new messages appear
  useEffect(() => {
    if (activeSession?.summaryConversation?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSession?.summaryConversation?.length]);

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
      setPendingSearchQuery(null); // Clear after using
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

  const handleSearch = async (query: string) => {
    if (!query.trim() || isSearching) return;

    setSearching(true);
    setSearchQuery("");

    try {
      const { data, error } = await supabase.functions.invoke("perplexity-search", {
        body: {
          query: query,
          model: "sonar-pro",
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
    } catch (error: any) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
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
    // Check if already saved in any list
    const isSaved = lists.some((list) => list.links.some((l) => l.url === result.url));

    if (isSaved) {
      // Find where it is and remove it
      lists.forEach((list) => {
        const link = list.links.find((l) => l.url === result.url);
        if (link) removeLink(list.id, link.id);
      });
      toast({ title: "Link removed" });
    } else {
      // Save to default list
      const defaultList = lists.find((l) => l.id === "default") || lists[0];
      if (defaultList) {
        saveLink({
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          listId: defaultList.id,
        });
        toast({ title: "Link saved" });
      }
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
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const handleFollowUp = async () => {
    if (!followUpInput.trim() || !activeSessionId) return;
    const message = followUpInput;
    setFollowUpInput("");
    await sendSummaryMessage(activeSessionId, message);
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-background/95 backdrop-blur-2xl text-foreground",
        (isPWAMode || isElectronApp) && "pt-[34px]",
      )}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeSearch}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold">Research</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* History Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1.5 hover:text-foreground"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="w-3.5 h-3.5" />
            History <span className="text-[10px] opacity-60">({sessions.length})</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content Area (Left Side) */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {!activeSession ? (
            <EmptyState
              onSearch={(q) => {
                setSearchQuery(q);
                handleSearch(q);
              }}
            />
          ) : (
            <ScrollArea className="flex-1">
              <div className="max-w-4xl mx-auto px-6 py-8 pb-32">
                {/* Search Input in Content */}
                <div className="mb-8">
                  <div className="relative group">
                    <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-primary/20 to-primary/10 opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative bg-muted/30 rounded-xl border border-border/20 flex items-center px-4 py-3">
                      <Search className="w-4 h-4 text-muted-foreground mr-3" />
                      <Input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSearch(searchQuery);
                        }}
                        placeholder="Ask anything..."
                        className="flex-1 border-0 bg-transparent h-auto p-0 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Title & Metadata */}
                <div className="mb-6">
                  <h1 className="text-3xl font-bold mb-3 leading-tight">{activeSession.query}</h1>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTimestamp(activeSession.timestamp)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      {activeSession.results.length} sources
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                      className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground gap-1.5 ml-auto"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy
                    </Button>
                  </div>
                </div>

                {/* Sources Cards */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sources</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {activeSession.results.slice(0, 4).map((result) => (
                      <a
                        key={result.id}
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <div className="h-full p-3 rounded-xl bg-muted/30 border border-border/20 hover:bg-muted/50 hover:border-primary/20 transition-all">
                          <div className="flex items-start gap-2 mb-2">
                            <div className="w-5 h-5 rounded bg-background flex items-center justify-center shrink-0">
                              {getFaviconUrl(result.url) ? (
                                <img src={getFaviconUrl(result.url)!} className="w-3.5 h-3.5 rounded-sm" alt="" />
                              ) : (
                                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate w-full">
                              {getHostname(result.url)}
                            </span>
                          </div>
                          <p className="text-xs font-medium line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                            {result.title}
                          </p>
                        </div>
                      </a>
                    ))}
                    {activeSession.results.length > 4 && (
                      <div className="flex items-center justify-center p-3 rounded-xl bg-muted/20 border border-border/10 text-xs font-medium text-muted-foreground">
                        +{activeSession.results.length - 4} more
                      </div>
                    )}
                  </div>
                </div>

                {/* Answer Content */}
                <div className="prose prose-sm dark:prose-invert max-w-none mb-12">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ node, ...props }) => <p className="mb-4 text-foreground/90 leading-relaxed" {...props} />,
                      h1: ({ node, ...props }) => (
                        <h1 className="text-lg font-bold mt-6 mb-3 text-foreground" {...props} />
                      ),
                      h2: ({ node, ...props }) => (
                        <h2 className="text-base font-semibold mt-5 mb-2 text-foreground" {...props} />
                      ),
                      ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-4 mb-4 space-y-2 text-foreground/90" {...props} />
                      ),
                      li: ({ node, ...props }) => <li className="text-foreground/90" {...props} />,
                      strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                    }}
                  >
                    {activeSession.formattedContent}
                  </ReactMarkdown>
                </div>

                {/* Summary Conversation Messages - Fixed Logic */}
                {activeSession.summaryConversation && activeSession.summaryConversation.length > 0 && (
                  <div className="space-y-6 mb-8 border-t border-border/20 pt-8">
                    {activeSession.summaryConversation.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn("flex w-full", msg.role === "user" ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 border border-border/40",
                          )}
                        >
                          {msg.role === "assistant" && (
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/10">
                              <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                                <Globe className="w-2.5 h-2.5 text-primary" />
                              </div>
                              <span className="text-xs font-medium">Answer</span>
                            </div>
                          )}
                          <div
                            className={cn(
                              "prose prose-sm dark:prose-invert max-w-none",
                              msg.role === "user" && "text-primary-foreground",
                            )}
                          >
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Sticky Follow-up Input */}
          {activeSession && (
            <div className="absolute bottom-6 left-0 right-0 px-6">
              <div className="max-w-3xl mx-auto">
                <div className="relative bg-background/80 backdrop-blur-xl border border-border/20 rounded-2xl shadow-lg flex items-center p-1.5 pl-4 transition-all focus-within:ring-1 focus-within:ring-primary/20">
                  <Input
                    value={followUpInput}
                    onChange={(e) => setFollowUpInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleFollowUp();
                      }
                    }}
                    placeholder="Ask a follow-up question..."
                    className="flex-1 bg-transparent border-0 h-10 p-0 focus-visible:ring-0 placeholder:text-muted-foreground/60"
                  />
                  <Button
                    size="sm"
                    className="h-8 w-8 rounded-xl p-0 ml-2"
                    disabled={!followUpInput.trim()}
                    onClick={handleFollowUp}
                  >
                    <ArrowLeft className="w-4 h-4 rotate-90" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar (Saved Panel) - Matches Screenshot */}
        <div className="w-[320px] border-l border-border/20 bg-muted/10 hidden md:flex flex-col">
          <SidebarPanel
            lists={lists}
            onRemoveLink={removeLink}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
          />
        </div>
      </div>

      {/* History Dialog/Overlay */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1 p-1">
              {sessions
                .slice()
                .reverse()
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2 hover:bg-muted rounded-lg cursor-pointer group"
                    onClick={() => {
                      setActiveSession(s.id);
                      setShowHistory(false);
                    }}
                  >
                    <div className="truncate text-sm font-medium">{s.query}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSession(s.id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sidebar Component matching the screenshot
function SidebarPanel({
  lists,
  onRemoveLink,
  getFaviconUrl,
  getHostname,
}: {
  lists: any[];
  onRemoveLink: (listId: string, linkId: string) => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
}) {
  const [activeTab, setActiveTab] = useState<"saved" | "gemini">("saved");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());

  // Flatten links for display
  const allSavedLinks = useMemo(() => {
    if (!lists) return [];
    return lists.flatMap((list) =>
      (list.links || []).map((link: any) => ({
        ...link,
        originalListId: list.id,
      })),
    );
  }, [lists]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-primary rounded-full"></div>
            <h3 className="font-semibold text-sm">
              Saved <span className="text-muted-foreground ml-1 font-normal">({allSavedLinks.length})</span>
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-auto p-0 hover:text-foreground"
            onClick={() => setIsSelectMode(!isSelectMode)}
          >
            {isSelectMode ? "Cancel" : "Select"}
          </Button>
        </div>

        {/* Tabs - Visual only for now as requested */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setActiveTab("saved")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              activeTab === "saved"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Saved Links <span className="opacity-70 ml-1">({allSavedLinks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("gemini")}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              activeTab === "gemini"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Gemini <span className="opacity-70 ml-1">(0)</span>
          </button>
          <Button variant="ghost" size="sm" className="w-6 h-6 rounded-full p-0 ml-auto">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-4 pb-4">
          {allSavedLinks.length === 0 ? (
            <div className="text-center py-10 opacity-50 text-xs">No saved links</div>
          ) : (
            allSavedLinks.map((link: any) => (
              <div key={link.id} className="group flex flex-col gap-0.5 py-1">
                <div className="flex items-start gap-3">
                  {/* Favicon / Icon */}
                  <div className="mt-1 w-4 h-4 shrink-0 rounded overflow-hidden">
                    {getFaviconUrl(link.url) ? (
                      <img src={getFaviconUrl(link.url)!} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <Globe className="w-full h-full text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium hover:underline line-clamp-2 leading-snug"
                    >
                      {link.title}
                    </a>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{getHostname(link.url)}</div>
                  </div>

                  {/* Delete Button (Hidden until hover) */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => onRemoveLink(link.originalListId, link.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Empty State Component
function EmptyState({ onSearch }: { onSearch: (query: string) => void }) {
  const suggestionGroups = [
    {
      title: "Trending",
      suggestions: ["What's happening in AI today?", "Latest breakthroughs in science", "Top tech news this week"],
    },
    {
      title: "Research",
      suggestions: [
        "How does quantum computing work?",
        "Benefits of intermittent fasting",
        "Future of renewable energy",
      ],
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-16 h-16 mx-auto mb-6"
        >
          <div className="absolute inset-0 rounded-2xl bg-primary/10 backdrop-blur-xl flex items-center justify-center">
            <Globe className="w-8 h-8 text-primary" />
          </div>
        </motion.div>

        <h2 className="text-2xl font-bold mb-2">Ask anything</h2>
        <p className="text-muted-foreground mb-8">
          Get instant answers with real-time web search powered by Perplexity AI
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left w-full max-w-lg mx-auto">
          {suggestionGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-xs text-foreground/80 hover:text-primary truncate"
                    onClick={() => onSearch(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
