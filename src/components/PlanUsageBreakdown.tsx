import { useWorkspaceSettingsRows } from '@/workspace/settingsPresentation';
import { TextUsageMeters } from '@/components/TextUsageMeters';
import { useTextUsage } from '@/hooks/useTextUsage';
import { useState } from 'react';
import { ImageCreditSummary } from '@/components/ImageCreditSummary';
import { CHAT_MODEL_ICONS } from '@/lib/chatModelIcons';
import { Image, Mic, RefreshCw } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useImageQuota } from '@/hooks/useImageQuota';

export function PlanUsageBreakdown() {
  const workspace = useWorkspaceSettingsRows();
  const { hasBoost, hasVerifiedBoost, isVerifiedModelAdmin, isAdmin, loading, dailyVoiceSessionsUsed,
    FREE_DAILY_VOICE_LIMIT, checkSubscription } = useSubscription();
  const images = useImageQuota();
  const sol = useTextUsage('sol');
  const astra = useTextUsage('astra', hasVerifiedBoost || isVerifiedModelAdmin);
  const [refreshing, setRefreshing] = useState(false);
  const unlimited = hasBoost || isAdmin;
  const rows = [
    { name: 'GPT 6 Luna', icon: CHAT_MODEL_ICONS['gpt-6-luna'], detail: 'Free and unlimited for everyone.', percent: null, unlimited: true },
    { name: 'Images', icon: Image, detail: 'Monthly image allowance shared across available models.', percent: images.loading || !images.resetAt ? null : images.usagePercent, unlimited: images.remainingCredits === Infinity },
    { name: 'Voice', icon: Mic, detail: 'Voice sessions started today', percent: Math.min(100, dailyVoiceSessionsUsed / FREE_DAILY_VOICE_LIMIT * 100), unlimited },
  ];
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([checkSubscription(), images.refreshQuota(), sol.refresh(), astra.refresh()]); }
    finally { setRefreshing(false); }
  };
  return (
    <section className={workspace ? "workspace-settings-group workspace-usage-group" : "rounded-[28px] border border-border/50 bg-background/60 p-5"} aria-label="Usage breakdown">
      <div className={workspace ? "workspace-usage-heading" : "flex items-start justify-between gap-3"}>
        <div>{workspace ? <h3>Usage</h3> : <h2 className="font-semibold text-foreground">Usage</h2>}
          <p className="mt-1 text-xs text-muted-foreground">Images renew monthly; daily allowances reset at midnight UTC.</p></div>
        <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh usage"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/50 text-foreground hover:bg-muted/40 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <div className={workspace ? "workspace-usage-rows" : "mt-5 space-y-5"} aria-busy={loading || refreshing}>
        {rows.map(({ name, icon: Icon, detail, percent, unlimited: noLimit }) => {
          const amount = percent === null ? null : Math.round(Math.min(100, Math.max(0, percent)));
          const pending = loading || refreshing || (name === 'Images' && images.loading);
          return <div key={name} className={workspace ? "workspace-usage-row" : undefined}>
            <div className={workspace ? "workspace-usage-label" : "flex items-center justify-between gap-3 text-sm"}>
              <span className="flex items-center gap-2 font-medium text-foreground"><Icon className="h-4 w-4" />{name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{pending ? 'Loading…' : noLimit ? 'Unlimited' : amount === null ? 'Unavailable' : `${amount}% used`}</span>
            </div>
            {!pending && !noLimit && amount !== null && <div role="progressbar" aria-label={`${name} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={amount}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground" style={{ width: `${amount}%` }} />
            </div>}
            {name === 'Images' ? <div className={workspace ? "workspace-image-credit-details" : "mt-2"}><ImageCreditSummary /></div> : <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>}
            {name === 'GPT 6 Luna' && <div className={workspace ? "workspace-text-usage-details" : "mt-4 space-y-3"}>
              <TextUsageMeters name="GPT 6.1 Sol" snapshot={sol.snapshot} loading={sol.loading} />
              <TextUsageMeters name="GPT 6 Astra" snapshot={astra.snapshot} loading={astra.loading} />
              <p className="text-xs leading-relaxed text-muted-foreground">Auto can use your shared Sol allowance. When it runs out, Auto and Sol switch to Luna. Astra has a separate Boost allowance.</p>
            </div>}
          </div>;
        })}
      </div>
    </section>
  );
}
