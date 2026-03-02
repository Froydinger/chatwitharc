import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADMIN-USERS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const callerUserId = userData.user?.id;
    if (!callerUserId) throw new Error("Not authenticated");

    // Check admin status
    const { data: adminCheck } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", callerUserId)
      .maybeSingle();

    if (!adminCheck) throw new Error("Not an admin");

    const { action, ...params } = await req.json();
    logStep("Action requested", { action, callerUserId });

    if (action === "list") {
      // List all users with profiles
      const { data: { users }, error } = await supabase.auth.admin.listUsers({
        page: params.page || 1,
        perPage: params.perPage || 50,
      });

      if (error) throw error;

      // Get profiles for all users
      const userIds = users.map(u => u.id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, preferred_model")
        .in("user_id", userIds);

      // Get admin users
      const { data: admins } = await supabase
        .from("admin_users")
        .select("user_id, role, is_primary_admin");

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const adminMap = new Map((admins || []).map(a => [a.user_id, a]));

      const enrichedUsers = users.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        display_name: profileMap.get(u.id)?.display_name || null,
        avatar_url: profileMap.get(u.id)?.avatar_url || null,
        preferred_model: profileMap.get(u.id)?.preferred_model || null,
        is_admin: adminMap.has(u.id),
        admin_role: adminMap.get(u.id)?.role || null,
        is_primary_admin: adminMap.get(u.id)?.is_primary_admin || false,
      }));

      return new Response(JSON.stringify({ users: enrichedUsers, total: users.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { userId } = params;
      if (!userId) throw new Error("userId required");
      if (userId === callerUserId) throw new Error("Cannot delete yourself");

      // Check if target is primary admin
      const { data: targetAdmin } = await supabase
        .from("admin_users")
        .select("is_primary_admin")
        .eq("user_id", userId)
        .maybeSingle();

      if (targetAdmin?.is_primary_admin) throw new Error("Cannot delete primary admin");

      // Delete user data
      await supabase.from("chat_sessions").delete().eq("user_id", userId);
      await supabase.from("profiles").delete().eq("user_id", userId);
      await supabase.from("context_blocks").delete().eq("user_id", userId);
      await supabase.from("generated_files").delete().eq("user_id", userId);
      await supabase.from("admin_users").delete().eq("user_id", userId);
      
      // Delete auth user
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw error;

      logStep("User deleted", { userId });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_admin") {
      const { userId, email } = params;
      if (!userId) throw new Error("userId required");

      const { data: existing } = await supabase
        .from("admin_users")
        .select("id, is_primary_admin")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        if (existing.is_primary_admin) throw new Error("Cannot remove primary admin");
        await supabase.from("admin_users").delete().eq("user_id", userId);
        logStep("Admin removed", { userId });
      } else {
        await supabase.from("admin_users").insert({
          user_id: userId,
          email: email || "",
          role: "admin",
          is_primary_admin: false,
        });
        logStep("Admin added", { userId });
      }

      return new Response(JSON.stringify({ success: true, isAdmin: !existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
