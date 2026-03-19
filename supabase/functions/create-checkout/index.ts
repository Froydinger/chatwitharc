import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MONTHLY_PRICE_ID = "price_1TCXWdAB32948AKD4SFikT2q";
const YEARLY_PRICE_ID = "price_1TCXaOAB32948AKDM21FdATf";
const YEARLY_COUPON = "9v4Flk8g";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://chatwitharc.lovable.app";

    // Parse request body
    let useEmbedded = false;
    let billingInterval = "monthly";
    try {
      const body = await req.json();
      useEmbedded = body?.embedded === true;
      if (body?.interval === "yearly") billingInterval = "yearly";
    } catch {
      // defaults
    }

    const isYearly = billingInterval === "yearly";
    const priceId = isYearly ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;

    const sessionParams: any = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
    };

    if (isYearly) {
      // 20% off annual plans
      sessionParams.discounts = [{ coupon: YEARLY_COUPON }];
    } else {
      // 7-day free trial for monthly
      sessionParams.subscription_data = { trial_period_days: 7 };
    }

    if (useEmbedded) {
      sessionParams.ui_mode = "embedded";
      sessionParams.return_url = `${origin}/?checkout=success`;

      const session = await stripe.checkout.sessions.create(sessionParams);
      return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      sessionParams.success_url = `${origin}/`;
      sessionParams.cancel_url = `${origin}/`;

      const session = await stripe.checkout.sessions.create(sessionParams);
      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
