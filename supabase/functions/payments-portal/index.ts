import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PADDLE_API = (env: "sandbox" | "live") =>
  env === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("paddle_subscription_id, paddle_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub?.paddle_subscription_id) throw new Error("No subscription found");

    // Determine env from URL prefix on stored sub id or fall back to live
    const isProd = !!Deno.env.get("PADDLE_LIVE_API_KEY");
    const env: "sandbox" | "live" = isProd ? "live" : "sandbox";
    const apiKey = env === "live"
      ? Deno.env.get("PADDLE_LIVE_API_KEY")
      : Deno.env.get("PADDLE_SANDBOX_API_KEY");

    if (!apiKey) throw new Error("Paddle API key not configured");

    // Generate a customer portal session
    const resp = await fetch(`${PADDLE_API(env)}/customers/${sub.paddle_customer_id}/portal-sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subscription_ids: [sub.paddle_subscription_id] }),
    });

    const json = await resp.json();
    if (!resp.ok) throw new Error(`Paddle error: ${JSON.stringify(json)}`);

    const url = json.data?.urls?.general?.overview ?? json.data?.urls?.subscriptions?.[0]?.cancel_subscription;
    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
