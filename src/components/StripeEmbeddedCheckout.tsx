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
          window.location.href = data.url;
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
        <div className="text-destructive text-sm max-w-sm mx-auto">
          <p className="font-semibold mb-1">Redirect Failed</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Redirecting to Stripe to complete your upgrade...</p>
        </div>
      )}
    </div>
  );
}
