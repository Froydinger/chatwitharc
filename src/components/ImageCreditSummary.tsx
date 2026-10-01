import { useImageQuota } from '@/hooks/useImageQuota';
import { useSubscription } from '@/hooks/useSubscription';

/** Both image modes spend the same daily credit balance. */
export function ImageCreditSummary() {
  const quota = useImageQuota();
  const { hasBoost, isAdmin, loading } = useSubscription();
  if (loading || quota.loading) return <p className="text-xs text-muted-foreground">Loading image credits…</p>;
  if (hasBoost || isAdmin) return <p className="text-xs text-muted-foreground">Unlimited images with Boost.</p>;
  if (!quota.resetAt) return <p className="text-xs text-muted-foreground">Image credits unavailable.</p>;
  const remaining = Math.max(0, quota.remainingCredits);
  return <div className="space-y-1 text-xs text-muted-foreground" aria-label="Image credits">
    <p className="font-medium text-foreground">{remaining} of {quota.creditLimit} image credits left today</p>
    <p>Arc Image: 1 credit per image · up to {Math.floor(remaining)} left</p>
    <p>Arc Image Flash: 2 credits per image · up to {Math.floor(remaining / 2)} left</p>
    <p>Shared balance, not separate allowances. Resets at midnight UTC.</p>
  </div>;
}
