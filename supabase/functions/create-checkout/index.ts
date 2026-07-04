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
      priceId,
      customerEmail,
      userId,
      returnUrl,
      environment,
    }: {
      priceId?: string;
      customerEmail?: string;
      userId?: string;
      returnUrl?: string;
      environment?: StripeEnv;
    } = body;

    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
    if (!returnUrl) throw new Error("Missing returnUrl");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

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
