import { RefObject } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { GlassCard } from "@/components/ui/glass-card";

const musicTracks = [
  { 
    id: 'lofi', 
    name: 'Lo-Fi Beats', 
    url: 'https://froydinger.com/wp-content/uploads/2025/03/lofi-beats-mix.mp3',
    artist: 'Chill Collective',
    albumArt: '/lovable-uploads/lofi-beats-album.jpg'
  },
  { 
    id: 'jazz', 
    name: 'Coffee House Jazz', 
    url: 'https://froydinger.com/wp-content/uploads/2025/05/jazz-coffee-bar-music.mp3',
    artist: 'Jazz Lounge',
    albumArt: '/lovable-uploads/jazz-album-art.jpg'
  },
  { 
    id: 'ambient', 
    name: 'Space Ambient', 
    url: 'https://froydinger.com/wp-content/uploads/2025/05/pad-space-travel-hyperdrive-engine-humming-235901.mp3',
    artist: 'Cosmic Sounds',
    albumArt: '/lovable-uploads/ambient-album-art.jpg'
  }
];

interface MusicPlayerPanelProps {
  audioRef: RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  volume: number;
  setVolume: (value: number) => void;
  currentTrack: string;
  setCurrentTrack: (value: string) => void;
  isMuted: boolean;
  setIsMuted: (value: boolean) => void;
  currentTime: number;
  setCurrentTime: (value: number) => void;
  duration: number;
  isLoading: boolean;
}

export function MusicPlayerPanel({
  audioRef,
  isPlaying,
  setIsPlaying,
  volume,
  setVolume,
  currentTrack,
  setCurrentTrack,
  isMuted,
  setIsMuted,
  currentTime,
  setCurrentTime,
  duration,
  isLoading
}: MusicPlayerPanelProps) {

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

  const handleSeek = (newTime: number[]) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    
    const seekTime = newTime[0];
    audio.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
    setCurrentTime(0);
    
    if (wasPlaying) {
      setTimeout(() => {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
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
        <div className="space-y-6">
          {/* Large Album Art Display */}
          <div className="text-center space-y-4">
            <div className="w-64 h-64 mx-auto rounded-3xl overflow-hidden shadow-2xl relative group">
              <img 
                src={`${track.albumArt}?v=${Date.now()}`} 
                alt={`${track.name} album art`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  // Fallback to gradient with icon if image fails to load
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const fallback = parent.querySelector('.fallback-art') as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }
                }}
              />
              <div className="fallback-art absolute inset-0 bg-gradient-to-br from-primary/30 to-primary-glow/30 flex items-center justify-center hidden">
                <Play className="h-20 w-20 text-primary-glow drop-shadow-lg" />
              </div>
              
              {/* Now Playing Overlay */}
              {isPlaying && (
                <div className="absolute inset-0 bg-black/20 flex items-end p-4">
                  <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1 flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1 h-3 bg-white rounded-full animate-pulse" />
                      <div className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <div className="w-1 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                    <span className="text-white text-sm font-medium">Now Playing</span>
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <h2 className="text-2xl font-bold text-foreground">{track.name}</h2>
              <p className="text-lg text-muted-foreground">{track.artist}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-3">
            <Slider
              value={[currentTime]}
              onValueChange={handleSeek}
              max={duration || 100}
              min={0}
              step={1}
              className="w-full cursor-pointer"
              disabled={!duration}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span className="font-mono">{formatTime(currentTime)}</span>
              <span className="font-mono">{formatTime(duration)}</span>
            </div>
          </div>
          
          {/* Status Indicator */}
          <div className="flex items-center justify-center">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                <span>Loading...</span>
              </div>
            ) : !isPlaying ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="w-2 h-2 bg-muted-foreground rounded-full" />
                <span>Paused</span>
              </div>
            ) : null}
          </div>
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
          <h3 className="text-lg font-semibold text-foreground">Music Library</h3>
          <div className="space-y-3">
            {musicTracks.map((musicTrack) => (
              <div
                key={musicTrack.id}
                className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all ${
                  currentTrack === musicTrack.id 
                    ? 'bg-primary/10 ring-1 ring-primary-glow' 
                    : 'hover:bg-muted/5'
                }`}
                onClick={() => handleTrackChange(musicTrack.id)}
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary-glow/20 flex-shrink-0">
                  {musicTrack.albumArt ? (
                    <img 
                      src={musicTrack.albumArt} 
                      alt={`${musicTrack.name} album art`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="h-4 w-4 text-primary-glow" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{musicTrack.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{musicTrack.artist}</p>
                </div>
                {currentTrack === musicTrack.id && (
                  <div className="flex items-center gap-1 text-primary-glow">
                    {isPlaying ? (
                      <div className="flex gap-1">
                        <div className="w-1 h-4 bg-primary-glow rounded-full animate-pulse" />
                        <div className="w-1 h-4 bg-primary-glow rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-1 h-4 bg-primary-glow rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}