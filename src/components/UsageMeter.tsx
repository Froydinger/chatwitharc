import { Zap, Sparkles, Mic } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  kind: "image" | "voice";
  className?: string;
}

/**
 * Tiny floating pill that shows remaining Free quota for image gen or voice.
 * Hidden entirely for Boost users (unlimited). Clicking opens the upgrade modal.
 */
export function UsageMeter({ kind, className }: UsageMeterProps) {
  const {
    hasBoost,
    dailyImagesUsed,
    voiceConversations30d,
    FREE_DAILY_IMAGE_LIMIT,
    FREE_VOICE_LIMIT_30D,
    openCheckout,
  } = useSubscription();

  const isImage = kind === "image";

  // Boost users get an unlimited pill (still visible so users can confirm
  // their entitlement at a glance — never hidden).
  if (hasBoost) {
    const Icon = isImage ? Sparkles : Mic;
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full",
          "border border-primary/50 bg-primary/10 backdrop-blur-xl shadow-lg",
          "text-xs font-medium text-primary",
          className,
        )}
        aria-label={`Unlimited ${kind} with ArcAI Boost`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>Unlimited {isImage ? "images" : "voice"} · Boost</span>
        <Zap className="h-3 w-3 opacity-80" />
      </div>
    );
  }

  const used = isImage ? dailyImagesUsed : voiceConversations30d;
  const limit = isImage ? FREE_DAILY_IMAGE_LIMIT : FREE_VOICE_LIMIT_30D;
  const remaining = Math.max(0, limit - used);
  const pct = Math.min(100, (used / limit) * 100);
  const isExhausted = remaining === 0;
  const isLow = remaining > 0 && remaining <= Math.max(1, Math.floor(limit * 0.3));

  const Icon = isImage ? Sparkles : Mic;
  const periodLabel = isImage ? "today" : "this month";

  return (
    <button
      type="button"
      onClick={openCheckout}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded-full",
        "border bg-background/70 backdrop-blur-xl shadow-lg",
        "text-xs font-medium transition-all hover:scale-105",
        isExhausted
          ? "border-destructive/60 text-destructive hover:bg-destructive/10"
          : isLow
          ? "border-primary/60 text-primary hover:bg-primary/10"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50",
        className,
      )}
      aria-label={`${remaining} ${kind} ${remaining === 1 ? "generation" : "generations"} remaining ${periodLabel}. Upgrade to Boost for unlimited.`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="tabular-nums">
        {isExhausted
          ? `Out of free ${isImage ? "images" : "voice"} ${periodLabel}`
          : `${remaining} / ${limit} ${isImage ? "images" : "voice"} left ${periodLabel}`}
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
      <Zap className="h-3 w-3 opacity-60 group-hover:opacity-100" />
    </button>
  );
}
