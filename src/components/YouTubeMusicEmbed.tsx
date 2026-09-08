import { useState } from "react";
import {
  ExternalLink,
  Headphones,
  Coffee,
  Music2,
  Orbit,
  Music,
  Brain,
  Zap,
  CloudRain,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMusicStore, YOUTUBE_PRESETS } from "@/store/useMusicStore";
import { cn } from "@/lib/utils";

const STATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'lofi-radio': Headphones,
  'chillhop-radio': Coffee,
  'jazz-radio': Music2,
  'ambient-space': Orbit,
  'classical': Music,
  'study-beats': Brain,
  'chill-synth': Zap,
  'nature-sounds': CloudRain,
  'coffee-shop': Coffee,
};

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
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/40 border border-border/30 shadow-inner">
        <iframe
          src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=0&rel=0&modestbranding=1`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          title="YouTube Music"
        />
      </div>

      {/* Preset Playlists & Next Station Switcher */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span className="font-medium uppercase tracking-wider text-[10px]">Curated Stations</span>
          <button
            type="button"
            onClick={() => {
              const currentIdx = YOUTUBE_PRESETS.findIndex((p) => p.videoId === youtubeVideoId);
              const nextIdx = (currentIdx + 1) % YOUTUBE_PRESETS.length;
              setYoutubeVideoId(YOUTUBE_PRESETS[nextIdx].videoId);
            }}
            className="text-primary hover:underline flex items-center gap-1 text-[11px] font-medium"
          >
            Next station →
          </button>
        </div>

        <ScrollArea className="h-[148px] pr-2">
          <div className="grid grid-cols-2 gap-1.5 p-0.5">
            {YOUTUBE_PRESETS.map((preset) => {
              const Icon = STATION_ICONS[preset.id] || Radio;
              const isSelected = youtubeVideoId === preset.videoId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setYoutubeVideoId(preset.videoId)}
                  className={cn(
                    "group relative flex items-center gap-2 p-2 rounded-xl text-xs font-medium transition-all text-left border min-w-0",
                    isSelected
                      ? "border-primary/50 bg-primary/15 text-foreground shadow-sm ring-1 ring-primary/25"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border/60"
                  )}
                  title={preset.name}
                >
                  <div
                    className={cn(
                      "h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                      isSelected
                        ? "bg-primary/25 text-primary"
                        : "bg-muted/40 text-muted-foreground group-hover:text-foreground group-hover:bg-muted/60"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="truncate flex-1 min-w-0 text-[11px] leading-tight font-medium">
                    {preset.name}
                  </span>
                  {isSelected && (
                    <div className="flex items-end gap-[1.5px] h-2.5 shrink-0">
                      <div className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '70%', animationDelay: '0ms' }} />
                      <div className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                      <div className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
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
