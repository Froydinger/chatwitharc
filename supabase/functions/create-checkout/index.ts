// Create a Stripe Embedded Checkout session for ArcAi Boost.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "../_shared/stripe.ts";

const BOOST_PRICE_IDS = new Set(["arcai_boost_monthly", "arcai_boost_annual"]);

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
      if (targetUserId) {
        const supabase = supabaseAdmin;

        let priceIdResolved = "arcai_boost_monthly"; // default
        let productIdResolved = "prod_boost";

        const subObject = session.subscription as any;
        if (subObject) {
          const item = subObject.items?.data?.[0];
          productIdResolved = typeof item?.price?.product === "string" ? item.price.product : (item?.price?.product?.id || productIdResolved);
          priceIdResolved = item?.price?.lookup_key || item?.price?.id || priceIdResolved;
        }

        const subscriptionIdResolved = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id || `sub_chk_${session.id}`);

        await supabase.from("subscriptions").upsert({
          user_id: targetUserId,
          stripe_subscription_id: subscriptionIdResolved,
          stripe_customer_id: typeof session.customer === "string" ? session.customer : (session.customer?.id || null),
          product_id: productIdResolved,
          price_id: priceIdResolved,
          status: "active",
          environment: environment,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", targetUserId)
          .maybeSingle();

        await sendBoostUpgradeEmail({
          userId: targetUserId,
          subscriptionId: subscriptionIdResolved,
          displayName: profile?.display_name,
        });

        console.log(`[create-checkout] Synchronously verified and upserted subscription for user: ${targetUserId}`);
      }

      return new Response(JSON.stringify({ success: true, status: session.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 2: Create a checkout session (default flow)
    if (!priceId || !BOOST_PRICE_IDS.has(priceId)) throw new Error("Invalid priceId");
    if (!returnUrl) throw new Error("Missing returnUrl");

    // Identity always comes from the verified JWT, never client-selected fields.
    const resolvedUserId = caller.id;
    const resolvedEmail = caller.email;

    const stripe = createStripeClient(environment);
    let stripePrice;
    try {
      const prices = await stripe.prices.list({ lookup_keys: [priceId] });
      if (prices.data.length) {
        stripePrice = prices.data[0];
      } else {
        // Fallback to retrieving directly by ID if lookup_keys matches nothing
        stripePrice = await stripe.prices.retrieve(priceId);
      }
    } catch (e) {
      throw new Error(`Price '${priceId}' not found. Stripe error: ${e.message}`);
    }
    const isRecurring = stripePrice.type === "recurring";

    const customerId = (resolvedEmail || resolvedUserId)
      ? await resolveOrCreateCustomer(stripe, { email: resolvedEmail, userId: resolvedUserId })
      : undefined;

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      allow_promotion_codes: true,
      ...(uiMode === "embedded" ? {
        ui_mode: "embedded",
        return_url: returnUrl,
      } : {
        success_url: returnUrl,
        cancel_url: returnUrl.split("?")[0],
      }),
      ...(customerId && { customer: customerId }),
      ...(resolvedUserId && {
        metadata: { userId: resolvedUserId },
        ...(isRecurring && { subscription_data: { metadata: { userId: resolvedUserId } } }),
      }),
    });

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
