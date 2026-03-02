import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMusicStore, YOUTUBE_PRESETS } from "@/store/useMusicStore";
import { cn } from "@/lib/utils";

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function getYoutubeThumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function YouTubeMusicEmbed() {
  const { youtubeVideoId, setYoutubeVideoId } = useMusicStore();
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState("");

  const handlePaste = () => {
    const id = extractYoutubeId(urlInput.trim());
    if (id) {
      setYoutubeVideoId(id);
      setUrlInput("");
      setError("");
    } else {
      setError("Invalid YouTube URL");
    }
  };

  const currentPreset = YOUTUBE_PRESETS.find(p => p.videoId === youtubeVideoId);
  const displayName = currentPreset?.name || "YouTube Music";

  return (
    <div className="space-y-4">
      {/* Vinyl Record with YouTube Thumbnail */}
      <div className="relative mx-auto w-36 h-36 my-3">
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-inner"
          style={{ animation: 'spin 8s linear infinite' }}
        >
          <div className="absolute inset-2 rounded-full border border-zinc-700/30" />
          <div className="absolute inset-4 rounded-full border border-zinc-700/20" />
        </div>
        <div
          className="absolute inset-4 overflow-hidden rounded-full shadow-lg"
          style={{ animation: 'spin 8s linear infinite' }}
        >
          <img
            src={getYoutubeThumbnail(youtubeVideoId)}
            alt={displayName}
            className="h-full w-full object-cover scale-150"
          />
        </div>
        <div className="absolute inset-0 m-auto h-4 w-4 rounded-full bg-zinc-300 shadow-inner" />
      </div>

      {/* Track name */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground truncate">{displayName}</h3>
        <p className="text-sm text-muted-foreground">YouTube</p>
      </div>

      {/* YouTube Player (small) */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/20">
        <iframe
          src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=0&rel=0`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="YouTube Music"
        />
      </div>

      {/* Preset Playlists */}
      <div className="flex flex-wrap gap-2">
        {YOUTUBE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setYoutubeVideoId(preset.videoId)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
              youtubeVideoId === preset.videoId
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Custom URL Input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handlePaste()}
            placeholder="Paste YouTube URL..."
            className="flex-1 rounded-xl bg-muted/30 border border-border/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handlePaste}
            className="rounded-xl"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
