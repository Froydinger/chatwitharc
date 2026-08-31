import {
  getBoostAdminIdempotencyKey,
  getBoostPlanName,
  getStripeSubscriptionUrl,
  isBoostPriceId,
  sendBoostAdminEmail,
  shouldSendBoostAdminEmail,
} from "./boost-admin-email.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("recognizes only ArcAI Boost lookup keys", () => {
  assert(isBoostPriceId("arcai_boost_monthly"), "monthly should be recognized");
  assert(isBoostPriceId("arcai_boost_annual"), "annual should be recognized");
  assert(
    !isBoostPriceId("price_unrelated"),
    "unrelated prices must be ignored",
  );
  assert(!isBoostPriceId(null), "missing prices must be ignored");
});

Deno.test("labels each Boost billing interval", () => {
  assert(
    getBoostPlanName("arcai_boost_monthly") === "ArcAI Boost Monthly",
    "monthly label mismatch",
  );
  assert(
    getBoostPlanName("arcai_boost_annual") === "ArcAI Boost Annual",
    "annual label mismatch",
  );
});

Deno.test("only live Boost purchases trigger an admin alert", () => {
  assert(
    shouldSendBoostAdminEmail("live", "arcai_boost_monthly"),
    "live Boost should notify",
  );
  assert(
    !shouldSendBoostAdminEmail("sandbox", "arcai_boost_monthly"),
    "sandbox Boost must not notify",
  );
  assert(
    !shouldSendBoostAdminEmail("live", "price_unrelated"),
    "unrelated live payments must not notify",
  );
});

Deno.test("deduplicates both activation paths by Stripe subscription", () => {
  const firstPath = getBoostAdminIdempotencyKey("sub_123");
  const secondPath = getBoostAdminIdempotencyKey("sub_123");
  assert(firstPath === secondPath, "same subscription should use one key");
  assert(
    firstPath !== getBoostAdminIdempotencyKey("sub_456"),
    "different subscriptions need different keys",
  );
});

Deno.test("builds an encoded live Stripe subscription link", () => {
  assert(
    getStripeSubscriptionUrl("sub_123/unsafe") ===
      "https://dashboard.stripe.com/subscriptions/sub_123%2Funsafe",
    "subscription URL should encode the id",
  );
});

Deno.test("sends the owner one identifiable live activation payload", async () => {
  const envNames = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_EMAIL"];
  const previousEnv = new Map(
    envNames.map((name) => [name, Deno.env.get(name)]),
  );
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  let requestCount = 0;

  Deno.env.set("SUPABASE_URL", "https://project.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  Deno.env.set("ADMIN_EMAIL", "admin@example.com");
  globalThis.fetch = (async (_input, init) => {
    requestCount += 1;
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await sendBoostAdminEmail({
      userId: "user_123",
      subscriptionId: "sub_123",
      priceId: "arcai_boost_annual",
      environment: "live",
      subscriberEmail: "subscriber@example.com",
      displayName: "Subscriber",
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }

  assert(requestCount === 1, "activation should make one email request");
  assert(
    requestBody?.recipientEmail === "admin@example.com",
    "admin recipient mismatch",
  );
  assert(
    requestBody?.idempotencyKey === "admin-boost-upgraded:sub_123",
    "admin idempotency key mismatch",
  );
  const templateData = requestBody?.templateData as Record<string, unknown>;
  assert(
    templateData.title === "New ArcAI Boost subscriber",
    "admin subject mismatch",
  );
  assert(
    String(templateData.message).includes(
      "Subscriber (subscriber@example.com)",
    ),
    "subscriber identity missing",
  );
});
