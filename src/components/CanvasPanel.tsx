import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Undo2,
  Redo2,
  Copy,
  Download,
  Check,
  History,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  Code,
  Loader2,
  ChevronLeft,
  Sparkles,
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
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  // Update word/char counts
  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(content.length);
  }, [content]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
      }
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
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded as .md" });
  };

  const handleSaveVersion = () => {
    if (!content.trim()) return;
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
    { icon: Heading1, label: "H1", action: () => insertFormatting("# ", "") },
    { icon: Heading2, label: "H2", action: () => insertFormatting("## ", "") },
    { icon: List, label: "List", action: () => insertFormatting("- ", "") },
    { icon: Code, label: "Code", action: () => insertFormatting("`") },
  ];


  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Clean Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        {/* Left: Close + Title */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeCanvas}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Canvas</span>
            {isAIWriting && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Writing...</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2 hidden sm:block">
            {wordCount} words
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground",
              showHistory && "bg-muted text-foreground"
            )}
            title="History"
          >
            <History className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!content}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
            title="Copy"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={!content}
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/20 bg-muted/30">
        <div className="flex items-center gap-0.5">
          {formatActions.map((action, index) => (
            <Button
              key={index}
              variant="ghost"
              size="sm"
              onClick={action.action}
              title={action.label}
              disabled={isAIWriting}
              className="h-7 w-7 p-0 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40"
            >
              <action.icon className="w-3.5 h-3.5" />
            </Button>
          ))}
          
          <div className="w-px h-4 bg-border/50 mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={undoStack.length === 0 || isAIWriting}
            title="Undo"
            className="h-7 w-7 p-0 rounded text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={redoStack.length === 0 || isAIWriting}
            title="Redo"
            className="h-7 w-7 p-0 rounded text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSaveVersion}
          disabled={isAIWriting || !content.trim()}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Save
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Live WYSIWYG Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <ScrollArea className="flex-1">
            <div
              ref={editorContainerRef}
              onClick={() => textareaRef.current?.focus()}
              className="relative min-h-full cursor-text"
            >
              {/* Rendered Markdown Layer (visible) */}
              <div
                className={cn(
                  "px-6 py-5 min-h-[300px] pointer-events-none select-none",
                  "prose prose-sm dark:prose-invert max-w-none",
                  "prose-headings:font-semibold prose-headings:text-foreground prose-headings:mb-3",
                  "prose-p:text-foreground/90 prose-p:leading-[1.7] prose-p:mb-4",
                  "prose-li:text-foreground/90 prose-li:leading-[1.6]",
                  "prose-strong:text-foreground prose-strong:font-semibold",
                  "prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
                  "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground",
                  !content && "hidden"
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
              
              {/* Hidden Textarea for Input (captures all keyboard input) */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Start writing..."
                disabled={isAIWriting}
                autoFocus
                className={cn(
                  "absolute inset-0 w-full h-full resize-none",
                  "bg-transparent",
                  "px-6 py-5",
                  "text-[15px] leading-[1.8]",
                  "placeholder:text-muted-foreground/40",
                  "focus:outline-none",
                  "caret-primary",
                  content ? "text-transparent" : "text-foreground",
                  isAIWriting && "opacity-70"
                )}
                style={{ caretColor: 'hsl(var(--primary))' }}
              />
            </div>
          </ScrollArea>
        </div>

        {/* Version History Sidebar */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-l border-border/30 bg-muted/20 overflow-hidden flex-shrink-0"
            >
              <div className="w-[200px] h-full flex flex-col">
                <div className="px-3 py-2.5 border-b border-border/20">
                  <h3 className="text-xs font-medium text-foreground">Versions</h3>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {versions.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-6 px-2">
                        No versions yet. Click "Save" to create one.
                      </p>
                    ) : (
                      versions.map((version, index) => (
                        <button
                          key={version.id}
                          onClick={() => restoreVersion(index)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg transition-colors",
                            activeVersionIndex === index
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-muted/50 border border-transparent"
                          )}
                        >
                          <p className="text-xs font-medium text-foreground truncate">
                            {version.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(version.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </button>
                      ))
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
