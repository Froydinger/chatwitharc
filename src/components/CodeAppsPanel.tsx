import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Code, Search, MessageCircle, Copy, Check, Eye, FileCode, Download } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CodePreview } from "@/components/CodePreview";
import { useIsMobile } from "@/hooks/use-mobile";

interface CodeBlock {
  code: string;
  language: string;
  sessionId: string;
  sessionTitle: string;
  timestamp: Date;
  messageId: string;
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

export function CodeAppsPanel() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { chatSessions, loadSession, setRightPanelOpen } = useArcStore();
  const [selectedCode, setSelectedCode] = useState<CodeBlock | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Scroll to top when panel opens
  useEffect(() => {
    const container = document.querySelector('.code-apps-container');
    if (container) {
      container.scrollTop = 0;
    }
  }, []);

  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [chatSessions]);

  const goToChat = (sessionId: string) => {
    loadSession(sessionId);
    navigate(`/chat/${sessionId}`);
    // Only auto-close on mobile and small tablets (< 1024px)
    if (isMobile || window.innerWidth < 1024) {
      setRightPanelOpen(false);
    }
    setSelectedCode(null);
  };

  // Extract all code blocks from chat sessions
  const codeBlocks = useMemo(() => {
    const blocks: CodeBlock[] = [];

    chatSessions.forEach((session) => {
      session.messages.forEach((message) => {
        if (message?.role === "assistant" && typeof message?.content === "string") {
          const coerced = toDate(message?.timestamp);
          if (!coerced) return;

          const extractedBlocks = extractCodeBlocks(message.content);
          extractedBlocks.forEach((block, index) => {
            blocks.push({
              code: block.code,
              language: block.language,
              sessionId: session.id,
              sessionTitle: session.title ?? "Untitled chat",
              timestamp: coerced,
              messageId: `${message.id}-${index}`,
            });
          });
        }
      });
    });

    blocks.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return blocks;
  }, [chatSessions]);

  // Filter code blocks based on search query
  const filteredBlocks = useMemo(() => {
    if (!searchQuery.trim()) return codeBlocks;

    const query = searchQuery.toLowerCase();
    return codeBlocks.filter(
      (block) =>
        block.code.toLowerCase().includes(query) ||
        block.language.toLowerCase().includes(query) ||
        block.sessionTitle.toLowerCase().includes(query)
    );
  }, [codeBlocks, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredBlocks.length / ITEMS_PER_PAGE);
  const paginatedBlocks = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredBlocks.slice(startIndex, endIndex);
  }, [filteredBlocks, currentPage]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const copyCode = (code: string, messageId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(messageId);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getFileExtension = (lang: string): string => {
    const extensions: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      jsx: 'jsx',
      tsx: 'tsx',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      csharp: 'cs',
      php: 'php',
      ruby: 'rb',
      go: 'go',
      rust: 'rs',
      swift: 'swift',
      kotlin: 'kt',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      json: 'json',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yml',
      markdown: 'md',
      sql: 'sql',
      bash: 'sh',
      shell: 'sh',
      powershell: 'ps1',
      latex: 'tex',
      r: 'r',
      matlab: 'm',
      perl: 'pl',
      lua: 'lua',
      dart: 'dart',
      scala: 'scala',
      dockerfile: 'Dockerfile',
      makefile: 'Makefile',
    };
    return extensions[lang.toLowerCase()] || 'txt';
  };

  const downloadCode = (code: string, language: string) => {
    try {
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code.${getFileExtension(language)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`File saved as code.${getFileExtension(language)}`);
    } catch (error) {
      toast.error("Failed to download file");
    }
  };

  const getPreview = (code: string) => {
    const lines = code.split('\n');
    return lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...' : '');
  };

  const getLanguageColor = (language: string) => {
    const colors: Record<string, string> = {
      typescript: 'bg-blue-500/20 text-blue-400',
      javascript: 'bg-yellow-500/20 text-yellow-400',
      tsx: 'bg-cyan-500/20 text-cyan-400',
      jsx: 'bg-cyan-500/20 text-cyan-400',
      python: 'bg-green-500/20 text-green-400',
      css: 'bg-pink-500/20 text-pink-400',
      html: 'bg-orange-500/20 text-orange-400',
      json: 'bg-purple-500/20 text-purple-400',
    };
    return colors[language.toLowerCase()] || 'bg-gray-500/20 text-gray-400';
  };

  const canPreview = (language: string) => {
    const previewable = ['html', 'css', 'javascript', 'js'];
    return previewable.includes(language.toLowerCase());
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
    <div className="code-apps-container w-full max-w-4xl mx-auto space-y-6 p-6 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            <Code className="h-8 w-8 text-primary-glow" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Code Apps</h2>
        </div>

        <p className="text-muted-foreground text-base">
          All code blocks from your conversations
        </p>

        {/* Search */}
        <div className="mx-auto max-w-2xl w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search code by language or chat title"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Pagination - Top */}
      {!isLoading && filteredBlocks.length > 0 && <PaginationButtons />}

      {/* Code Blocks Grid */}
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
        ) : filteredBlocks.length === 0 ? (
          <div className="text-center py-16">
            <GlassCard variant="bubble" glow className="p-12 max-w-md mx-auto">
              <div className="glass rounded-full p-6 w-fit mx-auto mb-6">
                <Code className="h-12 w-12 text-primary-glow" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                No code blocks yet
              </h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Code blocks from your chats will appear here.
              </p>
            </GlassCard>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {paginatedBlocks.map((block) => (
              <GlassCard
                key={block.messageId}
                variant="bubble"
                className="p-0 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group overflow-hidden"
                onClick={() => setSelectedCode(block)}
              >
                {/* Visual Code Thumbnail */}
                <div className="relative bg-gradient-to-br from-muted/40 to-muted/20 overflow-hidden aspect-[4/3]">
                  {/* Editor-style header */}
                  <div className="absolute top-0 left-0 right-0 h-6 bg-muted/60 border-b border-border/40 flex items-center px-2 gap-1 z-10">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                  
                  {/* Rendered preview for supported languages or code preview */}
                  {canPreview(block.language) ? (
                    <div className="absolute inset-0 top-6 overflow-hidden pointer-events-none">
                      <div className="w-[250%] h-[250%] scale-[0.4] origin-top-left">
                        <CodePreview code={block.code} language={block.language} />
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 top-6 p-3 overflow-hidden">
                      <pre className="text-[9px] leading-relaxed font-mono">
                        {getPreview(block.code).split('\n').map((line, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-muted-foreground/40 select-none w-4 text-right">{i + 1}</span>
                            <code className="text-foreground/70">{line || ' '}</code>
                          </div>
                        ))}
                      </pre>
                    </div>
                  )}
                  
                  {/* Fade overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/90 pointer-events-none z-[5]" />
                  
                  {/* Language badge */}
                  <div className="absolute bottom-2 right-2 z-10">
                    <div className={`px-2 py-1 rounded-md text-[10px] font-mono backdrop-blur-sm ${getLanguageColor(block.language)}`}>
                      {block.language}
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="p-3 border-t border-border/40 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium line-clamp-1">
                        {block.sessionTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {block.timestamp.toLocaleDateString()}
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
      {!isLoading && filteredBlocks.length > 0 && <PaginationButtons />}

      {/* Code Modal */}
      <Dialog open={!!selectedCode} onOpenChange={() => setSelectedCode(null)}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-hidden p-0">
          {selectedCode && (
            <div className="flex flex-col h-full max-h-[90vh]">
              {/* Header */}
              <div className="flex flex-col gap-3 p-3 sm:p-4 border-b border-border/40 bg-muted/30">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <div className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-mono ${getLanguageColor(selectedCode.language)}`}>
                    {selectedCode.language}
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground truncate">
                    {selectedCode.sessionTitle}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Preview/Code Toggle */}
                  {canPreview(selectedCode.language) && (
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadCode(selectedCode.code, selectedCode.language)}
                    className="flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyCode(selectedCode.code, selectedCode.messageId)}
                    className="flex-1 sm:flex-none"
                  >
                    {copiedId === selectedCode.messageId ? (
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
                    onClick={() => goToChat(selectedCode.sessionId)}
                    className="flex-1 sm:flex-none"
                  >
                    <MessageCircle className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Go to Chat</span>
                  </Button>
                </div>
              </div>
              
              {/* Code or Preview */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
                {showPreview && canPreview(selectedCode.language) ? (
                  <div className="w-full h-full min-h-[400px] border border-border/40 rounded-lg overflow-hidden">
                    <CodePreview code={selectedCode.code} language={selectedCode.language} />
                  </div>
                ) : (
                  <pre className="text-xs sm:text-sm text-foreground font-mono bg-muted/30 p-3 sm:p-4 rounded-lg border border-border/40 overflow-x-auto">
                    <code>{selectedCode.code}</code>
                  </pre>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t border-border/40 bg-muted/30">
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {selectedCode.timestamp.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedCode.code.split('\n').length} lines
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stats */}
      {codeBlocks.length > 0 && (
        <div className="pt-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {codeBlocks.length} {codeBlocks.length === 1 ? 'block' : 'blocks'} • {
                new Set(codeBlocks.map((b) => b.sessionId)).size
              } {new Set(codeBlocks.map((b) => b.sessionId)).size === 1 ? 'chat' : 'chats'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
