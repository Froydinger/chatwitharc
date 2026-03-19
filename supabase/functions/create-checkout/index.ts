import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MONTHLY_PRICE_ID = "price_1TCXWdAB32948AKD4SFikT2q";
const YEARLY_PRICE_ID = "price_1TCXaOAB32948AKDM21FdATf";
const MONTHLY_COUPON = "M7Wa63eA";
const YEARLY_COUPON = "JvA9kQgO";

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
      // No body or invalid JSON — defaults
    }

    const priceId = billingInterval === "yearly" ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;
    const coupon = billingInterval === "yearly" ? YEARLY_COUPON : MONTHLY_COUPON;

    if (useEmbedded) {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        discounts: [{ coupon }],
        mode: "subscription",
        ui_mode: "embedded",
        return_url: `${origin}/?checkout=success`,
      });

      return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } else {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        discounts: [{ coupon }],
        mode: "subscription",
        success_url: `${origin}/`,
        cancel_url: `${origin}/`,
      });

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
