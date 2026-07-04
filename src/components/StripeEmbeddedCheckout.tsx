import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
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
  const fetchClientSecret = async (): Promise<string> => {
    try {
      const finalReturnUrl =
        returnUrl || `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
      
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          customerEmail,
          userId,
          returnUrl: finalReturnUrl,
          environment: getStripeEnvironment(),
        },
      });

      if (error) {
        console.error("Supabase edge function invoke error:", error);
        throw new Error(error.message || "Failed to create checkout session");
      }

      if (!data?.clientSecret) {
        throw new Error(data?.error || "No client secret returned");
      }

      return data.clientSecret;
    } catch (err: any) {
      console.error("fetchClientSecret exception:", err);
      // Throw a clean string message to prevent cyclic structure serialization errors in Stripe SDK
      throw new Error(err?.message || String(err) || "Failed to initialize checkout session");
    }
  };

  return (
    <div id="boost-checkout" className="w-full">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
