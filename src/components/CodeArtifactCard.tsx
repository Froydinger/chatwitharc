import { useState } from 'react';
import { Code, ExternalLink, Rocket, Loader2, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/store/useCanvasStore';
import { cn } from '@/lib/utils';
import { getLanguageDisplay, getLanguageColor, canPreview } from '@/utils/codeUtils';
import { deployCodeBlock } from '@/lib/deploy';
import { toast } from 'sonner';

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
  const [deploying, setDeploying] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  const handleOpen = () => {
    openWithContent(codeContent, 'code', codeLanguage);
  };

  const handleDeploy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeploying(true);
    try {
      const result = await deployCodeBlock(codeContent, codeLanguage);
      setLiveUrl(result.url);
      toast.success('Deployed! Your site is live.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setDeploying(false);
    }
  };

  const previewLines = codeContent.split('\n').slice(0, 4).join('\n');
  const lineCount = codeContent.split('\n').length;
  const langDisplay = getLanguageDisplay(codeLanguage);
  const langColor = getLanguageColor(codeLanguage);
  const isDeployable = canPreview(codeLanguage);

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
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); handleOpen(); }}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1" />
            Open
          </Button>
          {isDeployable && !liveUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary hover:text-primary"
              onClick={handleDeploy}
              disabled={deploying}
            >
              {deploying
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Deploying…</>
                : <><Rocket className="w-3.5 h-3.5 mr-1" />Deploy</>}
            </Button>
          )}
          {liveUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300"
              onClick={(e) => { e.stopPropagation(); window.open(liveUrl, '_blank'); }}
            >
              <Globe className="w-3.5 h-3.5 mr-1" />
              View Live
            </Button>
          )}
        </div>
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
      <div className="px-4 py-2 border-t border-border/20 bg-muted/10 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
        </span>
        {liveUrl && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
          >
            <Globe className="w-3 h-3" />
            {liveUrl.replace('https://', '')}
          </a>
        )}
      </div>
    </div>
  );
}
