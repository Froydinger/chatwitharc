import { Sparkles, Mic, Crown } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { AnimatedCounter } from "@/components/ui/rare-ui/animated-counter";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  kind: "image" | "voice";
  className?: string;
}

/**
 * Tiny usage pill for daily image and voice allowances.
  */
export function UsageMeter({ kind, className }: UsageMeterProps) {
  const {
    isAdmin,
    hasBoost,
    dailyImagesUsed,
    imageLimit,
    dailyVoiceSessionsUsed,
    remainingVoiceConversations,
    FREE_DAILY_VOICE_LIMIT,
    openCheckout,
  } = useSubscription();

  const isImage = kind === "image";

  if (isAdmin || hasBoost && (isImage ? imageLimit === Infinity : true)) {
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

  const used = isImage ? dailyImagesUsed : dailyVoiceSessionsUsed;
  const limit = isImage ? imageLimit : FREE_DAILY_VOICE_LIMIT;
  const remaining = isImage ? Math.max(0, limit - used) : remainingVoiceConversations;
  const pct = Math.min(100, (used / limit) * 100);
  const voicePctLabel = `${Math.round(pct)}% used today`;
  const isExhausted = remaining === 0;
  const isLow = remaining > 0 && remaining <= Math.max(1, Math.floor(limit * 0.3));

  const Icon = isImage ? Sparkles : Mic;
  const periodLabel = "today";

  const handleClick = () => {
    if (isImage) {
      if (isExhausted && !hasBoost && !isAdmin) {
        openCheckout();
      } else {
        window.dispatchEvent(new CustomEvent("open-image-limits-modal"));
      }
    } else if (isExhausted && !hasBoost && !isAdmin) {
      openCheckout();
    }
  };

  return (
    <div
      role={isImage || !hasBoost ? "button" : undefined}
      tabIndex={isImage || !hasBoost ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if ((isImage || !hasBoost) && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
      title={
        isImage
          ? isExhausted
            ? "Daily image limit reached. Click to upgrade to Boost."
            : "Click to view image limits and upgrade options"
          : undefined
      }
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
        "border bg-background/70 backdrop-blur-xl shadow-lg",
        "text-xs font-medium",
        (isImage || !hasBoost) && "cursor-pointer select-none active:scale-95",
        isExhausted
          ? "border-destructive/60 text-destructive hover:bg-destructive/10 hover:border-destructive"
          : isLow
          ? "border-primary/60 text-primary hover:bg-primary/10 hover:border-primary"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border",
        className,
      )}
      aria-label={isImage ? `${remaining} images remaining ${periodLabel}.` : `${voicePctLabel}.`}
    >
      {isExhausted && !hasBoost && !isAdmin ? (
        <Crown className="h-3.5 w-3.5 shrink-0 text-destructive animate-pulse" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="tabular-nums hidden sm:inline-flex items-center gap-1">
        {isExhausted ? (
          "Daily limit reached · Upgrade to Boost"
        ) : (
          <>{isImage ? <><AnimatedCounter value={remaining} height={15} /> / {limit} images left {periodLabel}</> : voicePctLabel}</>
        )}
      </span>
      <span className="tabular-nums sm:hidden inline-flex items-center gap-0.5">
        {isExhausted ? "Upgrade" : (
          <>{isImage ? <><AnimatedCounter value={used} height={14} />/{limit}</> : `${Math.round(pct)}%`}</>
        )}
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
