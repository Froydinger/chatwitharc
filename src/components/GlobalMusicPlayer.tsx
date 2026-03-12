import { useEffect, useRef, useCallback } from "react";
import { useMusicStore, musicTracks } from "@/store/useMusicStore";

/**
 * Renders a hidden <audio> element at the app root so music persists across
 * all routes (dashboard, chat, apps, etc.).  Wires up all store ↔ DOM sync.
 */
export function GlobalMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    isPlaying,
    volume,
    isMuted,
    currentTrack,
    playbackMode,
    setAudioRef,
    setCurrentTime,
    setDuration,
    setIsLoading,
    setIsPlaying,
  } = useMusicStore();

  const currentMusicTrack =
    musicTracks.find((t) => t.id === currentTrack) || musicTracks[0];

  // Register element in store via callback ref
  const callbackRef = useCallback(
    (node: HTMLAudioElement | null) => {
      audioRef.current = node;
      if (node) setAudioRef(node);
    },
    [setAudioRef],
  );

  // DOM event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => useMusicStore.getState().handleTrackEnded();
    const onError = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onMeta = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    const onLoadStart = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("loadstart", onLoadStart);
    audio.addEventListener("canplay", onCanPlay);
    audio.volume = isMuted ? 0 : volume;

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("loadstart", onLoadStart);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [volume, isMuted, currentTrack, setIsPlaying, setCurrentTime, setDuration, setIsLoading]);

  return (
    <audio
      ref={callbackRef}
      src={currentMusicTrack.url}
      loop={playbackMode === "loop-track"}
      preload="metadata"
    />
  );
}
