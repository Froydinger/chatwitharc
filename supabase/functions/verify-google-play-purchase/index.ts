import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { verifyAndStoreGooglePlaySubscription } from "../_shared/googlePlayBilling.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in to verify this purchase." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Sign in to verify this purchase." }, 401);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.productId !== "string" || typeof body.purchaseToken !== "string") {
      return json({ error: "A Google Play product and purchase receipt are required." }, 400);
    }

    const subscription = await verifyAndStoreGooglePlaySubscription(
      supabase,
      user.id,
      body.productId,
      body.purchaseToken,
    );
    if (!subscription.isEntitled) {
      return json({
        verified: false,
        error: "This Google Play subscription is not currently active.",
        subscription,
      }, 409);
    }
    return json({ verified: true, subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Play receipt verification failed.";
    const status = message.includes("Unsupported Google Play product") || message.includes("Invalid Google Play") ? 400 : 409;
    return json({ verified: false, error: message }, status);
  }
});
