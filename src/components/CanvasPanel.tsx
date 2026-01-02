import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Undo2,
  Redo2,
  Copy,
  Download,
  Check,
  History,
  Sparkles,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface CanvasPanelProps {
  className?: string;
}

export function CanvasPanel({ className }: CanvasPanelProps) {
  const {
    content,
    versions,
    activeVersionIndex,
    undoStack,
    redoStack,
    isAIWriting,
    setContent,
    saveVersion,
    restoreVersion,
    undo,
    redo,
    closeCanvas,
  } = useCanvasStore();

  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  // Update word/char counts
  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(content.length);
  }, [content]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Z = Undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Cmd/Ctrl + Shift + Z = Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      // Cmd/Ctrl + Y = Redo (alternative)
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
      // Cmd/Ctrl + S = Save version
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSaveVersion();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleDownload = (format: "md" | "txt") => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Downloaded as .${format}` });
  };

  const handleSaveVersion = () => {
    saveVersion();
    toast({ title: "Version saved" });
  };

  // Insert markdown formatting at cursor
  const insertFormatting = useCallback(
    (prefix: string, suffix: string = prefix) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = content.substring(start, end);
      const newText =
        content.substring(0, start) +
        prefix +
        selectedText +
        suffix +
        content.substring(end);

      setContent(newText);

      // Restore cursor position
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = selectedText
          ? start + prefix.length + selectedText.length + suffix.length
          : start + prefix.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [content, setContent]
  );

  const formatActions = [
    { icon: Bold, label: "Bold", action: () => insertFormatting("**") },
    { icon: Italic, label: "Italic", action: () => insertFormatting("*") },
    { icon: Heading1, label: "Heading 1", action: () => insertFormatting("# ", "") },
    { icon: Heading2, label: "Heading 2", action: () => insertFormatting("## ", "") },
    { icon: List, label: "Bullet List", action: () => insertFormatting("- ", "") },
    { icon: ListOrdered, label: "Numbered List", action: () => insertFormatting("1. ", "") },
    { icon: Quote, label: "Quote", action: () => insertFormatting("> ", "") },
    { icon: Code, label: "Code", action: () => insertFormatting("`") },
    { icon: Minus, label: "Divider", action: () => insertFormatting("\n---\n", "") },
  ];

  return (
    <div className={cn("flex flex-col h-full bg-background/95 backdrop-blur-xl", className)}>
      {/* Header/Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            onClick={closeCanvas}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Divider */}
          <div className="w-px h-6 bg-border/50" />

          {/* Formatting Tools */}
          <div className="hidden md:flex items-center gap-0.5">
            {formatActions.slice(0, 5).map((action, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                onClick={action.action}
                title={action.label}
                disabled={isAIWriting}
                className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <action.icon className="w-4 h-4" />
              </Button>
            ))}
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-6 bg-border/50" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={undoStack.length === 0 || isAIWriting}
              title="Undo (Cmd+Z)"
              className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={redo}
              disabled={redoStack.length === 0 || isAIWriting}
              title="Redo (Cmd+Shift+Z)"
              className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Writing indicator */}
          {isAIWriting && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-400 text-xs">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Writing...</span>
            </div>
          )}

          {/* Word count */}
          <span className="hidden md:inline text-xs text-muted-foreground">
            {wordCount} words · {charCount} chars
          </span>

          {/* Save version */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveVersion}
            disabled={isAIWriting || !content}
            title="Save version (Cmd+S)"
            className="text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Save</span>
          </Button>

          {/* History */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              showHistory && "bg-muted text-foreground"
            )}
          >
            <History className="w-4 h-4" />
          </Button>

          {/* Copy */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!content}
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>

          {/* Download */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDownload("md")}
            disabled={!content}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor/Preview */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={isAIWriting ? "AI is writing..." : "Content will appear here..."}
              disabled={isAIWriting}
              className={cn(
                "flex-1 w-full resize-none",
                "bg-transparent text-foreground",
                "px-6 py-6",
                "text-base leading-relaxed",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none",
                "font-[system-ui]"
              )}
              style={{
                fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
              }}
              onBlur={() => setIsEditing(false)}
            />
          ) : (
            <ScrollArea className="flex-1">
              <div
                className={cn(
                  "px-6 py-6 prose prose-sm dark:prose-invert max-w-none",
                  "prose-headings:font-semibold prose-headings:text-foreground",
                  "prose-p:text-foreground/90 prose-p:leading-relaxed",
                  "prose-li:text-foreground/90",
                  "prose-strong:text-foreground prose-strong:font-semibold",
                  "prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:rounded",
                  "min-h-[200px] cursor-text"
                )}
                onClick={() => !isAIWriting && setIsEditing(true)}
              >
                {content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground/50 italic">
                    {isAIWriting ? "AI is writing..." : "Click to edit or ask Arc to write something..."}
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Version History Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-l border-border/50 bg-muted/20 overflow-hidden flex-shrink-0"
            >
              <div className="w-[240px] h-full flex flex-col">
                <div className="px-4 py-3 border-b border-border/30">
                  <h3 className="text-sm font-medium text-foreground">History</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {versions.length} versions
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {versions.map((version, index) => (
                      <button
                        key={version.id}
                        onClick={() => restoreVersion(index)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg transition-colors",
                          activeVersionIndex === index
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted/50 border border-transparent"
                        )}
                      >
                        <p className="text-sm font-medium text-foreground truncate">
                          {version.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(version.timestamp).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                          {version.content.slice(0, 40)}
                          {version.content.length > 40 ? "..." : ""}
                        </p>
                      </button>
                    ))}
                    {versions.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No versions yet
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
