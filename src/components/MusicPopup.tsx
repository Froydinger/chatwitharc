import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, X, Music, Repeat, Repeat1, Shuffle, ArrowRight, Crown, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMusicStore, musicTracks } from "@/store/useMusicStore";
import { YouTubeMusicEmbed } from "@/components/YouTubeMusicEmbed";
import { cn } from "@/lib/utils";
import type { PlaybackMode } from "@/store/useMusicStore";
import { useSubscription } from "@/hooks/useSubscription";

const PLAYBACK_MODE_ICONS: Record<PlaybackMode, typeof Repeat1> = {
  'loop-track': Repeat1,
  'loop-all': Repeat,
  'shuffle': Shuffle,
  'sequential': ArrowRight,
};

const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
  'loop-track': 'Loop Track',
  'loop-all': 'Loop All',
  'shuffle': 'Shuffle',
  'sequential': 'Sequential',
};

interface MusicPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicPopup({ isOpen, onClose }: MusicPopupProps) {
  const {
    isPlaying, volume, currentTrack, isMuted, currentTime, duration, isLoading,
    playbackMode, musicSource, setMusicSource, cyclePlaybackMode,
    togglePlay, toggleMute, nextTrack, prevTrack, seek, handleVolumeChange, handleTrackChange,
  } = useMusicStore();

  const { isSubscribed } = useSubscription();
  const popupRef = useRef<HTMLDivElement>(null);
  const safeDuration = duration && isFinite(duration) && duration > 0 ? duration : 0;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) onClose(); };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) {
      setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 100);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const track = musicTracks.find((t) => t.id === currentTrack) || musicTracks[0];
  const ModeIcon = PLAYBACK_MODE_ICONS[playbackMode];

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        ref={popupRef}
        initial={{ opacity: 0, scale: 0.9, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed top-20 right-4 z-50 w-[340px] overflow-hidden rounded-3xl"
        style={{
          background: "linear-gradient(135deg, hsl(var(--background) / 0.85) 0%, hsl(var(--background) / 0.75) 50%, hsl(var(--primary) / 0.15) 100%)",
          backdropFilter: "blur(24px) saturate(120%)",
          WebkitBackdropFilter: "blur(24px) saturate(120%)",
          border: "1px solid hsl(var(--primary) / 0.25)",
          boxShadow: isPlaying
            ? "0 0 60px hsl(var(--primary) / 0.25), 0 20px 50px -10px rgba(0, 0, 0, 0.5)"
            : "0 20px 50px -10px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Pro overlay for free users */}
        {!isSubscribed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl backdrop-blur-md bg-background/70">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 mb-3">
              <Crown className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">Pro Feature</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center px-8">Upgrade to Pro to unlock the music player</p>
            <button
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('open-upgrade-modal'));
              }}
              className="px-6 py-2.5 rounded-full font-semibold text-sm bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
            >
              <Crown className="w-4 h-4" />
              Upgrade to Pro
            </button>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Music className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">Music</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted/50">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Source Tabs */}
        <div className="px-5 pb-3">
          <Tabs value={musicSource} onValueChange={(v) => setMusicSource(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="built-in" className="flex-1 text-xs">Built-in</TabsTrigger>
              <TabsTrigger value="youtube" className="flex-1 text-xs">YouTube</TabsTrigger>
            </TabsList>

            <TabsContent value="built-in" className="mt-3 space-y-0">
              {/* Album Art Vinyl */}
              <div className="relative mx-auto w-36 h-36 my-3">
                <div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-inner"
                  style={{ animation: isPlaying ? 'spin 8s linear infinite' : 'none' }}
                >
                  <div className="absolute inset-2 rounded-full border border-zinc-700/30" />
                  <div className="absolute inset-4 rounded-full border border-zinc-700/20" />
                </div>
                <div
                  className="absolute inset-4 overflow-hidden rounded-full shadow-lg"
                  style={{ animation: isPlaying ? 'spin 8s linear infinite' : 'none' }}
                >
                  <img src={track.albumArt} alt={track.name} className="h-full w-full object-cover" />
                </div>
                <div className="absolute inset-0 m-auto h-4 w-4 rounded-full bg-zinc-300 shadow-inner" />
              </div>

              {/* Track Info */}
              <div className="px-1 text-center">
                <h3 className="text-lg font-semibold text-foreground truncate">{track.name}</h3>
                <p className="text-sm text-muted-foreground">{track.artist}</p>
              </div>

              {/* Progress (read-only) */}
              <div className="px-1 mt-3 space-y-2">
                <div className="relative h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-200"
                    style={{
                      width: safeDuration ? `${Math.min(100, (currentTime / safeDuration) * 100)}%` : "0%",
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-2 py-3">
                <Button variant="ghost" size="icon" onClick={cyclePlaybackMode} className="h-9 w-9 rounded-full hover:bg-muted/50" title={PLAYBACK_MODE_LABELS[playbackMode]}>
                  <ModeIcon className={cn("h-4 w-4", playbackMode !== 'sequential' && "text-primary")} />
                </Button>
                <Button variant="ghost" size="icon" onClick={prevTrack} className="h-10 w-10 rounded-full hover:bg-muted/50" title="Previous track">
                  <SkipBack className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => seek(Math.max(0, currentTime - 10))}
                  disabled={!safeDuration}
                  className="h-10 w-10 rounded-full hover:bg-muted/50 relative flex items-center justify-center"
                  title="Back 10 seconds"
                >
                  <RotateCcw className="h-5 w-5" />
                  <span className="absolute text-[8px] font-bold text-foreground/80 leading-none">10</span>
                </Button>
                <Button variant="ghost" size="icon" onClick={togglePlay} className="h-14 w-14 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/50 text-foreground shadow-lg" style={{ boxShadow: isPlaying ? "0 0 20px hsl(var(--primary) / 0.4)" : undefined }}>
                  {isLoading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" /> : isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => seek(Math.min(safeDuration - 0.1, currentTime + 10))}
                  disabled={!safeDuration}
                  className="h-10 w-10 rounded-full hover:bg-muted/50 relative flex items-center justify-center"
                  title="Forward 10 seconds"
                >
                  <RotateCw className="h-5 w-5" />
                  <span className="absolute text-[8px] font-bold text-foreground/80 leading-none">10</span>
                </Button>
                <Button variant="ghost" size="icon" onClick={nextTrack} className="h-10 w-10 rounded-full hover:bg-muted/50" title="Next track">
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-3 px-1 pb-3">
                <Button variant="ghost" size="icon" onClick={toggleMute} className="h-8 w-8 rounded-full hover:bg-muted/50">
                  {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <Slider value={[isMuted ? 0 : volume]} onValueChange={(val) => handleVolumeChange(val[0])} max={1} min={0} step={0.01} className="flex-1" />
              </div>

              {/* Track List */}
              <ScrollArea className="h-[140px] px-1 pb-3">
                <div className="space-y-1">
                  {musicTracks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleTrackChange(t.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all",
                        currentTrack === t.id
                          ? "bg-primary/15 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <img src={t.albumArt} alt={t.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-medium truncate", currentTrack === t.id && "text-primary")}>{t.previewName || t.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{t.artist}</p>
                      </div>
                      {currentTrack === t.id && isPlaying && (
                        <div className="flex items-end gap-[2px] h-3">
                          <div className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                          <div className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                          <div className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="youtube" className="mt-3 pb-4 px-1">
              <YouTubeMusicEmbed />
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </>
  );
}
