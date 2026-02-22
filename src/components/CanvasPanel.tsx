import { useEffect, useMemo, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bold,
  Check,
  ChevronLeft,
  Code,
  Copy,
  Download,
  Eye,
  FileText,
  Heading1,
  Heading2,
  History,
  Italic,
  List,
  Loader2,
  Monitor,
  Redo2,
  Smartphone,
  Sparkles,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCanvasStore } from "@/store/useCanvasStore";
import { CanvasCodeEditor } from "@/components/CanvasCodeEditor";
import { CodePreview } from "@/components/CodePreview";
import { getLanguageDisplay, getFileExtension, canPreview } from "@/utils/codeUtils";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";

interface CanvasPanelProps {
  className?: string;
}

function editorGetMarkdown(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return "";
  try {
    return editor.getMarkdown?.() ?? "";
  } catch {
    return "";
  }
}

export function CanvasPanel({ className }: CanvasPanelProps) {
  const {
    content,
    versions,
    activeVersionIndex,
    isAIWriting,
    isLoading,
    canvasType,
    codeLanguage,
    showCodePreview,
    setContent,
    setShowCodePreview,
    saveVersion,
    restoreVersion,
    closeCanvas,
  } = useCanvasStore();

  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  // For code mode: show code editor by default during generation, toggle to show preview
  const [showCodeEditor, setShowCodeEditor] = useState(true);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  // Track elapsed time during AI generation
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isCodeMode = canvasType === 'code';
  const supportsPreview = isCodeMode && canPreview(codeLanguage);

  // Track elapsed time when AI is writing
  useEffect(() => {
    if (isAIWriting) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedSeconds(0);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isAIWriting]);

  // Ref to prevent feedback loops: when we programmatically setContent, 
  // TipTap fires onUpdate which would wipe the store during streaming
  const isApplyingRemoteUpdateRef = useRef(false);
  const lastSyncedContent = useRef<string>("");

  const editor = useEditor({
    editable: !isAIWriting && !isCodeMode,
    extensions: [
      StarterKit.configure({
        paragraph: {},
        hardBreak: {},
      }),
      Markdown,
    ],
    // CRITICAL: Don't initialize with code content - TipTap will mangle it
    content: isCodeMode ? '' : (content || ""),
    onUpdate: ({ editor: ed }) => {
      // CRITICAL: Don't update store during AI writing, programmatic setContent, OR code mode
      // Code mode content must NEVER be processed by TipTap
      if (isAIWriting || isApplyingRemoteUpdateRef.current || isCodeMode) return;

      const md = editorGetMarkdown(ed as ReturnType<typeof useEditor>);
      if (md !== undefined && md !== content) {
        setContent(md, false);
      }
    },
  }, [isCodeMode]); // Re-create editor when switching modes

  // Keep editor editable state in sync with isAIWriting
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isAIWriting && !isCodeMode);
    }
  }, [editor, isAIWriting, isCodeMode]);

  // Sync editor when store content changes (writing mode only)
  useEffect(() => {
    if (!editor || isCodeMode) return;
    
    const currentMd = editorGetMarkdown(editor);
    // Sync if content differs from what's in the editor
    if (content !== undefined && currentMd !== content) {
      // Set flag BEFORE setContent to prevent onUpdate from firing back
      isApplyingRemoteUpdateRef.current = true;
      editor.commands.setContent(content, { contentType: 'markdown' });
      lastSyncedContent.current = content;
      // Clear flag after microtask (after onUpdate would have fired)
      queueMicrotask(() => {
        isApplyingRemoteUpdateRef.current = false;
      });
    }
  }, [content, editor, isCodeMode]);
  
  // Force sync when editor becomes ready (handles initial mount race condition)
  useEffect(() => {
    if (!editor || isCodeMode) return;
    
    // Small delay to ensure editor is fully initialized
    const timer = setTimeout(() => {
      if (content && content !== lastSyncedContent.current) {
        isApplyingRemoteUpdateRef.current = true;
        editor.commands.setContent(content, { contentType: 'markdown' });
        lastSyncedContent.current = content;
        queueMicrotask(() => {
          isApplyingRemoteUpdateRef.current = false;
        });
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, [editor, isCodeMode]); // Only run when editor changes (becomes ready)

  // Word/char counts
  const { wordCount, charCount, lineCount } = useMemo(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const lines = content.split('\n').length;
    return { wordCount: words, charCount: content.length, lineCount: lines };
  }, [content]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!editor && !isCodeMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSaveVersion();
      }
      if (!isCodeMode && editor) {
        if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          editor.chain().focus().undo().run();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
          e.preventDefault();
          editor.chain().focus().redo().run();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "y") {
          e.preventDefault();
          editor.chain().focus().redo().run();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, isCodeMode]);

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
    const extension = isCodeMode ? getExtension(codeLanguage) : 'md';
    const mimeType = isCodeMode ? 'text/plain' : 'text/markdown';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas-${Date.now()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Downloaded as .${extension}` });
  };

  const handleSaveVersion = () => {
    if (!content.trim()) return;
    saveVersion();
    toast({ title: "Version saved" });
  };

  const formatActions = useMemo(
    () => [
      {
        icon: Bold,
        label: "Bold",
        run: () => editor?.chain().focus().toggleBold().run(),
        active: () => !!editor?.isActive("bold"),
      },
      {
        icon: Italic,
        label: "Italic",
        run: () => editor?.chain().focus().toggleItalic().run(),
        active: () => !!editor?.isActive("italic"),
      },
      {
        icon: Heading1,
        label: "H1",
        run: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
        active: () => !!editor?.isActive("heading", { level: 1 }),
      },
      {
        icon: Heading2,
        label: "H2",
        run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
        active: () => !!editor?.isActive("heading", { level: 2 }),
      },
      {
        icon: List,
        label: "List",
        run: () => editor?.chain().focus().toggleBulletList().run(),
        active: () => !!editor?.isActive("bulletList"),
      },
      {
        icon: Code,
        label: "Code",
        run: () => editor?.chain().focus().toggleCode().run(),
        active: () => !!editor?.isActive("code"),
      },
    ],
    [editor]
  );

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header - Glassy style */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/20 bg-gradient-to-r from-background/80 via-background/60 to-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeCanvas}
            className="h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <div className="flex items-center gap-2.5">
            {isCodeMode ? (
              <div className="p-1.5 rounded-lg bg-primary/15">
                <Code className="w-4 h-4 text-primary" />
              </div>
            ) : (
              <div className="p-1.5 rounded-lg bg-primary/15">
                <FileText className="w-4 h-4 text-primary" />
              </div>
            )}
            <span className="text-sm font-semibold text-foreground hidden sm:inline">
              {isCodeMode ? getLanguageDisplay(codeLanguage) : 'Canvas'}
            </span>
            {isAIWriting && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs font-medium hidden sm:inline">
                  Generating{elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : '...'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/80 mr-1 hidden sm:block font-medium">
            {isCodeMode ? `${lineCount} lines` : `${wordCount} words`}
          </span>

          {/* Toggle between Code and Preview for code mode */}
          {isCodeMode && supportsPreview && (
            <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-xl p-1 backdrop-blur-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCodeEditor(false)}
                className={cn(
                  "h-8 px-2 sm:px-3 rounded-lg text-xs font-medium transition-all",
                  !showCodeEditor
                    ? "bg-primary/20 text-primary shadow-sm border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
              >
                <Eye className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCodeEditor(true)}
                className={cn(
                  "h-8 px-2 sm:px-3 rounded-lg text-xs font-medium transition-all",
                  showCodeEditor
                    ? "bg-primary/20 text-primary shadow-sm border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
              >
                <Code className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Code</span>
              </Button>
            </div>
          )}

          {/* Viewport toggle for code preview */}
          {!isMobile && isCodeMode && supportsPreview && !showCodeEditor && (
            <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-xl p-1 backdrop-blur-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewViewport('desktop')}
                className={cn(
                  "h-8 w-8 p-0 rounded-lg transition-all",
                  previewViewport === 'desktop'
                    ? "bg-primary/20 text-primary shadow-sm border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
                title="Desktop view"
              >
                <Monitor className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewViewport('mobile')}
                className={cn(
                  "h-8 w-8 p-0 rounded-lg transition-all",
                  previewViewport === 'mobile'
                    ? "bg-primary/20 text-primary shadow-sm border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
                title="Mobile view"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-1 ml-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all",
                showHistory && "bg-white/10 text-foreground"
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
              className="h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-40 transition-all"
              title="Copy"
            >
              {copied ? (
                <Check className="w-4 h-4 text-primary" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={!content}
              className="h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10 disabled:opacity-40 transition-all"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar - Only show for writing mode */}
      {!isCodeMode && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/20 bg-muted/30">
          <div className="flex items-center gap-0.5">
            {formatActions.map((action, index) => (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                onClick={action.run}
                title={action.label}
                disabled={isAIWriting || !editor}
                className={cn(
                  "h-7 w-7 p-0 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40",
                  action.active() && "bg-muted text-foreground"
                )}
              >
                <action.icon className="w-3.5 h-3.5" />
              </Button>
            ))}

            <div className="w-px h-4 bg-border/50 mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().undo().run()}
              disabled={isAIWriting || !editor || !editor.can().undo()}
              title="Undo"
              className="h-7 w-7 p-0 rounded text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().redo().run()}
              disabled={isAIWriting || !editor || !editor.can().redo()}
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
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Loading State - shows when waiting for non-streaming generation */}
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <span className="text-muted-foreground text-lg">
              {isCodeMode ? 'Generating code...' : 'Generating content...'}
            </span>
            <span className="text-muted-foreground/60 text-sm">
              This may take a moment
            </span>
          </div>
        ) : isCodeMode ? (
          // Code mode: show either preview (full-width) or code editor (full-width)
          supportsPreview && !showCodeEditor ? (
            // Preview mode
            <div className="flex-1 flex flex-col overflow-hidden items-center bg-muted/20">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  previewViewport === 'mobile'
                    ? "w-[375px] border-x border-border/30 shadow-lg bg-background"
                    : "w-full"
                )}
              >
                <CodePreview code={content} language={codeLanguage} />
              </div>
            </div>
          ) : (
            // Code editor mode
            <CanvasCodeEditor
              code={content}
              language={codeLanguage}
              onChange={(code) => setContent(code, false)}
              readOnly={isAIWriting}
              className="flex-1"
            />
          )
        ) : (
          // Writing mode
          <ScrollArea className="flex-1">
            <div className="px-6 py-5 pb-24 md:pb-5 min-h-[300px]">
              <EditorContent
                editor={editor}
                className={cn(
                  "min-h-[300px]",
                  "tiptap-editor prose prose-sm dark:prose-invert max-w-none",
                  "focus:outline-none",
                  "[&_.ProseMirror]:outline-none",
                  "[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h1]:mt-6",
                  "[&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h2]:mt-5",
                  "[&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:mt-4",
                  "[&_.ProseMirror_p]:mb-3 [&_.ProseMirror_p]:leading-relaxed",
                  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ul]:mb-3",
                  "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_ol]:mb-3",
                  "[&_.ProseMirror_li]:mb-1",
                  "[&_.ProseMirror_strong]:font-bold",
                  "[&_.ProseMirror_em]:italic",
                  "[&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm",
                  "[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary/30 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted-foreground"
                )}
              />
            </div>
          </ScrollArea>
        )}

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
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {charCount} chars
                  </p>
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

// Helper to get file extension
function getExtension(lang: string): string {
  const extensions: Record<string, string> = {
    'javascript': 'js',
    'typescript': 'ts',
    'tsx': 'tsx',
    'jsx': 'jsx',
    'python': 'py',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'sql': 'sql',
    'bash': 'sh',
    'go': 'go',
    'rust': 'rs',
  };
  return extensions[lang.toLowerCase()] || 'txt';
}
