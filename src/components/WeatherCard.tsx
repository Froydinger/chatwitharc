import { X, Cloud, CloudRain, CloudSnow, CloudLightning, Sun, Moon, CloudFog, CloudDrizzle } from "lucide-react";

export interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  condition: string;
  code: number;
  high: number;
  low: number;
  humidity: number;
  wind: number;
  isDay: boolean;
}

export function WeatherIcon({ code, isDay, className }: { code: number; isDay: boolean; className?: string }) {
  const cls = className || "w-16 h-16";
  if (code === 0 || code === 1) return isDay ? <Sun className={cls} /> : <Moon className={cls} />;
  if (code === 2 || code === 3) return <Cloud className={cls} />;
  if (code === 45 || code === 48) return <CloudFog className={cls} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={cls} />;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className={cls} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={cls} />;
  if (code >= 95) return <CloudLightning className={cls} />;
  return <Cloud className={cls} />;
}

export function WeatherCard({ weather, onClose }: { weather: WeatherData; onClose?: () => void }) {
  const gradient = weather.isDay
    ? 'from-sky-500/30 via-blue-500/20 to-indigo-500/30'
    : 'from-indigo-900/40 via-slate-800/30 to-purple-900/40';
  return (
    <div className={`relative w-full max-w-[300px] rounded-2xl border border-primary/20 bg-gradient-to-br ${gradient} backdrop-blur-xl shadow-2xl overflow-hidden`}>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-background/70 border border-border shadow hover:bg-muted transition-colors z-10"
          aria-label="Close weather"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <div className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{weather.location}</p>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-5xl font-light text-foreground tabular-nums">{weather.temperature}°</p>
            <p className="text-sm text-foreground/80 mt-1">{weather.condition}</p>
          </div>
          <div className="text-primary/90">
            <WeatherIcon code={weather.code} isDay={weather.isDay} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span>Feels like {weather.feelsLike}°</span>
          <span>·</span>
          <span>H {weather.high}° L {weather.low}°</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/40">
          <div className="text-xs">
            <span className="text-muted-foreground">Humidity</span>
            <p className="text-foreground font-medium">{weather.humidity}%</p>
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Wind</span>
            <p className="text-foreground font-medium">{weather.wind} mph</p>
          </div>
        </div>
      </div>
    </div>
  );
}
