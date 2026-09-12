/* Adapted from Bencho's deployed src/lab/Sound.tsx implementation.
 * Source and MIT notice: ./BENCHO-LICENSE.md. Arc supplies real audio state.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Heart, LoaderCircle, SkipBack, SkipForward } from "lucide-react";
import { useMusicStore, musicTracks } from "@/store/useMusicStore";
import "./bencho-now-playing.css";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;
const quartOut = (t: number) => 1 - (1 - t) ** 4;
const linear = (t: number) => t;
const cubicInOut = (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

// Bencho uses an interruptible RAF tween, not independent CSS transitions.
function useTween(target: number, ms: number, still: boolean, ease = quartOut) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (still) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      current.current = mix(from, target, ease(t));
      setValue(current.current);
      frame = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, still, ease]);
  return value;
}

const PAUSE_L = [6, 4, 10, 4, 10, 20, 6, 20];
const PLAY_L = [6.5, 4, 13.25, 8, 13.25, 16, 6.5, 20];
const PAUSE_R = [14, 4, 18, 4, 18, 20, 14, 20];
const PLAY_R = [13.25, 8, 20, 12, 20, 12, 13.25, 16];
const path = (from: number[], to: number[], t: number) =>
  from.reduce((d, _, i) => i % 2 ? d : `${d}${i ? "L" : "M"}${mix(from[i], to[i], t).toFixed(2)} ${mix(from[i + 1], to[i + 1], t).toFixed(2)}`, "") + "Z";

function PlayMark({ playing, size, still }: { playing: boolean; size: number; still: boolean }) {
  const t = useTween(+!playing, 300, still, cubicInOut);
  const goo = Math.sin(clamp(t, 0, 1) * Math.PI);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
      style={{ transformOrigin: "50% 50%", transform: `rotate(${(playing ? -9 : 9) * goo}deg) scale(${1 - 0.13 * goo}, ${1 + 0.11 * goo})` }}>
      <path d={path(PAUSE_L, PLAY_L, t)} transform={`translate(${1.6 * goo} 0)`} />
      <path d={path(PAUSE_R, PLAY_R, t)} transform={`translate(${-1.6 * goo} 0)`} />
    </svg>
  );
}

const formatTime = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;

interface BenchoNowPlayingProps {
  liked: boolean;
  onToggleLike: () => void;
}

export function BenchoNowPlaying({ liked, onToggleLike }: BenchoNowPlayingProps) {
  const { currentTrack, isPlaying, isLoading, currentTime, duration, togglePlay, prevTrack, nextTrack, seek } = useMusicStore();
  const track = musicTracks.find((item) => item.id === currentTrack) || musicTracks[0];
  const [open, setOpen] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const still = !!useReducedMotion();
  // Published Morph=50 maps to 460 * (1.6 - 50 / 100 * 1.2) ms.
  const p = useTween(+open, 460, still);
  const u = useTween(+open, 460, still, linear);
  const swell = Math.sin(Math.PI * clamp(u, 0, 1) ** 1.5);
  const late = clamp((p - 0.6) / 0.4, 0, 1);
  const artSize = mix(40, 64, p);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const elapsed = clamp(Number.isFinite(currentTime) ? currentTime : 0, 0, safeDuration);

  useEffect(() => {
    if (!open) return;
    const collapse = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const timer = window.setTimeout(() => document.addEventListener("pointerdown", collapse), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", collapse);
    };
  }, [open]);

  return (
    <div className="arc-bencho snd" style={{ width: 300, height: 218 }}>
      <div className="snd-box" ref={boxRef} data-open={open || undefined}
        style={{ width: 260, height: mix(78, 189, p), borderRadius: mix(20, 26, p), scale: open ? 1 : 1 - 0.035 * swell, transform: "scale(1.15)", transformOrigin: "center center" }}>
        <span className="snd-art" aria-hidden="true" style={{ backgroundImage: `url(${track.albumArt})`, left: 10, top: 10, width: artSize, height: artSize, borderRadius: mix(10, 16, p) }} />
        <span className="snd-say" style={{ left: mix(60, 84, p), top: 10, height: artSize, width: mix(94, 126, p) }}>
          <span className="snd-title" title={track.name} style={{ fontSize: mix(13, 15.5, p) }}>{track.name}</span>
          <span className="snd-by" title={track.artist} style={{ fontSize: mix(11, 12, p) }}>{track.artist}</span>
        </span>
        <span className="snd-bar" style={{ top: mix(65, 96, p), left: 10, width: 240 }}>
          <span className="snd-rail"><span className="snd-run" style={{ width: `${safeDuration ? elapsed / safeDuration * 100 : 0}%` }} /></span>
          <span className="snd-clock" style={{ opacity: late }}><span>{formatTime(elapsed)}</span><span>−{formatTime(safeDuration - elapsed)}</span></span>
        </span>
        <button type="button" className="snd-tap" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Collapse the player" : "Open the player"}
          style={{ left: mix(0, 10, p), top: mix(0, 10, p), width: mix(260, 240, p), height: mix(78, 64, p), borderRadius: mix(20, 16, p) }} />
        <button type="button" className="snd-like" data-on={liked || undefined} onClick={onToggleLike} aria-label={liked ? "Remove from liked songs" : "Add to liked songs"} aria-pressed={liked} tabIndex={open ? 0 : -1}
          style={{ left: 220, top: 10, width: 30, height: 30, opacity: late, pointerEvents: late > 0.9 ? "auto" : "none" }}>
          <Heart size={16} strokeWidth={2} fill={liked ? "currentColor" : "none"} />
        </button>
        {/* Arc addition: real seeking, layered over Bencho's original progress rail. */}
        <input className="snd-seek" type="range" aria-label="Seek in track" min={0} max={safeDuration || 1} step={0.1} value={elapsed} disabled={!safeDuration} tabIndex={open ? 0 : -1}
          onChange={(event) => seek(Number(event.target.value))} style={{ top: mix(57, 88, p), opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }} />
        <span className="snd-ops" style={{ left: mix(206, 130, p), top: mix(30, 156, p), gap: mix(5, 14, p) }}>
          <button type="button" className="snd-op" style={{ width: mix(24, 34, p), height: mix(24, 34, p) }} onClick={prevTrack} aria-label="Previous track"><SkipBack size={mix(13, 16, p)} strokeWidth={2} /></button>
          <button type="button" className="snd-op" data-lead style={{ width: mix(30, 46, p), height: mix(30, 46, p) }} onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} aria-pressed={isPlaying} aria-busy={isLoading}>
            {isLoading ? <LoaderCircle size={mix(14, 18, p)} className="animate-spin motion-reduce:animate-none" /> : <PlayMark playing={isPlaying} size={mix(14, 18, p)} still={still} />}
          </button>
          <button type="button" className="snd-op" style={{ width: mix(24, 34, p), height: mix(24, 34, p) }} onClick={nextTrack} aria-label="Next track"><SkipForward size={mix(13, 16, p)} strokeWidth={2} /></button>
        </span>
      </div>
    </div>
  );
}
