// Authenticated user → send a welcome / test push to themselves only.
// Delivery is delegated to the shared push sender so there is one Web Push
// implementation to maintain.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let isTest = false;
    try {
      const body = await req.json();
      isTest = body?.test === true;
    } catch {
      // No body — treat as welcome
    }

    const payload = isTest
      ? {
          title: "ArcAI",
          body: "Test notification — you're all set 🎉",
          icon: "/icons/apple-touch-icon-180.png",
          badge: "/icons/apple-touch-icon-180.png",
          url: "/",
          tag: "arc-test",
        }
      : {
          title: "Welcome to ArcAI 🎉",
          body: "Push is on! I'll ping you when scheduled tasks finish or someone @mentions you.",
          icon: "/icons/apple-touch-icon-180.png",
          badge: "/icons/apple-touch-icon-180.png",
          url: "/",
          tag: "arc-welcome",
        };

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_ids: [user.id], payload }),
    });
    const result = await response.text();
    return new Response(result, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-welcome-push error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
