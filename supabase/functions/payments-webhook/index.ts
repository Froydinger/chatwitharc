// Stripe webhook handler for ArcAi Boost subscriptions.
// Registered for both sandbox and live by enable_stripe_payments.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _supabase;
}

function resolvePriceId(item: any): string | null {
  return item?.price?.lookup_key
    || item?.price?.metadata?.lovable_external_id
    || item?.price?.id
    || null;
}

async function sendBoostUpgradeEmail(userId: string, subscriptionId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;

  const { data: profile } = await getSupabase()
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

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
        recipientUserId: userId,
        idempotencyKey: `boost-upgraded:${userId}:${subscriptionId}`,
        templateData: {
          displayName: profile?.display_name || undefined,
          planName: "ArcAI Boost",
          appUrl: "https://askarc.chat",
          manageUrl: "https://askarc.chat/dashboard/settings?section=plan",
        },
      }),
    });

    if (!response.ok) {
      console.warn("[payments-webhook] boost upgrade email failed", {
        userId,
        subscriptionId,
        status: response.status,
        text: await response.text(),
      });
    }
  } catch (error) {
    console.warn("[payments-webhook] boost upgrade email threw", {
      userId,
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function upsertSubscription(subscription: any, env: StripeEnv, options?: { sendUpgradeEmail?: boolean }) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("[payments-webhook] subscription event with no userId metadata", subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  const priceId = resolvePriceId(item);
  const productId = typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (options?.sendUpgradeEmail && subscription.status === "active") {
    await sendBoostUpgradeEmail(userId, subscription.id);
  }
}

async function markCanceled(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let env: StripeEnv = "sandbox";
  try {
    const clone = req.clone();
    const parsedBody = await clone.json();
    if (parsedBody && typeof parsedBody.livemode === "boolean") {
      env = parsedBody.livemode ? "live" : "sandbox";
    } else {
      const urlEnv = new URL(req.url).searchParams.get("env");
      if (urlEnv === "live") env = "live";
    }
  } catch (e) {
    console.error("[payments-webhook] Failed to parse body clone for auto-detect:", e);
    const urlEnv = new URL(req.url).searchParams.get("env");
    if (urlEnv === "live") env = "live";
  }

  try {
    const event = await verifyWebhook(req, env);
    console.log("[payments-webhook]", env, event.type);

    switch (event.type) {
      case "customer.subscription.created":
        await upsertSubscription(event.data.object, env, { sendUpgradeEmail: true });
        break;
      case "customer.subscription.updated":
        await upsertSubscription(event.data.object, env);
        break;
      case "customer.subscription.deleted":
        await markCanceled(event.data.object, env);
        break;
      default:
        // Ignore others (checkout.session.*, transaction.*, invoice.*, etc.)
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[payments-webhook] error", err);
    return new Response("Webhook error", { status: 400 });
  }
});
