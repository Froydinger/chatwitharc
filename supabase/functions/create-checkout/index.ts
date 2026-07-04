// Create a Stripe Embedded Checkout session for ArcAi Boost.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
      customerEmail,
      userId,
      returnUrl,
      environment,
    }: {
      action?: string;
      sessionId?: string;
      priceId?: string;
      customerEmail?: string;
      userId?: string;
      returnUrl?: string;
      environment?: StripeEnv;
    } = body;

    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

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
      if (targetUserId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { persistSession: false } },
        );

        let priceIdResolved = "arcai_boost_monthly"; // default
        let productIdResolved = "prod_boost";

        const subObject = session.subscription as any;
        if (subObject) {
          const item = subObject.items?.data?.[0];
          productIdResolved = typeof item?.price?.product === "string" ? item.price.product : (item?.price?.product?.id || productIdResolved);
          priceIdResolved = item?.price?.lookup_key || item?.price?.id || priceIdResolved;
        }

        await supabase.from("subscriptions").upsert({
          user_id: targetUserId,
          stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : (session.subscription?.id || `sub_chk_${session.id}`),
          stripe_customer_id: typeof session.customer === "string" ? session.customer : (session.customer?.id || null),
          product_id: productIdResolved,
          price_id: priceIdResolved,
          status: "active",
          environment: environment,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

        console.log(`[create-checkout] Synchronously verified and upserted subscription for user: ${targetUserId}`);
      }

      return new Response(JSON.stringify({ success: true, status: session.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 2: Create a checkout session (default flow)
    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
    if (!returnUrl) throw new Error("Missing returnUrl");

    // Resolve auth user if Authorization header is present (preferred over client-passed userId).
    let resolvedUserId = userId;
    let resolvedEmail = customerEmail;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        resolvedUserId = user.id;
        resolvedEmail = user.email ?? resolvedEmail;
      }
    }

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
      ui_mode: "embedded",
      return_url: returnUrl,
      ...(customerId && { customer: customerId }),
      ...(resolvedUserId && {
        metadata: { userId: resolvedUserId },
        ...(isRecurring && { subscription_data: { metadata: { userId: resolvedUserId } } }),
      }),
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
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
