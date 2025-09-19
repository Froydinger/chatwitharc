import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassCard } from "@/components/ui/glass-card";

const musicTracks = [
  { 
    id: 'lofi', 
    name: 'Lo-Fi Beats', 
    url: 'https://froydinger.com/wp-content/uploads/2025/03/lofi-beats-mix.mp3',
    artist: 'Chill Collective'
  },
  { 
    id: 'jazz', 
    name: 'Coffee House Jazz', 
    url: 'https://froydinger.com/wp-content/uploads/2025/05/jazz-coffee-bar-music.mp3',
    artist: 'Jazz Lounge'
  },
  { 
    id: 'ambient', 
    name: 'Space Ambient', 
    url: 'https://froydinger.com/wp-content/uploads/2025/05/pad-space-travel-hyperdrive-engine-humming-235901.mp3',
    artist: 'Cosmic Sounds'
  }
];

export function MusicPlayerPanel() {
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
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handleError = () => setIsPlaying(false);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.volume = isMuted ? 0 : volume;

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [volume, isMuted]);

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
    setIsMuted(vol === 0);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = vol;
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audio.volume = newMuted ? 0 : volume;
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

  const nextTrack = () => {
    const currentIndex = musicTracks.findIndex(t => t.id === currentTrack);
    const nextIndex = (currentIndex + 1) % musicTracks.length;
    handleTrackChange(musicTracks[nextIndex].id);
  };

  const prevTrack = () => {
    const currentIndex = musicTracks.findIndex(t => t.id === currentTrack);
    const prevIndex = currentIndex === 0 ? musicTracks.length - 1 : currentIndex - 1;
    handleTrackChange(musicTracks[prevIndex].id);
  };

  const getCurrentTrack = () => musicTracks.find(t => t.id === currentTrack) || musicTracks[0];
  const track = getCurrentTrack();

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-20 pt-8 px-4 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <div className="glass rounded-full p-2">
            <Play className="h-6 w-6 text-primary-glow" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Music Player</h1>
        </div>
        <p className="text-muted-foreground">Focus with ambient background music</p>
      </div>

      {/* Current Track Display */}
      <GlassCard variant="bubble" className="p-6">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-primary-glow/20 flex items-center justify-center">
            <Play className="h-8 w-8 text-primary-glow" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{track.name}</h2>
            <p className="text-sm text-muted-foreground">{track.artist}</p>
          </div>
          
          {/* Playback Status */}
          {isPlaying && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary-glow">
              <div className="w-2 h-2 bg-primary-glow rounded-full animate-pulse" />
              Now Playing
            </div>
          )}
        </div>
      </GlassCard>

      {/* Controls */}
      <GlassCard variant="bubble" className="p-6">
        <div className="space-y-6">
          {/* Main Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevTrack}
              className="rounded-full"
            >
              <SkipBack className="h-5 w-5" />
            </Button>
            
            <Button
              variant="default"
              size="lg"
              onClick={togglePlay}
              className="rounded-full w-16 h-16"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={nextTrack}
              className="rounded-full"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          {/* Volume Control */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Volume</span>
              <span className="text-xs text-muted-foreground">
                {isMuted ? "Muted" : `${Math.round(volume * 100)}%`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="rounded-full w-8 h-8"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                onValueChange={handleVolumeChange}
                max={1}
                min={0}
                step={0.01}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Track Selection */}
      <GlassCard variant="bubble" className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">Select Track</h3>
          <Select value={currentTrack} onValueChange={handleTrackChange}>
            <SelectTrigger className="glass border-glass-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="glass border-glass-border">
              {musicTracks.map((track) => (
                <SelectItem key={track.id} value={track.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{track.name}</span>
                    <span className="text-xs text-muted-foreground">{track.artist}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      <audio
        ref={audioRef}
        src={track.url}
        loop
        preload="metadata"
      />
    </div>
  );
}