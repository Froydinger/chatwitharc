import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
  brightness: number;
}

const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

const generateStars = (
  count: number,
  baseId: number,
  sizeRange: [number, number],
  opacityRange: [number, number]
): Star[] => {
  return Array.from({ length: count }, (_, i) => {
    const rand = seededRandom(baseId + i * 7.7);
    const isBright = rand > 0.8;
    return {
      id: baseId + i,
      x: seededRandom(baseId + i * 1.1) * 100,
      y: seededRandom(baseId + i * 2.2) * 100,
      size: isBright
        ? sizeRange[1] * 1.5
        : sizeRange[0] + seededRandom(baseId + i * 3.3) * (sizeRange[1] - sizeRange[0]),
      opacity: isBright
        ? Math.min(opacityRange[1] * 1.3, 0.8)
        : opacityRange[0] + seededRandom(baseId + i * 4.4) * (opacityRange[1] - opacityRange[0]),
      delay: seededRandom(baseId + i * 5.5) * 8,
      duration: 3 + seededRandom(baseId + i * 6.6) * 5,
      brightness: isBright ? 1.5 : 1,
    };
  });
};

export const Starfield = () => {
  const isMobile = useIsMobile();

  const stars = useMemo(() => {
    const count = isMobile ? 60 : 140;
    return [
      ...generateStars(Math.floor(count * 0.5), 0, [0.5, 1.5], [0.1, 0.3]),
      ...generateStars(Math.floor(count * 0.35), 100, [1, 2], [0.15, 0.4]),
      ...generateStars(Math.floor(count * 0.15), 200, [1.5, 2.5], [0.25, 0.55]),
    ];
  }, [isMobile]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: -5 }}>
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            backgroundColor: 'hsl(var(--primary-glow) / 0.9)',
            boxShadow:
              star.brightness > 1
                ? `0 0 ${star.size * 4}px ${star.size}px hsl(var(--primary-glow) / 0.4)`
                : `0 0 ${star.size * 2}px ${star.size * 0.5}px hsl(var(--primary-glow) / 0.15)`,
            animation: `starTwinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
};
