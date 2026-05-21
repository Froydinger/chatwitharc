import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Download, Copy, Check, Code, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface SvgArtifactProps {
  svgCode: string;
}

export function SvgArtifact({ svgCode }: SvgArtifactProps) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Sanitize AI-generated SVG to strip <script>, event handlers, foreign content, etc.
  const safeSvg = useMemo(
    () => DOMPurify.sanitize(svgCode, { USE_PROFILES: { svg: true, svgFilters: true } }),
    [svgCode]
  );

  const handleDownload = () => {
    const blob = new Blob([svgCode], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "image.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!", description: "SVG saved as image.svg" });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(svgCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="my-3 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
        <span className="text-xs text-muted-foreground font-mono">SVG</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowCode((s) => !s)}
            title={showCode ? "Show preview" : "Show code"}
          >
            {showCode ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            title="Copy SVG"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDownload}
            title="Download SVG"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showCode ? (
        <pre className="p-4 text-xs font-mono text-foreground/80 overflow-auto max-h-64 whitespace-pre-wrap">
          {svgCode}
        </pre>
      ) : (
        <div className="p-4 flex justify-center items-center bg-white/5 min-h-[120px]">
          {/* eslint-disable-next-line react/no-danger */}
          <div
            className="max-w-full overflow-hidden [&>svg]:max-w-full [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: safeSvg }}
          />
        </div>
      )}
    </div>
  );
}
