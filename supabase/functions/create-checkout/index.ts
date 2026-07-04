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

    // Action -1: Debug Stripe account contents
    if (action === "debug-stripe") {
      const stripe = createStripeClient(environment);
      let subsRes: any = null;
      let custsRes: any = null;
      let subsError: any = null;
      let custsError: any = null;

      try {
        subsRes = await stripe.subscriptions.list({ limit: 100 });
      } catch (err: any) {
        subsError = err.message || String(err);
      }

      try {
        custsRes = await stripe.customers.list({ limit: 100 });
      } catch (err: any) {
        custsError = err.message || String(err);
      }

      return new Response(JSON.stringify({ 
        subsError,
        custsError,
        rawSubs: subsRes,
        rawCusts: custsRes,
        subscriptionsCount: subsRes?.data?.length ?? null,
        customersCount: custsRes?.data?.length ?? null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 0: Sync subscription directly from Stripe customer search by email
    if (action === "sync-stripe-sub") {
      if (!customerEmail) throw new Error("Missing customerEmail");
      if (!userId) throw new Error("Missing userId");

      const stripe = createStripeClient(environment);
      console.log(`[create-checkout] Searching Stripe for active subscriptions for user: ${userId} / email: ${customerEmail}`);
      
      let foundSubscription = null;
      let stripeCustomerId = null;

      // Method 1: List subscriptions matching the metadata directly
      try {
        const subs = await stripe.subscriptions.list({
          status: "active",
          limit: 100
        });
        
        console.log(`[create-checkout] Found ${subs.data.length} active subscriptions in Stripe. Scanning metadata...`);
        
        // Find matching subscription by userId in metadata
        const matchingSub = subs.data.find(s => s.metadata?.userId === userId || s.metadata?.user_id === userId);
        if (matchingSub) {
          console.log(`[create-checkout] Found subscription matching metadata.userId: ${matchingSub.id}`);
          foundSubscription = matchingSub;
          stripeCustomerId = typeof matchingSub.customer === "string" ? matchingSub.customer : matchingSub.customer.id;
        }
      } catch (err: any) {
        console.warn(`[create-checkout] direct subscriptions list error:`, err);
      }

      // Method 2: If not found by metadata, search customer by email and check their subscriptions
      if (!foundSubscription) {
        try {
          console.log(`[create-checkout] Scanning customers by email: ${customerEmail}`);
          const customers = await stripe.customers.list({
            email: customerEmail,
            limit: 10,
          });

          for (const customer of customers.data) {
            console.log(`[create-checkout] Checking customer: ${customer.id}`);
            const subs = await stripe.subscriptions.list({
              customer: customer.id,
              status: "active",
              limit: 5
            });
            if (subs.data.length) {
              console.log(`[create-checkout] Found subscription matching customer email: ${subs.data[0].id}`);
              foundSubscription = subs.data[0];
              stripeCustomerId = customer.id;
              break;
            }
          }
        } catch (err: any) {
          console.error(`[create-checkout] customer-based search error:`, err);
        }
      }

      if (!foundSubscription) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "No active Stripe subscriptions found for your account. Please complete checkout or contact support if you were charged." 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subscription = foundSubscription;
      const item = subscription.items?.data?.[0];
      const priceIdResolved = item?.price?.lookup_key || item?.price?.id || "arcai_boost_monthly";
      const productIdResolved = typeof item?.price?.product === "string" ? item.price.product : (item?.price?.product?.id || "prod_boost");

      // Save to database
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
      );

      await supabase.from("subscriptions").upsert({
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: stripeCustomerId,
        product_id: productIdResolved,
        price_id: priceIdResolved,
        status: "active",
        environment: environment,
        current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
        current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      console.log(`[create-checkout] Successfully linked real Stripe subscription: ${subscription.id} to user: ${userId}`);

      return new Response(JSON.stringify({ success: true, subscriptionId: subscription.id }), {
        status: 200,
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
      success_url: returnUrl,
      cancel_url: returnUrl.split("?")[0],
      allow_promotion_codes: true,
      ...(customerId && { customer: customerId }),
      ...(resolvedUserId && {
        metadata: { userId: resolvedUserId },
        ...(isRecurring && { subscription_data: { metadata: { userId: resolvedUserId } } }),
      }),
    });

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
