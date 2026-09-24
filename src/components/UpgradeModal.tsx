import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { Sparkles, Check, X, Zap } from "lucide-react";
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
  BOOST_ANNUAL_REGULAR_PRICE_AMOUNT,
  BOOST_ANNUAL_REGULAR_PRICE_DISPLAY,
  BOOST_ANNUAL_RENEWAL_DISPLAY,
  BOOST_ANNUAL_SAVINGS_DISPLAY,
  BOOST_ANNUAL_OFFER_BADGE,
  BOOST_ANNUAL_PRICE_DISPLAY, 
  paymentsAvailable,
  getStripeEnvironment,
  getStripe
} from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { BOOST_PLAN_FEATURES, FREE_PLAN_SUMMARY } from "@/lib/planCopy";
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
  const [selectedPriceId, setSelectedPriceId] = useState(priceId || BOOST_PRICE_ID);
  const [showCheckout, setShowCheckout] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [playDetails, setPlayDetails] = useState<GooglePlayItemDetails[]>([]);
  const [loadingPlayDetails, setLoadingPlayDetails] = useState(false);
  const [playBillingError, setPlayBillingError] = useState<string | null>(null);

  const isRealUser = !!user && !isAnonymous;
  const isPlayCheckout = isGooglePlayStoreTwa();
  const selectedPlayItem = playDetails.find(item => item.itemId === selectedPriceId);
  const selectedPlayPrice = formatGooglePlayPrice(selectedPlayItem);
  const canCheckout = isPlayCheckout
    ? isRealUser && !!selectedPlayItem && !loadingPlayDetails
    : paymentsAvailable() && isRealUser;
  const isVoiceLimit = reason === 'voice_daily_limit' || reason === 'voice_session_timeout';

  useEffect(() => {
    if (isOpen) {
      setSelectedPriceId(priceId || BOOST_PRICE_ID);
      setShowCheckout(false);
      setClientSecret(null);
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
    if (!user) return;
    setLoadingCheckout(true);
    if (isPlayCheckout) {
      try {
        await buyGooglePlayBoost(selectedPriceId);
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
    setShowCheckout(true);
    setClientSecret(null);
    try {
      const finalReturnUrl = `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: selectedPriceId,
          customerEmail: user.email,
          userId: user.id,
          returnUrl: finalReturnUrl,
          environment: getStripeEnvironment(),
          uiMode: "embedded"
        },
      });
      if (error || !data?.clientSecret) {
        throw new Error(error?.message || data?.error || "Failed to create checkout session");
      }
      setClientSecret(data.clientSecret);
    } catch (err: unknown) {
      console.error("Embedded checkout initiation failed:", err);
      setShowCheckout(false);
      window.alert(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handleClose = () => {
    setShowCheckout(false);
    setClientSecret(null);
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
      <DialogContent 
        hideCloseButton={showCheckout}
        className={cn(
          "max-w-lg border-white/10 p-0 overflow-hidden bg-background/95 backdrop-blur-xl transition-all duration-300",
          showCheckout && "max-w-xl border-none bg-zinc-950 shadow-none backdrop-blur-none overflow-visible"
        )}
        style={showCheckout ? {
          maxHeight: "calc(100dvh - var(--arcai-safe-area-top) - env(safe-area-inset-bottom, 0px) - 16px)",
        } : undefined}
      >
        {!showCheckout ? (
          <div className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-1">{isVoiceLimit ? 'Keep the conversation going' : reason === 'river_boost_required' ? 'Unlock River with Boost' : 'ArcAI Boost'}</h2>
            
            {/* Billing Cycle Selector Switch */}
            <div className="flex justify-center my-5">
              <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-muted/40 border border-border/40 backdrop-blur-xl">
                <button
                  onClick={() => setSelectedPriceId(BOOST_PRICE_ID)}
                  className={cn(
                    "h-8 px-4 rounded-full text-xs font-semibold transition-all duration-200",
                    selectedPriceId === BOOST_PRICE_ID
                      ? "bg-primary/70 text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setSelectedPriceId(BOOST_ANNUAL_PRICE_ID)}
                  className={cn(
                    "h-8 px-4 rounded-full text-xs font-semibold transition-all duration-200 relative",
                    selectedPriceId === BOOST_ANNUAL_PRICE_ID
                      ? "bg-primary/70 text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Yearly
                  <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-[8px] text-white px-1.5 py-0.5 rounded-full font-bold">
                    {BOOST_ANNUAL_OFFER_BADGE}
                  </span>
                </button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-1">
              {isPlayCheckout ? priceDisplay : `${priceDisplay} after a ${BOOST_TRIAL_DISPLAY.toLowerCase()}`}
            </p>
            <p className="text-[11px] text-muted-foreground mb-1">
              {isPlayCheckout ? 'Renews automatically until canceled in Google Play.' : BOOST_TRIAL_NOTE}
            </p>
            {isPlayCheckout && playBillingError && (
              <p role="status" className="text-xs text-amber-500 mb-3">{playBillingError}</p>
            )}
            {isPlayCheckout && !loadingPlayDetails && !playBillingError && !playDetails.length && (
              <p role="status" className="text-xs text-muted-foreground mb-3">Google Play Boost products are not available yet.</p>
            )}
            {isVoiceLimit && (
              <p className="text-sm text-foreground/80 mb-1">
                {reason === 'voice_session_timeout'
                  ? 'Your free voice session reached its 10-minute limit.'
                  : 'You have used the free voice allowance for today.'}
                {' '}Boost unlocks unlimited live voice sessions up to 2 hours each.
              </p>
            )}
            {!isPlayCheckout && <div className="flex items-baseline justify-center gap-1 my-4">
              {isAnnual && (
                <span className="text-lg text-muted-foreground/70 line-through" aria-label={`Regular price ${BOOST_ANNUAL_REGULAR_PRICE_DISPLAY}`}>
                  {BOOST_ANNUAL_REGULAR_PRICE_AMOUNT}
                </span>
              )}
              <span className="text-4xl font-bold">{isAnnual ? BOOST_ANNUAL_PRICE_AMOUNT : BOOST_MONTHLY_PRICE_AMOUNT}</span>
              <span className="text-muted-foreground">/ {isAnnual ? "year" : "month"}</span>
            </div>}
            {!isPlayCheckout && isAnnual && (
              <div className="-mt-2 mb-4 space-y-1">
                <p className="text-xs text-primary font-semibold">{BOOST_ANNUAL_OFFER_BADGE} · {BOOST_ANNUAL_SAVINGS_DISPLAY} vs. {BOOST_ANNUAL_REGULAR_PRICE_DISPLAY}</p>
                <p className="text-[11px] text-muted-foreground">{BOOST_ANNUAL_RENEWAL_DISPLAY}</p>
              </div>
            )}

            <ul className="text-left space-y-2.5 mb-6 max-w-sm mx-auto">
              {[...BOOST_PLAN_FEATURES, "Cancel anytime"].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="rounded-lg bg-white/5 border border-white/10 p-3 mb-5 text-xs text-muted-foreground">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Sparkles className="h-3 w-3" />
                <span className="font-medium text-foreground">Free forever includes</span>
              </div>
              {FREE_PLAN_SUMMARY}
            </div>

            {canCheckout ? (
              <GlassButton 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/95 font-semibold py-6 rounded-xl shadow-lg shadow-primary/15 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
                onClick={handleInitiateCheckout}
                disabled={loadingCheckout}
              >
                {loadingCheckout ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                    <span>Preparing checkout...</span>
                  </div>
                ) : (
                  isPlayCheckout ? "Subscribe with Google Play" : "Upgrade to Boost"
                )}
              </GlassButton>
            ) : (
              <>
                <GlassButton className="w-full" onClick={isRealUser ? handleClose : handleSignIn}>
                  {isRealUser ? "Got it" : "Sign in to upgrade"}
                </GlassButton>
                {!paymentsAvailable() && user && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Checkout coming soon, go-live in progress.
                  </p>
                )}
              </>
            )}

            {isPlayCheckout && (
              <button
                type="button"
                onClick={() => void handleRestorePlayPurchases()}
                disabled={loadingCheckout || loadingPlayDetails}
                className="mt-3 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
              >
                Restore Google Play purchases
              </button>
            )}
          </div>
        ) : (
          <div
            className="relative w-full overflow-y-auto rounded-xl bg-zinc-950 border border-white/10 min-h-[min(500px,calc(100dvh-var(--arcai-safe-area-top)-env(safe-area-inset-bottom,0px)-16px))]"
            style={{
              maxHeight: "calc(100dvh - var(--arcai-safe-area-top) - env(safe-area-inset-bottom, 0px) - 16px)",
              padding: "calc(3.5rem + var(--arcai-safe-area-top)) calc(1rem + env(safe-area-inset-right, 0px)) calc(1rem + env(safe-area-inset-bottom, 0px)) calc(1rem + env(safe-area-inset-left, 0px))",
            }}
          >
            {/* Absolute custom Back/Close button respecting iOS safe areas */}
            <button
              onClick={() => {
                setShowCheckout(false);
                setClientSecret(null);
              }}
              className="absolute text-white/80 hover:text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all border border-white/10 backdrop-blur-md flex items-center justify-center z-50 shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
              style={{
                top: "calc(1rem + var(--arcai-safe-area-top))",
                right: "calc(1rem + env(safe-area-inset-right, 0px))",
              }}
              aria-label="Back"
            >
              <X className="h-4 w-4" />
            </button>
            {clientSecret ? (
              <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
                <div>
                  <EmbeddedCheckout />
                </div>
              </EmbeddedCheckoutProvider>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 gap-3 text-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Initiating secure checkout...</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
