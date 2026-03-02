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

  return (
    <div className="space-y-4">
      {/* YouTube Player */}
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
