import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Admin chat browser.
 *
 * chat_sessions is RLS-scoped to its owner, so an admin's browser session can
 * only ever see its own rows — the listing has to run server-side under the
 * service role, same shape as admin-users and admin-storage. The caller is
 * re-verified against admin_users on every action; the client's isAdmin flag is
 * a UI convenience and is never trusted here.
 *
 * `list` deliberately returns metadata only — titles, counts, timestamps. Whole
 * conversations are private by default and are fetched one at a time through
 * `session`, so browsing who has what does not mean dumping everyone's
 * messages. Each content read is logged with the admin's id.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-CHATS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Chat auditing is disabled for privacy." }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const callerUserId = userData.user?.id;
    if (!callerUserId) throw new Error("Not authenticated");

    const { data: adminCheck } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", callerUserId)
      .maybeSingle();

    if (!adminCheck) throw new Error("Not an admin");

    const { action, ...params } = await req.json();
    logStep("Action requested", { action, callerUserId });

    // ── list: session metadata, optionally for one user ─────────────────────
    if (action === "list") {
      let query = supabase
        .from("chat_sessions")
        .select("id, user_id, title, created_at, updated_at, folder_id")
        .order("updated_at", { ascending: false })
        .limit(Math.min(params.limit ?? 500, 2000));

      if (params.userId) query = query.eq("user_id", params.userId);

      const { data: sessions, error } = await query;
      if (error) throw error;

      const userIds = [...new Set((sessions ?? []).map((s) => s.user_id))];
      const displayNames: Record<string, string> = {};
      const userEmails: Record<string, string> = {};

      if (userIds.length) {
        const [{ data: authData }, { data: profiles }] = await Promise.all([
          supabase.auth.admin.listUsers({ perPage: 1000 }),
          supabase.from("profiles").select("id, user_id, display_name"),
        ]);

        const authUserMap = new Map((authData?.users || []).map((u) => [u.id, u.email]));
        const profileMap = new Map<string, string>();
        for (const p of profiles || []) {
          if (p.display_name) {
            if (p.user_id) profileMap.set(p.user_id, p.display_name);
            if (p.id) profileMap.set(p.id, p.display_name);
          }
        }

        for (const id of userIds) {
          const email = authUserMap.get(id);
          const name = profileMap.get(id);
          if (email) userEmails[id] = email;
          if (name) displayNames[id] = name;
        }
      }

      logStep("Listed sessions", { count: sessions?.length ?? 0 });
      return new Response(JSON.stringify({ sessions: sessions ?? [], displayNames, userEmails }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ── session: one conversation's messages, on explicit request ───────────
    if (action === "session") {
      const { sessionId } = params as { sessionId: string };
      if (!sessionId) throw new Error("sessionId is required");

      const { data: session, error } = await supabase
        .from("chat_sessions")
        .select("id, user_id, title, messages, created_at, updated_at, canvas_content")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!session) throw new Error("Session not found");

      // Reading someone's conversation is the sensitive action here, so it is
      // recorded with who did it rather than passing silently.
      logStep("Content read", {
        adminUserId: callerUserId,
        sessionId,
        ownerUserId: session.user_id,
      });

      return new Response(JSON.stringify({ session }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    const isAuth = /admin|authenticated|authorization|Auth error/i.test(message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isAuth ? 403 : 500,
    });
  }
});
