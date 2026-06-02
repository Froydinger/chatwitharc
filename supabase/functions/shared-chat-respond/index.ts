// When @arc is mentioned in a shared chat, this endpoint generates Arc's reply
// from the conversation history and inserts it as an assistant message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const authHeader = req.headers.get("Authorization") ?? "";
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

    const { chat_id } = await req.json();
    if (!chat_id) {
      return new Response(JSON.stringify({ error: "chat_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Membership check via security definer
    const { data: isMember } = await admin.rpc("is_shared_chat_member", { _chat_id: chat_id, _user_id: user.id });
    const { data: isOwner } = await admin.rpc("is_shared_chat_owner", { _chat_id: chat_id, _user_id: user.id });
    if (!isMember && !isOwner) {
      return new Response(JSON.stringify({ error: "Not a member" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msgs } = await admin
      .from("shared_chat_messages")
      .select("role, content, author_user_id, created_at")
      .eq("chat_id", chat_id)
      .order("created_at", { ascending: true })
      .limit(40);

    // Map author display names
    const authorIds = Array.from(new Set((msgs ?? []).map((m) => m.author_user_id).filter(Boolean) as string[]));
    const { data: profiles } = await admin
      .from("profiles").select("user_id, display_name").in("user_id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "User"]));

    const messages = [
      { role: "system", content: "You are Arc, replying inside a shared group chat with multiple humans. Be concise and reference participants by name when useful." },
      ...((msgs ?? []).map((m) => {
        if (m.role === "assistant") return { role: "assistant", content: m.content };
        const name = m.author_user_id ? (nameMap.get(m.author_user_id) ?? "User") : "User";
        return { role: "user", content: `${name}: ${m.content}` };
      })),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `AI gateway ${res.status}: ${text}` }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await res.json();
    const reply: string = json?.choices?.[0]?.message?.content ?? "(no reply)";

    const { data: inserted } = await admin.from("shared_chat_messages").insert({
      chat_id, author_user_id: null, role: "assistant", content: reply,
    }).select("id").single();

    return new Response(JSON.stringify({ id: inserted?.id, content: reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
