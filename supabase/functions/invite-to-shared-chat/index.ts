// Owners invite users to a shared chat by email. If the email already maps to
// an existing user, they are added immediately as a member. Otherwise an
// invite token is created so they can accept after signing up.
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

    const { chat_id, email, role = "editor" } = await req.json();
    if (!chat_id || !email) {
      return new Response(JSON.stringify({ error: "chat_id and email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: chat } = await admin.from("shared_chats")
      .select("id, owner_id, title").eq("id", chat_id).maybeSingle();
    if (!chat || chat.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: "Only the owner can invite" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enforce member cap: 6 total (owner + up to 5 additional)
    const MAX_MEMBERS = 6;
    const { count: memberCount } = await admin
      .from("shared_chat_members")
      .select("user_id", { count: "exact", head: true })
      .eq("chat_id", chat_id);
    const { count: pendingCount } = await admin
      .from("shared_chat_invites")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chat_id)
      .is("accepted_at", null);
    if ((memberCount ?? 0) + (pendingCount ?? 0) >= MAX_MEMBERS) {
      return new Response(JSON.stringify({
        error: `This chat is full. Shared chats include the owner plus up to 5 others (6 total).`,
      }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve inviter display name (best effort)
    const { data: inviterProfile } = await admin
      .from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
    const inviterName = inviterProfile?.display_name || user.email?.split("@")[0] || "Someone";

    const normalized = String(email).trim().toLowerCase();
    const SITE = "https://askarc.chat";
    const chatUrl = `${SITE}/shared/${chat_id}`;

    // Look up existing auth user
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const target = list?.users?.find((u) => u.email?.toLowerCase() === normalized);

    // Helper: fire the invite email (non-blocking).
    const sendInviteEmail = (isExistingUser: boolean) => {
      admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "shared-chat-invite",
          recipientEmail: normalized,
          idempotencyKey: `shared-invite-${chat_id}-${normalized}`,
          templateData: {
            inviterName,
            chatTitle: chat.title,
            chatUrl,
            isExistingUser,
          },
        },
      }).catch((e) => console.error("invite email failed", e));
    };

    if (target) {
      const { error: insErr } = await admin.from("shared_chat_members").insert({
        chat_id, user_id: target.id, role,
      });
      if (insErr && !insErr.message.includes("duplicate")) throw insErr;
      // Push + email
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_ids: [target.id],
          payload: {
            title: `${inviterName} added you to a shared chat`,
            body: chat.title,
            url: `/shared/${chat_id}`,
            tag: `shared-${chat_id}`,
          },
        }),
      }).catch(() => {});
      sendInviteEmail(true);
      return new Response(JSON.stringify({ status: "added", user_id: target.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create pending invite + email them so they can sign up and join
    const { data: invite, error: invErr } = await admin.from("shared_chat_invites").insert({
      chat_id, email: normalized, role, invited_by: user.id,
    }).select("token").single();
    if (invErr) throw invErr;
    sendInviteEmail(false);

    return new Response(JSON.stringify({ status: "invited", token: invite!.token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
