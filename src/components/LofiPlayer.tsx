import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const musicTracks = [
  {
    id: 'lofi',
    name: 'Lo-Fi Beats',
    url: 'https://froydinger.blog/wp-content/uploads/2025/03/lofi-beats-mix.mp3'
  },
  {
    id: 'jazz',
    name: 'Coffee House Jazz',
    url: 'https://froydinger.blog/wp-content/uploads/2025/05/jazz-coffee-bar-music.mp3'
  },
  {
    id: 'ambient',
    name: 'Space Ambient',
    url: 'https://froydinger.blog/wp-content/uploads/2025/05/pad-space-travel-hyperdrive-engine-humming-235901.mp3'
  }
];

export function LofiPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('arcai-music-volume');
    return saved ? parseFloat(saved) : 0.4; // Default 40%
  });
  const [currentTrack, setCurrentTrack] = useState(() => {
    const saved = localStorage.getItem('arcai-music-track');
    return saved || 'lofi';
  });
  const [showVolumeControl, setShowVolumeControl] = useState(false);

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

  // Save volume to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('arcai-music-volume', volume.toString());
  }, [volume]);

  // Save track to localStorage when it changes
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
        // Handle autoplay restrictions
        setIsPlaying(false);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMuted = !isMuted;
    audio.muted = newMuted;
    setIsMuted(newMuted);
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
    
    // If music was playing, restart with new track after a brief delay
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
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full"
        onClick={togglePlay}
        title={isPlaying ? `Pause ${getCurrentTrack().name}` : `Play ${getCurrentTrack().name}`}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <Popover open={showVolumeControl} onOpenChange={setShowVolumeControl}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            title={isMuted ? "Unmute" : `Volume: ${Math.round(volume * 100)}%`}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4 glass border-glass-border" align="center">
          <div className="space-y-4">
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

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleMute}
                className="glass border-glass-border"
              >
                {isMuted ? "Unmute" : "Mute"}
              </Button>
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