import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Play, Code, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CodePreview } from "./CodePreview";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();

  const canPreview = ["jsx", "tsx", "html", "css", "javascript", "typescript"].includes(
    language.toLowerCase()
  );

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
          className="max-w-none w-screen h-screen p-0 gap-0 m-0 rounded-none [&>button]:hidden" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            transform: 'none',
            zIndex: 9999
          }}
        >
          <div className="flex flex-col w-full h-full bg-background">
            {/* Header with X button */}
            <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-border/40 bg-background">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <Code className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                <span className="text-sm sm:text-lg font-medium truncate">{language}</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {canPreview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                    className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                  >
                    <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline ml-1.5">{showPreview ? "Code" : "Preview"}</span>
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCopy}
                  className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                >
                  <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline ml-1.5">Copy</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFullscreen(false)}
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full flex-shrink-0 ml-1"
                >
                  <X className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {!showPreview ? (
                <SyntaxHighlighter
                  language={language}
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    background: "transparent",
                    fontSize: "14px",
                    padding: "1rem",
                    minHeight: "100%",
                  }}
                  showLineNumbers
                  wrapLines={false}
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
