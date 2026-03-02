import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Search, MessageCircle, Copy, Check, Eye, FileCode, Download, Code, PenLine } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useArcStore } from "@/store/useArcStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CodePreview } from "@/components/CodePreview";
import { useIsMobile } from "@/hooks/use-mobile";
import { getLanguageDisplay, getLanguageColor, getFileExtension, canPreview } from "@/utils/codeUtils";

interface CanvasItem {
  id: string;
  type: 'code' | 'writing';
  content: string;
  language?: string;
  sessionId: string;
  sessionTitle: string;
  timestamp: Date;
  label?: string;
}

// Safely coerce unknown timestamp shapes to a Date
function toDate(ts: unknown): Date | null {
  if (ts instanceof Date) return ts;
  if (typeof ts === "number") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

// Extract code blocks from markdown content
function extractCodeBlocks(content: string): Array<{ code: string; language: string }> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: Array<{ code: string; language: string }> = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || "text",
      code: match[2].trim(),
    });
  }

  return blocks;
}

export function CanvasesPanel() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { chatSessions, loadSession, setRightPanelOpen, hydrateAllSessions, isHydratingAll, allSessionsHydrated } = useArcStore();
  const { openWithContent } = useCanvasStore();
  const [selectedItem, setSelectedItem] = useState<CanvasItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Hydrate all sessions when tab is opened so canvases are available
  useEffect(() => {
    hydrateAllSessions();
  }, [hydrateAllSessions]);

  // Scroll to top when panel opens
  useEffect(() => {
    const container = document.querySelector('.canvases-container');
    if (container) {
      container.scrollTop = 0;
    }
  }, []);

  const isLoading = isHydratingAll && !allSessionsHydrated;

  const goToChat = (sessionId: string) => {
    loadSession(sessionId);
    navigate(`/chat/${sessionId}`);
    if (isMobile || window.innerWidth < 1024) {
      setRightPanelOpen(false);
    }
    setSelectedItem(null);
  };

  const openInCanvas = (item: CanvasItem) => {
    // Navigate to the source chat first so the canvas opens in context
    loadSession(item.sessionId);
    navigate(`/chat/${item.sessionId}`);
    // Then open the canvas with the content
    openWithContent(item.content, item.type, item.language || 'text');
    if (isMobile || window.innerWidth < 1024) {
      setRightPanelOpen(false);
    }
    setSelectedItem(null);
  };

  // Extract all canvases from chat sessions
  const canvasItems = useMemo(() => {
    const items: CanvasItem[] = [];

    chatSessions.forEach((session) => {
      session.messages.forEach((message) => {
        if (!message) return;
        
        const coerced = toDate(message?.timestamp);
        if (!coerced) return;

        // Extract canvas-type messages (writing canvases)
        // Use canvasContent (actual writing) not content (which is just the command/label)
        if (message.type === 'canvas') {
          const canvasContent = (message as any).canvasContent;
          if (typeof canvasContent === 'string' && canvasContent.length > 0) {
            items.push({
              id: `canvas-${message.id}`,
              type: 'writing',
              content: canvasContent,
              sessionId: session.id,
              sessionTitle: session.title ?? "Untitled chat",
              timestamp: coerced,
              label: (message as any).canvasLabel || 'Writing Canvas',
            });
          }
        }

        // Extract code-type messages (code canvases)
        // Use codeContent (actual code) not content (which is just the label)
        if (message.type === 'code') {
          const codeContent = (message as any).codeContent;
          if (typeof codeContent === 'string' && codeContent.length > 0) {
            items.push({
              id: `code-${message.id}`,
              type: 'code',
              content: codeContent,
              language: (message as any).codeLanguage || 'text',
              sessionId: session.id,
              sessionTitle: session.title ?? "Untitled chat",
              timestamp: coerced,
              label: (message as any).codeLabel || 'Code Canvas',
            });
          }
        }

        // Also extract markdown code blocks from assistant messages
        if (message.role === "assistant" && typeof message.content === "string") {
          const extractedBlocks = extractCodeBlocks(message.content);
          extractedBlocks.forEach((block, index) => {
            items.push({
              id: `block-${message.id}-${index}`,
              type: 'code',
              content: block.code,
              language: block.language,
              sessionId: session.id,
              sessionTitle: session.title ?? "Untitled chat",
              timestamp: coerced,
              label: `${getLanguageDisplay(block.language)} snippet`,
            });
          });
        }
      });
    });

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return items;
  }, [chatSessions]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return canvasItems;

    const query = searchQuery.toLowerCase();
    return canvasItems.filter(
      (item) =>
        item.content.toLowerCase().includes(query) ||
        item.sessionTitle.toLowerCase().includes(query) ||
        (item.language && item.language.toLowerCase().includes(query)) ||
        item.type.toLowerCase().includes(query)
    );
  }, [canvasItems, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, currentPage]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const copyContent = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadContent = (content: string, type: 'code' | 'writing', language?: string) => {
    try {
      const extension = type === 'code' ? getFileExtension(language || 'text') : 'md';
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`File saved as canvas.${extension}`);
    } catch (error) {
      toast.error("Failed to download file");
    }
  };

  const getPreview = (content: string, type: 'code' | 'writing') => {
    const lines = content.split('\n');
    if (type === 'writing') {
      // For writing, show first ~100 chars
      return content.slice(0, 100) + (content.length > 100 ? '...' : '');
    }
    return lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...' : '');
  };

  const getWordCount = (content: string) => {
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  };

  const PaginationButtons = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between gap-2 px-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="backdrop-blur-xl bg-background/70 border-border/40"
        >
          Prev Page
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="backdrop-blur-xl bg-background/70 border-border/40"
        >
          Next Page
        </Button>
      </div>
    );
  };

  return (
    <div className="canvases-container w-full max-w-4xl mx-auto space-y-6 p-6 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            <Layers className="h-8 w-8 text-primary-glow" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Canvases</h2>
        </div>

        <p className="text-muted-foreground text-base">
          Writing and code canvases from your conversations
        </p>

        {/* Search */}
        <div className="mx-auto max-w-2xl w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search canvases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Pagination - Top */}
      {!isLoading && filteredItems.length > 0 && <PaginationButtons />}

      {/* Canvas Grid */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <GlassCard key={i} className="p-0 overflow-hidden">
                <Skeleton className="h-32 w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-7 w-24" />
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <GlassCard variant="bubble" glow className="p-12 max-w-md mx-auto">
              <div className="glass rounded-full p-6 w-fit mx-auto mb-6">
                <Layers className="h-12 w-12 text-primary-glow" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                No canvases yet
              </h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Writing and code canvases from your chats will appear here.
              </p>
            </GlassCard>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {paginatedItems.map((item) => (
              <GlassCard
                key={item.id}
                variant="bubble"
                className="p-0 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group overflow-hidden"
                onClick={() => goToChat(item.sessionId)}
              >
                {/* Visual Thumbnail */}
                <div className="relative bg-gradient-to-br from-muted/40 to-muted/20 overflow-hidden aspect-[4/3]">
                  {/* Editor-style header */}
                  <div className="absolute top-0 left-0 right-0 h-6 bg-muted/60 border-b border-border/40 flex items-center px-2 gap-1 z-10">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                  
                  {/* Preview content */}
                  {item.type === 'code' && item.language && canPreview(item.language) ? (
                    <div className="absolute inset-0 top-6 overflow-hidden pointer-events-none">
                      <div className="w-[250%] h-[250%] scale-[0.4] origin-top-left">
                        <CodePreview code={item.content} language={item.language} />
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 top-6 p-3 overflow-hidden">
                      <pre className="text-[9px] leading-relaxed font-mono">
                        {getPreview(item.content, item.type).split('\n').map((line, i) => (
                          <div key={i} className="flex gap-2">
                            {item.type === 'code' && (
                              <span className="text-muted-foreground/40 select-none w-4 text-right">{i + 1}</span>
                            )}
                            <code className="text-foreground/70">{line || ' '}</code>
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}
                  
                  {/* Fade overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/90 pointer-events-none z-[5]" />
                  
                  {/* Type and language badges */}
                  <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
                    {/* Type badge */}
                    <div className={`px-2 py-1 rounded-md text-[10px] font-medium backdrop-blur-sm flex items-center gap-1 ${
                      item.type === 'writing' 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {item.type === 'writing' ? (
                        <PenLine className="w-3 h-3" />
                      ) : (
                        <Code className="w-3 h-3" />
                      )}
                      {item.type === 'writing' ? 'Writing' : 'Code'}
                    </div>
                    
                    {/* Language badge for code */}
                    {item.type === 'code' && item.language && (
                      <div className={`px-2 py-1 rounded-md text-[10px] font-mono backdrop-blur-sm ${getLanguageColor(item.language)}`}>
                        {item.language}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="p-3 border-t border-border/40 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium line-clamp-1">
                        {item.sessionTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.timestamp.toLocaleDateString()} • {
                          item.type === 'writing' 
                            ? `${getWordCount(item.content)} words` 
                            : `${item.content.split('\n').length} lines`
                        }
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to view
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Pagination - Bottom */}
      {!isLoading && filteredItems.length > 0 && <PaginationButtons />}

      {/* Canvas Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-hidden p-0">
          {selectedItem && (
            <div className="flex flex-col h-full max-h-[90vh]">
              {/* Header */}
              <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-border/40 bg-muted/30">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {/* Type badge */}
                  <div className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-medium flex items-center gap-1.5 ${
                    selectedItem.type === 'writing' 
                      ? 'bg-primary/20 text-primary' 
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {selectedItem.type === 'writing' ? (
                      <PenLine className="w-3.5 h-3.5" />
                    ) : (
                      <Code className="w-3.5 h-3.5" />
                    )}
                    {selectedItem.type === 'writing' ? 'Writing' : 'Code'}
                  </div>
                  
                  {/* Language badge for code */}
                  {selectedItem.type === 'code' && selectedItem.language && (
                    <div className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-mono ${getLanguageColor(selectedItem.language)}`}>
                      {selectedItem.language}
                    </div>
                  )}
                  
                  <span className="text-xs sm:text-sm text-muted-foreground truncate">
                    {selectedItem.sessionTitle}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Preview/Code Toggle for code */}
                  {selectedItem.type === 'code' && selectedItem.language && canPreview(selectedItem.language) && (
                    <Button
                      size="sm"
                      variant={showPreview ? "default" : "outline"}
                      onClick={() => setShowPreview(!showPreview)}
                      className="flex-1 sm:flex-none"
                    >
                      {showPreview ? (
                        <>
                          <FileCode className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Code</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Preview</span>
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Open in Canvas */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openInCanvas(selectedItem)}
                    className="flex-1 sm:flex-none"
                  >
                    <Layers className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Open in Canvas</span>
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadContent(selectedItem.content, selectedItem.type, selectedItem.language)}
                    className="flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyContent(selectedItem.content, selectedItem.id)}
                    className="flex-1 sm:flex-none"
                  >
                    {copiedId === selectedItem.id ? (
                      <>
                        <Check className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Copy</span>
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => goToChat(selectedItem.sessionId)}
                    className="flex-1 sm:flex-none"
                  >
                    <MessageCircle className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Go to Chat</span>
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto">
                {selectedItem.type === 'code' && selectedItem.language && canPreview(selectedItem.language) && showPreview ? (
                  <CodePreview code={selectedItem.content} language={selectedItem.language} />
                ) : selectedItem.type === 'writing' ? (
                  <div className="p-4 sm:p-6 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedItem.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="p-4 sm:p-6 font-mono text-sm overflow-auto">
                    <code>{selectedItem.content}</code>
                  </pre>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 sm:p-4 border-t border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {selectedItem.type === 'writing' 
                    ? `${getWordCount(selectedItem.content)} words` 
                    : `${selectedItem.content.split('\n').length} lines`
                  }
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedItem.timestamp.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary */}
      {!isLoading && canvasItems.length > 0 && (
        <div className="text-center text-sm text-muted-foreground py-4">
          {canvasItems.filter(i => i.type === 'writing').length} writing canvases • {' '}
          {canvasItems.filter(i => i.type === 'code').length} code canvases • {' '}
          {new Set(canvasItems.map(i => i.sessionId)).size} chats
        </div>
      )}
    </div>
  );
}
