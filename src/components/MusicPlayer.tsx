import { useState, useRef, useEffect } from "react";
import { Play, Pause, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { musicTracks } from "@/store/useMusicStore";

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('arcai-music-volume');
    return saved ? parseFloat(saved) : 0.4; // Default 40%
  });
  const [currentTrack, setCurrentTrack] = useState(() => {
    const saved = localStorage.getItem('arcai-music-track');
    return saved || 'lofi';
  });
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handleError = () => setIsPlaying(false);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.volume = volume;

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [volume]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('arcai-music-volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('arcai-music-track', currentTrack);
  }, [currentTrack]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {
        setIsPlaying(false);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleVolumeChange = (newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = vol;
    }
  };

  const handleTrackChange = (trackId: string) => {
    const wasPlaying = isPlaying;
    setIsPlaying(false);
    setCurrentTrack(trackId);
    
    if (wasPlaying) {
      setTimeout(() => {
        const audio = audioRef.current;
        if (audio) {
          audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        }
      }, 100);
    }
  };

  const getCurrentTrack = () => musicTracks.find(t => t.id === currentTrack) || musicTracks[0];

  return (
    <div className="flex items-center">
      <Popover open={showControls} onOpenChange={setShowControls}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full relative"
            title={isPlaying ? `Playing: ${getCurrentTrack().name}` : 'Music Player'}
          >
            <Headphones className="h-4 w-4" />
            {isPlaying && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4 glass border-glass-border" align="center">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Music Player</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlay}
                className="h-8 w-8 p-0"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            <div className="space-y-2">
              <span className="text-sm font-medium">Music Track</span>
              <Select value={currentTrack} onValueChange={handleTrackChange}>
                <SelectTrigger className="glass border-glass-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass border-glass-border">
                  {musicTracks.map((track) => (
                    <SelectItem key={track.id} value={track.id}>
                      {track.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Volume</span>
                <span className="text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
              </div>
              <Slider
                value={[volume]}
                onValueChange={handleVolumeChange}
                max={1}
                min={0}
                step={0.01}
                className="w-full"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <audio
        ref={audioRef}
        src={getCurrentTrack().url}
        loop
      />
    </div>
  );
}