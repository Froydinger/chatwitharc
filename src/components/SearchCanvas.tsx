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
import { useIsMobile } from "@/hooks/use-mobile";
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
    setCurrentTab,
    startSourceChat,
    sendSourceMessage,
    setActiveSource,
    setPendingSearchQuery,
    syncFromSupabase,
  } = useSearchStore();

  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [pendingSaveResult, setPendingSaveResult] = useState<SearchResult | null>(null);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

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

  // Count total saved links across all lists
  const totalSavedLinks = useMemo(() => {
    return lists.reduce((total, list) => total + list.links.length, 0);
  }, [lists]);

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
      // Phrase as a natural request that triggers web search (don't force the tool)
      const searchPrompt = `Search the web for: ${query}

Provide a comprehensive answer based on current information. Synthesize what you find into a clear, detailed response.`;

      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [{ role: "user", content: searchPrompt }],
          // Don't force web_search - let AI decide naturally (like regular chat)
        },
      });

      if (error) {
        console.error("Search API error:", error);
        throw error;
      }

      console.log("Search API response:", data);

      const results: SearchResult[] =
        data?.web_sources?.map((source: any, index: number) => ({
          id: `result-${index}`,
          title: source.title || "Untitled",
          url: source.url,
          snippet: source.snippet || source.content || "",
        })) || [];

      // Extract summary from the response - try multiple possible paths
      let formattedContent =
        data?.choices?.[0]?.message?.content ||
        data?.message?.content ||
        data?.content ||
        data?.summary ||
        "";

      // If still empty, check if web_sources has a summary field
      if (!formattedContent && data?.web_summary) {
        formattedContent = data.web_summary;
      }

      // Final fallback - create a basic summary from sources
      if (!formattedContent || formattedContent.trim() === "") {
        console.warn("No summary found in API response, generating fallback");
        formattedContent = `Found ${results.length} source${results.length !== 1 ? 's' : ''} for "${query}".\n\nClick on the sources to learn more.`;
      }

      console.log("Adding session with summary length:", formattedContent.length);

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
          {/* Clear All */}
          {sessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClearAllDialog(true)}
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

      {/* Tab Bar - Desktop (top) - show if activeSession OR if there are sessions */}
      {(activeSession || sessions.length > 0) && (
        <div className="border-b border-border/20 glass-shimmer md:block hidden">
          <div className="flex items-center justify-center gap-1 px-4">
            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, 'search');
                } else if (sessions.length > 0) {
                  // If no active session, select the most recent one
                  setActiveSession(sessions[sessions.length - 1].id);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === 'search'
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              disabled={!activeSession && sessions.length === 0}
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
              {currentTab === 'search' && activeSession && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>

            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, 'chats');
                } else if (sessions.length > 0) {
                  setActiveSession(sessions[sessions.length - 1].id);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === 'chats'
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              disabled={!activeSession && sessions.length === 0}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chats</span>
              {chatCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full">
                  {chatCount}
                </span>
              )}
              {currentTab === 'chats' && activeSession && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>

            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, 'saved');
                } else {
                  // Show saved tab without needing an active session
                  setCurrentTab('temp', 'saved');
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === 'saved'
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Search className="w-4 h-4" />
              <span>Research</span>
              {(sessions.length + totalSavedLinks) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full">
                  {sessions.length + totalSavedLinks}
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
        {/* Left Sidebar - Sessions (hidden on mobile) - show if there are sessions */}
        {sessions.length > 0 && (
          <div className="hidden md:flex w-64 flex-shrink-0 border-r border-border/40 flex-col glass-panel">
            <div className="px-3 py-2 border-b border-border/20 bg-muted/5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Search History ({sessions.length})
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {sessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      onSelect={() => {
                        setActiveSession(session.id);
                        setCurrentTab(session.id, 'search');
                      }}
                      onRemove={() => removeSession(session.id)}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}
              </div>
            </ScrollArea>
          </div>
        )}

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
            followUpInput={followUpInput}
            setFollowUpInput={setFollowUpInput}
            onFollowUp={(message) => {
              if (activeSessionId) {
                // Create a "follow-up" conversation based on the search
                const followUpSource: SearchResult = {
                  id: `followup-${Date.now()}`,
                  title: `Follow-up: ${session.query}`,
                  url: window.location.href,
                  snippet: session.formattedContent.slice(0, 200)
                };
                startSourceChat(activeSessionId, followUpSource);
                // Send the follow-up message
                setTimeout(() => {
                  sendSourceMessage(activeSessionId, followUpSource.url, message);
                  setFollowUpInput("");
                  setCurrentTab(activeSessionId, 'chats');
                }, 100);
              }
            }}
            summaryExpanded={summaryExpanded}
            setSummaryExpanded={setSummaryExpanded}
            sourcesExpanded={sourcesExpanded}
            setSourcesExpanded={setSourcesExpanded}
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
              setCurrentTab(sessionId, 'search');
            }}
            onStartChat={(link) => {
              // Create a temporary search result from the saved link
              const linkAsResult: SearchResult = {
                id: link.id,
                title: link.title,
                url: link.url,
                snippet: ""
              };
              // Find a session to attach the chat to, or create a temp one
              const sessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : 'temp';
              if (sessions.length > 0) {
                startSourceChat(sessionId, linkAsResult);
                setActiveSession(sessionId);
                setCurrentTab(sessionId, 'chats');
              } else {
                toast({ title: "Create a search first", description: "You need at least one search session to start a chat", variant: "destructive" });
              }
            }}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
            formatTimestamp={formatTimestamp}
          />
        )}

        {!activeSession && currentTab !== 'saved' && (
          <EmptyState onSearch={(q) => {
            setSearchQuery(q);
            searchInputRef.current?.focus();
          }} />
        )}
      </div>

      {/* Mobile Bottom Tab Bar - show if activeSession OR if there are sessions */}
      {(activeSession || sessions.length > 0) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-strong border-t border-border/40 safe-area-inset-bottom z-50">
          <div className="flex items-center justify-around px-2">
            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, 'search');
                } else if (sessions.length > 0) {
                  // If no active session, select the most recent one
                  setActiveSession(sessions[sessions.length - 1].id);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1",
                currentTab === 'search'
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
              disabled={!activeSession && sessions.length === 0}
            >
              <Search className="w-5 h-5" />
              <span>Search</span>
            </button>

            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, 'chats');
                } else if (sessions.length > 0) {
                  setActiveSession(sessions[sessions.length - 1].id);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1 relative",
                currentTab === 'chats'
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
              disabled={!activeSession && sessions.length === 0}
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
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, 'saved');
                } else {
                  // Show saved tab without needing an active session
                  setCurrentTab('temp', 'saved');
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1 relative",
                currentTab === 'saved'
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <Search className="w-5 h-5" />
              <span>Research</span>
              {(sessions.length + totalSavedLinks) > 0 && (
                <span className="absolute top-1 right-1/4 px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded-full">
                  {sessions.length + totalSavedLinks}
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

      {/* Clear All Confirmation Dialog */}
      <Dialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Clear All Search Data?
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm font-semibold text-destructive mb-2">⚠️ Warning: This action cannot be undone!</p>
              <p className="text-sm text-muted-foreground">
                This will permanently delete:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-destructive">•</span>
                  <span>All {sessions.length} search {sessions.length === 1 ? 'session' : 'sessions'}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive">•</span>
                  <span>All search summaries and results</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive">•</span>
                  <span>All conversations with sources (in Chats tab)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive">•</span>
                  <span>Search history from Supabase (if synced)</span>
                </li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Your saved bookmarks will NOT be deleted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAllDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearAllSessions();
                setShowClearAllDialog(false);
                toast({ title: "All search data cleared" });
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Yes, Delete Everything
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
  followUpInput,
  setFollowUpInput,
  onFollowUp,
  summaryExpanded,
  setSummaryExpanded,
  sourcesExpanded,
  setSourcesExpanded,
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
  followUpInput: string;
  setFollowUpInput: (value: string) => void;
  onFollowUp: (message: string) => void;
  summaryExpanded: boolean;
  setSummaryExpanded: (value: boolean) => void;
  sourcesExpanded: boolean;
  setSourcesExpanded: (value: boolean) => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
}) {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // On mobile, hide the opposite panel when one is expanded
  const showSummary = !isMobile || !sourcesExpanded;
  const showSources = !isMobile || !summaryExpanded;

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Summary Panel */}
      {showSummary && (
        <div className={cn(
          "flex flex-col overflow-hidden md:border-r border-border/20",
          summaryExpanded ? "flex-1" : "flex-1",
          isMobile && summaryExpanded ? "h-full" : "min-h-[40vh] md:min-h-0"
        )}>
          <div className="px-4 py-2 border-b border-border/20 glass-shimmer flex items-center justify-between flex-shrink-0">
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-xs font-medium text-muted-foreground">Summary</p>
              <p className="text-sm font-medium text-foreground mt-0.5 line-clamp-1">
                {session.query}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {/* Mobile expand button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSummaryExpanded(!summaryExpanded);
                  if (!summaryExpanded) setSourcesExpanded(false);
                }}
                className="h-8 w-8 p-0 md:hidden"
              >
                {summaryExpanded ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
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

        {/* Follow-up Input Bar */}
        <div className="p-3 border-t border-border/20 bg-muted/30 flex-shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && followUpInput.trim()) {
                    e.preventDefault();
                    onFollowUp(followUpInput);
                  }
                }}
                placeholder="Ask a follow-up question..."
                className="text-sm"
              />
            </div>
            <Button
              onClick={() => followUpInput.trim() && onFollowUp(followUpInput)}
              disabled={!followUpInput.trim()}
              size="sm"
              className="h-9"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Start a conversation about this search summary
          </p>
        </div>
      </div>
      )}

      {/* Sources Panel */}
      {showSources && (
        <div className={cn(
          "flex-shrink-0 flex flex-col overflow-hidden border-t md:border-t-0 border-border/20",
          sourcesExpanded ? "flex-1" : "w-full md:w-80",
          isMobile && sourcesExpanded ? "h-full" : "md:flex-initial"
        )}>
          <div className="px-4 py-2 border-b border-border/20 glass-shimmer flex-shrink-0 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Sources ({session.results.length})
            </p>
            {/* Mobile expand button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSourcesExpanded(!sourcesExpanded);
                if (!sourcesExpanded) setSummaryExpanded(false);
              }}
              className="h-8 w-8 p-0 md:hidden"
            >
              {sourcesExpanded ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <Globe className="w-4 h-4" />
              )}
            </Button>
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

                      <div className="flex items-center gap-1">
                        <DropdownMenu
                          onOpenChange={(open) => {
                            setOpenDropdownId(open ? result.id : null);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-6 w-6 p-0 transition-opacity",
                                openDropdownId === result.id
                                  ? "opacity-100"
                                  : "opacity-70 hover:opacity-100 md:opacity-50 md:group-hover:opacity-100"
                              )}
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
                          className="h-6 w-6 p-0 opacity-70 hover:opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity"
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
                          className="h-6 w-6 p-0 opacity-70 hover:opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity"
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
      )}
    </div>
  );
}

// Links Panel Component
function LinksPanel({
  lists,
  sessions,
  onRemoveLink,
  onSelectSession,
  onStartChat,
  getFaviconUrl,
  getHostname,
  formatTimestamp,
}: {
  lists: any[];
  sessions: SearchSession[];
  onRemoveLink: (listId: string, linkId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onStartChat: (link: any) => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
  formatTimestamp: (timestamp: number) => string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/20 glass-shimmer">
        <p className="text-sm font-medium text-foreground">Research</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your searches and saved bookmarks
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-70 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          onClick={() => onStartChat(link)}
                          title="Chat about this link"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-70 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          onClick={() => onRemoveLink(list.id, link.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
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

// History View Component
function HistoryView({
  sessions,
  onSelectSession,
  onRemoveSession,
  formatTimestamp,
}: {
  sessions: SearchSession[];
  onSelectSession: (sessionId: string) => void;
  onRemoveSession: (sessionId: string) => void;
  formatTimestamp: (timestamp: number) => string;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Reverse sessions (most recent first) and paginate
  const reversedSessions = useMemo(() => sessions.slice().reverse(), [sessions]);
  const totalPages = Math.ceil(reversedSessions.length / ITEMS_PER_PAGE);

  const paginatedSessions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return reversedSessions.slice(startIndex, endIndex);
  }, [reversedSessions, currentPage]);

  // Reset to page 1 when sessions change
  useEffect(() => {
    setCurrentPage(1);
  }, [sessions.length]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/20 glass-shimmer">
        <p className="text-sm font-medium text-foreground">Search History</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {sessions.length} {sessions.length === 1 ? 'search' : 'searches'}
        </p>
      </div>
      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 h-full">
            <Clock className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No search history yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your past searches will appear here
            </p>
          </div>
        ) : (
          <>
            {/* Pagination controls at top */}
            {totalPages > 1 && (
              <div className="p-4 pb-2 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8"
                >
                  Next
                  <ArrowLeft className="w-4 h-4 ml-1 rotate-180" />
                </Button>
              </div>
            )}

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginatedSessions.map((session, index) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="group relative rounded-lg p-4 border border-border/40 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all cursor-pointer"
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Search className="w-4 h-4 text-primary" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSession(session.id);
                      }}
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>

                  <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-2">
                    {session.query}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {session.results.length} {session.results.length === 1 ? 'source' : 'sources'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(session.timestamp)}
                    </span>
                  </div>

                  {session.sourceConversations && Object.keys(session.sourceConversations).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/20">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="w-3 h-3" />
                        {Object.keys(session.sourceConversations).length} {Object.keys(session.sourceConversations).length === 1 ? 'conversation' : 'conversations'}
                      </span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Pagination controls at bottom */}
            {totalPages > 1 && (
              <div className="p-4 pt-2 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8"
                >
                  Next
                  <ArrowLeft className="w-4 h-4 ml-1 rotate-180" />
                </Button>
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}

// Empty State Component
function EmptyState({ onSearch }: { onSearch: (query: string) => void }) {
  const suggestions = [
    "How to develop a daily reflection practice",
    "Creative writing prompts for self-discovery",
    "Building meaningful habits that last",
    "Understanding your personal values",
    "Newest calming trends and mindfulness techniques",
    "How to create a personal mission statement",
    "Morning routines for mental clarity",
    "Latest research on gratitude practices",
    "Setting boundaries for better well-being",
    "Emerging self-care practices in 2025",
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
