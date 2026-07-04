// Send push notifications via Web Push protocol — admin / service-role only.
// Uses @negrel/webpush (pure Web Crypto, runs in Deno edge runtime).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@askarc.chat";

// Decode base64url to Uint8Array
function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Convert raw VAPID base64url keys -> JWK pair expected by @negrel/webpush
function rawVapidToJwk(publicB64u: string, privateB64u: string) {
  const pub = b64uToBytes(publicB64u);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(`Invalid VAPID public key length=${pub.length}`);
  }
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  const d = b64uToBytes(privateB64u);
  return {
    publicKey: {
      kty: "EC", crv: "P-256",
      x: bytesToB64u(x), y: bytesToB64u(y),
      key_ops: ["verify"], ext: true,
    } as JsonWebKey,
    privateKey: {
      kty: "EC", crv: "P-256",
      x: bytesToB64u(x), y: bytesToB64u(y), d: bytesToB64u(d),
      key_ops: ["sign"], ext: true,
    } as JsonWebKey,
  };
}

let appServerPromise: Promise<webpush.ApplicationServer> | null = null;
function getAppServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const exported = rawVapidToJwk(VAPID_PUBLIC, VAPID_PRIVATE);
      const vapidKeys = await webpush.importVapidKeys(exported, { extractable: false });
      return await webpush.ApplicationServer.new({
        contactInformation: VAPID_SUBJECT,
        vapidKeys,
      });
    })();
  }
  return appServerPromise;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceCall = authHeader === `Bearer ${serviceKey}`;

    if (!isServiceCall) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Parse body early to check if it's an admin-only dispatch
      const rawBody = await req.clone().json().catch(() => ({}));
      const isAdminsOnly = rawBody?.admins_only === true;

      if (!isAdminsOnly) {
        const { data: isAdmin } = await admin
          .from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Admin required" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const body = await req.json();
    const payload = body?.payload;
    if (!payload?.title) {
      return new Response(JSON.stringify({ error: "payload.title required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userIds: string[] = [];
    if (body?.admins_only === true) {
      const { data: admins } = await admin.from("admin_users").select("user_id");
      userIds = (admins || []).map(a => a.user_id);
    } else if (Array.isArray(body?.user_ids)) {
      userIds = body.user_ids;
    } else if (body?.user_id) {
      userIds = [body.user_id];
    }

    let query = admin.from("push_subscriptions").select("*");
    if (userIds.length) query = query.in("user_id", userIds);
    const { data: subs, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appServer = await getAppServer();
    const json = JSON.stringify(payload);

    const results = await Promise.allSettled((subs ?? []).map(async (s: any) => {
      try {
        const subscriber = appServer.subscribe({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        });
        await subscriber.pushTextMessage(json, { ttl: 60 });
        await admin.from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", s.id);
        return { id: s.id, ok: true };
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        // Gone / Not Found -> remove dead subscription
        if (/\b(404|410)\b/.test(msg) || /gone|not\s*found|expired/i.test(msg)) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
        console.error("push send failed", s.id, msg);
        return { id: s.id, ok: false, error: msg };
      }
    }));

    const sent = results.filter(r => r.status === "fulfilled" && (r as any).value.ok).length;
    const failed = results.length - sent;

    return new Response(JSON.stringify({ sent, failed, total: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
