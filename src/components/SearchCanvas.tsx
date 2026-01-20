// SearchCanvas.tsx
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useArcStore } from "@/store/useArcStore";
import { useNavigate } from "react-router-dom";

/** Root SearchCanvas Component */
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
  const [isPWAMode, setIsPWAMode] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);

  /** PWA / Electron detection */
  useEffect(() => {
    const checkPWA =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    const checkElectron = /electron/i.test(navigator.userAgent);
    setIsPWAMode(checkPWA);
    setIsElectronApp(checkElectron);
  }, []);

  /** Get active session */
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );
  const currentTab = globalCurrentTab;

  /** Derived values */
  const totalSavedLinks = useMemo(() => lists.reduce((t, l) => t + l.links.length, 0), [lists]);

  /** Initial Supabase sync */
  useEffect(() => {
    syncFromSupabase().catch(console.error);
  }, []);

  /** Handle Search */
  const handleSearch = async (query: string) => {
    if (!query.trim() || isSearching) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("perplexity-search", {
        body: { query, model: "sonar-pro" },
      });
      if (error) throw error;
      const results: SearchResult[] =
        data?.sources?.map((src: any, i: number) => ({
          id: `res-${i}`,
          title: src.title || `Source ${i + 1}`,
          url: src.url,
          snippet: src.snippet || "",
        })) || [];
      const formattedContent = data?.content || `No results found for "${query}".`;
      addSession(query, results, formattedContent, undefined);
      toast({ title: `Found ${results.length} sources`, description: "Powered by Perplexity AI" });
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  /** Copy summary text */
  const handleCopy = async () => {
    if (!activeSession?.formattedContent) return;
    try {
      await navigator.clipboard.writeText(activeSession.formattedContent);
      setCopied(true);
      toast({ title: "Copied summary to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  /** Favicons & Hostnames */
  const getFaviconUrl = (url: string) => {
    try {
      return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
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

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  /** Main render */
  return (
    <div
      className={cn(
        "flex flex-col h-full w-full bg-background/80 backdrop-blur-2xl",
        (isPWAMode || isElectronApp) && "pt-[34px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={closeSearch} className="h-8 w-8 p-0">
            <X className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold">Research</span>
            <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">Perplexity</span>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 py-6 border-b border-border/20 bg-gradient-to-b from-background/60 to-background/90">
        <div className="max-w-2xl mx-auto relative flex items-center gap-3 px-4 py-3 border rounded-2xl bg-background/50">
          <Globe className="w-5 h-5 text-primary/60" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch(searchQuery)}
            placeholder="Ask anything..."
            className="flex-1 border-0 bg-transparent focus-visible:ring-0"
            disabled={isSearching}
          />
          {isSearching ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
              <Globe className="w-4 h-4 text-primary" />
            </motion.div>
          ) : (
            searchQuery && (
              <Button size="sm" onClick={() => handleSearch(searchQuery)}>
                <Search className="w-4 h-4 mr-1" /> Search
              </Button>
            )
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {currentTab === "saved" && (
          <LinksPanel
            lists={lists}
            onRemoveLink={() => {}} // disabled for now
            onMoveLink={() => {}} // disabled for now
            onCreateList={() => setShowNewListDialog(true)}
            onStartChat={() => {}}
            onStartChatWithMultiple={() => {}}
            getFaviconUrl={getFaviconUrl}
            getHostname={getHostname}
          />
        )}
      </div>

      {/* Dialogs */}
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
              onKeyDown={(e) => e.key === "Enter" && setShowNewListDialog(false)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewListDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newListName.trim()) {
                  createList(newListName.trim());
                  toast({ title: "List created", description: newListName });
                  setNewListName("");
                  setShowNewListDialog(false);
                }
              }}
              disabled={!newListName.trim()}
            >
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Clear All Search Data
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-3">
            This will remove all local sessions, searches, and chat history. Bookmarks will remain untouched.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearAllDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearAllSessions();
                setShowClearAllDialog(false);
                toast({ title: "Search data cleared" });
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Links Panel (click/delete hidden) */
function LinksPanel({
  lists,
  onRemoveLink,
  onMoveLink,
  onCreateList,
  getFaviconUrl,
  getHostname,
}: {
  lists: any[];
  onRemoveLink: any;
  onMoveLink: any;
  onCreateList: () => void;
  getFaviconUrl: (url: string) => string | null;
  getHostname: (url: string) => string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Saved Links</p>
          <p className="text-xs text-muted-foreground">Click and delete disabled temporarily</p>
        </div>
        <Button variant="outline" size="sm" onClick={onCreateList} className="h-8 gap-1.5 text-xs">
          <FolderPlus className="w-3.5 h-3.5" /> New List
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {lists.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Bookmark className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              No saved lists yet.
            </div>
          )}
          {lists.map((list) => (
            <div key={list.id} className="p-3 rounded-lg border border-border/30 bg-muted/10">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">{list.name}</h3>
                <span className="text-xs text-muted-foreground">({list.links.length})</span>
              </div>
              {list.links.length === 0 ? (
                <p className="text-xs text-muted-foreground">No links saved yet</p>
              ) : (
                <div className="space-y-1">
                  {list.links.map((link: any) => (
                    <div
                      key={link.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-all"
                    >
                      <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                        {getFaviconUrl(link.url) ? (
                          <img src={getFaviconUrl(link.url)!} alt="" className="w-4 h-4 rounded" />
                        ) : (
                          <Globe className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground line-clamp-1">{link.title}</span>
                        <p className="text-xs text-muted-foreground truncate">{getHostname(link.url)}</p>
                      </div>
                      {/* Hidden delete/move buttons */}
                      <div className="opacity-40 text-muted-foreground text-[10px] select-none">Disabled</div>
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
