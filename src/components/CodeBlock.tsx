import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Play, Code, Maximize2, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CodePreview } from "./CodePreview";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getFileExtension, canPreview as checkCanPreview } from "@/utils/codeUtils";

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const canPreview = checkCanPreview(language);
  
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
                className="h-7 px-2"
              >
                <Play className="h-3 w-3" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsFullscreen(true)} 
              className="h-7 px-2"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload} className="h-7 px-2">
              <Download className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
              <Copy className="h-3 w-3" />
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
                    className="h-8 px-2"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleDownload}
                  className="h-8 px-2"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCopy}
                  className="h-8 px-2"
                >
                  <Copy className="h-4 w-4" />
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
