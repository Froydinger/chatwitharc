import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, X, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useMusicStore, musicTracks } from "@/store/useMusicStore";
import { cn } from "@/lib/utils";

interface MusicPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MusicPopup({ isOpen, onClose }: MusicPopupProps) {
  const {
    isPlaying,
    volume,
    currentTrack,
    isMuted,
    currentTime,
    duration,
    isLoading,
    togglePlay,
    toggleMute,
    nextTrack,
    prevTrack,
    seek,
    handleVolumeChange,
    handleTrackChange,
  } = useMusicStore();

  const popupRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      // Delay to prevent immediate close
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getCurrentTrack = () => musicTracks.find((t) => t.id === currentTrack) || musicTracks[0];
  const track = getCurrentTrack();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Popup */}
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-20 right-4 z-50 w-[320px] overflow-hidden rounded-3xl border border-border/40 bg-background/90 backdrop-blur-xl shadow-2xl"
            style={{
              boxShadow: isPlaying
                ? "0 0 40px hsl(var(--primary) / 0.15), 0 20px 50px -10px hsl(var(--background) / 0.8)"
                : "0 20px 50px -10px hsl(var(--background) / 0.8)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Music className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Now Playing</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-full hover:bg-muted/50"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Album Art with Vinyl Effect */}
            <div className="relative mx-auto w-40 h-40 my-4">
              {/* Vinyl ring background */}
              <div
                className={cn(
                  "absolute inset-0 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-inner",
                  isPlaying && "animate-spin"
                )}
                style={{
                  animationDuration: "8s",
                  animationTimingFunction: "linear",
                }}
              >
                {/* Vinyl grooves */}
                <div className="absolute inset-2 rounded-full border border-zinc-700/30" />
                <div className="absolute inset-4 rounded-full border border-zinc-700/20" />
                <div className="absolute inset-6 rounded-full border border-zinc-700/10" />
              </div>

              {/* Album art center */}
              <motion.div
                className="absolute inset-4 overflow-hidden rounded-full shadow-lg"
                animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                transition={{
                  duration: 8,
                  repeat: isPlaying ? Infinity : 0,
                  ease: "linear",
                }}
              >
                <img
                  src={track.albumArt}
                  alt={track.name}
                  className="h-full w-full object-cover"
                />
              </motion.div>

              {/* Center spindle */}
              <div className="absolute inset-0 m-auto h-4 w-4 rounded-full bg-zinc-300 shadow-inner" />
            </div>

            {/* Track Info */}
            <div className="px-5 text-center">
              <h3 className="text-lg font-semibold text-foreground truncate">{track.name}</h3>
              <p className="text-sm text-muted-foreground">{track.artist}</p>
            </div>

            {/* Progress Bar */}
            <div className="px-5 mt-4 space-y-2">
              <Slider
                value={[currentTime]}
                onValueChange={(val) => seek(val[0])}
                max={duration || 100}
                min={0}
                step={1}
                className="w-full cursor-pointer"
                disabled={!duration}
              />
              <div className="flex justify-between text-xs text-muted-foreground font-mono">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 py-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={prevTrack}
                className="h-10 w-10 rounded-full hover:bg-muted/50"
              >
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button
                variant="default"
                size="icon"
                onClick={togglePlay}
                className="h-14 w-14 rounded-full shadow-lg"
                style={{
                  boxShadow: isPlaying ? "0 0 20px hsl(var(--primary) / 0.4)" : undefined,
                }}
              >
                {isLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 ml-0.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={nextTrack}
                className="h-10 w-10 rounded-full hover:bg-muted/50"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-3 px-5 pb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="h-8 w-8 rounded-full hover:bg-muted/50"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                onValueChange={(val) => handleVolumeChange(val[0])}
                max={1}
                min={0}
                step={0.01}
                className="flex-1"
              />
            </div>

            {/* Track Selection Pills */}
            <div className="flex items-center justify-center gap-2 px-5 pb-5">
              {musicTracks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTrackChange(t.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    currentTrack === t.id
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
