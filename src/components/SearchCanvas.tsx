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
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Send,
  ArrowLeft,
  Maximize2,
  Minimize2,
  GripVertical,
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
    globalCurrentTab,
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
    setCurrentTab,
    startSourceChat,
    sendSourceMessage,
    sendSummaryMessage,
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

  // Use global current tab instead of session-specific one
  const currentTab = globalCurrentTab;

  // Count of sources with conversations
  const chatCount = useMemo(() => {
    if (!activeSession?.sourceConversations) return 0;
    return Object.keys(activeSession.sourceConversations).length;
  }, [activeSession]);

  // Track which links are already saved and their info for removal
  const savedUrlsMap = useMemo(() => {
    const map = new Map<string, { listId: string; linkId: string }>();
    lists?.forEach((list) => {
      list.links?.forEach((link) => {
        map.set(link.url, { listId: list.id, linkId: link.id });
      });
    });
    return map;
  }, [lists]);

  // Simple set for quick lookup
  const savedUrls = useMemo(() => {
    return new Set(savedUrlsMap.keys());
  }, [savedUrlsMap]);

  // Count total saved links across all lists
  const totalSavedLinks = useMemo(() => {
    return lists?.reduce((total, list) => total + (list.links?.length || 0), 0) || 0;
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
      // Use Perplexity AI for research
      const { data, error } = await supabase.functions.invoke("perplexity-search", {
        body: {
          query: query,
          model: "sonar-pro", // Use sonar-pro for multi-step reasoning with 2x citations
        },
      });

      if (error) {
        console.error("Perplexity API error:", error);
        throw error;
      }

      console.log("Perplexity response:", data);

      // Convert Perplexity citations to SearchResult format
      const results: SearchResult[] =
        data?.sources?.map((source: any, index: number) => ({
          id: `result-${index}`,
          title: source.title || `Source ${index + 1}`,
          url: source.url,
          snippet: source.snippet || "",
        })) || [];

      // Use the Perplexity response content directly
      const formattedContent = data?.content || `No results found for "${query}".`;

      console.log("Adding session with summary length:", formattedContent.length);

      // Perplexity doesn't provide related queries by default
      const relatedQueries = undefined;

      addSession(query, results, formattedContent, relatedQueries);

      toast({
        title: `Found ${results.length} sources`,
        description: "Powered by Perplexity AI",
      });
    } catch (error: any) {
      console.error("Search error:", error);

      // Handle rate limits
      if (error.message?.includes("Rate limit") || error.message?.includes("429")) {
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

  const handleSaveToList = (result: SearchResult, listId: string) => {
    console.log("Saving link:", { result, listId, lists });
    saveLink({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      listId,
    });
    const listName = lists.find((l) => l.id === listId)?.name;
    toast({
      title: listName ? `Saved to ${listName}` : "Link saved",
      description: result.title,
    });
  };

  // Toggle save/unsave for a source
  const handleToggleSave = (result: SearchResult) => {
    const savedInfo = savedUrlsMap.get(result.url);

    if (savedInfo) {
      // Already saved - remove it
      removeLink(savedInfo.listId, savedInfo.linkId);
      toast({ title: "Link removed" });
    } else {
      // Not saved - save to default list
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

  const handleCreateListAndSave = () => {
    if (!newListName.trim()) return;
    const newListId = createList(newListName.trim());

    // If there's a pending result, save it to the new list
    if (pendingSaveResult) {
      handleSaveToList(pendingSaveResult, newListId);
      setPendingSaveResult(null);
    } else {
      toast({
        title: "List created",
        description: `"${newListName.trim()}" is ready for bookmarks`,
      });
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
    return date.toLocaleDateString();
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-background/80 backdrop-blur-2xl",
        (isPWAMode || isElectronApp) && "pt-[34px]",
      )}
    >
      {/* Header - Perplexity style */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 glass-panel bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
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
            <div className="relative">
              <Globe className="w-5 h-5 text-primary" />
              <motion.div
                className="absolute -inset-1 rounded-full bg-primary/20"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <span className="text-sm font-semibold text-foreground">Research</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              Perplexity
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

      {/* Search Input Bar - Perplexity style */}
      <div className="px-4 py-6 border-b border-border/20 bg-gradient-to-b from-background/60 to-background/90 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto">
          <div className="relative group">
            {/* Glow effect */}
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 opacity-0 group-focus-within:opacity-100 blur transition-opacity duration-300" />

            <div className="relative glass-panel rounded-2xl border border-border/40 group-focus-within:border-primary/40 transition-colors overflow-hidden">
              <div className="flex items-center gap-3 px-4">
                <Globe className="w-5 h-5 text-primary/60 group-focus-within:text-primary transition-colors" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch(searchQuery);
                  }}
                  placeholder="Ask anything..."
                  className="flex-1 border-0 bg-transparent h-14 text-base placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                  disabled={isSearching}
                />
                {isSearching ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      <Globe className="w-4 h-4 text-primary" />
                    </motion.div>
                    <span className="text-xs text-primary font-medium">Searching</span>
                  </div>
                ) : (
                  searchQuery && (
                    <Button
                      onClick={() => handleSearch(searchQuery)}
                      size="sm"
                      className="h-9 px-4 rounded-xl bg-primary hover:bg-primary/90"
                    >
                      <Search className="w-4 h-4 mr-1.5" />
                      Search
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Thinking indicator below search */}
          <AnimatePresence>
            {isSearching && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 flex items-center justify-center gap-3"
              >
                <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-primary/20">
                  <motion.div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-primary"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </motion.div>
                  <span className="text-sm text-muted-foreground">Researching with Perplexity AI...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tab Bar - Desktop (top) - show if activeSession OR if there are sessions */}
      {(activeSession || sessions.length > 0) && (
        <div className="border-b border-border/20 glass-shimmer md:block hidden">
          <div className="flex items-center justify-center gap-1 px-4">
            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, "search");
                } else if (sessions.length > 0) {
                  const latestSession = sessions[sessions.length - 1].id;
                  setActiveSession(latestSession);
                  setCurrentTab(latestSession, "search");
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === "search" ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              disabled={!activeSession && sessions.length === 0}
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
              {currentTab === "search" && activeSession && (
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
                  setCurrentTab(activeSessionId, "chats");
                } else if (sessions.length > 0) {
                  setActiveSession(sessions[sessions.length - 1].id);
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === "chats" ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
              {currentTab === "chats" && activeSession && (
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
                  setCurrentTab(activeSessionId, "saved");
                } else {
                  // Show saved tab without needing an active session
                  setCurrentTab("temp", "saved");
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative",
                currentTab === "saved" ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Search className="w-4 h-4" />
              <span>Research</span>
              {sessions.length + totalSavedLinks > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded-full">
                  {sessions.length + totalSavedLinks}
                </span>
              )}
              {currentTab === "saved" && (
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
                        setCurrentTab(session.id, "search");
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
        {currentTab === "search" && activeSession && (
          <SessionDetail
            session={activeSession}
            savedUrls={savedUrls}
            selectedResultId={selectedResultId}
            setSelectedResultId={setSelectedResultId}
            onCopy={handleCopy}
            copied={copied}
            lists={lists}
            onSaveToList={handleSaveToList}
            onToggleSave={handleToggleSave}
            onNewList={(result) => {
              setPendingSaveResult(result);
              setShowNewListDialog(true);
            }}
            onRelatedSearch={(query) => {
              setSearchQuery(query);
              searchInputRef.current?.focus();
            }}
            onStartChat={(source) => {
              // Start a source conversation within Research Mode (don't leave)
              if (activeSessionId) {
                startSourceChat(activeSessionId, source);
                // Switch to chats tab to show the conversation
                setCurrentTab(activeSessionId, "chats");
              }
            }}
            followUpInput={followUpInput}
            setFollowUpInput={setFollowUpInput}
            onFollowUp={async (message) => {
              if (!activeSessionId) return;

              // Send message within the summary (stays in search mode)
              await sendSummaryMessage(activeSessionId, message);
              setFollowUpInput("");
            }}
            summaryExpanded={summaryExpanded}
            setSummaryExpanded={setSummaryExpanded}
            sourcesExpanded={sourcesExpanded}
            setSourcesExpanded={setSourcesExpanded}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
          />
        )}

        {currentTab === "chats" && activeSession && (
          <ChatsView
            session={activeSession}
            onBack={() => activeSessionId && setCurrentTab(activeSessionId, "search")}
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

        {currentTab === "saved" && (
          <LinksPanel
            lists={lists}
            onRemoveLink={removeLink}
            onMoveLink={(linkId, fromListId, toListId) => {
              moveLink(linkId, fromListId, toListId);
              toast({ title: "Link moved" });
            }}
            onCreateList={() => {
              setShowNewListDialog(true);
            }}
            onStartChat={(link) => {
              // For saved links, we need to either find an existing session or create one
              // Then start a source chat within Research Mode
              const existingSession = sessions.find((s) => s.results.some((r) => r.url === link.url));
              if (existingSession) {
                setActiveSession(existingSession.id);
                const source = existingSession.results.find((r) => r.url === link.url);
                if (source) {
                  startSourceChat(existingSession.id, source);
                  setCurrentTab(existingSession.id, "chats");
                }
              } else {
                // Create a minimal session for this link
                const newResult: SearchResult = {
                  id: link.id,
                  title: link.title,
                  url: link.url,
                  snippet: link.snippet || "",
                };
                addSession(`Chat about: ${link.title}`, [newResult], `Research on: ${link.title}`, undefined);
                // After adding, get the latest session and start chat
                setTimeout(() => {
                  const latestSession =
                    useSearchStore.getState().sessions[useSearchStore.getState().sessions.length - 1];
                  if (latestSession) {
                    startSourceChat(latestSession.id, newResult);
                    setCurrentTab(latestSession.id, "chats");
                  }
                }, 100);
              }
            }}
            onStartChatWithMultiple={(links) => {
              // Create a session with all the selected links and start a chat about them
              const results: SearchResult[] = links.map((link: any, index: number) => ({
                id: link.id || `link-${index}`,
                title: link.title,
                url: link.url,
                snippet: link.snippet || "",
              }));

              const titles = links
                .slice(0, 3)
                .map((l: any) => l.title)
                .join(", ");
              const queryTitle = links.length > 3 ? `${titles}, and ${links.length - 3} more` : titles;

              addSession(
                `Research: ${queryTitle}`,
                results,
                `Researching ${links.length} sources:\n\n${links.map((l: any, i: number) => `${i + 1}. **${l.title}**\n   ${l.url}`).join("\n\n")}`,
                undefined,
              );

              // Switch to the new session
              setTimeout(() => {
                const latestSession = useSearchStore.getState().sessions[useSearchStore.getState().sessions.length - 1];
                if (latestSession) {
                  setActiveSession(latestSession.id);
                  setCurrentTab(latestSession.id, "search");
                  toast({
                    title: `Started research with ${links.length} sources`,
                    description: "Ask questions about these sources in the follow-up input",
                  });
                }
              }, 100);
            }}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
          />
        )}

        {!activeSession && currentTab !== "saved" && (
          <EmptyState
            onSearch={(q) => {
              setSearchQuery(q);
              searchInputRef.current?.focus();
            }}
          />
        )}
      </div>

      {/* Mobile Bottom Tab Bar - show if activeSession OR if there are sessions */}
      {(activeSession || sessions.length > 0) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass-strong border-t border-border/40 safe-area-inset-bottom z-50">
          <div className="flex items-center justify-around px-2">
            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, "search");
                } else if (sessions.length > 0) {
                  // If no active session, select the most recent one
                  setActiveSession(sessions[sessions.length - 1].id);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1",
                currentTab === "search" ? "text-primary" : "text-muted-foreground",
              )}
              disabled={!activeSession && sessions.length === 0}
            >
              <Search className="w-5 h-5" />
              <span>Search</span>
            </button>

            <button
              onClick={() => {
                if (activeSessionId) {
                  setCurrentTab(activeSessionId, "chats");
                } else if (sessions.length > 0) {
                  setActiveSession(sessions[sessions.length - 1].id);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1 relative",
                currentTab === "chats" ? "text-primary" : "text-muted-foreground",
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
                  setCurrentTab(activeSessionId, "saved");
                } else {
                  // Show saved tab without needing an active session
                  setCurrentTab("temp", "saved");
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-all flex-1 relative",
                currentTab === "saved" ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Search className="w-5 h-5" />
              <span>Research</span>
              {sessions.length + totalSavedLinks > 0 && (
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
            <DialogTitle>{pendingSaveResult ? "Create List & Save Link" : "Create New List"}</DialogTitle>
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
            <Button
              variant="outline"
              onClick={() => {
                setShowNewListDialog(false);
                setPendingSaveResult(null);
                setNewListName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateListAndSave} disabled={!newListName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              {pendingSaveResult ? "Create & Save" : "Create List"}
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
              <p className="text-sm text-muted-foreground">This will permanently delete:</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-destructive">•</span>
                  <span>
                    All {sessions.length} search {sessions.length === 1 ? "session" : "sessions"}
                  </span>
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
            <p className="text-sm text-muted-foreground">Your saved bookmarks will NOT be deleted.</p>
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
        isActive ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium line-clamp-2 leading-snug",
              isActive ? "text-primary" : "text-foreground",
            )}
          >
            {session.query}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">{session.results.length} sources</span>
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
  onToggleSave,
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
  onToggleSave: (result: SearchResult) => void;
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
  const isMobile = useIsMobile();

  // On mobile, hide the opposite panel when one is expanded
  const showSummary = !isMobile || !sourcesExpanded;
  const showSources = !isMobile || !summaryExpanded;

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Summary Panel */}
      {showSummary && (
        <div
          className={cn(
            "flex flex-col overflow-hidden md:border-r border-border/20",
            summaryExpanded ? "flex-1" : "flex-1",
            isMobile && summaryExpanded ? "h-full" : "min-h-[40vh] md:min-h-0",
          )}
        >
          <div className="px-4 py-3 border-b border-border/20 glass-shimmer flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
            <div className="flex-1 min-w-0 mr-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <Globe className="w-3 h-3 text-primary" />
                </div>
                <p className="text-xs font-medium text-primary">Answer</p>
              </div>
              <p className="text-sm font-medium text-foreground line-clamp-1">{session.query}</p>
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
                {summaryExpanded ? <ChevronRight className="w-4 h-4" /> : <Search className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={onCopy} className="h-8 w-8 p-0">
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
                    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-3 space-y-1" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-3 space-y-1" {...props} />,
                    li: ({ node, ...props }) => <li className="text-sm text-foreground leading-relaxed" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                    a: ({ node, href, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        {...props}
                      />
                    ),
                    code: ({ node, ...props }) => <code className="px-1 py-0.5 bg-muted rounded text-xs" {...props} />,
                  }}
                >
                  {session.formattedContent}
                </ReactMarkdown>
              </div>

              {/* Related Searches */}
              {session.relatedQueries && session.relatedQueries.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Related searches</p>
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

          {/* Conversation Messages */}
          {session.summaryConversation && session.summaryConversation.length > 0 && (
            <div className="border-t border-border/20 bg-muted/10 flex-shrink-0 max-h-[300px] overflow-hidden">
              <ScrollArea className="h-full max-h-[300px] overflow-auto">
                <div className="p-3 space-y-3">
                  {session.summaryConversation.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "rounded-lg p-3 text-sm",
                        msg.role === "user" ? "bg-primary/10 text-foreground ml-4" : "bg-muted/50 text-foreground mr-4",
                      )}
                    >
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {msg.role === "user" ? "You" : "Assistant"}
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

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
            <p className="text-[10px] text-muted-foreground mt-1.5">Start a conversation about this search summary</p>
          </div>
        </div>
      )}

      {/* Sources Panel - Perplexity style */}
      {showSources && (
        <div
          className={cn(
            "flex-shrink-0 flex flex-col overflow-hidden border-t md:border-t-0 border-border/20 bg-muted/20",
            sourcesExpanded ? "flex-1" : "w-full md:w-80",
            isMobile && sourcesExpanded ? "h-full" : "md:flex-initial",
            !sourcesExpanded && isMobile && "max-h-[40vh]",
          )}
        >
          <div className="px-4 py-3 border-b border-border/20 glass-shimmer flex-shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                <Globe className="w-3 h-3 text-primary" />
              </div>
              <p className="text-xs font-medium text-foreground">Sources ({session.results.length})</p>
            </div>
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
              {sourcesExpanded ? <ChevronRight className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </Button>
          </div>
          <ScrollArea className="flex-1 overflow-auto">
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
                      isExpanded && "ring-1 ring-primary/30",
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
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{getHostname(result.url)}</p>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Simple save toggle button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-8 w-8 p-0 transition-all touch-manipulation",
                              isSaved
                                ? "text-primary hover:text-primary/80"
                                : "opacity-100 md:opacity-50 md:group-hover:opacity-100",
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSave(result);
                            }}
                            title={isSaved ? "Remove from saved" : "Save link"}
                          >
                            {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity touch-manipulation"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartChat(result);
                            }}
                            title="Chat about this source"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity touch-manipulation"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(result.url, "_blank");
                            }}
                          >
                            <ExternalLink className="w-4 h-4" />
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
                              !isExpanded && "line-clamp-2",
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
  onRemoveLink,
  onMoveLink,
  onCreateList,
  onStartChat,
  onStartChatWithMultiple,
  getFaviconUrl,
  getHostname,
}: {
  lists: any[];
  onRemoveLink: (listId: string, linkId: string) => void;
  onMoveLink: (linkId: string, fromListId: string, toListId: string) => void;
  onCreateList: () => void;
  onStartChat: (link: any) => void;
  onStartChatWithMultiple: (links: any[]) => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
}) {
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());

  // Initialize all lists as expanded by default so user sees content
  useEffect(() => {
    if (lists && lists.length > 0) {
      setExpandedLists(new Set(lists.map((l) => l.id)));
    }
  }, [lists?.length]);

  const toggleList = (listId: string) => {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  };

  const toggleLinkSelection = (linkId: string) => {
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

  const selectAllInList = (list: any) => {
    setSelectedLinks((prev) => {
      const next = new Set(prev);
      list.links?.forEach((link: any) => next.add(link.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedLinks(new Set());
    setIsSelectMode(false);
  };

  const getSelectedLinksData = () => {
    const selected: any[] = [];
    lists?.forEach((list) => {
      list.links?.forEach((link: any) => {
        if (selectedLinks.has(link.id)) {
          selected.push(link);
        }
      });
    });
    return selected;
  };

  const handleChatWithSelected = () => {
    const links = getSelectedLinksData();
    if (links.length > 0) {
      onStartChatWithMultiple(links);
      clearSelection();
    }
  };

  const handleChatWithList = (list: any) => {
    if (list.links && list.links.length > 0) {
      onStartChatWithMultiple(list.links);
    }
  };

  if (!lists) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/20 glass-shimmer flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Saved Links</p>
          <p className="text-xs text-muted-foreground mt-0.5">Organize and chat with your bookmarks</p>
        </div>
        <div className="flex items-center gap-2">
          {isSelectMode ? (
            <>
              <span className="text-xs text-muted-foreground">{selectedLinks.size} selected</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleChatWithSelected}
                disabled={selectedLinks.size === 0}
                className="h-8 gap-1.5 text-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection} className="h-8 text-xs">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSelectMode(true)}
                className="h-8 text-xs text-muted-foreground"
              >
                Select
              </Button>
              <Button variant="outline" size="sm" onClick={onCreateList} className="h-8 gap-1.5 text-xs flex-shrink-0">
                <FolderPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New List</span>
              </Button>
            </>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {lists.length === 0 ? (
            <div className="text-center py-8">
              <Bookmark className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No saved links yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Save links from search results to organize them here
              </p>
            </div>
          ) : (
            lists.map((list) => {
              const isExpanded = expandedLists.has(list.id);
              return (
                <div key={list.id} className="border border-border/30 rounded-lg overflow-hidden bg-card/30">
                  <div
                    className="flex items-center justify-between p-3 bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleList(list.id)}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Bookmark className="w-4 h-4 text-primary" />
                        {list.name}
                        <span className="text-xs text-muted-foreground font-normal">({list.links?.length || 0})</span>
                      </h3>
                    </div>

                    {list.links && list.links.length > 0 && isExpanded && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {isSelectMode && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => selectAllInList(list)}
                            className="h-7 text-xs text-muted-foreground"
                          >
                            Select all
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleChatWithList(list)}
                          className="h-7 gap-1 text-xs text-primary hover:text-primary"
                          title="Chat about all links in this list"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Chat with list
                        </Button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="p-2 space-y-1">
                      {!list.links || list.links.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-8 py-2">No links saved yet</p>
                      ) : (
                        list.links.map((link: any) => {
                          const isSelected = selectedLinks.has(link.id);
                          return (
                            <div
                              key={link.id}
                              className={cn(
                                "group flex items-start gap-2 p-2 rounded-lg transition-colors ml-4",
                                isSelectMode ? "cursor-pointer" : "",
                                isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50",
                              )}
                              onClick={isSelectMode ? () => toggleLinkSelection(link.id) : undefined}
                            >
                              {isSelectMode && (
                                <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                                  <div
                                    className={cn(
                                      "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                                      isSelected ? "bg-primary border-primary" : "border-muted-foreground/40",
                                    )}
                                  >
                                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                                  </div>
                                </div>
                              )}
                              <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                                {getFaviconUrl(link.url) ? (
                                  <img src={getFaviconUrl(link.url)!} alt="" className="w-4 h-4 rounded" />
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
                                  onClick={(e) => isSelectMode && e.preventDefault()}
                                >
                                  {link.title}
                                </a>
                                <p className="text-xs text-muted-foreground truncate">{getHostname(link.url)}</p>
                              </div>
                              {!isSelectMode && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity touch-manipulation"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(link.url, "_blank");
                                    }}
                                    title="Open in new tab"
                                  >
                                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity touch-manipulation"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onStartChat(link);
                                    }}
                                    title="Chat about this link"
                                  >
                                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                                  {/* Move to another list */}
                                  {lists.length > 1 && (
                                    <select
                                      className="h-7 text-xs bg-transparent border border-border/50 rounded px-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          onMoveLink(link.id, list.id, e.target.value);
                                          e.target.value = "";
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      title="Move to another list"
                                    >
                                      <option value="" disabled>
                                        Move...
                                      </option>
                                      {lists
                                        .filter((l) => l.id !== list.id)
                                        .map((targetList) => (
                                          <option key={targetList.id} value={targetList.id}>
                                            {targetList.name}
                                          </option>
                                        ))}
                                    </select>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity touch-manipulation text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRemoveLink(list.id, link.id);
                                    }}
                                    title="Delete link"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
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
      <div
        className={cn(
          "w-full md:w-72 flex-shrink-0 md:border-r border-border/20 flex flex-col overflow-hidden glass-panel",
          activeConversation && "hidden md:flex",
        )}
      >
        <div className="px-4 py-3 border-b border-border/20 glass-shimmer">
          <p className="text-sm font-medium text-foreground">Conversations</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sourcesWithChats.length} {sourcesWithChats.length === 1 ? "source" : "sources"}
          </p>
        </div>

        <ScrollArea className="flex-1">
          {sourcesWithChats.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-1">Click the chat icon on any source</p>
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
                        : "hover:bg-muted/50 border border-transparent",
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
                        <h4
                          className={cn(
                            "text-sm font-medium line-clamp-1 leading-snug",
                            isActive ? "text-primary" : "text-foreground",
                          )}
                        >
                          {conv.sourceTitle}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{getHostname(conv.sourceUrl)}</p>
                        {lastMessage && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {lastMessage.role === "user" ? "You: " : "Arc: "}
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
            <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0 md:hidden">
              <ArrowLeft className="w-4 h-4" />
            </Button>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground line-clamp-1">{activeConversation.sourceTitle}</p>
              <p className="text-xs text-muted-foreground truncate">{getHostname(activeConversation.sourceUrl)}</p>
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
                  className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5",
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
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
              <Button onClick={handleSend} disabled={!messageInput.trim()} size="sm" className="h-10 w-10 p-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Conversation Selected</h3>
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
          {sessions.length} {sessions.length === 1 ? "search" : "searches"}
        </p>
      </div>
      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 h-full">
            <Clock className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No search history yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your past searches will appear here</p>
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
                      {session.results.length} {session.results.length === 1 ? "source" : "sources"}
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
                        {Object.keys(session.sourceConversations).length}{" "}
                        {Object.keys(session.sourceConversations).length === 1 ? "conversation" : "conversations"}
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

// Empty State Component - Perplexity style
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
    {
      title: "Learn",
      suggestions: ["Best practices for productivity", "How to start investing", "Understanding machine learning"],
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        {/* Perplexity-style icon */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-20 h-20 mx-auto mb-6"
        >
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 backdrop-blur-xl" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Globe className="w-10 h-10 text-primary" />
          </div>
          <motion.div
            className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-primary/10 via-transparent to-primary/10"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>

        <h2 className="text-2xl font-bold text-foreground mb-2">Ask anything</h2>
        <p className="text-muted-foreground mb-8">
          Get instant answers with real-time web search powered by Perplexity AI
        </p>

        {/* Suggestion groups */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          {suggestionGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">{group.title}</p>
              <div className="space-y-1.5">
                {group.suggestions.map((suggestion) => (
                  <motion.button
                    key={suggestion}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full text-left px-3 py-2.5 rounded-xl glass-panel border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    onClick={() => onSearch(suggestion)}
                  >
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm text-foreground line-clamp-1">{suggestion}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
