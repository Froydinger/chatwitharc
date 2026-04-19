import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Image as ImageIcon, ExternalLink, X } from "lucide-react";
import { SmoothImage } from "@/components/ui/smooth-image";

interface MediaEmbedProps {
  url: string;
  title?: string;
  compact?: boolean;
}

// Extract YouTube video ID from various URL formats
export const getYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Check if URL is a direct image
export const isImageUrl = (url: string): boolean => {
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
  const imageHosts = [
    /images\.unsplash\.com/i,
    /i\.imgur\.com/i,
    /pbs\.twimg\.com/i,
    /cdn\.discordapp\.com/i,
    /media\.giphy\.com/i,
    /i\.redd\.it/i,
    /preview\.redd\.it/i,
  ];

  if (imageExtensions.test(url)) return true;
  return imageHosts.some(host => host.test(url));
};

// Get media type from URL
export const getMediaType = (url: string): 'youtube' | 'image' | 'none' => {
  if (getYouTubeVideoId(url)) return 'youtube';
  if (isImageUrl(url)) return 'image';
  return 'none';
};

export const MediaEmbed = ({ url, title, compact = false }: MediaEmbedProps) => {
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  const youtubeId = getYouTubeVideoId(url);
  const isImage = isImageUrl(url);

  // YouTube embed
  if (youtubeId) {
    if (compact) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors group"
        >
          <Play className="h-3.5 w-3.5 text-red-500" />
          <span className="text-xs text-foreground/80 truncate max-w-[150px]">
            {title || 'YouTube Video'}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      );
    }

    return (
      <div className="rounded-xl overflow-hidden border border-border/40 bg-muted/30">
        <div className="aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
            title={title || 'YouTube Video'}
            className="w-full h-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
          {title && (
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          )}
          <a
            href={`https://www.youtube.com/watch?v=${youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors ml-auto shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
            Watch on YouTube
          </a>
        </div>
      </div>
    );
  }

  // Image embed
  if (isImage && !imageError) {
    if (compact) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors group"
        >
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-foreground/80 truncate max-w-[150px]">
            {title || 'Image'}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      );
    }

    return (
      <>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-xl overflow-hidden border border-border/40 bg-muted/30 cursor-pointer group"
          onClick={() => setShowFullImage(true)}
        >
          <SmoothImage
            src={url}
            alt={title || 'Image'}
            className="w-full max-h-[300px] object-contain"
            loadingClassName="w-full h-48"
            onError={() => setImageError(true)}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          {title && (
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-xs text-white truncate">{title}</p>
            </div>
          )}
        </motion.div>

        {/* Full image modal */}
        {showFullImage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowFullImage(false)}
          >
            <button
              onClick={() => setShowFullImage(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={url}
              alt={title || 'Image'}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        )}
      </>
    );
  }

  // No embeddable media
  return null;
};

// Component to render multiple media embeds from sources
interface MediaEmbedsProps {
  sources: Array<{ url: string; title?: string }>;
  maxItems?: number;
}

export const MediaEmbeds = ({ sources, maxItems = 2 }: MediaEmbedsProps) => {
  // Filter to only embeddable media
  const mediaItems = sources
    .filter(source => getMediaType(source.url) !== 'none')
    .slice(0, maxItems);

  if (mediaItems.length === 0) return null;

  // Only show max 1 video, rest as compact
  const videos = mediaItems.filter(s => getMediaType(s.url) === 'youtube');
  const images = mediaItems.filter(s => getMediaType(s.url) === 'image');

  return (
    <div className="space-y-3 mt-3">
      {/* Show only the first video as a full embed */}
      {videos.length > 0 && (
        <div className="space-y-2">
          <MediaEmbed url={videos[0].url} title={videos[0].title} />
          {/* Rest as compact chips */}
          {videos.slice(1).map((video, index) => (
            <MediaEmbed key={`video-${index}`} url={video.url} title={video.title} compact />
          ))}
        </div>
      )}

      {/* Images as compact chips */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <MediaEmbed key={`image-${index}`} url={image.url} title={image.title} compact />
          ))}
        </div>
      )}
    </div>
  );
};
