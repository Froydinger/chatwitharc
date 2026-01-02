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

// Simple markdown to HTML converter for contentEditable rendering
function convertMarkdownToHtml(markdown: string): string {
  let html = markdown
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers (must come before other patterns)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines within paragraphs
    .replace(/\n/g, '<br/>');
  
  // Wrap in paragraph if not already structured
  if (!html.startsWith('<h') && !html.startsWith('<p') && !html.startsWith('<li') && !html.startsWith('<blockquote')) {
    html = '<p>' + html + '</p>';
  }
  
  // Wrap consecutive li elements in ul
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
  
  return html;
}

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
  const [isEditingRaw, setIsEditingRaw] = useState(false);

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

  // Handle contentEditable changes
  const handleContentEdit = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    // Get plain text from contentEditable - this maintains the markdown
    const target = e.currentTarget;
    const text = target.innerText;
    setContent(text, false); // Don't save to history on every keystroke
  }, [setContent]);

  const handleContentBlur = useCallback(() => {
    // Save to history when user stops editing
    setContent(content, true);
  }, [content, setContent]);

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
        {/* Editor/Preview Area - Always rendered markdown, editable inline */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {isEditingRaw ? (
            // Raw markdown editing mode (toggled via code button in toolbar)
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing..."
              disabled={isAIWriting}
              autoFocus
              className={cn(
                "flex-1 w-full resize-none",
                "bg-transparent text-foreground",
                "px-6 py-5",
                "text-[15px] leading-[1.7]",
                "placeholder:text-muted-foreground/40",
                "focus:outline-none",
                "font-mono text-sm"
              )}
              onBlur={() => setIsEditingRaw(false)}
            />
          ) : (
            // Rendered markdown view with inline editing
            <ScrollArea className="flex-1">
              <div
                contentEditable={!isAIWriting}
                suppressContentEditableWarning
                onInput={handleContentEdit}
                onBlur={handleContentBlur}
                className={cn(
                  "px-6 py-5 min-h-[300px] outline-none",
                  "text-[15px] leading-[1.8]",
                  "text-foreground",
                  "[&>h1]:text-2xl [&>h1]:font-bold [&>h1]:mb-4 [&>h1]:mt-6 first:[&>h1]:mt-0",
                  "[&>h2]:text-xl [&>h2]:font-semibold [&>h2]:mb-3 [&>h2]:mt-5",
                  "[&>h3]:text-lg [&>h3]:font-medium [&>h3]:mb-2 [&>h3]:mt-4",
                  "[&>p]:mb-4 [&>p]:text-foreground/90",
                  "[&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4",
                  "[&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4",
                  "[&>li]:mb-1",
                  "[&>blockquote]:border-l-2 [&>blockquote]:border-primary/40 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-muted-foreground",
                  "[&>pre]:bg-muted/50 [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:mb-4",
                  "[&>code]:bg-primary/10 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-sm [&>code]:text-primary",
                  isAIWriting && "pointer-events-none opacity-70"
                )}
                dangerouslySetInnerHTML={{
                  __html: content 
                    ? convertMarkdownToHtml(content)
                    : `<p class="text-muted-foreground/50 italic">${isAIWriting ? 'AI is writing...' : 'Start typing...'}</p>`
                }}
              />
            </ScrollArea>
          )}
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
