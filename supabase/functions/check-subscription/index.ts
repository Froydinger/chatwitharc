import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// All product/price IDs that grant Pro access
const PRO_PRODUCT_IDS = [
  "prod_UAtIOiu4df3Rso", // ArcAi Pro (current)
  "prod_U4U5QGmibWU8wD", // ArcAi Pro (legacy)
];
const PRO_PRICE_IDS = [
  "price_1TB5D3AB32948AKDJTYd74X4", // Win The Night "Pro Supporter"
];

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No auth header, returning not subscribed");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      logStep("Auth failed, returning not subscribed", { error: userError?.message });
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;
    logStep("User authenticated", { email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Fetch ALL active subscriptions (not limit 1)
    const activeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 100,
    });

    // Also check past_due subscriptions
    const pastDueSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "past_due",
      limit: 100,
    });

    // Also check trialing subscriptions
    const trialingSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 100,
    });

    const allSubs = [...activeSubscriptions.data, ...pastDueSubscriptions.data, ...trialingSubscriptions.data];
    logStep("Fetched subscriptions", { active: activeSubscriptions.data.length, pastDue: pastDueSubscriptions.data.length, trialing: trialingSubscriptions.data.length });

    // Find matching Pro subscription from any of our recognized products/prices
    let matchedSub: typeof allSubs[0] | null = null;
    let source: string | null = null;

    for (const sub of allSubs) {
      const priceId = sub.items.data[0]?.price?.id;
      const productId = sub.items.data[0]?.price?.product;

      if (typeof productId === 'string' && PRO_PRODUCT_IDS.includes(productId)) {
        matchedSub = sub;
        source = productId === "prod_UAtIOiu4df3Rso" ? "arcai_pro" : "arcai_pro_legacy";
        break;
      }
      if (typeof priceId === 'string' && PRO_PRICE_IDS.includes(priceId)) {
        matchedSub = sub;
        source = "wtn_pro_supporter";
        break;
      }
    }

    if (!matchedSub) {
      logStep("No matching Pro subscription found");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const isActive = matchedSub.status === "active";
    const paymentStatus: "ok" | "past_due" = isActive ? "ok" : "past_due";
    const productId = matchedSub.items.data[0]?.price?.product || null;

    let subscriptionEnd: string | null = null;
    try {
      const periodEnd = matchedSub.current_period_end;
      if (typeof periodEnd === 'number' && periodEnd > 0) {
        subscriptionEnd = new Date(periodEnd * 1000).toISOString();
      } else if (typeof periodEnd === 'string') {
        subscriptionEnd = periodEnd;
      }
    } catch (e) {
      logStep("Could not parse period end", { raw: matchedSub.current_period_end });
    }

    logStep("Matched subscription", { source, productId, paymentStatus, subscriptionEnd });

    return new Response(JSON.stringify({
      subscribed: true,
      source,
      product_id: productId,
      subscription_end: subscriptionEnd,
      payment_status: paymentStatus,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
