import { GOOGLE_PLAY_BOOST_PRODUCT_IDS, currentBoostCheckoutPriceId, boostBillingInterval } from '../../supabase/functions/_shared/boostCatalog';
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { Check, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { cn } from "@/lib/utils";
import {
  BOOST_PRICE_ID,
  BOOST_MONTHLY_PRICE_AMOUNT,
  BOOST_PRICE_DISPLAY,
  BOOST_TRIAL_DISPLAY,
  BOOST_TRIAL_NOTE,
  BOOST_ANNUAL_PRICE_ID,
  BOOST_ANNUAL_PRICE_AMOUNT,
  BOOST_ANNUAL_REGULAR_PRICE_DISPLAY,
  BOOST_ANNUAL_RENEWAL_DISPLAY,
  BOOST_ANNUAL_SAVINGS_DISPLAY,
  BOOST_ANNUAL_OFFER_BADGE,
  BOOST_ANNUAL_PRICE_DISPLAY,
  BOOST_GRANDFATHERING_COPY,
  paymentsAvailable,
  getStripeEnvironment
} from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import {
  buyGooglePlayBoost,
  formatGooglePlayPrice,
  getGooglePlayBoostDetails,
  isGooglePlayStoreTwa,
  restoreGooglePlayBoost,
  type GooglePlayItemDetails,
} from "@/services/googlePlayBilling";
import { useToast } from "@/hooks/use-toast";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  priceId?: string;
  reason?: string;
}

export function UpgradeModal({ isOpen, onClose, priceId, reason }: UpgradeModalProps) {
  const { user, isAnonymous } = useAuth();
  const { checkSubscription } = useSubscription();
  const requireAuth = useRequireAuth();
  const { toast } = useToast();
  const [selectedPriceId, setSelectedPriceId] = useState(currentBoostCheckoutPriceId(priceId));
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [playDetails, setPlayDetails] = useState<GooglePlayItemDetails[]>([]);
  const [loadingPlayDetails, setLoadingPlayDetails] = useState(false);
  const [playBillingError, setPlayBillingError] = useState<string | null>(null);

  const isRealUser = !!user && !isAnonymous;
  const isPlayCheckout = isGooglePlayStoreTwa();
  const selectedPlayProductId = GOOGLE_PLAY_BOOST_PRODUCT_IDS[boostBillingInterval(selectedPriceId) ?? 'monthly'];
  const selectedPlayItem = playDetails.find(item => item.itemId === selectedPlayProductId);
  const selectedPlayPrice = formatGooglePlayPrice(selectedPlayItem);
  const canCheckout = isPlayCheckout
    ? isRealUser && !!selectedPlayItem && !!selectedPlayPrice && !loadingPlayDetails
    : paymentsAvailable() && isRealUser;
  const isVoiceLimit = reason === 'voice_daily_limit' || reason === 'voice_session_timeout';
  useEffect(() => {
    if (!isOpen || reason !== 'app_builder') return;
    const closeOnBack = () => onClose();
    window.addEventListener('popstate', closeOnBack);
    return () => window.removeEventListener('popstate', closeOnBack);
  }, [isOpen, reason, onClose]);

  useEffect(() => {
    if (isOpen) {
      setSelectedPriceId(currentBoostCheckoutPriceId(priceId));
    }
  }, [isOpen, priceId]);

  useEffect(() => {
    if (!isOpen || !isPlayCheckout) return;
    let active = true;
    setLoadingPlayDetails(true);
    setPlayBillingError(null);
    void getGooglePlayBoostDetails()
      .then(details => { if (active) setPlayDetails(details); })
      .catch(error => {
        if (active) setPlayBillingError(error instanceof Error ? error.message : 'Google Play prices could not be loaded.');
      })
      .finally(() => { if (active) setLoadingPlayDetails(false); });
    return () => { active = false; };
  }, [isOpen, isPlayCheckout]);

  if (!isOpen) return null;

  const handleInitiateCheckout = async () => {
    if (!isRealUser || !canCheckout || loadingCheckout) return;
    setLoadingCheckout(true);
    if (isPlayCheckout) {
      try {
        await buyGooglePlayBoost(selectedPlayProductId);
        await checkSubscription();
        toast({ title: 'ArcAI Boost is active', description: 'Your Google Play purchase is verified.' });
        handleClose();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not complete the Google Play purchase.';
        if (message !== 'Purchase cancelled.') {
          toast({ title: 'Google Play purchase not completed', description: message, variant: 'destructive' });
        }
      } finally {
        setLoadingCheckout(false);
      }
      return;
    }
    try {
      const finalReturnUrl = `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: selectedPriceId,
          customerEmail: user.email,
          userId: user.id,
          returnUrl: finalReturnUrl,
          environment: getStripeEnvironment(),
          uiMode: "hosted"
        },
      });
      if (error || !data?.url) {
        throw new Error(error?.message || data?.error || "Failed to create checkout session");
      }
      window.location.href = data.url;
    } catch (err: unknown) {
      console.error("Checkout initiation failed:", err);
      toast({ title: "Could not start checkout", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleSignIn = () => {
    handleClose();
    requireAuth("generic");
  };

  const handleRestorePlayPurchases = async () => {
    if (!user || !isRealUser) {
      handleSignIn();
      return;
    }
    setLoadingCheckout(true);
    try {
      const count = await restoreGooglePlayBoost(user.id, true);
      await checkSubscription();
      toast({
        title: count ? 'Google Play purchases restored' : 'No Google Play purchase found',
        description: count ? 'ArcAI checked your Play subscription receipts.' : 'Check that you are signed in with the Google Play account used to subscribe.',
      });
    } catch (err: unknown) {
      toast({
        title: 'Restore could not finish',
        description: err instanceof Error ? err.message : 'Try again when Google Play is available.',
        variant: 'destructive',
      });
    } finally {
      setLoadingCheckout(false);
    }
  };

  const isAnnual = selectedPriceId === BOOST_ANNUAL_PRICE_ID;
  const priceDisplay = isPlayCheckout
    ? selectedPlayPrice
      ? `${selectedPlayPrice}${selectedPlayItem?.subscriptionPeriod ? ` / ${isAnnual ? 'year' : 'month'}` : ''}`
      : loadingPlayDetails ? 'Loading Google Play price…' : 'Google Play price unavailable'
    : isAnnual ? BOOST_ANNUAL_PRICE_DISPLAY : BOOST_PRICE_DISPLAY;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="arc-upgrade-dialog flex w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-3xl p-0"
        style={{ maxHeight: "calc(100dvh - var(--arcai-safe-area-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)" }}>
        <header className="shrink-0 px-5 pb-4 pt-5 pr-14 sm:px-6 sm:pr-14">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Zap className="h-4 w-4" /> ARCAI BOOST</div>
          <DialogTitle className="text-2xl font-semibold tracking-tight">{isVoiceLimit ? 'Keep the conversation going' : 'Put your agent to work.'}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm">Unlock Arc Work and App Builder, more Sol usage, a separate Astra allowance, and 250 shared monthly image credits.</DialogDescription>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
          <div role="group" aria-label="Billing period" className="grid grid-cols-2 gap-2">
            {[{id: BOOST_PRICE_ID, label: 'Monthly'}, {id: BOOST_ANNUAL_PRICE_ID, label: 'Yearly'}].map(option => <button key={option.id} type="button" aria-pressed={selectedPriceId === option.id}
              onClick={() => setSelectedPriceId(option.id)} disabled={loadingCheckout}
              className={cn('rounded-2xl border px-3 py-3 text-sm font-medium text-foreground transition-colors', selectedPriceId === option.id ? 'border-primary/50 bg-muted/60' : 'border-border/50 bg-transparent')}>
              {option.label}{!isPlayCheckout && option.id === BOOST_ANNUAL_PRICE_ID && <span className="mt-0.5 block text-[10px] text-muted-foreground">{BOOST_ANNUAL_OFFER_BADGE}</span>}
            </button>)}
          </div>
          <div className="py-4">
            {isPlayCheckout ? <p className="text-xl font-semibold">{priceDisplay}</p> : <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight">{isAnnual ? BOOST_ANNUAL_PRICE_AMOUNT : BOOST_MONTHLY_PRICE_AMOUNT}</span>
              <span className="text-sm text-muted-foreground">/ {isAnnual ? 'year' : 'month'}</span>
            </div>}
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{isPlayCheckout ? 'Renews automatically until canceled in Google Play.' : `After a ${BOOST_TRIAL_DISPLAY.toLowerCase()}. ${BOOST_TRIAL_NOTE}`}</p>
            {!isPlayCheckout && isAnnual && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{BOOST_ANNUAL_SAVINGS_DISPLAY} vs. {BOOST_ANNUAL_REGULAR_PRICE_DISPLAY}. {BOOST_ANNUAL_RENEWAL_DISPLAY}</p>}
          </div>
          {!isPlayCheckout && <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{BOOST_GRANDFATHERING_COPY}</p>}
          <ul className="space-y-3 border-t border-border/50 pt-4">
            {[
              ['Arc Work', 'Your agent carries out longer tasks in the cloud, with progress saved to your chat.'],
              ['App Builder', 'Build and refine working apps with Arc, then publish or export.'],
              ['GPT 6 Luna, GPT 6.1 Sol + GPT 6 Astra', 'Unlimited Luna, more Sol usage, and a separate Astra allowance.'],
              ['Image generation & editing', '250 shared monthly credits across available models.'],
              ['Deep Search + Ultra Deep Search', 'Unlimited research.'],
              ['Natural voice', 'Unlimited sessions, up to 2 hours each.'],
            ].map(([title, detail]) => <li key={title} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" /><div><p className="text-sm font-medium">{title}</p><p className="text-xs leading-relaxed text-muted-foreground">{detail}</p></div></li>)}
          </ul>
          {isVoiceLimit && <p className="mt-4 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">{reason === 'voice_session_timeout' ? 'Your free voice session reached its 10-minute limit.' : 'You have used your free voice allowance today.'}</p>}
          {isPlayCheckout && playBillingError && <p role="status" className="mt-3 text-xs text-destructive">{playBillingError}</p>}
          {isPlayCheckout && !loadingPlayDetails && !playBillingError && !playDetails.length && <p role="status" className="mt-3 text-xs text-muted-foreground">Google Play Boost products are not available yet.</p>}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Happy on Free? Keep using Arc with less usage. Your chats and memories stay with you.</p>
        </div>
        <footer className="shrink-0 border-t border-border/50 px-5 pb-5 pt-4 sm:px-6">
          <GlassButton className="w-full rounded-xl font-semibold" onClick={canCheckout ? handleInitiateCheckout : isRealUser ? handleClose : handleSignIn} disabled={loadingCheckout}>
            {loadingCheckout ? 'Preparing checkout…' : canCheckout ? isPlayCheckout ? 'Subscribe with Google Play' : 'Upgrade to Boost' : isRealUser ? 'Got it' : 'Sign in to upgrade'}
          </GlassButton>
          {reason === 'app_builder' && <button type="button" onClick={handleClose} className="mt-2 w-full rounded-xl py-2 text-sm text-muted-foreground hover:text-foreground">Not now</button>}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{!isPlayCheckout && !paymentsAvailable() ? 'Checkout is currently unavailable.' : 'Cancel anytime.'}</p>
          {isPlayCheckout && <button type="button" onClick={() => void handleRestorePlayPurchases()} disabled={loadingCheckout || loadingPlayDetails} className="mt-2 w-full text-center text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-50">Restore Google Play purchases</button>}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
