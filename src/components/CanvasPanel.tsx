import { useEffect, useMemo, useState } from "react";
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
  Redo2,
  Sparkles,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
    canvasType,
    codeLanguage,
    showCodePreview,
    setContent,
    setShowCodePreview,
    saveVersion,
    restoreVersion,
    closeCanvas,
  } = useCanvasStore();

  const { toast } = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  // For code mode: show preview by default (full-width), toggle to show code
  const [showCodeEditor, setShowCodeEditor] = useState(false);

  const isCodeMode = canvasType === 'code';
  const supportsPreview = isCodeMode && canPreview(codeLanguage);

  const editor = useEditor({
    editable: !isAIWriting && !isCodeMode,
    extensions: [
      StarterKit.configure({
        paragraph: {},
        hardBreak: {},
      }),
      Markdown,
    ],
    content: "",
    onUpdate: ({ editor: ed }) => {
      const md = editorGetMarkdown(ed as ReturnType<typeof useEditor>);
      if (md !== undefined && md !== content) {
        setContent(md, false);
      }
    },
  });

  // Sync editor when store content changes (writing mode only)
  useEffect(() => {
    if (!editor || isCodeMode) return;
    
    const currentMd = editorGetMarkdown(editor);
    if (currentMd !== content && content !== undefined) {
      editor.commands.setContent(content, { contentType: 'markdown' });
    }
  }, [content, editor, isCodeMode]);

  // Initialize editor with store content on mount
  useEffect(() => {
    if (editor && content && !isCodeMode) {
      editor.commands.setContent(content, { contentType: 'markdown' });
    }
  }, [editor, isCodeMode]);

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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
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
            {isCodeMode ? (
              <Code className="w-4 h-4 text-primary" />
            ) : (
              <FileText className="w-4 h-4 text-primary" />
            )}
            <span className="text-sm font-medium text-foreground">
              {isCodeMode ? getLanguageDisplay(codeLanguage) : 'Canvas'}
            </span>
            {isAIWriting && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Writing...</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2 hidden sm:block">
            {isCodeMode ? `${lineCount} lines` : `${wordCount} words`}
          </span>

          {/* Toggle between Code and Preview for code mode */}
          {isCodeMode && supportsPreview && (
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCodeEditor(false)}
                className={cn(
                  "h-7 px-2.5 rounded-md text-xs font-medium transition-colors",
                  !showCodeEditor 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Eye className="w-3.5 h-3.5 mr-1" />
                Preview
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCodeEditor(true)}
                className={cn(
                  "h-7 px-2.5 rounded-md text-xs font-medium transition-colors",
                  showCodeEditor 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Code className="w-3.5 h-3.5 mr-1" />
                Code
              </Button>
            </div>
          )}

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
            className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
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
        {isCodeMode ? (
          // Code mode: show either preview (full-width) or code editor (full-width)
          supportsPreview && !showCodeEditor ? (
            // Preview mode (default for previewable languages)
            <div className="flex-1 flex flex-col overflow-hidden">
              <CodePreview code={content} language={codeLanguage} />
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
