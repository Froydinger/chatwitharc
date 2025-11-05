import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Code, Search, MessageCircle, Copy, Check } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

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
  const { chatSessions, loadSession, setRightPanelOpen } = useArcStore();
  const [selectedCode, setSelectedCode] = useState<CodeBlock | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading state
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [chatSessions]);

  const goToChat = (sessionId: string) => {
    loadSession(sessionId);
    navigate(`/chat/${sessionId}`);
    setRightPanelOpen(false);
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

  const copyCode = (code: string, messageId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(messageId);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-6 h-full overflow-y-auto scrollbar-hide">
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
            {filteredBlocks.map((block) => (
              <GlassCard
                key={block.messageId}
                variant="bubble"
                className="p-0 cursor-pointer hover:border-primary/50 transition-all group overflow-hidden"
                onClick={() => setSelectedCode(block)}
              >
                {/* Code Preview Thumbnail */}
                <div className="relative bg-muted/30 overflow-hidden border-b border-border/40">
                  <pre className="text-[10px] leading-tight text-foreground/60 p-3 overflow-hidden font-mono h-32">
                    <code>{getPreview(block.code)}</code>
                  </pre>
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />
                  <div className="absolute top-2 right-2">
                    <div className={`px-2 py-1 rounded-md text-[10px] font-mono backdrop-blur-sm ${getLanguageColor(block.language)}`}>
                      {block.language}
                    </div>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm text-foreground font-medium line-clamp-1">
                      {block.sessionTitle}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyCode(block.code, block.messageId);
                      }}
                      className="p-1.5 hover:bg-muted rounded-md transition-colors flex-shrink-0 bg-black text-white"
                    >
                      {copiedId === block.messageId ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {block.timestamp.toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToChat(block.sessionId);
                      }}
                      className="h-7 text-xs bg-black text-white hover:bg-black/80"
                    >
                      <MessageCircle className="h-3 w-3 mr-1" />
                      View Chat
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Code Modal */}
      <Dialog open={!!selectedCode} onOpenChange={() => setSelectedCode(null)}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-hidden p-0">
          {selectedCode && (
            <div className="flex flex-col h-full max-h-[90vh]">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-border/40 bg-muted/30">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`px-3 py-1 rounded-md text-sm font-mono ${getLanguageColor(selectedCode.language)}`}>
                    {selectedCode.language}
                  </div>
                  <span className="text-sm text-muted-foreground truncate">
                    {selectedCode.sessionTitle}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => copyCode(selectedCode.code, selectedCode.messageId)}
                    className="bg-black text-white hover:bg-black/80"
                  >
                    {copiedId === selectedCode.messageId ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Code
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => goToChat(selectedCode.sessionId)}
                    className="bg-black text-white hover:bg-black/80"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Open Chat
                  </Button>
                </div>
              </div>
              
              {/* Code Preview */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
                <pre className="text-xs sm:text-sm text-foreground font-mono bg-muted/30 p-3 sm:p-4 rounded-lg border border-border/40 overflow-x-auto">
                  <code>{selectedCode.code}</code>
                </pre>
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
