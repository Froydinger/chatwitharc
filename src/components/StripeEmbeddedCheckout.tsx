import { useEffect, useState } from "react";
import { getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

interface StripeEmbeddedCheckoutProps {
  priceId: string;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
}

export function StripeEmbeddedCheckout({
  priceId,
  customerEmail,
  userId,
  returnUrl,
}: StripeEmbeddedCheckoutProps) {
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const startCheckout = async () => {
      try {
        const finalReturnUrl =
          returnUrl || `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
        
        const { data, error: invokeError } = await supabase.functions.invoke("create-checkout", {
          body: {
            priceId,
            customerEmail,
            userId,
            returnUrl: finalReturnUrl,
            environment: getStripeEnvironment(),
          },
        });

        if (invokeError) {
          throw new Error(invokeError.message || "Failed to initiate checkout");
        }

        if (!data?.url) {
          throw new Error(data?.error || "No checkout URL returned from server");
        }

        if (active) {
          setCheckoutUrl(data.url);
          
          const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          
          if (isStandalone || isMobile) {
            // For PWAs or mobile browsers/webviews, open in _blank to avoid standalone in-app redirects downloading inner.html files.
            window.open(data.url, '_blank');
          } else {
            // Standard desktop/same-tab redirect
            window.location.href = data.url;
          }
        }
      } catch (err: any) {
        console.error("Checkout redirection failed:", err);
        if (active) {
          setError(err?.message || String(err) || "Failed to redirect to payment gateway");
        }
      }
    };

    startCheckout();
    return () => {
      active = false;
    };
  }, [priceId, customerEmail, userId, returnUrl]);

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]">
      {error ? (
        <div className="text-destructive text-sm max-w-sm mx-auto space-y-3 flex flex-col items-center">
          <p className="font-semibold mb-1">Redirect Failed</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-primary rounded-xl shadow-md hover:bg-primary/95 transition-all mt-2 active:scale-95 cursor-pointer"
            >
              Open Checkout Manually
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-4 flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto animate-pulse"></div>
          <p className="text-sm text-muted-foreground">Redirecting to Stripe to complete your upgrade...</p>
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-all mt-2 cursor-pointer"
            >
              If redirect fails, click here to open
            </a>
          )}
        </div>
      )}
    </div>
  );
}
