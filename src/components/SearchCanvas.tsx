// src/components/SearchCanvas.tsx
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
  Trash2,
  Clock,
  ChevronRight,
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

const DEFAULT_LIST_ID = "default";

export function SearchCanvas() {
  const navigate = useNavigate();
  const { loadSession, addMessage } = useArcStore();

  const {
    sessions,
    activeSessionId,
    isSearching,
    // lists removed from UI usage, but kept if needed for counts; you may comment out if unused
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
    // createList removed
    removeLink,
    // moveLink removed
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

  // Removed: newListName, showNewListDialog, pendingSaveResult was kept only if used for saving a link
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

  // Helpers
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy" });
    }
  };

  const handleSaveResultToMainList = (result: SearchResult) => {
    try {
      saveLink(DEFAULT_LIST_ID, {
        id: result.id,
        url: result.url,
        title: result.title,
        timestamp: Date.now(),
      });
      toast({ title: "Saved to Main list" });
    } catch {
      toast({ title: "Failed to save link" });
    }
  };

  const handleRemoveLinkFromMainList = (linkId: string) => {
    try {
      removeLink(DEFAULT_LIST_ID, linkId);
      toast({ title: "Removed from Main list" });
    } catch {
      toast({ title: "Failed to remove link" });
    }
  };

  // Any UI previously showing multiple lists or new list creation is removed below.
  // Make sure any buttons or dropdowns invoking createList/moveLink are not rendered.

  // Your existing render code continues below; when rendering saved states,
  // replace any list selection with DEFAULT_LIST_ID.

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top bar */}
      <div
        className={cn("flex items-center gap-2 px-3 py-2 border-b border-border/30", {
          "pl-12": isPWAMode || isElectronApp, // traffic lights spacing buffer
        })}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => {
            closeSearch();
            navigate("/");
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search the web…"
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // trigger search via store
                setPendingSearchQuery(searchQuery.trim());
                setSearching(true);
              }
            }}
          />
        </div>

        <Button
          variant="default"
          size="sm"
          className="h-8"
          onClick={() => {
            setPendingSearchQuery(searchQuery.trim());
            setSearching(true);
          }}
        >
          Search
        </Button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 h-full">
          {/* Left: Results */}
          <div className="border-r border-border/30 h-full">
            <ScrollArea className="h-full">
              {/* Example results rendering (adapt to your actual structure) */}
              {activeSession?.results?.length ? (
                <div className="p-3 space-y-2">
                  {activeSession.results.map((result: SearchResult) => (
                    <div
                      key={result.id}
                      className={cn(
                        "rounded-md border border-border/30 p-3 hover:bg-muted/30",
                        selectedResultId === result.id && "ring-1 ring-ring",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:underline"
                          title={result.title}
                        >
                          {result.title}
                        </a>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleSaveResultToMainList(result)}
                            aria-label="Save to Main list"
                            title="Save to Main list"
                          >
                            <Bookmark className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {result.snippet ? <p className="text-xs text-muted-foreground mt-1">{result.snippet}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-sm text-muted-foreground">No results yet.</div>
              )}
            </ScrollArea>
          </div>

          {/* Right: Summary + Sources */}
          <div className="h-full">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-3">
                {/* Summary */}
                <div className="rounded-md border border-border/30">
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Summary</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSummaryExpanded((v) => !v)}
                    >
                      <ChevronRight className={cn("w-4 h-4 transition-transform", summaryExpanded && "rotate-90")} />
                    </Button>
                  </div>
                  {summaryExpanded && (
                    <div className="px-3 pb-3">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeSession?.summaryMarkdown || ""}</ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Sources */}
                <div className="rounded-md border border-border/30">
                  <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Sources</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setSourcesExpanded((v) => !v)}
                    >
                      <ChevronRight className={cn("w-4 h-4 transition-transform", sourcesExpanded && "rotate-90")} />
                    </Button>
                  </div>
                  {sourcesExpanded && (
                    <div className="px-3 pb-2 space-y-2">
                      {(activeSession?.sources || []).map((src) => (
                        <div
                          key={src.id}
                          className="flex items-center justify-between rounded-sm px-2 py-2 hover:bg-muted/30"
                        >
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm hover:underline truncate"
                            title={src.title}
                          >
                            {src.title}
                          </a>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                              onClick={() => handleRemoveLinkFromMainList(src.id)}
                              aria-label="Remove from Main list"
                              title="Remove from Main list"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Clear all sessions dialog */}
      <Dialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove your search sessions. Saved links in the Main list are not affected.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowClearAllDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearAllSessions();
                setShowClearAllDialog(false);
                toast({ title: "Cleared sessions" });
              }}
            >
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
