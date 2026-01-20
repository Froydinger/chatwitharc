import { useState, useMemo, useRef, useEffect, memo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
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
  MessageCircle,
  CheckSquare,
  Square,
  Trash2,
  FolderPlus,
  X,
  Library,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchStore, SearchResult, SavedLink, LinkList } from "@/store/useSearchStore";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { supabase } from "@/integrations/supabase/client";

// Inline Citation Component - shows clickable source references in the text
function InlineCitation({
  index,
  source,
  getFaviconUrl
}: {
  index: number;
  source: SearchResult;
  getFaviconUrl: (url: string) => string | null;
}) {
  const hostname = (() => {
    try {
      return new URL(source.url).hostname.replace("www.", "");
    } catch {
      return source.url;
    }
  })();

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 mx-0.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors align-baseline cursor-pointer no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          {index}
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-3" side="top" align="start">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            {getFaviconUrl(source.url) ? (
              <img
                src={getFaviconUrl(source.url)!}
                alt=""
                className="w-5 h-5 rounded"
              />
            ) : (
              <Globe className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground line-clamp-2 mb-1">
              {source.title}
            </p>
            <p className="text-xs text-muted-foreground mb-2">{hostname}</p>
            {source.snippet && (
              <p className="text-xs text-muted-foreground/80 line-clamp-2">
                {source.snippet}
              </p>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Process content to add inline citations
function processContentWithCitations(
  content: string,
  sources: SearchResult[],
  getFaviconUrl: (url: string) => string | null
): React.ReactNode[] {
  // Match citation patterns like [1], [2], [1,2], [1][2], etc.
  const citationRegex = /\[(\d+(?:,\s*\d+)*)\]|\[(\d+)\]\[(\d+)\]/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = citationRegex.exec(content)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    // Parse citation numbers
    const citationText = match[1] || `${match[2]},${match[3]}`;
    const citations = citationText.split(/,\s*/).map(n => parseInt(n.trim(), 10));

    // Add citation components
    citations.forEach((num, idx) => {
      const sourceIndex = num - 1; // Citations are 1-indexed
      if (sourceIndex >= 0 && sourceIndex < sources.length) {
        parts.push(
          <InlineCitation
            key={`citation-${key++}`}
            index={num}
            source={sources[sourceIndex]}
            getFaviconUrl={getFaviconUrl}
          />
        );
      } else {
        // If source doesn't exist, just show the number
        parts.push(
          <span key={`citation-${key++}`} className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 mx-0.5 text-xs font-medium bg-muted text-muted-foreground rounded-md">
            {num}
          </span>
        );
      }
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [content];
}

// Props interface for SavedLinksSidebar
interface SavedLinksSidebarProps {
  className?: string;
  lists: LinkList[];
  activeListId: string;
  setActiveListId: (id: string) => void;
  isSelectMode: boolean;
  setIsSelectMode: (mode: boolean) => void;
  selectedLinks: Set<string>;
  onToggleSelectLink: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onChatWithSelected: () => void;
  onDeleteSelected: () => void;
  onChatWithLink: (link: SavedLink) => void;
  onRemoveLink: (listId: string, linkId: string) => void;
  onShowNewListDialog: () => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
  allSavedLinksCount: number;
}

// Memoized SavedLinksSidebar component to prevent re-renders
const SavedLinksSidebar = memo(function SavedLinksSidebar({
  className,
  lists,
  activeListId,
  setActiveListId,
  isSelectMode,
  setIsSelectMode,
  selectedLinks,
  onToggleSelectLink,
  onSelectAll,
  onClearSelection,
  onChatWithSelected,
  onDeleteSelected,
  onChatWithLink,
  onRemoveLink,
  onShowNewListDialog,
  getFaviconUrl,
  getHostname,
  allSavedLinksCount,
}: SavedLinksSidebarProps) {
  const activeList = lists.find((l) => l.id === activeListId) || lists[0];

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Library className="w-5 h-5 text-primary" />
          <span className="font-semibold">Saved</span>
          <span className="text-xs text-muted-foreground">({allSavedLinksCount})</span>
        </div>
        <div className="flex items-center gap-1">
          {isSelectMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAll}
                className="h-8 text-xs"
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
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
              disabled={allSavedLinksCount === 0}
            >
              Select
            </Button>
          )}
        </div>
      </div>

      {/* List Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/20 overflow-x-auto no-scrollbar">
        {lists.map((list) => (
          <button
            key={list.id}
            onClick={() => setActiveListId(list.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              activeListId === list.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {list.name}
            <span className="ml-1 opacity-70">({list.links.length})</span>
          </button>
        ))}
        <button
          onClick={onShowNewListDialog}
          className="p-1.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
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
                  onClick={onChatWithSelected}
                  className="h-7 text-xs gap-1"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Chat
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDeleteSelected}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Links List */}
      <div className="flex-1 overflow-auto">
        {activeList && activeList.links.length > 0 ? (
          <div className="p-2 space-y-1">
            {activeList.links.map((link) => {
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
                        onClick={() => onToggleSelectLink(link.id)}
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
                          onClick={() => onChatWithLink(link)}
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
                          onClick={() => onRemoveLink(link.listId, link.id)}
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
});

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
  const [showHistory, setShowHistory] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const [newListName, setNewListName] = useState("");
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [pendingSaveResult, setPendingSaveResult] = useState<SearchResult | null>(null);
  const [showSavedLinks, setShowSavedLinks] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [activeListId, setActiveListId] = useState<string>("default");

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

  // Get active list
  const activeList = useMemo(() => {
    return lists.find((l) => l.id === activeListId) || lists[0];
  }, [lists, activeListId]);

  // Get all saved links across all lists
  const allSavedLinks = useMemo(() => {
    return lists.flatMap((list) => list.links);
  }, [lists]);

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
    setActiveListId(newListId);
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
    if (activeList) {
      const allIds = new Set(activeList.links.map((l) => l.id));
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

    const selectedLinkObjects = allSavedLinks.filter((l) => selectedLinks.has(l.id));
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
      const link = allSavedLinks.find((l) => l.id === linkId);
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

  // Memoized sidebar props
  const sidebarProps = useMemo(() => ({
    lists,
    activeListId,
    setActiveListId,
    isSelectMode,
    setIsSelectMode,
    selectedLinks,
    onToggleSelectLink: handleToggleSelectLink,
    onSelectAll: handleSelectAll,
    onClearSelection: handleClearSelection,
    onChatWithSelected: handleChatWithSelected,
    onDeleteSelected: handleDeleteSelected,
    onChatWithLink: handleChatWithLink,
    onRemoveLink: removeLink,
    onShowNewListDialog: () => setShowNewListDialog(true),
    getFaviconUrl,
    getHostname,
    allSavedLinksCount: allSavedLinks.length,
  }), [lists, activeListId, isSelectMode, selectedLinks, allSavedLinks.length]);

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
              <span className="text-xs text-muted-foreground">({allSavedLinks.length})</span>
            </Button>
          )}
        </div>
      </header>

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
                  <SavedLinksSidebar {...sidebarProps} />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
            {/* Search Input */}
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

                {/* Main Answer - Blog Style with Inline Citations */}
                <article className="mb-8">
                  <div className="prose prose-neutral dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // Custom text renderer to process citations like [1], [2]
                        text: ({ node }) => {
                          const text = String(node.value || '');
                          // Check if text contains citation patterns
                          if (/\[\d+\]/.test(text)) {
                            return <>{processContentWithCitations(text, activeSession.results, getFaviconUrl)}</>;
                          }
                          return <>{text}</>;
                        },
                        p: ({ node, children, ...props }) => (
                          <p className="text-base sm:text-lg leading-relaxed mb-4 text-foreground/90" {...props}>
                            {children}
                          </p>
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
                        li: ({ node, children, ...props }) => (
                          <li className="text-base sm:text-lg leading-relaxed text-foreground/90" {...props}>
                            {children}
                          </li>
                        ),
                        strong: ({ node, ...props }) => (
                          <strong className="font-semibold text-foreground" {...props} />
                        ),
                        a: ({ node, href, children, ...props }) => {
                          // Check if this is a source link (matches one of our sources)
                          const sourceIndex = activeSession.results.findIndex(r => r.url === href);
                          if (sourceIndex !== -1) {
                            return (
                              <InlineCitation
                                index={sourceIndex + 1}
                                source={activeSession.results[sourceIndex]}
                                getFaviconUrl={getFaviconUrl}
                              />
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

                {/* Follow-up Conversation Thread */}
                {activeSession.summaryConversation && activeSession.summaryConversation.length > 0 && (
                  <div className="mb-8 border-t border-border/30 pt-8">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <RotateCcw className="w-5 h-5 text-primary" />
                      Follow-up Questions
                    </h3>
                    <div className="space-y-6">
                      {activeSession.summaryConversation.reduce((acc: JSX.Element[], msg, idx, arr) => {
                        if (msg.role === 'user') {
                          const response = arr[idx + 1];
                          acc.push(
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="rounded-xl border border-border/50 bg-card/30 overflow-hidden"
                            >
                              <div className="px-4 py-3 bg-primary/5 border-b border-border/30">
                                <p className="font-medium text-foreground">{msg.content}</p>
                              </div>
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

        {/* Desktop: Right Sidebar for Saved Links */}
        {!isMobile && (
          <div className="w-80 border-l border-border/30 bg-card/30 flex-shrink-0">
            <SavedLinksSidebar {...sidebarProps} />
          </div>
        )}
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
