import { useState } from 'react';
import { Code, ExternalLink, Rocket, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/store/useCanvasStore';
import { cn } from '@/lib/utils';
import { getLanguageDisplay, getLanguageColor } from '@/utils/codeUtils';
import { deployCodeBlock } from '@/lib/deploy';
import { useSubscription } from '@/hooks/useSubscription';
import { toast } from 'sonner';
import { PublishModal } from '@/components/PublishModal';

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
  const { isSubscribed } = useSubscription();
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);

  const handleOpen = () => {
    openWithContent(codeContent, 'code', codeLanguage);
  };

  const handleDeployClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSubscribed) {
      window.dispatchEvent(new CustomEvent('open-upgrade-modal'));
      return;
    }
    setShowPublishModal(true);
  };

  const handlePublishConfirm = async (opts: { subdomain: string; title: string; faviconSvg: string }) => {
    const result = await deployCodeBlock(codeContent, codeLanguage, opts);
    setLiveUrl(result.url);
    toast.success('Published! Your site is live.', {
      action: { label: 'View', onClick: () => window.open(result.url, '_blank') },
    });
  };

  const previewLines = codeContent.split('\n').slice(0, 4).join('\n');
  const lineCount = codeContent.split('\n').length;
  const langDisplay = getLanguageDisplay(codeLanguage);
  const langColor = getLanguageColor(codeLanguage);

  return (
    <>
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
            {!liveUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-primary hover:text-primary"
                onClick={handleDeployClick}
              >
                <Rocket className="w-3.5 h-3.5 mr-1" />
                Publish
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

      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onPublish={handlePublishConfirm}
      />
    </>
  );
}
