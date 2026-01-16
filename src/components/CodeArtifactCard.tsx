import { Code, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/store/useCanvasStore';
import { cn } from '@/lib/utils';
import { getLanguageDisplay, getLanguageColor } from '@/utils/codeUtils';

interface CodeArtifactCardProps {
  codeContent: string;
  codeLanguage: string;
  codeLabel?: string;
  className?: string;
}

export function CodeArtifactCard({
  codeContent,
  codeLanguage,
  codeLabel,
  className
}: CodeArtifactCardProps) {
  const { openWithContent } = useCanvasStore();

  const handleOpen = () => {
    // Use atomic openWithContent to prevent race conditions
    openWithContent(codeContent, 'code', codeLanguage);
  };

  // Get first 3-4 lines for preview
  const previewLines = codeContent.split('\n').slice(0, 4).join('\n');
  const lineCount = codeContent.split('\n').length;
  const langDisplay = getLanguageDisplay(codeLanguage);
  const langColor = getLanguageColor(codeLanguage);

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm",
        "hover:border-primary/30 hover:bg-card/80 transition-all duration-200",
        "cursor-pointer overflow-hidden",
        className
      )}
      onClick={handleOpen}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Code className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium text-sm text-foreground truncate">
            {codeLabel || 'Code'}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
            langColor
          )}>
            {langDisplay}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" />
          Open
        </Button>
      </div>

      {/* Code Preview */}
      <div className="px-4 py-3 bg-muted/20">
        <pre className="text-xs text-muted-foreground font-mono leading-relaxed overflow-hidden">
          <code className="line-clamp-4">
            {previewLines}
          </code>
        </pre>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/20 bg-muted/10">
        <span className="text-xs text-muted-foreground">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>
    </div>
  );
}
