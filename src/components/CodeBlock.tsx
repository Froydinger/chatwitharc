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

  const renderCodeContent = () => (
    <>
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
        <div className="relative max-h-[500px] overflow-x-auto overflow-y-auto">
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
    </>
  );

  return (
    <>
      <div className="my-4 rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm w-full min-w-0">
        {renderCodeContent()}
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[100vw] w-screen h-screen p-0 gap-0 m-0" hideCloseButton>
          <div className="flex flex-col h-full bg-background">
            {/* Fullscreen Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-muted/10">
              <div className="flex items-center gap-3">
                <Code className="h-5 w-5 text-primary" />
                <span className="text-lg font-medium">{language}</span>
              </div>
              <div className="flex items-center gap-3">
                {canPreview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {showPreview ? "Hide Preview" : "Show Preview"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Code
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsFullscreen(false)}
                  className="rounded-full"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Fullscreen Content */}
            <div className="flex-1 overflow-auto">
              {!showPreview ? (
                <SyntaxHighlighter
                  language={language}
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    background: "transparent",
                    fontSize: "16px",
                    padding: "2rem",
                    height: "100%",
                  }}
                  showLineNumbers
                  wrapLines={false}
                >
                  {code}
                </SyntaxHighlighter>
              ) : (
                <div className="h-full">
                  <CodePreview code={code} language={language} />
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
