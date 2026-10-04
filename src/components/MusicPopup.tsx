import { Transition } from "@/components/transitions/Transition";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X, Music, Heart, Repeat, Repeat1, Shuffle, ArrowRight, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMusicStore, musicTracks } from "@/store/useMusicStore";
import { BenchoNowPlaying } from "@/components/music/BenchoNowPlaying";
import { useMusicLikes } from "@/hooks/useMusicLikes";
import { cn } from "@/lib/utils";
import type { PlaybackMode } from "@/store/useMusicStore";

const PLAYBACK_MODE_ICONS: Record<PlaybackMode, typeof Repeat1> = {
  "loop-track": Repeat1, "loop-all": Repeat, shuffle: Shuffle, sequential: ArrowRight,
};
const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
  "loop-track": "Loop Track", "loop-all": "Loop All", shuffle: "Shuffle", sequential: "Sequential",
};

interface MusicPopupProps { isOpen: boolean; onClose: () => void }

export function MusicPopup({ isOpen, onClose }: MusicPopupProps) {
  const {
    isPlaying, volume, isMuted, currentTime, duration, currentTrack,
    playbackMode, cyclePlaybackMode,
    toggleMute, seek, handleVolumeChange, handleTrackChange,
  } = useMusicStore();
  const popupRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [showLikedOnly, setShowLikedOnly] = useState(false);
  const { likedTrackIds, toggleLike } = useMusicLikes();
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const ModeIcon = PLAYBACK_MODE_ICONS[playbackMode];
  const visibleTracks = showLikedOnly
    ? musicTracks.filter((item) => likedTrackIds.has(item.id))
    : musicTracks;

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = Array.from(popupRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"], a[href]',
      ) || []).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <Transition preset="fade"><div
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" /></Transition>
      <Transition preset="panel"><div ref={popupRef} role="dialog" aria-modal="true" aria-labelledby="arc-music-title"
        className="fixed right-2 top-[max(1rem,var(--arcai-safe-area-top))] z-50 max-h-[calc(100dvh-2rem)] w-[340px] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-3xl border border-border/60 bg-background/95 text-foreground shadow-2xl backdrop-blur-2xl sm:right-4 sm:top-20 sm:max-h-[calc(100dvh-6rem)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 id="arc-music-title" className="flex items-center gap-2 text-sm font-medium"><Music className="h-4 w-4" />Music</h2>
          <Button ref={closeRef} variant="ghost" size="icon" onClick={onClose} aria-label="Close music" className="h-8 w-8 rounded-full"><X className="h-4 w-4" /></Button>
        </div>

        <div className="px-4 pb-4">
          <div className="mt-1">
            <BenchoNowPlaying liked={likedTrackIds.has(currentTrack)} onToggleLike={() => void toggleLike(currentTrack)} />
            <div className="flex items-center justify-between border-t border-border/40 pt-2">
              <Button variant="ghost" onClick={cyclePlaybackMode} aria-label={`Playback mode: ${PLAYBACK_MODE_LABELS[playbackMode]}. Change mode`} className="h-9 gap-2 rounded-full px-3 text-xs">
                <ModeIcon className="h-4 w-4" />{PLAYBACK_MODE_LABELS[playbackMode]}
              </Button>
              <div className="flex">
                <Button variant="ghost" size="icon" onClick={() => seek(Math.max(0, currentTime - 10))} disabled={!safeDuration} aria-label="Back 10 seconds" className="relative h-9 w-9 rounded-full">
                  <RotateCcw className="h-5 w-5" /><span className="absolute text-[8px] font-bold">10</span>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => seek(Math.max(0, Math.min(safeDuration - 0.1, currentTime + 10)))} disabled={!safeDuration} aria-label="Forward 10 seconds" className="relative h-9 w-9 rounded-full">
                  <RotateCw className="h-5 w-5" /><span className="absolute text-[8px] font-bold">10</span>
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2 pr-2">
              <Button variant="ghost" size="icon" onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"} className="h-9 w-9 rounded-full">
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Slider aria-label="Music volume" value={[isMuted ? 0 : volume]} onValueChange={(value) => handleVolumeChange(value[0])} max={1} min={0} step={0.01} className="flex-1" />
            </div>
            <div className="flex items-center justify-between border-t border-border/40 px-1 pt-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Your stream</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowLikedOnly((value) => !value)}
                aria-label={showLikedOnly ? "Show all songs" : "Show liked songs only"}
                aria-pressed={showLikedOnly}
                className={cn("h-8 w-8 rounded-full", showLikedOnly && "bg-primary/15 text-primary")}
              >
                <Heart className="h-4 w-4" fill={showLikedOnly ? "currentColor" : "none"} />
              </Button>
            </div>
            <ScrollArea className="h-[140px]" aria-label={showLikedOnly ? "Liked music tracks" : "Music tracks"}>
              <div className="space-y-1 pt-1">
                {visibleTracks.length === 0 ? (
                  <p className="px-3 py-5 text-center text-xs text-muted-foreground">Heart a track to build your liked stream.</p>
                ) : visibleTracks.map((item) => (
                  <button type="button" key={item.id} onClick={() => handleTrackChange(item.id)} aria-pressed={currentTrack === item.id}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors motion-reduce:transition-none", currentTrack === item.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                    <img src={item.albumArt} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.previewName || item.name}</span><span className="block truncate text-[11px] text-muted-foreground">{item.artist}</span></span>
                    {likedTrackIds.has(item.id) && <Heart className="h-3.5 w-3.5 shrink-0 text-primary" fill="currentColor" aria-label="Liked" />}
                    {currentTrack === item.id && isPlaying && <span className="flex h-3 items-end gap-0.5" aria-label="Playing">{[60, 100, 40].map((height, index) => <span key={height} className="w-0.5 animate-pulse rounded-full bg-foreground motion-reduce:animate-none" style={{ height: `${height}%`, animationDelay: `${index * 150}ms` }} />)}</span>}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div></Transition>
    </>
  );
}
