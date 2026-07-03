import { Sparkles, Mic } from "lucide-react";
import { useImageQuota } from "@/hooks/useImageQuota";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  kind: "image" | "voice";
  className?: string;
}

/**
 * Tiny floating pill for the daily image allowance. Voice is unlimited.
 */
export function UsageMeter({ kind, className }: UsageMeterProps) {
  const {
    isAdmin,
    dailyImagesUsed,
    FREE_DAILY_IMAGE_LIMIT,
  } = useImageQuota();

  const isImage = kind === "image";

  if (!isImage || isAdmin) {
    const Icon = isImage ? Sparkles : Mic;
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full",
          "border border-primary/50 bg-primary/10 backdrop-blur-xl shadow-lg",
          "text-xs font-medium text-primary",
          className,
        )}
        aria-label={`Unlimited ${kind}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Unlimited {isImage ? "images" : "voice"}</span>
        <span className="sm:hidden">{isImage ? "Unltd." : "Unltd."}</span>
      </div>
    );
  }

  const used = dailyImagesUsed;
  const limit = FREE_DAILY_IMAGE_LIMIT;
  const remaining = Math.max(0, limit - used);
  const pct = Math.min(100, (used / limit) * 100);
  const isExhausted = remaining === 0;
  const isLow = remaining > 0 && remaining <= Math.max(1, Math.floor(limit * 0.3));

  const Icon = isImage ? Sparkles : Mic;
  const periodLabel = "today";

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded-full",
        "border bg-background/70 backdrop-blur-xl shadow-lg",
        "text-xs font-medium",
        isExhausted
          ? "border-destructive/60 text-destructive hover:bg-destructive/10"
          : isLow
          ? "border-primary/60 text-primary hover:bg-primary/10"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50",
        className,
      )}
      aria-label={`${remaining} image ${remaining === 1 ? "output" : "outputs"} remaining today.`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="tabular-nums hidden sm:inline">
        {isExhausted
          ? `Daily image limit reached`
          : `${remaining} / ${limit} ${isImage ? "images" : "voice"} left ${periodLabel}`}
      </span>
      <span className="tabular-nums sm:hidden">
        {isImage ? `${used}/${limit}` : `${used}/${limit}`}
      </span>
      {/* mini progress bar */}
      <span className="hidden sm:inline-block w-10 h-1 rounded-full bg-muted/70 overflow-hidden">
        <span
          className={cn(
            "block h-full rounded-full transition-all",
            isExhausted ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}
