import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Code, Search, MessageCircle, Copy, Check } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
    return lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n...' : '');
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
        {filteredBlocks.length === 0 ? (
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
          <div className="grid gap-4 grid-cols-1">
            {filteredBlocks.map((block) => (
              <GlassCard
                key={block.messageId}
                variant="bubble"
                className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedCode(block)}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-mono">
                      {block.language}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {block.sessionTitle}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyCode(block.code, block.messageId);
                    }}
                    className="p-2 hover:bg-muted rounded-md transition-colors"
                  >
                    {copiedId === block.messageId ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <pre className="text-sm text-foreground/80 overflow-hidden font-mono bg-muted/30 p-3 rounded-md">
                  <code>{getPreview(block.code)}</code>
                </pre>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">
                    {block.timestamp.toLocaleDateString()}
                  </span>
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToChat(block.sessionId);
                    }}
                    className="text-xs"
                  >
                    <MessageCircle className="h-3 w-3 mr-1" />
                    View Chat
                  </GlassButton>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Code Modal */}
      <Dialog open={!!selectedCode} onOpenChange={() => setSelectedCode(null)}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {selectedCode && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 rounded-md bg-primary/10 text-primary text-sm font-mono">
                    {selectedCode.language}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {selectedCode.sessionTitle}
                  </span>
                </div>
                <GlassButton
                  variant="ghost"
                  onClick={() => copyCode(selectedCode.code, selectedCode.messageId)}
                >
                  {copiedId === selectedCode.messageId ? (
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  {copiedId === selectedCode.messageId ? "Copied!" : "Copy"}
                </GlassButton>
              </div>
              
              <div className="max-h-[60vh] overflow-y-auto">
                <pre className="text-sm text-foreground font-mono bg-muted/30 p-4 rounded-md">
                  <code>{selectedCode.code}</code>
                </pre>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border/40">
                <span className="text-sm text-muted-foreground">
                  {selectedCode.timestamp.toLocaleString()}
                </span>
                <GlassButton
                  variant="glow"
                  onClick={() => goToChat(selectedCode.sessionId)}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Go to Chat
                </GlassButton>
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
