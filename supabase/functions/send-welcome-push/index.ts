// Authenticated user → send a welcome / test push to themselves only.
// Uses web-push-neo (Web Crypto + fetch) because the classic `web-push` npm
// package crashes the Deno edge runtime (Deno.core.runMicrotasks not supported).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendNotification } from "npm:web-push-neo@1.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@askarc.chat";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const json = JSON.stringify(payload);
    const vapidDetails = {
      subject: VAPID_SUBJECT,
      publicKey: VAPID_PUBLIC,
      privateKey: VAPID_PRIVATE,
    };

    const results = await Promise.allSettled((subs ?? []).map(async (s: any) => {
      try {
        const res = await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { vapidDetails, TTL: 60 },
        );
        if (res.status === 404 || res.status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          return { id: s.id, ok: false, status: res.status };
        }
        if (res.status >= 400) {
          const text = await res.text().catch(() => "");
          console.error("push failed", res.status, text);
          return { id: s.id, ok: false, status: res.status, error: text };
        }
        await admin.from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
        return { id: s.id, ok: true };
      } catch (err: any) {
        console.error("send error", err?.message ?? err);
        return { id: s.id, ok: false, error: String(err?.message ?? err) };
      }
    }));

    const sent = results.filter((r) => r.status === "fulfilled" && (r as any).value.ok).length;
    const failed = results.length - sent;

    return new Response(JSON.stringify({ sent, failed, total: results.length }), {
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
