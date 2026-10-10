/**
 * Billing identities are independent from the current price offered to a new
 * subscriber. Never transfer the legacy lookup keys or rewrite subscription
 * items when changing this catalog: their existing prices also govern renewals.
 */
export const BOOST_STRIPE_PRODUCT_ID = "prod_UbSTljFnpRfR8v";
export const BOOST_TRIAL_PERIOD_DAYS = 7;

export const BOOST_CHECKOUT_PLANS = {
  monthly: {
    lookupKey: "arcai_boost_monthly_202610",
    livePriceId: "price_1UOrq0AB32948AKDzDqPg1vp",
    currency: "usd",
    unitAmount: 1500,
    interval: "month",
  },
  annual: {
    lookupKey: "arcai_boost_annual_202610",
    livePriceId: "price_1UOrqPAB32948AKDjnqWyyC4",
    currency: "usd",
    unitAmount: 11500,
    interval: "year",
  },
} as const;

// Google Play is a separate store catalog. Its existing SKUs and localized
// prices must not silently follow a Stripe lookup-key or dollar-price change.
export const GOOGLE_PLAY_BOOST_PRODUCT_IDS = {
  monthly: "arcai_boost_monthly",
  annual: "arcai_boost_annual",
} as const;

const BOOST_PRICE_ALIASES: Record<string, string> = {
  arcai_boost_monthly: "arcai_boost_monthly",
  arcai_boost_annual: "arcai_boost_annual",
  price_1TpXatAB32948AKD6EmXcZo0: "arcai_boost_monthly", // $10/month
  price_1TpXf9AB32948AKDtKNThFaZ: "arcai_boost_annual", // $95/year
  price_1TcFYeAB32948AKDObaHk0fz: "arcai_boost_monthly", // legacy $7/month
  price_1TpKUdAB32948AKD4CUxINQY: "arcai_boost_annual", // legacy $65/year
  [BOOST_CHECKOUT_PLANS.monthly.lookupKey]: BOOST_CHECKOUT_PLANS.monthly.lookupKey,
  [BOOST_CHECKOUT_PLANS.annual.lookupKey]: BOOST_CHECKOUT_PLANS.annual.lookupKey,
  [BOOST_CHECKOUT_PLANS.monthly.livePriceId]: BOOST_CHECKOUT_PLANS.monthly.lookupKey,
  [BOOST_CHECKOUT_PLANS.annual.livePriceId]: BOOST_CHECKOUT_PLANS.annual.lookupKey,
};

export type BoostCheckoutPlan = typeof BOOST_CHECKOUT_PLANS[keyof typeof BOOST_CHECKOUT_PLANS];

export function isBoostPriceId(priceId: unknown): priceId is string {
  return typeof priceId === "string" && Object.prototype.hasOwnProperty.call(BOOST_PRICE_ALIASES, priceId);
}

export function getBoostCheckoutPlan(priceId: unknown): BoostCheckoutPlan | null {
  return Object.values(BOOST_CHECKOUT_PLANS).find(plan => plan.lookupKey === priceId) ?? null;
}

export function boostBillingInterval(priceId: unknown): "monthly" | "annual" | null {
  if (!isBoostPriceId(priceId)) return null;
  const key = BOOST_PRICE_ALIASES[priceId];
  return key === "arcai_boost_annual" || key === BOOST_CHECKOUT_PLANS.annual.lookupKey ? "annual" : "monthly";
}

/** Normalize a saved UI choice, never an actual Stripe subscription price. */
export function currentBoostCheckoutPriceId(priceId: unknown): string {
  return BOOST_CHECKOUT_PLANS[boostBillingInterval(priceId) ?? "monthly"].lookupKey;
}

export interface StripeBoostPrice {
  id?: string;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
  product?: string | { id?: string; deleted?: boolean } | null;
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  type?: string;
  recurring?: { interval?: string; interval_count?: number; usage_type?: string } | null;
}

/** Only consume a server-retrieved price or a signature-verified webhook price. */
export function resolveBoostPriceId(price: StripeBoostPrice | null | undefined): string | null {
  if (!price) return null;
  for (const identity of [price.id, price.lookup_key, price.metadata?.lovable_external_id]) {
    if (isBoostPriceId(identity)) return BOOST_PRICE_ALIASES[identity];
  }
  // Older, including zero-cost, legitimate prices may have no lookup key.
  // The verified product identity preserves their entitlement, not their price.
  const productId = typeof price.product === "string" ? price.product : price.product?.id;
  if (productId === BOOST_STRIPE_PRODUCT_ID && price.recurring?.interval_count === 1) {
    if (price.recurring.interval === "month") return "arcai_boost_monthly";
    if (price.recurring.interval === "year") return "arcai_boost_annual";
  }
  return null;
}

/** Fail closed before opening Checkout if the displayed offer and Stripe differ. */
export function assertBoostCheckoutPrice(
  price: StripeBoostPrice,
  plan: BoostCheckoutPlan,
  environment: "live" | "sandbox",
): void {
  const productId = typeof price.product === "string" ? price.product : price.product?.id;
  if (!price.id || !price.active || price.lookup_key !== plan.lookupKey ||
    price.type !== "recurring" || price.currency !== plan.currency ||
    price.unit_amount !== plan.unitAmount || price.recurring?.interval !== plan.interval ||
    price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed" ||
    (environment === "live" && (price.id !== plan.livePriceId || productId !== BOOST_STRIPE_PRODUCT_ID))) {
    throw new Error("Boost checkout pricing is not ready. Please try again later.");
  }
}

export function boostSubscriptionBlocksNewCheckout(
  status: string | null | undefined,
  periodEnd?: string | number | null,
  now = Date.now(),
): boolean {
  // An incomplete payment, paused plan, or unpaid invoice must be recovered in
  // billing management, not replaced by a second, more expensive subscription.
  if (["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(status ?? "")) return true;
  const end = typeof periodEnd === "number" ? periodEnd * 1000 : Date.parse(periodEnd ?? "");
  return status === "canceled" && Number.isFinite(end) && end > now;
}
