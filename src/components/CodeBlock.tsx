import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Play, Code, Maximize2, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CodePreview } from "./CodePreview";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const canPreview = ["jsx", "tsx", "html", "css", "javascript", "typescript"].includes(
    language.toLowerCase()
  );
  
  const [showPreview, setShowPreview] = useState(canPreview); // Default to preview if possible
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: "Copied!",
        description: "Code copied to clipboard",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy code to clipboard",
        variant: "destructive",
      });
    }
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

  const handleDownload = () => {
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
      
      toast({
        title: "Downloaded!",
        description: `File saved as code.${getFileExtension(language)}`,
      });
    } catch {
      toast({
        title: "Download failed",
        description: "Could not download the file",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="my-4 rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm w-full min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">{language}</span>
          </div>
          <div className="flex items-center gap-2">
            {canPreview && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="h-7 text-xs"
              >
                <Play className="h-3 w-3 mr-1.5" />
                {showPreview ? "Hide" : "Preview"}
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsFullscreen(true)} 
              className="h-7 text-xs"
            >
              <Maximize2 className="h-3 w-3 mr-1.5" />
              Fullscreen
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload} className="h-7 text-xs">
              <Download className="h-3 w-3 mr-1.5" />
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-xs">
              <Copy className="h-3 w-3 mr-1.5" />
              Copy
            </Button>
          </div>
        </div>

        {/* Code */}
        {!showPreview && (
          <div className="relative max-h-[500px] overflow-auto">
            <SyntaxHighlighter
              language={language}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                background: "transparent",
                fontSize: "14px",
                padding: "1rem",
              }}
              showLineNumbers
              wrapLines={false}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        )}

        {/* Preview */}
        {showPreview && <CodePreview code={code} language={language} />}
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent 
          hideCloseButton
          hideOverlay
          className="!max-w-none !w-screen !h-screen !p-0 !gap-0 !m-0 !rounded-none !top-0 !left-0 !translate-x-0 !translate-y-0"
        >
          <div className="flex flex-col w-screen h-screen bg-background overflow-hidden">
            {/* Header with X button - Always visible */}
            <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-6 py-3 border-b border-border/40 bg-background">
              <div className="flex items-center gap-2 sm:gap-3">
                <Code className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <span className="text-sm sm:text-lg font-medium">{language}</span>
              </div>
              <div className="flex items-center gap-2">
                {canPreview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                    className="h-8 px-2 sm:px-3"
                  >
                    <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline ml-2">{showPreview ? "Code" : "Preview"}</span>
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleDownload}
                  className="h-8 px-2 sm:px-3"
                >
                  <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline ml-2">Download</span>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCopy}
                  className="h-8 px-2 sm:px-3"
                >
                  <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline ml-2">Copy</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFullscreen(false)}
                  className="h-9 w-9 rounded-full"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-auto w-full">
              {!showPreview ? (
                <SyntaxHighlighter
                  language={language}
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    background: "transparent",
                    fontSize: "14px",
                    padding: "1rem",
                  }}
                  showLineNumbers
                >
                  {code}
                </SyntaxHighlighter>
              ) : (
                <CodePreview code={code} language={language} />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
