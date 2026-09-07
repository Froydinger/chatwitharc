import { Sparkles, Mic, Crown } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
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
    hasBoost,
    dailyImagesUsed,
    imageLimit,
    voiceConversations30d,
    remainingVoiceConversations,
    FREE_VOICE_LIMIT_30D,
    openCheckout,
  } = useSubscription();

  const isImage = kind === "image";

  if (isAdmin || (isImage && hasBoost && imageLimit === Infinity)) {
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

  const used = isImage ? dailyImagesUsed : voiceConversations30d;
  const limit = isImage ? imageLimit : FREE_VOICE_LIMIT_30D;
  const remaining = isImage ? Math.max(0, limit - used) : remainingVoiceConversations;
  const pct = Math.min(100, (used / limit) * 100);
  const isExhausted = remaining === 0;
  const isLow = remaining > 0 && remaining <= Math.max(1, Math.floor(limit * 0.3));

  const Icon = isImage ? Sparkles : Mic;
  const periodLabel = isImage ? "today" : "this month";

  const handleClick = () => {
    if (isImage) {
      if (isExhausted && !hasBoost && !isAdmin) {
        openCheckout();
      } else {
        window.dispatchEvent(new CustomEvent("open-image-limits-modal"));
      }
    }
  };

  return (
    <div
      role={isImage ? "button" : undefined}
      tabIndex={isImage ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (isImage && (e.key === "Enter" || e.key === " ")) {
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
        isImage && "cursor-pointer select-none active:scale-95",
        isExhausted
          ? "border-destructive/60 text-destructive hover:bg-destructive/10 hover:border-destructive"
          : isLow
          ? "border-primary/60 text-primary hover:bg-primary/10 hover:border-primary"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:border-border",
        className,
      )}
      aria-label={`${remaining} ${isImage ? "images" : "voice calls"} remaining ${periodLabel}.`}
    >
      {isExhausted && !hasBoost && !isAdmin ? (
        <Crown className="h-3.5 w-3.5 shrink-0 text-destructive animate-pulse" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="tabular-nums hidden sm:inline">
        {isExhausted
          ? `Daily limit reached · Upgrade to Boost`
          : `${remaining} / ${limit} ${isImage ? "images" : "voice"} left ${periodLabel}`}
      </span>
      <span className="tabular-nums sm:hidden">
        {isExhausted ? "Upgrade" : `${used}/${limit}`}
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
