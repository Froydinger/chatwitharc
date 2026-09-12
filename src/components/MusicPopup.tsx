import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Volume2, VolumeX, X, Music, Repeat, Repeat1, Shuffle, ArrowRight, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMusicStore, musicTracks } from "@/store/useMusicStore";
import { YouTubeMusicEmbed } from "@/components/YouTubeMusicEmbed";
import { BenchoNowPlaying } from "@/components/music/BenchoNowPlaying";
import { cn } from "@/lib/utils";
import type { PlaybackMode, MusicSource } from "@/store/useMusicStore";

const PLAYBACK_MODE_ICONS: Record<PlaybackMode, typeof Repeat1> = {
  "loop-track": Repeat1, "loop-all": Repeat, shuffle: Shuffle, sequential: ArrowRight,
};
const PLAYBACK_MODE_LABELS: Record<PlaybackMode, string> = {
  "loop-track": "Loop Track", "loop-all": "Loop All", shuffle: "Shuffle", sequential: "Sequential",
};

interface MusicPopupProps { isOpen: boolean; onClose: () => void }

export function MusicPopup({ isOpen, onClose }: MusicPopupProps) {
  const {
    isPlaying, volume, isMuted, currentTime, duration,
    playbackMode, musicSource, setMusicSource, cyclePlaybackMode,
    toggleMute, seek, handleVolumeChange, handleTrackChange,
  } = useMusicStore();
  const popupRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const ModeIcon = PLAYBACK_MODE_ICONS[playbackMode];

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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}
        className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <motion.div ref={popupRef} role="dialog" aria-modal="true" aria-labelledby="arc-music-title"
        initial={{ opacity: 0, y: reducedMotion ? 0 : -12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="fixed right-2 top-[max(1rem,env(safe-area-inset-top))] z-50 max-h-[calc(100dvh-2rem)] w-[340px] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-3xl border border-border/60 bg-background/95 text-foreground shadow-2xl backdrop-blur-2xl sm:right-4 sm:top-20 sm:max-h-[calc(100dvh-6rem)]">
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h2 id="arc-music-title" className="flex items-center gap-2 text-sm font-medium"><Music className="h-4 w-4" />Music</h2>
          <Button ref={closeRef} variant="ghost" size="icon" onClick={onClose} aria-label="Close music" className="h-8 w-8 rounded-full"><X className="h-4 w-4" /></Button>
        </div>

        <Tabs value={musicSource} onValueChange={(value) => setMusicSource(value as MusicSource)} className="px-4 pb-4">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted/50">
            <TabsTrigger value="built-in" className="rounded-full">Built-in Tracks</TabsTrigger>
            <TabsTrigger value="youtube" className="rounded-full">Live Radio</TabsTrigger>
          </TabsList>
          <TabsContent value="built-in" className="mt-1">
            <BenchoNowPlaying />
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
            <ScrollArea className="h-[140px]" aria-label="Music tracks">
              <div className="space-y-1">
                {musicTracks.map((item) => (
                  <button type="button" key={item.id} onClick={() => handleTrackChange(item.id)} aria-pressed={currentTrack === item.id}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors motion-reduce:transition-none", currentTrack === item.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                    <img src={item.albumArt} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.previewName || item.name}</span><span className="block truncate text-[11px] text-muted-foreground">{item.artist}</span></span>
                    {currentTrack === item.id && isPlaying && <span className="flex h-3 items-end gap-0.5" aria-label="Playing">{[60, 100, 40].map((height, index) => <span key={height} className="w-0.5 animate-pulse rounded-full bg-foreground motion-reduce:animate-none" style={{ height: `${height}%`, animationDelay: `${index * 150}ms` }} />)}</span>}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="youtube" className="mt-4"><YouTubeMusicEmbed /></TabsContent>
        </Tabs>
      </motion.div>
    </>
  );
}
