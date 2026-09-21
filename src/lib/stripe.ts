import { loadStripe, Stripe } from "@stripe/stripe-js/pure";

// iOS standalone PWAs can occasionally promote Stripe's advanced fraud-signal
// iframe (m.stripe.network/inner.html) into a top-level document download.
// Embedded Checkout still works without these optional signals.
loadStripe.setLoadParameters({ advancedFraudSignals: false });

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
export const BOOST_MONTHLY_PRICE_AMOUNT = "$10";
export const BOOST_PRICE_DISPLAY = `${BOOST_MONTHLY_PRICE_AMOUNT}/month`;
export const BOOST_TRIAL_PERIOD_DAYS = 7;
export const BOOST_TRIAL_DISPLAY = "7-day free trial";
export const BOOST_TRIAL_NOTE = "Card required · cancel anytime";

export const BOOST_ANNUAL_PRICE_ID = "arcai_boost_annual";
export const BOOST_ANNUAL_PRICE_AMOUNT = "$95";
export const BOOST_ANNUAL_REGULAR_PRICE_AMOUNT = "$120";
export const BOOST_ANNUAL_PRICE_DISPLAY = `${BOOST_ANNUAL_PRICE_AMOUNT}/year`;
export const BOOST_ANNUAL_REGULAR_PRICE_DISPLAY = `${BOOST_ANNUAL_REGULAR_PRICE_AMOUNT}/year`;
export const BOOST_ANNUAL_SAVINGS_DISPLAY = "Save 21%";
export const BOOST_ANNUAL_OFFER_BADGE = "Limited time";
export const BOOST_ANNUAL_RENEWAL_DISPLAY = "Renews at $95/year while subscribed";
