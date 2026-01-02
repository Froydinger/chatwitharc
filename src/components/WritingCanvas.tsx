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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function WritingCanvas() {
  const {
    isOpen,
    content,
    versions,
    activeVersionIndex,
    undoStack,
    redoStack,
    closeCanvas,
    setContent,
    saveVersion,
    restoreVersion,
    undo,
    redo,
  } = useCanvasStore();

  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Update word/char counts
  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(content.length);
  }, [content]);

  // Auto-focus textarea when canvas opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

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
      // Escape = Close
      if (e.key === "Escape") {
        if (showHistory) {
          setShowHistory(false);
        } else {
          closeCanvas();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showHistory, undo, redo, closeCanvas]);

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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "fixed inset-0 z-50 flex flex-col",
          "bg-background/95 backdrop-blur-2xl",
          // Safe area padding for PWA
          "pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
        )}
      >
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

            {/* Formatting Tools - Hidden on very small screens */}
            <div className="hidden sm:flex items-center gap-0.5">
              {formatActions.map((action, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={action.action}
                  title={action.label}
                  className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  <action.icon className="w-4 h-4" />
                </Button>
              ))}
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-6 bg-border/50" />

            {/* Undo/Redo */}
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={undo}
                disabled={undoStack.length === 0}
                title="Undo (Cmd+Z)"
                className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={redo}
                disabled={redoStack.length === 0}
                title="Redo (Cmd+Shift+Z)"
                className="w-8 h-8 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Word count */}
            <span className="hidden md:inline text-xs text-muted-foreground">
              {wordCount} words · {charCount} chars
            </span>

            {/* Save version */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSaveVersion}
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
              className="text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>

            {/* Download */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownload("md")}
              className="text-muted-foreground hover:text-foreground"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Mobile formatting toolbar */}
        <div className="sm:hidden flex items-center gap-1 px-4 py-2 overflow-x-auto border-b border-border/30 bg-muted/20">
          {formatActions.map((action, index) => (
            <Button
              key={index}
              variant="ghost"
              size="sm"
              onClick={action.action}
              className="w-9 h-9 p-0 flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <action.icon className="w-4 h-4" />
            </Button>
          ))}
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor */}
          <div className="flex-1 flex flex-col min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing..."
              className={cn(
                "flex-1 w-full resize-none",
                "bg-transparent text-foreground",
                "px-6 py-6 md:px-12 lg:px-20 md:py-10",
                "text-base md:text-lg leading-relaxed",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none",
                "font-[system-ui]"
              )}
              style={{
                fontFamily:
                  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
              }}
            />

            {/* Mobile word count */}
            <div className="md:hidden px-4 py-2 text-xs text-muted-foreground text-center border-t border-border/30">
              {wordCount} words · {charCount} chars
            </div>
          </div>

          {/* Version History Panel */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-l border-border/50 bg-muted/20 overflow-hidden flex-shrink-0"
              >
                <div className="w-[280px] h-full flex flex-col">
                  <div className="px-4 py-3 border-b border-border/30">
                    <h3 className="text-sm font-medium text-foreground">Version History</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {versions.length} versions saved
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
                            {version.content.slice(0, 50)}
                            {version.content.length > 50 ? "..." : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
