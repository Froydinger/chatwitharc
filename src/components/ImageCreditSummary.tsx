import { useState } from 'react';
import { useImageQuota } from '@/hooks/useImageQuota';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
export function ImageCreditSummary({ compact = false }: { compact?: boolean }) {
 const quota = useImageQuota();
 const { hasBoost, isAdmin } = useSubscription();
 const [offer, setOffer] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 if (quota.loading) return <p className="text-xs text-muted-foreground">Loading image allowance…</p>;
 if (compact) return <p className="text-xs text-muted-foreground">{quota.remainingCredits === Infinity ? `Unlimited images${isAdmin ? ' for admins' : ''}` : `${quota.remainingCredits} ${hasBoost ? 'credits' : 'images'} remaining${hasBoost ? ` · ${quota.unitCost} per image` : ''}`}</p>;
 if (isAdmin || quota.remainingCredits === Infinity) return <p className="text-xs text-muted-foreground">{isAdmin ? 'Unlimited images for admins.' : quota.unlimitedReason === 'grandfather' && quota.grandfatheredUntil ? `Your existing Boost image allowance remains unlimited until ${new Date(quota.grandfatheredUntil).toLocaleString()} (${quota.grandfatheredUntil}). Then 250 monthly credits apply.` : quota.unlimitedReason === 'staged' ? 'Your existing Boost image allowance remains unlimited while the transition is staged.' : 'Unlimited images during this offer.'}</p>;
 if (!quota.resetAt) return <p className="text-xs text-muted-foreground">Image allowance unavailable.</p>;
 const refill = async () => {
  setBusy(true);setError('');
  try { await quota.claimRefill(offer || undefined);setOffer(null); } catch(e) {setError(e instanceof Error ? e.message : 'Refill unavailable');} finally {setBusy(false);}
 };
 return <div className="space-y-1 text-xs text-muted-foreground" aria-label="Image allowance">
  <p className="font-medium text-foreground">{quota.baseRemaining} of {quota.creditLimit} {hasBoost ? 'base credits' : 'images'} remaining</p>
  {quota.bonusRemaining > 0 && <p>Plus {quota.bonusRemaining} bonus {hasBoost ? 'credits' : 'images'}; offers expire separately.</p>}
  {hasBoost && <p>This selection: {quota.unitCost} credits per image. Edits matching the original may cost more.</p>}
  <p>Renews {new Date(quota.resetAt).toLocaleDateString()} at 00:00 UTC.</p>
  {quota.refillEnabled && <Button size="sm" variant="outline" disabled={!quota.canRefill || busy} onClick={() => setOffer('')}>{quota.canRefill ? 'Refill monthly allowance' : 'Monthly refill used'}</Button>}
  {quota.refillOffers.map(o => <Button key={o.id} size="sm" variant="outline" disabled={busy} onClick={() => setOffer(o.id)}>{o.title}: refill</Button>)}
  {error && <p role="alert">{error}</p>}
  <AlertDialog open={offer !== null} onOpenChange={open => !open && !busy && setOffer(null)}><AlertDialogContent>
   <AlertDialogHeader><AlertDialogTitle>Refill your base allowance?</AlertDialogTitle><AlertDialogDescription>This replaces your remaining base balance with the full monthly allowance. Unused base usage is forfeited. Bonus balances and the normal renewal date stay the same.</AlertDialogDescription></AlertDialogHeader>
   <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => {e.preventDefault();void refill();}}>{busy ? 'Refilling…' : 'Refill'}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </div>;
}
