import { createClient } from "npm:@supabase/supabase-js@2.89.0";
import { syncStoredGooglePlaySubscriptions } from "../_shared/googlePlayBilling.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Unauthorized." }, 401);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return json({ error: "Unauthorized." }, 401);

    const refreshed = await syncStoredGooglePlaySubscriptions(db, user.id);
    return json({ refreshed }, 200);
  } catch {
    return json({ error: "Google Play subscriptions could not be refreshed." }, 503);
  }
});
