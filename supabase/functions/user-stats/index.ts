import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel
    const [weekRes, monthRes, yearRes, memoriesRes, imagesRes] = await Promise.all([
      supabase.from("chat_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", weekAgo),
      supabase.from("chat_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", monthAgo),
      supabase.from("chat_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", yearAgo),
      supabase.from("context_blocks").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("generated_files").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("file_type", "image"),
    ]);

    return new Response(JSON.stringify({
      chats_week: weekRes.count ?? 0,
      chats_month: monthRes.count ?? 0,
      chats_year: yearRes.count ?? 0,
      memories: memoriesRes.count ?? 0,
      images_generated: imagesRes.count ?? 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("user-stats error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
