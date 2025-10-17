import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Play, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CodePreview } from "./CodePreview";

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [showPreview, setShowPreview] = useState(false);
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
    <div className="my-4 rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm w-full min-w-0">
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
    </div>
  );
}
