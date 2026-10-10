import { visibleTextUsageWindows, type TextUsageSnapshot } from '@/services/arcTextUsage';
import { cn } from '@/lib/utils';

/** The meter contains percentages only; model cost budgets stay server-side. */
export function TextUsageMeters({ name, snapshot, loading, compact = false }: {
  name: string; snapshot: TextUsageSnapshot | null; loading?: boolean; compact?: boolean;
}) {
  if (loading && !snapshot) return null;
  if (snapshot?.adminUncapped) return (
    <div className={cn('flex items-center justify-between gap-2', compact ? 'text-[10px]' : 'text-xs')}>
      <span className="text-muted-foreground">{name}</span><span className="font-medium text-primary">Uncapped</span>
    </div>
  );
  const windows = visibleTextUsageWindows(snapshot);
  if (!windows.length) return null;
  return <div className="space-y-2" aria-busy={loading || undefined}>
    {windows.map(window => {
      const percent = Math.round(window.usagePercent!);
      const label = `${name} · ${window.period === 'daily' ? 'Today' : 'This month'}`;
      return <div key={window.period}>
        <div className={cn('flex items-center justify-between gap-2', compact ? 'text-[10px]' : 'text-xs')}>
          <span className="min-w-0 truncate text-muted-foreground">{label}</span>
          <span className="shrink-0 font-mono text-foreground">{percent}% used</span>
        </div>
        <div role="progressbar" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
          className="mt-1 h-1 overflow-hidden rounded-full bg-muted/60">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>;
    })}
  </div>;
}
