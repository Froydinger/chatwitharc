import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Check for active subscriptions first
    const activeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    // Also check for past_due subscriptions (payment failed but not yet canceled)
    const pastDueSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "past_due",
      limit: 1,
    });

    const hasActiveSub = activeSubscriptions.data.length > 0;
    const hasPastDueSub = pastDueSubscriptions.data.length > 0;
    const subscription = hasActiveSub 
      ? activeSubscriptions.data[0] 
      : hasPastDueSub 
        ? pastDueSubscriptions.data[0] 
        : null;

    let productId = null;
    let subscriptionEnd = null;
    let paymentStatus: "ok" | "past_due" | "none" = "none";

    if (subscription) {
      try {
        const periodEnd = subscription.current_period_end;
        if (typeof periodEnd === 'number' && periodEnd > 0) {
          subscriptionEnd = new Date(periodEnd * 1000).toISOString();
        } else if (typeof periodEnd === 'string') {
          subscriptionEnd = periodEnd;
        }
      } catch (e) {
        logStep("Could not parse period end, skipping", { raw: subscription.current_period_end });
      }

      productId = subscription.items.data[0]?.price?.product || null;

      if (hasActiveSub) {
        paymentStatus = "ok";
        logStep("Active subscription found", { subscriptionEnd, productId });
      } else {
        paymentStatus = "past_due";
        logStep("Past due subscription found", { subscriptionEnd, productId });
      }
    } else {
      logStep("No active or past_due subscription");
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub || hasPastDueSub, // Keep access during past_due (grace period)
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
