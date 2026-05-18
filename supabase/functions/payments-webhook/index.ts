import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paddle-signature",
};

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function verifySignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(signatureHeader.split(";").map((p) => p.split("=")));
    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
    const expected = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    // constant-time compare
    if (expected.length !== h1.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ h1.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    console.error("[payments-webhook] verify error", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const env = url.searchParams.get("env") === "live" ? "live" : "sandbox";
  const secret = env === "live"
    ? Deno.env.get("PAYMENTS_LIVE_WEBHOOK_SECRET")
    : Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET");

  const rawBody = await req.text();
  const sigHeader = req.headers.get("paddle-signature") ?? "";

  if (!secret) {
    console.error("[payments-webhook] missing webhook secret", { env });
    return new Response(JSON.stringify({ error: "config" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const ok = await verifySignature(rawBody, sigHeader, secret);
  if (!ok) {
    console.error("[payments-webhook] invalid signature");
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const event = JSON.parse(rawBody);
    const type: string = event.event_type ?? event.type ?? "";
    const data = event.data ?? {};
    console.log("[payments-webhook] event", { type, id: data.id });

    if (type.startsWith("subscription.")) {
      const userId: string | undefined = data.custom_data?.user_id;
      const customerId: string | undefined = data.customer_id;
      const subId: string | undefined = data.id;
      const status: string = data.status ?? "active";
      const priceId: string | undefined = data.items?.[0]?.price?.id;
      const productId: string | undefined = data.items?.[0]?.price?.product_id;
      const periodEnd: string | undefined = data.current_billing_period?.ends_at;
      const canceledAt: string | undefined = data.canceled_at;

      if (!userId) {
        // Fallback: look up by customer_id
        const { data: existing } = await supabase.from("subscriptions").select("user_id").eq("paddle_customer_id", customerId).maybeSingle();
        if (!existing) {
          console.error("[payments-webhook] no user_id and no existing subscription", { customerId, subId });
          return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const row = {
        user_id: userId,
        paddle_customer_id: customerId,
        paddle_subscription_id: subId,
        paddle_product_id: productId,
        paddle_price_id: priceId,
        status,
        current_period_end: periodEnd,
        canceled_at: canceledAt,
        updated_at: new Date().toISOString(),
      };

      if (userId) {
        await supabase.from("subscriptions").upsert(row, { onConflict: "user_id" });
      } else if (subId) {
        await supabase.from("subscriptions").update(row).eq("paddle_subscription_id", subId);
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[payments-webhook] error", err);
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
