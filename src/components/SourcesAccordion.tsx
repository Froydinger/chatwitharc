import { useWorkspaceUI } from "@/workspace/WorkspaceContext";
import { WorkspaceWebSearchDialog } from "@/workspace/WorkspaceWebSearchDialog";
import { Transition } from "@/components/transitions/Transition";
import { useId, useState } from "react";
import { Globe, ChevronDown, ExternalLink, Play, Image as ImageIcon } from "lucide-react";
import { WebSource } from "@/store/useArcStore";
import { MediaEmbeds, getMediaType, getYouTubeVideoId } from "@/components/MediaEmbed";

interface SourcesAccordionProps {
  sources: WebSource[];
  showMediaEmbeds?: boolean;
  messageContent?: string;
}

export const SourcesAccordion = ({ sources, showMediaEmbeds = true, messageContent }: SourcesAccordionProps) => {
  const workspaceUI = useWorkspaceUI();
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const panelId = useId();

  if (!sources || sources.length === 0) return null;

  // Extract YouTube IDs already embedded in the message text so we don't show them twice
  const embeddedYouTubeIds = new Set<string>();
  if (messageContent) {
    const urlPattern = /https?:\/\/[^\s)>\]"]+/g;
    const matches = messageContent.match(urlPattern) || [];
    for (const url of matches) {
      const id = getYouTubeVideoId(url);
      if (id) embeddedYouTubeIds.add(id);
    }
  }

  // Sources to show in media embeds — exclude YouTube videos already in the message
  const sourcesForEmbeds = sources.filter(s => {
    const youtubeId = getYouTubeVideoId(s.url);
    if (youtubeId && embeddedYouTubeIds.has(youtubeId)) return false;
    return true;
  });

  // Count media items
  const mediaItems = sourcesForEmbeds.filter(s => getMediaType(s.url) !== 'none');
  const videoCount = sourcesForEmbeds.filter(s => getMediaType(s.url) === 'youtube').length;
  const imageCount = sourcesForEmbeds.filter(s => getMediaType(s.url) === 'image').length;

  // Extract domain from URL for display
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch {
      return url;
    }
  };

  // Get favicon URL
  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  };

  return (
    <Transition preset="panel"><div
      className="mt-3 w-full max-w-full overflow-hidden"
    >
      {/* Media Embeds (shown above accordion when enabled) */}
      {showMediaEmbeds && mediaItems.length > 0 && (
        <MediaEmbeds
          sources={sourcesForEmbeds.map(s => ({ url: s.url, title: s.title }))}
          maxItems={3}
        />
      )}

      {/* The same recorded sources open the Workspace result viewer, including
          automatic tool searches and reply metadata. Keep native/legacy intact. */}
      {workspaceUI ? <div className="mt-3"><WorkspaceWebSearchDialog sources={sources} content={messageContent} initialTab="sources" /></div> : <>
      {/* Trigger Button */}
      <button
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => { setHasOpened(true); setIsOpen(!isOpen); }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/40 hover:bg-muted/70 transition-colors group w-fit max-w-full mt-3"
      >
        <Globe className="h-3.5 w-3.5 text-primary/70" />
        <span className="text-xs font-medium text-muted-foreground">
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
        {videoCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-red-500/80">
            <Play className="h-3 w-3" />
            {videoCount}
          </span>
        )}
        {imageCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-primary/80">
            <ImageIcon className="h-3 w-3" />
            {imageCount}
          </span>
        )}
        <span className="arc-chevron inline-flex" data-open={isOpen}>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
        </span>
      </button>

      {/* Sources List */}
      <div id={panelId} className="arc-accordion w-full max-w-full" data-open={isOpen} aria-hidden={!isOpen}>
        <div>
          {hasOpened && (
            <div className="mt-2 space-y-1.5 pl-1 w-full max-w-full">
              {sources.map((source, index) => (
                <Transition preset="page" delay={index * 0.05} key={index}><a
                  href={source.url}
                  tabIndex={isOpen ? undefined : -1}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 hover:border-primary/30 transition-[background-color,border-color] w-full max-w-full overflow-hidden"
                >
                  {/* Favicon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <img
                      src={getFavicon(source.url) || ''}
                      alt=""
                      className="h-4 w-4 rounded"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 max-w-full">
                      <span className="text-xs font-medium text-foreground/90 truncate flex-1 min-w-0">
                        {source.title || getDomain(source.url)}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 truncate block max-w-full">
                      {getDomain(source.url)}
                    </span>
                    {source.content && (
                      <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-1 break-words">
                        {source.content}
                      </p>
                    )}
                  </div>
                </a></Transition>
              ))}
            </div>
          )}
        </div>
      </div>
      </>}
    </div></Transition>
  );
};
