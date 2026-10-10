// Create a Stripe Hosted Checkout session for ArcAI Boost.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "../_shared/stripe.ts";
import { sendBoostAdminEmail } from "../_shared/boost-admin-email.ts";

import {
  BOOST_STRIPE_PRODUCT_ID, BOOST_TRIAL_PERIOD_DAYS,
  getBoostCheckoutPlan, isBoostPriceId, resolveBoostPriceId,
  assertBoostCheckoutPrice, boostSubscriptionBlocksNewCheckout,
} from "../_shared/boostCatalog.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendBoostUpgradeEmail(options: {
  userId: string;
  subscriptionId: string;
  displayName?: string | null;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateName: "boost-upgraded",
        recipientUserId: options.userId,
        idempotencyKey: `boost-upgraded:${options.userId}:${options.subscriptionId}`,
        templateData: {
          displayName: options.displayName || undefined,
          planName: "ArcAI Boost",
          appUrl: "https://askarc.chat",
          manageUrl: "https://askarc.chat/dashboard/settings?section=plan",
        },
      }),
    });

    if (!response.ok) {
      console.warn("[create-checkout] boost upgrade email failed", {
        userId: options.userId,
        subscriptionId: options.subscriptionId,
        status: response.status,
        text: await response.text(),
      });
    }
  } catch (error) {
    console.warn("[create-checkout] boost upgrade email threw", {
      userId: options.userId,
      subscriptionId: options.subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const {
      action,
      sessionId,
      priceId,
      returnUrl,
      environment,
      uiMode,
    }: {
      action?: string;
      sessionId?: string;
      priceId?: string;
      returnUrl?: string;
      environment?: StripeEnv;
      uiMode?: "embedded" | "hosted";
    } = body;

    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (environment === "sandbox") {
      const { data: adminRow } = await supabaseAdmin
        .from("admin_users")
        .select("user_id")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (!adminRow) {
        return new Response(JSON.stringify({ error: "Sandbox checkout is restricted to admins" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // These temporary diagnostics exposed account-wide Stripe data and allowed
    // client-selected subscription linking. They are intentionally retired.
    if (action === "debug-stripe" || action === "sync-stripe-sub") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 1: Verify a completed checkout session
    if (action === "verify") {
      if (!sessionId) throw new Error("Missing sessionId");
      const stripe = createStripeClient(environment);
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription", "subscription.items.data.price"],
      });

      if (session.status !== "complete" && session.payment_status !== "paid") {
        return new Response(JSON.stringify({ success: false, status: session.status }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert subscription directly since we validated it on Stripe
      const targetUserId = session.metadata?.userId;
      if (!targetUserId || targetUserId !== caller.id) {
        return new Response(JSON.stringify({ error: "Checkout session does not belong to this account" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const subObject = session.subscription as any;
      const item = subObject && typeof subObject === "object" ? subObject.items?.data?.[0] : null;
      const priceIdResolved = resolveBoostPriceId(item?.price);
      const productIdResolved = typeof item?.price?.product === "string"
        ? item.price.product : item?.price?.product?.id;
      if (!subObject?.id || !priceIdResolved || !productIdResolved || typeof subObject.status !== "string") {
        return new Response(JSON.stringify({ success: false, status: session.status, error: "A verified Boost subscription was not found for this checkout." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (subObject.metadata?.userId && subObject.metadata.userId !== caller.id) {
        return new Response(JSON.stringify({ error: "Subscription does not belong to this account" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const subscriptionStatus = subObject.status;
      const periodStart = item?.current_period_start ?? subObject.current_period_start;
      const periodEnd = item?.current_period_end ?? subObject.current_period_end;
      const entitled = ["active", "trialing", "past_due"].includes(subscriptionStatus) ||
        (subscriptionStatus === "canceled" && typeof periodEnd === "number" && periodEnd * 1000 > Date.now());
      // A saved old checkout URL must not replace a newer current subscription.
      const { data: currentSubscription, error: currentSubscriptionError } = await supabaseAdmin.from("subscriptions")
        .select("stripe_subscription_id,price_id,product_id,status,current_period_end")
        .eq("user_id", caller.id).maybeSingle();
      if (currentSubscriptionError) throw new Error("Could not verify your current subscription. Please try again later.");
      if (currentSubscription?.stripe_subscription_id && currentSubscription.stripe_subscription_id !== subObject.id &&
        (isBoostPriceId(currentSubscription.price_id) || currentSubscription.product_id === BOOST_STRIPE_PRODUCT_ID) &&
        boostSubscriptionBlocksNewCheckout(currentSubscription.status, currentSubscription.current_period_end)) {
        return new Response(JSON.stringify({ success: false, error: "This is an older checkout. Your current subscription is unchanged; open Manage Subscription to view it." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: subscriptionError } = await supabaseAdmin.from("subscriptions").upsert({
        user_id: caller.id,
        stripe_subscription_id: subObject.id,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : (session.customer?.id || null),
        product_id: productIdResolved,
        price_id: priceIdResolved,
        status: subscriptionStatus,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subObject.cancel_at_period_end === true,
        environment,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (subscriptionError) throw new Error(`Failed to verify Boost: ${subscriptionError.message}`);

      if (entitled) {
        const { data: profile } = await supabaseAdmin.from("profiles")
          .select("display_name").eq("user_id", caller.id).maybeSingle();
        await sendBoostUpgradeEmail({ userId: caller.id, subscriptionId: subObject.id, displayName: profile?.display_name });
        await sendBoostAdminEmail({
          userId: caller.id, subscriptionId: subObject.id, priceId: priceIdResolved,
          environment, subscriberEmail: caller.email, displayName: profile?.display_name,
        });
      }
      return new Response(JSON.stringify({ success: entitled, status: session.status, subscriptionStatus }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 2: New offers only. Old open clients must review the changed
    // displayed price; never silently translate their $10/$95 request.
    const checkoutPlan = getBoostCheckoutPlan(priceId);
    if (!checkoutPlan) {
      // Old clients mask non-2xx payloads with a generic invoke error. A logical
      // error without a checkout URL lets them display this refresh guidance.
      const retiredOffer = isBoostPriceId(priceId);
      return new Response(JSON.stringify({
        error: retiredOffer ? "Boost pricing has changed. Refresh this page to review the current price before subscribing." : "Invalid priceId",
        code: retiredOffer ? "boost_pricing_changed" : "invalid_price",
      }), { status: retiredOffer ? 200 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!returnUrl) throw new Error("Missing returnUrl");

    // Identity always comes from the verified JWT, never client-selected fields.
    const resolvedUserId = caller.id;
    const resolvedEmail = caller.email;
    const existingSubscriptionResponse = () => new Response(JSON.stringify({
      error: "You already have Boost. Manage your existing subscription to keep its current price.",
      code: "boost_subscription_exists",
    }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: previousSubscriptions, error: previousSubscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("id,price_id,product_id,status,current_period_end,stripe_subscription_id")
      .eq("user_id", resolvedUserId).eq("environment", environment);
    if (previousSubscriptionError) throw new Error("Could not verify your current subscription. Please try again later.");
    for (const previous of previousSubscriptions ?? []) {
      if ((isBoostPriceId(previous.price_id) || previous.product_id === BOOST_STRIPE_PRODUCT_ID) &&
        boostSubscriptionBlocksNewCheckout(previous.status, previous.current_period_end)) return existingSubscriptionResponse();
    }
    if (environment === "live") {
      const { data: playSubscriptions, error: playError } = await supabaseAdmin
        .from("google_play_subscriptions").select("subscription_state,expiry_time").eq("user_id", resolvedUserId);
      if (playError) throw new Error("Could not verify your current subscription. Please try again later.");
      if ((playSubscriptions ?? []).some(receipt =>
        ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(receipt.subscription_state) &&
        Date.parse(receipt.expiry_time ?? "") > Date.now())) return existingSubscriptionResponse();
    }

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [checkoutPlan.lookupKey], active: true, limit: 2 });
    if (prices.data.length !== 1) throw new Error("Boost checkout pricing is not ready. Please try again later.");
    const stripePrice = prices.data[0];
    assertBoostCheckoutPrice(stripePrice, checkoutPlan, environment);
    const isRecurring = true;
    const customerId = await resolveOrCreateCustomer(stripe, { email: resolvedEmail, userId: resolvedUserId });

    // Check every page, even if the database already contains old history. A
    // delayed webhook must not create a duplicate or replace a grandfathered rate.
    let hasPreviousStripeSubscription = (previousSubscriptions ?? []).some(previous => !!previous.stripe_subscription_id);
    let startingAfter: string | undefined;
    for (;;) {
      const history = await stripe.subscriptions.list({
        customer: customerId, status: "all", limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      hasPreviousStripeSubscription ||= history.data.length > 0;
      for (const previous of history.data) {
        for (const item of previous.items?.data ?? []) {
          if (resolveBoostPriceId(item.price) && boostSubscriptionBlocksNewCheckout(
            previous.status, (item as any).current_period_end ?? (previous as any).current_period_end,
          )) return existingSubscriptionResponse();
        }
      }
      if (!history.has_more) break;
      const nextCursor = history.data.at(-1)?.id;
      if (!nextCursor || nextCursor === startingAfter) throw new Error("Could not verify your subscription history. Please try again later.");
      startingAfter = nextCursor;
    }
    const shouldApplyTrial = !hasPreviousStripeSubscription;

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      allow_promotion_codes: true,
      ...(uiMode === "embedded" ? {
        ui_mode: "embedded" as const,
        return_url: returnUrl,
      } : {
        success_url: returnUrl,
        cancel_url: returnUrl.split("?")[0],
      }),
      ...(customerId && { customer: customerId }),
      ...(resolvedUserId && {
        metadata: { userId: resolvedUserId },
        ...(isRecurring && {
          subscription_data: {
            metadata: { userId: resolvedUserId },
            ...(shouldApplyTrial && {
              trial_period_days: BOOST_TRIAL_PERIOD_DAYS,
              trial_settings: {
                end_behavior: { missing_payment_method: "cancel" },
              },
            }),
          },
        }),
      }),
      ...(shouldApplyTrial && { payment_method_collection: "always" }),
    } as any);

    if (uiMode === "embedded") {
      return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-checkout]", err);
    return new Response(JSON.stringify({ error: getStripeErrorMessage(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
