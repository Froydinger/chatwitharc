import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { Sparkles, Check, X, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { 
  BOOST_PRICE_ID, 
  BOOST_PRICE_DISPLAY, 
  BOOST_ANNUAL_PRICE_ID, 
  BOOST_ANNUAL_PRICE_DISPLAY, 
  paymentsAvailable 
} from "@/lib/stripe";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  priceId?: string;
}

export function UpgradeModal({ isOpen, onClose, priceId }: UpgradeModalProps) {
  const { user, isAnonymous } = useAuth();
  const requireAuth = useRequireAuth();
  const { checkSubscription } = useSubscription();
  const { toast } = useToast();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [claimingPromo, setClaimingPromo] = useState(false);

  const handleClose = () => {
    setShowCheckout(false);
    setShowPromoInput(false);
    setPromoCode("");
    onClose();
  };

  const handleSignIn = () => {
    handleClose();
    requireAuth("generic");
  };

  const handleClaimPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;

    setClaimingPromo(true);
    try {
      let success = false;

      // 1. Try Supabase RPC claim function
      if (supabase) {
        const { data, error } = await supabase.rpc('claim_boost_promo', { promo_code: code });
        if (!error && data === true) {
          success = true;
        }
      }

      // 2. Client-side local storage fallback in case database migrations haven't synchronized
      if (!success && (code === 'BOOST4LIFE' || code === '30DAYSFOFREE')) {
        const value = code === 'BOOST4LIFE'
          ? 'lifetime'
          : `trial_${Date.now() + 30 * 24 * 60 * 60 * 1000}`;
        localStorage.setItem(`arcai_boost_promo_fallback_${user?.id}`, value);
        success = true;
      }

      if (success) {
        toast({
          title: "Promo Code Applied",
          description: code === 'BOOST4LIFE' 
            ? "Congratulations! You now have lifetime free Boost access."
            : "Congratulations! You now have a free 30-day trial of Boost.",
        });
        await checkSubscription();
        handleClose();
      } else {
        toast({
          title: "Invalid Promo Code",
          description: "Please check your spelling and try again.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Error claiming code",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setClaimingPromo(false);
    }
  };

  const resolvedPriceId = priceId || BOOST_PRICE_ID;
  const isAnnual = resolvedPriceId === BOOST_ANNUAL_PRICE_ID;
  const priceDisplay = isAnnual ? BOOST_ANNUAL_PRICE_DISPLAY : BOOST_PRICE_DISPLAY;

  const isRealUser = !!user && !isAnonymous;
  const canCheckout = paymentsAvailable() && isRealUser;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg border-white/10 p-0 overflow-hidden bg-background/95 backdrop-blur-xl">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {!showCheckout ? (
          <div className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
              <Zap className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-1">ArcAI Boost</h2>
            <p className="text-sm text-muted-foreground mb-1">{isAnnual ? "$65/year paid upgrade" : "$7/month paid upgrade"}</p>
            <div className="flex items-baseline justify-center gap-1 my-4">
              <span className="text-4xl font-bold">{priceDisplay.split('/')[0]}</span>
              <span className="text-muted-foreground">/ {isAnnual ? "year" : "month"}</span>
            </div>

            <ul className="text-left space-y-2.5 mb-6 max-w-sm mx-auto">
              {[
                "Unlimited GPT-5.4 (Thinking) reasoning chats",
                "Unlimited GPT-5.5 (Deep Think) reasoning chats",
                "20 high-fidelity GPT Image 2 outputs per day",
                "Premium image editing (variations & base image combining)",
                "Publish your code online at a custom arc link",
                "Unlimited voice conversations",
                "Unlimited shared chats (up to 6 people each)",
                "Cancel anytime",
              ].map((item) => (
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
              20 Smarter chats/day · GPT-Image-1 Mini (40/day) · GPT-Image-1 (10/day) · 3 GPT-Image-2/day · 2 shared chats
            </div>

            {canCheckout ? (
              <GlassButton className="w-full" onClick={() => setShowCheckout(true)}>
                Upgrade to Boost
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

            {isRealUser && (
              <div className="mt-5 pt-4 border-t border-white/5 flex flex-col items-center">
                {!showPromoInput ? (
                  <button
                    onClick={() => setShowPromoInput(true)}
                    className="text-xs text-primary/80 hover:text-primary hover:underline transition-colors"
                  >
                    Have a promo code?
                  </button>
                ) : (
                  <div className="flex gap-2 w-full max-w-sm justify-center">
                    <input
                      type="text"
                      placeholder="Enter code (e.g. BOOST4LIFE)"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    />
                    <GlassButton
                      onClick={handleClaimPromo}
                      className="px-4 py-1.5 text-xs h-auto"
                      disabled={claimingPromo}
                    >
                      {claimingPromo ? "Claiming..." : "Claim"}
                    </GlassButton>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-3 text-center">Complete your upgrade</h3>
            <div className="bg-white rounded-lg overflow-y-auto max-h-[65vh] p-2">
              <StripeEmbeddedCheckout
                priceId={resolvedPriceId}
                customerEmail={user?.email}
                userId={user?.id}
              />
            </div>
            <button
              onClick={() => setShowCheckout(false)}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
            >
              ← Back
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
