import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";

const stripePromise = loadStripe(
  "pk_live_51Qdlh0AB32948AKDzlRswkYwSIWl6tXNItf8bxQT8fkbCk0GEhFhIWIIMTJDzRZgq69t7x0atykPasYRDopG0p6M00ceEJA4Vu"
);

export function EmbeddedCheckoutForm() {
  const fetchClientSecret = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { embedded: true },
    });
    if (error) throw error;
    return data.clientSecret;
  }, []);

  return (
    <div className="w-full min-h-[400px]">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout className="w-full" />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
