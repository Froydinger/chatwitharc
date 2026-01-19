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
  const [showVideo, setShowVideo] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  const youtubeId = getYouTubeVideoId(url);
  const isImage = isImageUrl(url);

  // YouTube embed
  if (youtubeId) {
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;

    if (compact) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-xl overflow-hidden border border-border/40 bg-muted/30"
      >
        {!showVideo ? (
          <div
            className="relative cursor-pointer group"
            onClick={() => setShowVideo(true)}
          >
            <img
              src={thumbnailUrl}
              alt={title || 'YouTube Video'}
              className="w-full aspect-video object-cover"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="h-8 w-8 text-white ml-1" fill="white" />
              </div>
            </div>
            {title && (
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-sm text-white font-medium line-clamp-2">{title}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="relative aspect-video">
            <button
              onClick={() => setShowVideo(false)}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
              title={title || 'YouTube Video'}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </motion.div>
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

export const MediaEmbeds = ({ sources, maxItems = 4 }: MediaEmbedsProps) => {
  // Filter to only embeddable media
  const mediaItems = sources
    .filter(source => getMediaType(source.url) !== 'none')
    .slice(0, maxItems);

  if (mediaItems.length === 0) return null;

  // Separate YouTube videos and images
  const videos = mediaItems.filter(s => getMediaType(s.url) === 'youtube');
  const images = mediaItems.filter(s => getMediaType(s.url) === 'image');

  return (
    <div className="space-y-3 mt-3">
      {/* Videos first */}
      {videos.length > 0 && (
        <div className="space-y-2">
          {videos.map((video, index) => (
            <MediaEmbed key={`video-${index}`} url={video.url} title={video.title} />
          ))}
        </div>
      )}

      {/* Images in a grid */}
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {images.map((image, index) => (
            <MediaEmbed key={`image-${index}`} url={image.url} title={image.title} />
          ))}
        </div>
      )}
    </div>
  );
};
