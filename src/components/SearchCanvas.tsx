import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Globe,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Send,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  MessageCircle,
  CheckSquare,
  Square,
  Trash2,
  X,
  Library,
  Plus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchStore, SearchResult, SavedLink } from "@/store/useSearchStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { MediaEmbed, getYouTubeVideoId, isImageUrl } from "@/components/MediaEmbed";

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
    clearAllSessions,
    setSearching,
    saveLink,
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
  const [showHistory, setShowHistory] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const [showSavedLinks, setShowSavedLinks] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [smartSuggestions, setSmartSuggestions] = useState<Array<{ label: string; prompt: string }>>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const HISTORY_PAGE_SIZE = 5;
  
  // Default fallback suggestions for research
  const defaultSuggestions = [
    { label: "🤖 AI News", prompt: "What's new in AI today?" },
    { label: "⚛️ Quantum", prompt: "How does quantum computing work?" },
    { label: "📈 Productivity", prompt: "Best practices for productivity" },
    { label: "🌱 Energy", prompt: "Future of renewable energy" },
  ];

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

  // Get only the default list for saved links
  const defaultList = useMemo(() => {
    return lists.find((l) => l.id === 'default') || lists[0];
  }, [lists]);

  // Get links from the default list only
  const defaultListLinks = useMemo(() => {
    return defaultList?.links || [];
  }, [defaultList]);

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

  // Load smart suggestions on mount
  useEffect(() => {
    const loadSmartSuggestions = async () => {
      setIsLoadingSuggestions(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-smart-prompts', {
          body: { context: 'research' }
        });
        
        if (error) throw error;
        
        if (data?.prompts && Array.isArray(data.prompts)) {
          // Take first 4 for research mode
          setSmartSuggestions(data.prompts.slice(0, 4));
        }
      } catch (err) {
        console.error('Failed to load smart suggestions:', err);
        // Will fallback to default suggestions
      } finally {
        setIsLoadingSuggestions(false);
      }
    };
    
    loadSmartSuggestions();
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
        if (isSelectMode) {
          setIsSelectMode(false);
          setSelectedLinks(new Set());
        } else {
          closeSearch();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSearch, isSelectMode]);

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

  const handleToggleSelectLink = (linkId: string) => {
    setSelectedLinks((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) {
        next.delete(linkId);
      } else {
        next.add(linkId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (defaultListLinks.length > 0) {
      const allIds = new Set(defaultListLinks.map((l) => l.id));
      setSelectedLinks(allIds);
    }
  };

  const handleClearSelection = () => {
    setSelectedLinks(new Set());
    setIsSelectMode(false);
  };

  const handleChatWithLink = (link: SavedLink) => {
    // Build context from the link and start a conversation
    const contextMessage = `I want to discuss this saved link:\n\nTitle: ${link.title}\nURL: ${link.url}${link.snippet ? `\nSnippet: ${link.snippet}` : ''}\n\nPlease help me understand or explore this topic further.`;

    if (activeSessionId) {
      sendSummaryMessage(activeSessionId, contextMessage);
    } else {
      // If no active session, create a search for the link title
      handleSearch(`Explain: ${link.title}`);
    }

    toast({ title: "Starting conversation about link" });
    if (isMobile) setShowSavedLinks(false);
  };

  const handleChatWithSelected = () => {
    if (selectedLinks.size === 0) return;

    const selectedLinkObjects = defaultListLinks.filter((l) => selectedLinks.has(l.id));
    const contextMessage = `I want to discuss these ${selectedLinkObjects.length} saved links:\n\n${selectedLinkObjects.map((l, i) => `${i + 1}. ${l.title}\n   URL: ${l.url}${l.snippet ? `\n   Snippet: ${l.snippet}` : ''}`).join('\n\n')}\n\nPlease help me understand how these topics relate or explore them together.`;

    if (activeSessionId) {
      sendSummaryMessage(activeSessionId, contextMessage);
    } else {
      // Create a search combining the topics
      const topics = selectedLinkObjects.map((l) => l.title).join(', ');
      handleSearch(`Compare and discuss: ${topics}`);
    }

    toast({ title: `Starting conversation about ${selectedLinks.size} links` });
    handleClearSelection();
    if (isMobile) setShowSavedLinks(false);
  };

  const handleDeleteSelected = () => {
    selectedLinks.forEach((linkId) => {
      const link = defaultListLinks.find((l) => l.id === linkId);
      if (link) {
        removeLink(link.listId, linkId);
      }
    });
    toast({ title: `Deleted ${selectedLinks.size} links` });
    handleClearSelection();
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

  // Saved Links Sidebar Component - Only shows default Saved Links list
  const SavedLinksSidebar = ({ className }: { className?: string }) => (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Library className="w-5 h-5 text-primary" />
          <span className="font-semibold">Saved</span>
          <span className="text-xs text-muted-foreground">({defaultListLinks.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {isSelectMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-8 text-xs"
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="h-8 text-xs"
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSelectMode(true)}
              className="h-8 text-xs"
              disabled={defaultListLinks.length === 0}
            >
              Select
            </Button>
          )}
        </div>
      </div>

      {/* Selection Actions Bar */}
      <AnimatePresence>
        {isSelectMode && selectedLinks.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 py-2 border-b border-border/20 bg-primary/5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{selectedLinks.size} selected</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleChatWithSelected}
                  className="h-7 text-xs gap-1"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Chat
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteSelected}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Links List - Only default list */}
      <div className="flex-1 overflow-auto">
        {defaultListLinks.length > 0 ? (
          <div className="p-2 space-y-1">
            {defaultListLinks.map((link) => {
              const isSelected = selectedLinks.has(link.id);
              return (
                <div
                  key={link.id}
                  className={cn(
                    "group relative rounded-lg border transition-all",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:border-border/50 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-2 p-2">
                    {/* Checkbox / Favicon */}
                    {isSelectMode ? (
                      <button
                        onClick={() => handleToggleSelectLink(link.id)}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-primary" />
                        ) : (
                          <Square className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    ) : (
                      <div className="mt-0.5 flex-shrink-0 w-5 h-5">
                        {getFaviconUrl(link.url) ? (
                          <img
                            src={getFaviconUrl(link.url)!}
                            alt=""
                            className="w-5 h-5 rounded"
                          />
                        ) : (
                          <Globe className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm font-medium text-foreground hover:text-primary line-clamp-2 transition-colors"
                      >
                        {link.title}
                      </a>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {getHostname(link.url)}
                      </p>
                    </div>

                    {/* Actions */}
                    {!isSelectMode && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleChatWithLink(link)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          title="Chat about this link"
                        >
                          <MessageCircle className="w-4 h-4 text-primary" />
                        </button>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        </a>
                        <button
                          onClick={() => removeLink(link.listId, link.id)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center p-4">
            <Bookmark className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No saved links yet</p>
            <p className="text-xs text-muted-foreground/70">
              Save sources from your research
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-background",
        (isPWAMode || isElectronApp) && "pt-[34px]"
      )}
    >
      {/* Header */}
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
          {/* New Search Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActiveSession(null as any);
              setSearchQuery("");
              setHistoryPage(0);
              searchInputRef.current?.focus();
            }}
            className="h-9 w-9 p-0 rounded-full hover:bg-muted"
            title="New search"
          >
            <Plus className="w-5 h-5" />
          </Button>

          {/* History Button */}
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

          {/* Mobile: Toggle saved links panel */}
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSavedLinks(!showSavedLinks)}
              className={cn(
                "h-9 gap-2 text-sm",
                showSavedLinks && "bg-muted"
              )}
            >
              <Library className="w-4 h-4" />
              <span className="text-xs text-muted-foreground">({defaultListLinks.length})</span>
            </Button>
          )}
        </div>
      </header>

      {/* History Dropdown - Shows above active session when open */}
      <AnimatePresence>
        {showHistory && sessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-border/30 bg-card/50 overflow-hidden"
          >
            <div className="max-w-3xl mx-auto px-4 py-4">
              <div className="rounded-xl border border-border/50 bg-background/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Recent Searches</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearAllSessions();
                      setShowHistory(false);
                      setHistoryPage(0);
                    }}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear all
                  </Button>
                </div>
                <div className="space-y-2">
                  {sessions
                    .slice()
                    .reverse()
                    .slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE)
                    .map((session) => (
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

                {/* Pagination Controls */}
                {sessions.length > HISTORY_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">
                      {historyPage * HISTORY_PAGE_SIZE + 1}-{Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, sessions.length)} of {sessions.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistoryPage(Math.max(0, historyPage - 1))}
                        disabled={historyPage === 0}
                        className="h-7 px-2 text-xs"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistoryPage(historyPage + 1)}
                        disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= sessions.length}
                        className="h-7 px-2 text-xs"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Search Input Bar - Hide on mobile when in active session */}
      {!(isMobile && activeSession) && (
        <div className="border-b border-border/20 bg-background/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="relative">
              <div className={cn(
                "glass-dock !rounded-full !p-1 transition-all duration-200",
                "focus-within:ring-2 focus-within:ring-primary/40 focus-within:shadow-[0_0_24px_rgba(var(--primary),.15)]"
              )}>
                <div className="flex items-center gap-3 px-4">
                  {/* Left search icon */}
                  <div className="shrink-0 flex items-center justify-center text-muted-foreground">
                    <Search className="h-5 w-5" />
                  </div>
                  
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch(searchQuery);
                    }}
                    placeholder="Research anything..."
                    className="flex-1 border-0 bg-transparent h-12 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isSearching}
                  />
                  
                  {/* Right send button */}
                  {searchQuery && !isSearching && (
                    <button
                      onClick={() => handleSearch(searchQuery)}
                      className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
      
      {/* Mobile: New Search FAB when in active session */}
      {isMobile && activeSession && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => {
            setActiveSession(null as any);
            setSearchQuery("");
            setHistoryPage(0);
          }}
          className="fixed bottom-24 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-6 w-6" />
        </motion.button>
      )}

      {/* Main Layout: Content + Sidebar on Desktop */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
        >
          {/* Mobile: Saved Links Panel (collapsible at top) */}
          {isMobile && (
            <AnimatePresence>
              {showSavedLinks && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 300 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-b border-border/30 bg-card/50 overflow-hidden"
                >
                  <SavedLinksSidebar />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">

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
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
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
                        a: ({ node, href, children, ...props }) => {
                          // Detect YouTube links and embed them
                          if (href && getYouTubeVideoId(href)) {
                            const linkText = typeof children === 'string' ? children :
                              (Array.isArray(children) ? children.join('') : String(children));
                            return (
                              <div className="my-4">
                                <MediaEmbed
                                  url={href}
                                  title={linkText !== href ? linkText : undefined}
                                />
                              </div>
                            );
                          }

                          // Detect direct image URLs and embed them
                          if (href && isImageUrl(href)) {
                            const linkText = typeof children === 'string' ? children :
                              (Array.isArray(children) ? children.join('') : String(children));
                            return (
                              <div className="my-4">
                                <MediaEmbed
                                  url={href}
                                  title={linkText !== href ? linkText : undefined}
                                />
                              </div>
                            );
                          }

                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline underline-offset-2"
                              {...props}
                            >
                              {children}
                            </a>
                          );
                        },
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

                {/* Follow-up Research Threads - Same style as main content */}
                {activeSession.summaryConversation && activeSession.summaryConversation.length > 0 && (
                  <div className="space-y-8">
                    {activeSession.summaryConversation.reduce((acc: JSX.Element[], msg, idx, arr) => {
                      if (msg.role === 'user') {
                        const response = arr[idx + 1];
                        acc.push(
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="border-t border-border/30 pt-8"
                          >
                            {/* Follow-up Query as Sub-heading */}
                            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
                              <MessageCircle className="w-5 h-5 text-primary" />
                              {msg.content}
                            </h2>
                            
                            {/* Response Content - Same markdown styling */}
                            {response && response.role === 'assistant' && (
                              <>
                                {/* New sources pill if any */}
                                {response.sources && response.sources.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mb-4">
                                    {response.sources.map((source, sIdx) => (
                                      <a
                                        key={sIdx}
                                        href={source.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/50 bg-card/50 hover:bg-card hover:border-primary/40 transition-all text-sm"
                                      >
                                        <img
                                          src={`https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}&sz=16`}
                                          alt=""
                                          className="w-4 h-4 rounded"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                        <span className="text-muted-foreground truncate max-w-[150px]">
                                          {new URL(source.url).hostname.replace('www.', '')}
                                        </span>
                                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                                
                                <div className="prose prose-neutral dark:prose-invert prose-lg max-w-none">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      p: ({ node, ...props }) => (
                                        <p className="text-base sm:text-lg leading-relaxed mb-4 text-foreground/90" {...props} />
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
                                      a: ({ node, href, children, ...props }) => {
                                        // Detect YouTube links and embed them
                                        if (href && getYouTubeVideoId(href)) {
                                          const linkText = typeof children === 'string' ? children :
                                            (Array.isArray(children) ? children.join('') : String(children));
                                          return (
                                            <div className="my-4">
                                              <MediaEmbed
                                                url={href}
                                                title={linkText !== href ? linkText : undefined}
                                              />
                                            </div>
                                          );
                                        }

                                        // Detect direct image URLs and embed them
                                        if (href && isImageUrl(href)) {
                                          const linkText = typeof children === 'string' ? children :
                                            (Array.isArray(children) ? children.join('') : String(children));
                                          return (
                                            <div className="my-4">
                                              <MediaEmbed
                                                url={href}
                                                title={linkText !== href ? linkText : undefined}
                                              />
                                            </div>
                                          );
                                        }

                                        return (
                                          <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline underline-offset-2"
                                            {...props}
                                          >
                                            {children}
                                          </a>
                                        );
                                      },
                                    }}
                                  >
                                    {response.content.replace(/\n\n---\n\*.*\*$/, '')}
                                  </ReactMarkdown>
                                </div>
                              </>
                            )}
                            
                            {/* Loading state for pending response */}
                            {!response && (
                              <div className="flex items-center gap-3 text-muted-foreground">
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                >
                                  <Globe className="w-5 h-5 text-primary" />
                                </motion.div>
                                <span>Searching...</span>
                              </div>
                            )}
                          </motion.div>
                        );
                      }
                      return acc;
                    }, [])}
                  </div>
                )}

                {/* Spacer for input bar */}
                <div className="h-24" />

                {/* Follow-up Input - Glass Dock Style */}
                <div className="sticky bottom-6 z-10">
                  <div className={cn(
                    "glass-dock !rounded-full !p-1 transition-all duration-200",
                    "focus-within:ring-2 focus-within:ring-primary/40 focus-within:shadow-[0_0_24px_rgba(var(--primary),.15)]"
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
                        placeholder="Ask a follow-up..."
                        className="flex-1 border-0 bg-transparent h-12 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      
                      {/* Right send button */}
                      <button
                        onClick={handleFollowUp}
                        disabled={!followUpInput.trim()}
                        className={cn(
                          "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200",
                          followUpInput.trim() 
                            ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : isSearching ? (
              /* Searching State - Replaces Empty State */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-12"
              >
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5" />
                  <motion.div 
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Globe className="w-10 h-10 text-primary" />
                  </motion.div>
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                  Searching the web...
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Finding the best sources for your query
                </p>
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

                {/* Smart Suggestion Cards */}
                <AnimatePresence mode="wait">
                  {isLoadingSuggestions ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-wrap items-center justify-center gap-2 max-w-lg mx-auto"
                    >
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-12 w-36 rounded-full bg-muted/30 animate-pulse"
                        />
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="suggestions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-wrap items-center justify-center gap-2 max-w-lg mx-auto"
                    >
                      {(smartSuggestions.length > 0 ? smartSuggestions : defaultSuggestions).map((suggestion, index) => (
                        <motion.button
                          key={suggestion.label}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          onClick={() => {
                            setSearchQuery(suggestion.prompt);
                            handleSearch(suggestion.prompt);
                          }}
                          className="px-4 py-2.5 rounded-full border border-border/50 bg-card/50 hover:bg-card hover:border-primary/40 transition-all group"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <span className="text-sm font-medium text-foreground">{suggestion.label}</span>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>

        {/* Desktop: Right Sidebar for Saved Links */}
        {!isMobile && (
          <div className="w-80 border-l border-border/30 bg-card/30 flex-shrink-0">
            <SavedLinksSidebar />
          </div>
        )}
      </div>

    </div>
  );
}
