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
  FolderPlus,
  Trash2,
  Clock,
  Sparkles,
  Link2,
  ChevronRight,
  MessageSquare,
  Send,
  ArrowLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchStore, SearchResult, SearchSession } from "@/store/useSearchStore";
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
import { supabase } from "@/integrations/supabase/client";

export function SearchCanvas() {
  const {
    sessions,
    activeSessionId,
    isSearching,
    showLinksPanel,
    lists,
    pendingSearchQuery,
    closeSearch,
    setActiveSession,
    addSession,
    removeSession,
    clearAllSessions,
    setSearching,
    toggleLinksPanel,
    saveLink,
    createList,
    removeLink,
    setCurrentTab,
    startSourceChat,
    sendSourceMessage,
    setActiveSource,
    setPendingSearchQuery,
  } = useSearchStore();

  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
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

  // Current tab for active session
  const currentTab = activeSession?.currentTab || 'search';

  // Count of sources with conversations
  const chatCount = useMemo(() => {
    if (!activeSession?.sourceConversations) return 0;
    return Object.keys(activeSession.sourceConversations).length;
  }, [activeSession]);

  // Track which links are already saved
  const savedUrls = useMemo(() => {
    const urls = new Set<string>();
    lists.forEach((list) => {
      list.links.forEach((link) => urls.add(link.url));
    });
    return urls;
  }, [lists]);

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
      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [{ role: "user", content: query }],
          forceWebSearch: true,
        },
      });

      if (error) throw error;

      const results: SearchResult[] =
        data?.web_sources?.map((source: any, index: number) => ({
          id: `result-${index}`,
          title: source.title || "Untitled",
          url: source.url,
          snippet: source.snippet || source.content || "",
        })) || [];

      const formattedContent = data?.choices?.[0]?.message?.content || "No results found.";
      const relatedQueries = undefined; // Related queries not yet implemented in backend

      addSession(query, results, formattedContent, relatedQueries);
      
      toast({ title: `Found ${results.length} sources` });
    } catch (error) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description: "Please try again",
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

  const handleSaveToList = (result: SearchResult, listId: string) => {
    console.log('Saving link:', { result, listId, lists });
    saveLink({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      listId,
    });
    const listName = lists.find((l) => l.id === listId)?.name;
    toast({
      title: listName ? `Saved to ${listName}` : 'Link saved',
      description: result.title
    });
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

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const totalSavedLinks = useMemo(() => {
    return lists.reduce((acc, list) => acc + list.links.length, 0);
  }, [lists]);

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-background/95 backdrop-blur-xl",
        (isPWAMode || isElectronApp) && "pt-[34px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 glass-panel">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeSearch}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <X className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Search Mode
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Links Panel Toggle */}
          <Button
            variant={showLinksPanel ? "secondary" : "ghost"}
            size="sm"
            onClick={toggleLinksPanel}
            className="h-8 gap-1.5 text-xs"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Links</span>
            {totalSavedLinks > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full">
                {totalSavedLinks}
              </span>
            )}
          </Button>

          {/* Clear All */}
          {sessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllSessions}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear All</span>
            </Button>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="px-4 py-4 border-b border-border/20 bg-background/50 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch(searchQuery);
              }}
              placeholder="Search the web..."
              className="pl-12 pr-12 h-12 text-base bg-muted/30 backdrop-blur-md border-border/40 rounded-xl focus:ring-2 focus:ring-primary/30 hover:bg-muted/40 transition-colors"
              disabled={isSearching}
            />
            {isSearching ? (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <motion.div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="w-2 h-2 rounded-full bg-primary"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.div
                    className="w-2 h-2 rounded-full bg-primary"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                  />
                  <motion.div
                    className="w-2 h-2 rounded-full bg-primary"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                  />
                </motion.div>
              </div>
            ) : searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSearch(searchQuery)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Bar - Desktop (top) / Mobile (bottom) */}
      {activeSession && (
        <div className="border-b border-border/20 glass-shimmer md:block hidden">
          <div className="flex items-center justify-center gap-1 px-4">
            <button
              onClick={() => activeSessionId && setCurrentTab(activeSessionId, 'search')}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === 'search'
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
              {currentTab === 'search' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>

            <button
              onClick={() => activeSessionId && setCurrentTab(activeSessionId, 'chats')}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === 'chats'
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chats</span>
              {chatCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full">
                  {chatCount}
                </span>
              )}
              {currentTab === 'chats' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>

            <button
              onClick={() => activeSessionId && setCurrentTab(activeSessionId, 'saved')}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === 'saved'
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bookmark className="w-4 h-4" />
              <span>Saved</span>
              {totalSavedLinks > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full">
                  {totalSavedLinks}
                </span>
              )}
              {currentTab === 'saved' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative pb-16 md:pb-0">
        {/* Left Sidebar - Sessions (hidden on mobile) */}
        <div className="hidden md:flex w-64 flex-shrink-0 border-r border-border/40 flex-col glass-panel">
          <div className="px-3 py-2 border-b border-border/20 bg-muted/5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Search History ({sessions.length})
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sessions.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <Search className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No searches yet
                  </p>
                </div>
              ) : (
                sessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      onSelect={() => setActiveSession(session.id)}
                      onRemove={() => removeSession(session.id)}
                      formatTimestamp={formatTimestamp}
                    />
                  ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        {currentTab === 'search' && activeSession && (
          <SessionDetail
            session={activeSession}
            savedUrls={savedUrls}
            selectedResultId={selectedResultId}
            setSelectedResultId={setSelectedResultId}
            onCopy={handleCopy}
            copied={copied}
            lists={lists}
            onSaveToList={handleSaveToList}
            onNewList={(result) => {
              setPendingSaveResult(result);
              setShowNewListDialog(true);
            }}
            onRelatedSearch={(query) => {
              setSearchQuery(query);
              searchInputRef.current?.focus();
            }}
            onStartChat={(source) => {
              if (activeSessionId) {
                startSourceChat(activeSessionId, source);
              }
            }}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
          />
        )}

        {currentTab === 'chats' && activeSession && (
          <ChatsView
            session={activeSession}
            onBack={() => activeSessionId && setCurrentTab(activeSessionId, 'search')}
            onSendMessage={(sourceUrl, message) => {
              if (activeSessionId) {
                sendSourceMessage(activeSessionId, sourceUrl, message);
              }
            }}
            onSelectSource={(sourceUrl) => {
              if (activeSessionId) {
                setActiveSource(activeSessionId, sourceUrl);
              }
            }}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
          />
        )}

        {currentTab === 'saved' && (
          <LinksPanel
            lists={lists}
            sessions={sessions}
            onRemoveLink={removeLink}
            onSelectSession={(sessionId) => {
              setActiveSession(sessionId);
              if (activeSessionId) setCurrentTab(activeSessionId, 'search');
            }}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
            formatTimestamp={formatTimestamp}
          />
        )}

        {!activeSession && (
          <EmptyState onSearch={(q) => {
            setSearchQuery(q);
            searchInputRef.current?.focus();
          }} />
        )}
      </div>

      {/* Mobile Bottom Tab Bar */}
      {activeSession && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-strong border-t border-border/40 safe-area-inset-bottom z-50">
          <div className="flex items-center justify-around px-2">
            <button
              onClick={() => activeSessionId && setCurrentTab(activeSessionId, 'search')}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1",
                currentTab === 'search'
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Search className="w-5 h-5" />
              <span>Search</span>
            </button>

            <button
              onClick={() => activeSessionId && setCurrentTab(activeSessionId, 'chats')}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1 relative",
                currentTab === 'chats'
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <MessageSquare className="w-5 h-5" />
              <span>Chats</span>
              {chatCount > 0 && (
                <span className="absolute top-1 right-1/4 px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded-full">
                  {chatCount}
                </span>
              )}
            </button>

            <button
              onClick={() => activeSessionId && setCurrentTab(activeSessionId, 'saved')}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1 relative",
                currentTab === 'saved'
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Bookmark className="w-5 h-5" />
              <span>Saved</span>
              {totalSavedLinks > 0 && (
                <span className="absolute top-1 right-1/4 px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded-full">
                  {totalSavedLinks}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

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

// Session Card Component
function SessionCard({
  session,
  isActive,
  onSelect,
  onRemove,
  formatTimestamp,
}: {
  session: SearchSession;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  formatTimestamp: (timestamp: number) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "group relative rounded-lg p-2.5 cursor-pointer transition-all",
        isActive
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/50 border border-transparent"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium line-clamp-2 leading-snug",
              isActive ? "text-primary" : "text-foreground"
            )}
          >
            {session.query}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">
              {session.results.length} sources
            </span>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {formatTimestamp(session.timestamp)}
            </span>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      </div>
    </motion.div>
  );
}

// Session Detail Component
function SessionDetail({
  session,
  savedUrls,
  selectedResultId,
  setSelectedResultId,
  onCopy,
  copied,
  lists,
  onSaveToList,
  onNewList,
  onRelatedSearch,
  onStartChat,
  getFaviconUrl,
  getHostname,
}: {
  session: SearchSession;
  savedUrls: Set<string>;
  selectedResultId: string | null;
  setSelectedResultId: (id: string | null) => void;
  onCopy: () => void;
  copied: boolean;
  lists: any[];
  onSaveToList: (result: SearchResult, listId: string) => void;
  onNewList: (result: SearchResult) => void;
  onRelatedSearch: (query: string) => void;
  onStartChat: (source: SearchResult) => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
}) {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Summary Panel */}
      <div className="flex-1 flex flex-col overflow-hidden md:border-r border-border/20 min-h-[40vh] md:min-h-0">
        <div className="px-4 py-2 border-b border-border/20 glass-shimmer flex items-center justify-between flex-shrink-0">
          <div className="flex-1 min-w-0 mr-2">
            <p className="text-xs font-medium text-muted-foreground">Summary</p>
            <p className="text-sm font-medium text-foreground mt-0.5">
              {session.query}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopy}
            className="h-8 w-8 p-0"
          >
            {copied ? (
              <Check className="w-4 h-4 text-primary" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>
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
                {session.formattedContent}
              </ReactMarkdown>
            </div>
            
            {/* Related Searches */}
            {session.relatedQueries && session.relatedQueries.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border/20">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Related searches
                </p>
                <div className="flex flex-wrap gap-2">
                  {session.relatedQueries.map((query, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onRelatedSearch(query)}
                    >
                      <Search className="w-3 h-3 mr-1.5" />
                      {query}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Sources Panel */}
      <div className="w-full md:w-80 flex-shrink-0 flex flex-col overflow-hidden border-t md:border-t-0 border-border/20 flex-1 md:flex-initial">
        <div className="px-4 py-2 border-b border-border/20 glass-shimmer flex-shrink-0">
          <p className="text-xs font-medium text-muted-foreground">
            Sources ({session.results.length})
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {session.results.map((result, index) => {
              const isSaved = savedUrls.has(result.url);
              const isExpanded = selectedResultId === result.id;

              return (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={cn(
                    "group rounded-lg border border-border/30 bg-card/50 hover:bg-card/80 transition-all cursor-pointer overflow-hidden",
                    isExpanded && "ring-1 ring-primary/30"
                  )}
                  onClick={() => setSelectedResultId(isExpanded ? null : result.id)}
                >
                  <div className="p-3">
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

                      <div className={cn(
                        "flex items-center gap-1 transition-opacity",
                        openDropdownId === result.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        <DropdownMenu
                          onOpenChange={(open) => {
                            setOpenDropdownId(open ? result.id : null);
                          }}
                        >
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
                          <DropdownMenuContent
                            align="end"
                            className="w-48"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {lists.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                No lists available
                              </div>
                            ) : (
                              lists.map((list) => (
                                <DropdownMenuItem
                                  key={list.id}
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    onSaveToList(result, list.id);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Bookmark className="w-3.5 h-3.5 mr-2" />
                                  {list.name}
                                </DropdownMenuItem>
                              ))
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                onNewList(result);
                              }}
                              onClick={(e) => e.stopPropagation()}
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
                            onStartChat(result);
                          }}
                          title="Chat about this source"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Button>

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
  );
}

// Links Panel Component
function LinksPanel({
  lists,
  sessions,
  onRemoveLink,
  onSelectSession,
  getFaviconUrl,
  getHostname,
  formatTimestamp,
}: {
  lists: any[];
  sessions: SearchSession[];
  onRemoveLink: (listId: string, linkId: string) => void;
  onSelectSession: (sessionId: string) => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
  formatTimestamp: (timestamp: number) => string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/20 glass-shimmer">
        <p className="text-sm font-medium text-foreground">Saved & History</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your bookmarks and past searches
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Past Searches Section */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Past Searches
              <span className="text-xs text-muted-foreground font-normal">
                ({sessions.length})
              </span>
            </h3>
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-6">
                No searches yet
              </p>
            ) : (
              <div className="space-y-2 pl-6">
                {sessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => onSelectSession(session.id)}
                    >
                      <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                        <Search className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-1">
                          {session.query}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{session.results.length} sources</span>
                          <span>•</span>
                          <span>{formatTimestamp(session.timestamp)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
              </div>
            )}
          </div>

          {/* Saved Links Section */}
          {lists.map((list) => (
            <div key={list.id}>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-primary" />
                {list.name}
                <span className="text-xs text-muted-foreground font-normal">
                  ({list.links.length})
                </span>
              </h3>
              {list.links.length === 0 ? (
                <p className="text-xs text-muted-foreground pl-6">
                  No links saved yet
                </p>
              ) : (
                <div className="space-y-2 pl-6">
                  {list.links.map((link: any) => (
                    <div
                      key={link.id}
                      className="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                        {getFaviconUrl(link.url) ? (
                          <img
                            src={getFaviconUrl(link.url)!}
                            alt=""
                            className="w-4 h-4 rounded"
                          />
                        ) : (
                          <Globe className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-foreground hover:text-primary line-clamp-1"
                        >
                          {link.title}
                        </a>
                        <p className="text-xs text-muted-foreground truncate">
                          {getHostname(link.url)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onRemoveLink(list.id, link.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// Chats View Component
function ChatsView({
  session,
  onBack,
  onSendMessage,
  onSelectSource,
  getFaviconUrl,
  getHostname,
}: {
  session: SearchSession;
  onBack: () => void;
  onSendMessage: (sourceUrl: string, message: string) => void;
  onSelectSource: (sourceUrl: string) => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
}) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sourceConversations = session.sourceConversations || {};
  const activeSourceUrl = session.activeSourceUrl;
  const activeConversation = activeSourceUrl ? sourceConversations[activeSourceUrl] : null;

  // Get array of sources with conversations
  const sourcesWithChats = Object.values(sourceConversations);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  const handleSend = () => {
    if (!messageInput.trim() || !activeSourceUrl) return;
    onSendMessage(activeSourceUrl, messageInput);
    setMessageInput("");
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sources with Conversations List - hide on mobile when chat is active */}
      <div className={cn(
        "w-full md:w-72 flex-shrink-0 md:border-r border-border/20 flex flex-col overflow-hidden glass-panel",
        activeConversation && "hidden md:flex"
      )}>
        <div className="px-4 py-3 border-b border-border/20 glass-shimmer">
          <p className="text-sm font-medium text-foreground">Conversations</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sourcesWithChats.length} {sourcesWithChats.length === 1 ? 'source' : 'sources'}
          </p>
        </div>

        <ScrollArea className="flex-1">
          {sourcesWithChats.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">
                No conversations yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Click the chat icon on any source
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {sourcesWithChats.map((conv) => {
                const isActive = conv.sourceUrl === activeSourceUrl;
                const messageCount = conv.messages.length;
                const lastMessage = conv.messages[conv.messages.length - 1];

                return (
                  <motion.div
                    key={conv.sourceUrl}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "group relative rounded-lg p-3 cursor-pointer transition-all",
                      isActive
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50 border border-transparent"
                    )}
                    onClick={() => onSelectSource(conv.sourceUrl)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                        {getFaviconUrl(conv.sourceUrl) ? (
                          <img
                            src={getFaviconUrl(conv.sourceUrl)!}
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
                        <h4 className={cn(
                          "text-sm font-medium line-clamp-1 leading-snug",
                          isActive ? "text-primary" : "text-foreground"
                        )}>
                          {conv.sourceTitle}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {getHostname(conv.sourceUrl)}
                        </p>
                        {lastMessage && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {lastMessage.role === 'user' ? 'You: ' : 'Arc: '}
                            {lastMessage.content}
                          </p>
                        )}
                      </div>

                      <span className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded-full">
                        {messageCount}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Active Conversation */}
      {activeConversation ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Conversation Header */}
          <div className="px-4 py-3 border-b border-border/20 glass-shimmer flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 w-8 p-0 md:hidden"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground line-clamp-1">
                {activeConversation.sourceTitle}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {getHostname(activeConversation.sourceUrl)}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(activeConversation.sourceUrl, "_blank")}
              className="h-8 gap-1.5 text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Visit</span>
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-4">
            {/* Source Context Card */}
            <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-xs text-muted-foreground mb-1">About this source:</p>
              <p className="text-sm text-foreground">{activeConversation.sourceSnippet}</p>
            </div>

            {/* Messages */}
            <div className="space-y-3">
              {activeConversation.messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5",
                      message.role === 'user'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                  </div>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border/20 bg-background">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask about this source..."
                  className="pr-10 resize-none"
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={!messageInput.trim()}
                size="sm"
                className="h-10 w-10 p-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              No Conversation Selected
            </h3>
            <p className="text-sm text-muted-foreground">
              Select a source conversation from the list to continue chatting
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Empty State Component
function EmptyState({ onSearch }: { onSearch: (query: string) => void }) {
  const suggestions = [
    "Latest AI developments",
    "React best practices 2025",
    "TypeScript tips and tricks",
    "Web performance optimization",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Start Researching
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Search the web with AI-powered summaries. Your searches are saved so you
          can compare and organize your research.
        </p>
        
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">Try searching for:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onSearch(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
