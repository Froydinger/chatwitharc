import { loadStripe, Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error(
    "ArcAI Boost checkout isn't configured for this build. Complete go-live in your Lovable project to enable production payments.",
  );
}

export function paymentsAvailable(): boolean {
  return clientToken?.startsWith("pk_test_") === true || clientToken?.startsWith("pk_live_") === true;
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment(); // throws if not configured
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

export const BOOST_PRICE_ID = "arcai_boost_monthly";
export const BOOST_PRICE_DISPLAY = "$7/month";
