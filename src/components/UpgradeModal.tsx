import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { Sparkles, Check, X, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { cn } from "@/lib/utils";
import { 
  BOOST_PRICE_ID, 
  BOOST_PRICE_DISPLAY, 
  BOOST_ANNUAL_PRICE_ID, 
  BOOST_ANNUAL_PRICE_DISPLAY, 
  paymentsAvailable,
  getStripeEnvironment
} from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  priceId?: string;
}

export function UpgradeModal({ isOpen, onClose, priceId }: UpgradeModalProps) {
  const { user, isAnonymous } = useAuth();
  const requireAuth = useRequireAuth();
  const [selectedPriceId, setSelectedPriceId] = useState(priceId || BOOST_PRICE_ID);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  const isRealUser = !!user && !isAnonymous;
  const canCheckout = paymentsAvailable() && isRealUser;

  useEffect(() => {
    if (isOpen) {
      setSelectedPriceId(priceId || BOOST_PRICE_ID);
    }
  }, [isOpen, priceId]);

  useEffect(() => {
    if (!isOpen || !user || !isRealUser) return;

    let active = true;
    const fetchCheckoutUrl = async () => {
      setLoadingUrl(true);
      setCheckoutUrl(null);
      try {
        const finalReturnUrl = `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
        const { data, error } = await supabase.functions.invoke("create-checkout", {
          body: {
            priceId: selectedPriceId,
            customerEmail: user.email,
            userId: user.id,
            returnUrl: finalReturnUrl,
            environment: getStripeEnvironment(),
          },
        });
        if (active && data?.url) {
          setCheckoutUrl(data.url);
        }
      } catch (err) {
        console.error("Failed to pre-fetch checkout URL:", err);
      } finally {
        if (active) setLoadingUrl(false);
      }
    };

    fetchCheckoutUrl();
    return () => {
      active = false;
    };
  }, [isOpen, selectedPriceId, user, isRealUser]);

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
  };

  const handleSignIn = () => {
    handleClose();
    requireAuth("generic");
  };

  const isAnnual = selectedPriceId === BOOST_ANNUAL_PRICE_ID;
  const priceDisplay = isAnnual ? BOOST_ANNUAL_PRICE_DISPLAY : BOOST_PRICE_DISPLAY;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent 
        className="max-w-lg border-white/10 p-0 overflow-hidden bg-background/95 backdrop-blur-xl transition-all duration-300"
      >
        <div className="p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
            <Zap className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-1">ArcAI Boost</h2>
          
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
                  Save 22%
                </span>
              </button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-1">
            {isAnnual ? "$95/year paid upgrade" : "$10/month paid upgrade"}
          </p>
          <div className="flex items-baseline justify-center gap-1 my-4">
            <span className="text-4xl font-bold">{priceDisplay.split('/')[0]}</span>
            <span className="text-muted-foreground">/ {isAnnual ? "year" : "month"}</span>
          </div>

          <ul className="text-left space-y-2.5 mb-6 max-w-sm mx-auto">
            {[
              "Unlimited GPT-5.6 Sol frontier reasoning chats",
              "Unlimited GPT-5.6 Terra everyday chats",
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
            20 Fast chats/day · GPT-Image-1 Mini (40/day) · GPT-Image-1 (10/day) · 3 GPT-Image-2/day · 2 shared chats
          </div>

          {canCheckout ? (
            <a
              href={checkoutUrl || "#"}
              onClick={(e) => {
                if (!checkoutUrl) {
                  e.preventDefault();
                  return;
                }
                const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                
                if (isStandalone || isMobile) {
                  e.preventDefault();
                  window.open(checkoutUrl, '_blank');
                }
                handleClose();
              }}
              target={(typeof window !== 'undefined' && ((window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent))) ? "_blank" : "_self"}
              rel="noopener noreferrer"
              className={cn(
                "w-full inline-flex items-center justify-center h-10 px-4 rounded-xl text-sm font-semibold transition-all duration-200 select-none cursor-pointer",
                loadingUrl || !checkoutUrl
                  ? "bg-primary/50 text-primary-foreground/75 cursor-not-allowed pointer-events-none opacity-50"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md active:scale-[0.98]"
              )}
            >
              {loadingUrl ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  <span>Preparing checkout...</span>
                </div>
              ) : (
                "Upgrade to Boost"
              )}
            </a>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
