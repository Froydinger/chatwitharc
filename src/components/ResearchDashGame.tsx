import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A one-button jumper to play while Ultra Deep Search browses. Agentic research
 * takes real time, and a spinner makes that time feel longer than it is.
 *
 * Deliberately tiny: one canvas, no assets, no audio, no persistence beyond the
 * session's best score. It pauses itself when the tab is hidden so it never
 * burns battery in the background.
 */

interface Obstacle {
  x: number;
  height: number;
  width: number;
}

const GROUND_Y = 96;
const PLAYER_X = 40;
const PLAYER_SIZE = 18;
const GRAVITY = 0.62;
const JUMP_VELOCITY = -9.6;
const BASE_SPEED = 3.1;

export function ResearchDashGame({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const playerYRef = useRef(GROUND_Y - PLAYER_SIZE);
  const velocityRef = useRef(0);
  const rotationRef = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const spawnRef = useRef(0);
  const scoreRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [dead, setDead] = useState(false);
  const [started, setStarted] = useState(false);

  const reset = useCallback(() => {
    playerYRef.current = GROUND_Y - PLAYER_SIZE;
    velocityRef.current = 0;
    rotationRef.current = 0;
    obstaclesRef.current = [];
    spawnRef.current = 0;
    scoreRef.current = 0;
    speedRef.current = BASE_SPEED;
    setScore(0);
    setDead(false);
    setStarted(true);
    runningRef.current = true;
  }, []);

  const jump = useCallback(() => {
    if (dead || !started) {
      reset();
      return;
    }
    // Only from the ground — no mid-air double jumps.
    if (playerYRef.current >= GROUND_Y - PLAYER_SIZE - 0.5) {
      velocityRef.current = JUMP_VELOCITY;
    }
  }, [dead, started, reset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const readColor = (name: string, fallback: string) => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value ? `hsl(${value})` : fallback;
    };
    const fg = readColor("--foreground", "#e5e5e5");
    const accent = readColor("--primary", "#a855f7");
    const muted = readColor("--muted-foreground", "#888");

    const step = () => {
      ctx.clearRect(0, 0, width, height);

      // ground line
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(width, GROUND_Y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (runningRef.current) {
        velocityRef.current += GRAVITY;
        playerYRef.current += velocityRef.current;
        if (playerYRef.current > GROUND_Y - PLAYER_SIZE) {
          playerYRef.current = GROUND_Y - PLAYER_SIZE;
          velocityRef.current = 0;
          rotationRef.current = 0;
        } else {
          rotationRef.current += 0.16;
        }

        speedRef.current = BASE_SPEED + Math.min(scoreRef.current * 0.04, 3.2);

        spawnRef.current -= 1;
        if (spawnRef.current <= 0) {
          const height = 14 + Math.random() * 20;
          obstaclesRef.current.push({ x: width + 20, height, width: 12 + Math.random() * 8 });
          spawnRef.current = 58 + Math.random() * 48;
        }

        obstaclesRef.current = obstaclesRef.current.filter((o) => o.x + o.width > -10);
        for (const o of obstaclesRef.current) {
          o.x -= speedRef.current;
          const hitX = PLAYER_X + PLAYER_SIZE > o.x && PLAYER_X < o.x + o.width;
          const hitY = playerYRef.current + PLAYER_SIZE > GROUND_Y - o.height;
          if (hitX && hitY) {
            runningRef.current = false;
            setDead(true);
            setBest((b) => Math.max(b, scoreRef.current));
          }
          if (!o.x || o.x + o.width < PLAYER_X) continue;
        }

        scoreRef.current += 1;
        if (scoreRef.current % 6 === 0) setScore(Math.floor(scoreRef.current / 6));
      }

      // obstacles
      ctx.fillStyle = accent;
      for (const o of obstaclesRef.current) {
        ctx.beginPath();
        ctx.moveTo(o.x, GROUND_Y);
        ctx.lineTo(o.x + o.width / 2, GROUND_Y - o.height);
        ctx.lineTo(o.x + o.width, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }

      // player
      ctx.save();
      ctx.translate(PLAYER_X + PLAYER_SIZE / 2, playerYRef.current + PLAYER_SIZE / 2);
      ctx.rotate(rotationRef.current);
      ctx.fillStyle = fg;
      ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
      ctx.restore();

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") runningRef.current = false;
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  return (
    <div className={cn("w-full max-w-md mx-auto select-none", className)}>
      <div className="flex items-center justify-between px-1 pb-2 text-xs text-muted-foreground">
        <span>Score {score}</span>
        <span>Best {best}</span>
      </div>
      <button
        type="button"
        onClick={jump}
        onTouchStart={(e) => {
          e.preventDefault();
          jump();
        }}
        aria-label="Jump"
        className="relative w-full rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 overflow-hidden touch-none"
      >
        <canvas ref={canvasRef} className="w-full h-[120px] block" />
        {(!started || dead) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/40 backdrop-blur-[1px]">
            <span className="text-sm font-semibold text-foreground">
              {dead ? `Nice — ${score}` : "Tap to play while you wait"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {dead ? "Tap to go again" : "Tap or press space to jump"}
            </span>
          </div>
        )}
      </button>
    </div>
  );
}
