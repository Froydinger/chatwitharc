// When @arc is mentioned in a shared chat, this endpoint generates Arc's reply
// from the conversation history and inserts it as an assistant message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { chat_id, message_id } = await req.json();
    if (typeof chat_id !== "string" || typeof message_id !== "string") {
      return new Response(JSON.stringify({ error: "chat_id and message_id required" }), {
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

    const { data: trigger, error: triggerError } = await admin.from("shared_chat_messages")
      .select("id,author_user_id,role,content,created_at")
      .eq("id", message_id).eq("chat_id", chat_id).maybeSingle();
    if (triggerError || !trigger || trigger.author_user_id !== user.id || trigger.role !== "user" || !/@arc\b/i.test(trigger.content)) {
      return new Response(JSON.stringify({ error: "Mention @Arc in your message to request a reply." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: blockRows, error: blockError } = await admin
      .from("user_blocks")
      .select("blocked_user_id")
      .eq("blocker_user_id", user.id);
    if (blockError) {
      return new Response(JSON.stringify({ error: "Safety settings are unavailable" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const blockedUserIds = new Set((blockRows ?? []).map((row) => row.blocked_user_id));

    const { data: allMessages, error: messagesError } = await admin
      .from("shared_chat_messages")
      .select("role, content, author_user_id, created_at")
      .eq("chat_id", chat_id)
      .lte("created_at", trigger.created_at)
      .order("created_at", { ascending: false })
      .limit(40);
    if (messagesError) throw messagesError;
    const msgs = (allMessages ?? []).reverse().filter((message) =>
      !message.author_user_id || !blockedUserIds.has(message.author_user_id)
    );

    // Map author display names
    const authorIds = Array.from(new Set((msgs ?? []).map((m) => m.author_user_id).filter(Boolean) as string[]));
    const { data: profiles } = await admin
      .from("profiles").select("user_id, display_name").in("user_id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "User"]));

    // Only the room's visible history is shared with Arc, never personal memories.
    const convo = [
      {
        role: "system",
        content:
          "You are Arc, replying inside a Collab Chat with multiple humans. " +
          "Reference participants by name when useful. Keep replies concise unless asked to expand. " +
          "You can chat and search the web here. For images, files, Canvas, Work, memory, scheduling, browser control, voice, or other actions, explain that the tool is not ready in Collab Chats yet and ask them to use their main Arc chat. Do not claim to perform those actions.",
      },
      ...((msgs ?? []).map((m) => {
        if (m.role === "assistant") return { role: "assistant", content: m.content };
        const name = m.author_user_id ? (nameMap.get(m.author_user_id) ?? "User") : "User";
        return { role: "user", content: `${name}: ${m.content}` };
      })),
    ];

    // Main chat enforces the search-only tool allowlist for this mode.
    const chatUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/chat`;
    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify({
        messages: convo,
        model: "gpt-6-luna",
        collabChat: true,
        stream: false,
        streamEvents: false,
        clientDateTime: new Date().toString(),
        clientTimezone: "UTC",
        clientTimezoneOffsetMinutes: 0,
      }),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return new Response(JSON.stringify({ error: "Arc couldn’t reply. Please try again." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await res.json();
    const reply = json?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) throw new Error("No reply returned");

    const { data: inserted, error: insertError } = await admin.from("shared_chat_messages").insert({
      chat_id, author_user_id: null, role: "assistant", content: reply,
    }).select("*").single();
    if (insertError || !inserted) throw new Error("Reply could not be saved");

    return new Response(JSON.stringify({ id: inserted.id, content: reply, message: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Arc couldn’t reply. Please try mentioning @Arc again." }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
