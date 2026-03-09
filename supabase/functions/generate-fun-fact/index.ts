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

    // Fetch user's context blocks and profile
    const [blocksRes, profileRes] = await Promise.all([
      supabase.from("context_blocks").select("content").eq("user_id", userId).limit(20),
      supabase.from("profiles").select("display_name, context_info, memory_info").eq("user_id", userId).maybeSingle(),
    ]);

    const blocks = blocksRes.data?.map(b => b.content) || [];
    const profile = profileRes.data;

    const contextSummary = [
      profile?.display_name ? `User's name: ${profile.display_name}` : "",
      profile?.context_info ? `About: ${profile.context_info}` : "",
      profile?.memory_info ? `Memories: ${profile.memory_info}` : "",
      blocks.length > 0 ? `Context blocks:\n${blocks.join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    if (!contextSummary.trim()) {
      return new Response(JSON.stringify({ fun_fact: "You're a mystery! Start chatting more and I'll learn fun things about you. 🕵️" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You generate a single fun, quirky, playful one-liner fact about a user based on their data. Be creative, witty, and positive. Use emojis. Keep it under 120 characters. Don't be generic — reference specific things from their data. Return ONLY the fun fact text, nothing else."
          },
          { role: "user", content: contextSummary },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ fun_fact: "Couldn't generate a fun fact right now — try again! ✨" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const funFact = aiData.choices?.[0]?.message?.content?.trim() || "You're awesome, that's a fact! 🌟";

    return new Response(JSON.stringify({ fun_fact: funFact }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-fun-fact error:", e);
    return new Response(JSON.stringify({ fun_fact: "Something went wrong — but you're still cool! 😎" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
