import { useState } from 'react';
import { ImageCreditSummary } from '@/components/ImageCreditSummary';
import { Brain, Zap, Image, Mic, RefreshCw } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useImageQuota } from '@/hooks/useImageQuota';

export function PlanUsageBreakdown() {
  const { hasBoost, isAdmin, loading, flashUsagePercent, dailyVoiceSessionsUsed,
    FREE_DAILY_VOICE_LIMIT, checkSubscription } = useSubscription();
  const images = useImageQuota();
  const [refreshing, setRefreshing] = useState(false);
  const unlimited = hasBoost || isAdmin;
  const rows = [
    { name: 'Arc Think', icon: Brain, detail: 'Everyday chat and reasoning', percent: null, unlimited: true },
    { name: 'Arc Flash', icon: Zap, detail: 'Your sent messages using Arc Flash', percent: flashUsagePercent, unlimited },
    { name: 'Images', icon: Image, detail: 'Shared allowance for Arc Image and Arc Image Flash. Flash images use twice as much.', percent: images.loading || !images.resetAt ? null : images.usagePercent, unlimited },
    { name: 'Voice', icon: Mic, detail: 'Voice sessions started today', percent: Math.min(100, dailyVoiceSessionsUsed / FREE_DAILY_VOICE_LIMIT * 100), unlimited },
  ];
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([checkSubscription(), images.refreshQuota()]); }
    finally { setRefreshing(false); }
  };
  return (
    <section className="rounded-[28px] border border-border/50 bg-background/60 p-5" aria-label="Usage breakdown">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold text-foreground">Usage today</h2>
          <p className="mt-1 text-xs text-muted-foreground">Daily allowances reset at midnight UTC.</p></div>
        <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh usage"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/50 text-foreground hover:bg-muted/40 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-5 space-y-5" aria-busy={loading || refreshing}>
        {rows.map(({ name, icon: Icon, detail, percent, unlimited: noLimit }) => {
          const amount = percent === null ? null : Math.round(Math.min(100, Math.max(0, percent)));
          const pending = loading || refreshing || (name === 'Images' && images.loading);
          return <div key={name}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium text-foreground"><Icon className="h-4 w-4" />{name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{pending ? 'Loading…' : noLimit ? 'Unlimited' : amount === null ? 'Unavailable' : `${amount}% used`}</span>
            </div>
            {!pending && !noLimit && amount !== null && <div role="progressbar" aria-label={`${name} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={amount}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground" style={{ width: `${amount}%` }} />
            </div>}
            {name === 'Images' ? <div className="mt-2"><ImageCreditSummary /></div> : <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>}
          </div>;
        })}
      </div>
    </section>
  );
}
