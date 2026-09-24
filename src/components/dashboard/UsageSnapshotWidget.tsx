import { CircleGauge, ChevronRight } from "lucide-react";
import { useImageQuota } from "@/hooks/useImageQuota";
import { useSubscription } from "@/hooks/useSubscription";

function UsageLine({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = !Number.isFinite(limit);
  const percentage = unlimited || limit <= 0 ? 0 : Math.min(100, Math.max(0, (used / limit) * 100));

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 font-mono text-foreground">
          {unlimited ? "Unlimited" : `${used}/${limit}`}
        </span>
      </div>
      {!unlimited && (
        <div
          role="progressbar"
          aria-label={`${label} usage`}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          className="mt-1 h-1 overflow-hidden rounded-full bg-muted/60"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} />
        </div>
      )}
    </div>
  );
}

export function UsageSnapshotWidget({ onOpenPlan }: { onOpenPlan: () => void }) {
  const {
    hasBoost,
    isAdmin,
    dailyBalancedUsed,
    dailyVoiceSessionsUsed,
    FREE_DAILY_BALANCED_LIMIT,
    FREE_DAILY_VOICE_LIMIT,
  } = useSubscription();
  const { dailyImagesUsed, limit: imageLimit } = useImageQuota();
  const unlimited = hasBoost || isAdmin;

  return (
    <section className="rounded-[24px] border border-border/50 bg-background/55 p-4 shadow-sm backdrop-blur-xl sm:p-5" aria-label="Usage snapshot">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <CircleGauge className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Usage today</h2>
            <p className="truncate text-[10px] text-muted-foreground">Your plan’s current allowances</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
          {isAdmin ? "Admin" : hasBoost ? "Boost" : "Free"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <UsageLine label="Balanced" used={dailyBalancedUsed} limit={unlimited ? Infinity : FREE_DAILY_BALANCED_LIMIT} />
        <UsageLine label="Voice" used={dailyVoiceSessionsUsed} limit={unlimited ? Infinity : FREE_DAILY_VOICE_LIMIT} />
        <UsageLine label="Images" used={dailyImagesUsed} limit={unlimited ? Infinity : imageLimit} />
      </div>

      <button
        type="button"
        onClick={onOpenPlan}
        className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-left text-[11px] font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.06]"
      >
        <span>Plan &amp; usage details</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </section>
  );
}
