// Anonymous chat endpoint — IP-rate-limited, text + web search only.
// No memory, no images, no personas, no file uploads, no history.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-anon-replies-today, x-anon-limit",
};

const DAILY_LIMIT = 25;
const MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are Arc, an AI assistant. The user is using Arc anonymously, without an account.

Anonymous mode rules:
- You have NO memory of past conversations. Do not pretend to remember anything.
- You CANNOT generate images, edit images, analyze files, use personas, save memories, create canvases, run code, or build apps.
- If asked for any of the above, politely say it requires a free account at askarc.chat and suggest signing up.
- Keep responses concise and conversational.
- You CAN use web search results when provided.`;

function hashIp(ip: string): string {
  // Lightweight SHA-256 hex via SubtleCrypto, sync-style helper
  return ip; // placeholder — replaced below by async hash
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

async function webSearchTavily(
  query: string,
): Promise<{ summary: string; sources: Array<{ title: string; url: string }> }> {
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  if (!tavilyKey) return { summary: "", sources: [] };
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!res.ok) return { summary: "", sources: [] };
    const data = await res.json();
    let summary = data.answer ? `Quick Answer: ${data.answer}\n\n` : "";
    const sources: Array<{ title: string; url: string }> = [];
    if (Array.isArray(data.results)) {
      summary += "Search Results:\n";
      data.results.forEach((r: any, i: number) => {
        summary += `${i + 1}. ${r.title}\n   ${(r.content || "").slice(0, 800)}\n   Source: ${r.url}\n\n`;
        sources.push({ title: r.title, url: r.url });
      });
    }
    return { summary, sources };
  } catch (e) {
    console.error("Tavily error:", e);
    return { summary: "", sources: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfiguration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { messages, search } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      search?: boolean;
    };

    // Validate: text-only, no attachments
    for (const m of messages) {
      if (typeof m.content !== "string") {
        return new Response(
          JSON.stringify({ error: "Only text messages allowed in anonymous mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (m.content.length > 15000) {
        return new Response(
          JSON.stringify({ error: "Message too long" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    if (messages.length > 50) {
      return new Response(
        JSON.stringify({ error: "Conversation too long. Sign up for a free account to keep going." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Rate limit by IP hash
    const ip = getClientIp(req);
    const ipHash = await sha256Hex(`anon:${ip}`);
    const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

    const { data: usage } = await supabase
      .from("anon_usage")
      .select("replies_count")
      .eq("ip_hash", ipHash)
      .eq("usage_date", today)
      .maybeSingle();

    const repliesToday = usage?.replies_count ?? 0;
    if (repliesToday >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "daily_limit",
          repliesToday,
          limit: DAILY_LIMIT,
          message: "You've hit today's free anonymous limit. Sign up for a free account to keep chatting — your current conversation will be saved.",
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "x-anon-replies-today": String(repliesToday),
            "x-anon-limit": String(DAILY_LIMIT),
          },
        },
      );
    }

    // Optional web search on the latest user message
    let searchContext = "";
    let sources: Array<{ title: string; url: string }> = [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (search && lastUser?.content) {
      const result = await webSearchTavily(lastUser.content);
      searchContext = result.summary;
      sources = result.sources;
    }

    const systemContent = searchContext
      ? `${SYSTEM_PROMPT}\n\nWeb search results for the user's latest message:\n${searchContext}\n\nCite sources naturally where relevant.`
      : SYSTEM_PROMPT;

    const conversation = [
      { role: "system", content: systemContent },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: conversation,
          temperature: 0.6,
          max_tokens: 1024,
        }),
      },
    );

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "AI service busy. Try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please try again later." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      console.error("AI gateway error:", aiRes.status, txt);
      return new Response(
        JSON.stringify({ error: "Chat service error" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiRes.json();
    const reply: string = aiData?.choices?.[0]?.message?.content ?? "";

    // Increment counter (best-effort upsert)
    const newCount = repliesToday + 1;
    await supabase
      .from("anon_usage")
      .upsert(
        {
          ip_hash: ipHash,
          usage_date: today,
          replies_count: newCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ip_hash,usage_date" },
      );

    return new Response(
      JSON.stringify({
        reply,
        sources,
        repliesToday: newCount,
        limit: DAILY_LIMIT,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "x-anon-replies-today": String(newCount),
          "x-anon-limit": String(DAILY_LIMIT),
        },
      },
    );
  } catch (e) {
    console.error("anon-chat error:", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
