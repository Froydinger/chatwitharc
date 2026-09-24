import { isGooglePlaySubscriptionEntitled } from "./googlePlayBilling.ts";

const now = Date.parse("2026-09-23T12:00:00.000Z");
const future = "2026-09-24T12:00:00.000Z";
const past = "2026-09-22T12:00:00.000Z";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("active and grace-period Play subscriptions grant Boost until expiry", () => {
  assert(isGooglePlaySubscriptionEntitled("SUBSCRIPTION_STATE_ACTIVE", future, now), "active subscription should grant Boost");
  assert(isGooglePlaySubscriptionEntitled("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", future, now), "grace-period subscription should grant Boost");
});

Deno.test("canceled Play subscriptions keep Boost only through their paid expiry", () => {
  assert(isGooglePlaySubscriptionEntitled("SUBSCRIPTION_STATE_CANCELED", future, now), "unexpired canceled subscription should grant Boost");
  assert(!isGooglePlaySubscriptionEntitled("SUBSCRIPTION_STATE_CANCELED", past, now), "expired canceled subscription must not grant Boost");
});

Deno.test("paused, on-hold, and expired Play subscriptions do not grant Boost", () => {
  for (const state of ["SUBSCRIPTION_STATE_PAUSED", "SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_EXPIRED"]) {
    assert(!isGooglePlaySubscriptionEntitled(state, future, now), `${state} must not grant Boost`);
  }
});

Deno.test("missing or invalid Play subscription expiry fails closed", () => {
  assert(!isGooglePlaySubscriptionEntitled("SUBSCRIPTION_STATE_ACTIVE", null, now), "missing expiry must not grant Boost");
  assert(!isGooglePlaySubscriptionEntitled("SUBSCRIPTION_STATE_ACTIVE", "not-a-date", now), "invalid expiry must not grant Boost");
});
