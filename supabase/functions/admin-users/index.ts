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
        perPage: params.perPage || 100, // retrieve more
      });

      if (error) throw error;

      // Get profiles for all users
      const userIds = users.map(u => u.id);
      const [profilesRes, adminsRes, subsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url, preferred_model")
          .in("user_id", userIds),
        supabase
          .from("admin_users")
          .select("user_id, role, is_primary_admin"),
        supabase
          .from("subscriptions")
          .select("user_id, status, stripe_subscription_id, stripe_customer_id, current_period_end, environment")
          .in("user_id", userIds),
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.user_id, p]));
      const adminMap = new Map((adminsRes.data || []).map(a => [a.user_id, a]));
      const subMap = new Map((subsRes.data || []).map(s => [s.user_id, s]));

      const enrichedUsers = users.map(u => {
        const sub = subMap.get(u.id);
        return {
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
          subscription: sub ? {
            status: sub.status,
            stripe_subscription_id: sub.stripe_subscription_id,
            stripe_customer_id: sub.stripe_customer_id,
            current_period_end: sub.current_period_end,
            environment: sub.environment,
          } : null,
        };
      });

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

    if (action === "add_by_email") {
      const { email } = params;
      if (!email) throw new Error("email required");

      // Look up user by email using admin API
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;

      const targetUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!targetUser) throw new Error("User not found. They must sign up first.");

      // Check if already an admin
      const { data: existing } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", targetUser.id)
        .maybeSingle();

      if (existing) throw new Error("User is already an admin");

      const { data, error: insertError } = await supabase
        .from("admin_users")
        .insert({
          user_id: targetUser.id,
          email: targetUser.email || email,
          role: "admin",
          is_primary_admin: false,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      logStep("Admin added by email", { email, userId: targetUser.id });
      return new Response(JSON.stringify({ success: true, admin: data }), {
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

    if (action === "grant_boost") {
      const { userId } = params;
      if (!userId) throw new Error("userId required");

      await supabase.from("subscriptions").upsert({
        user_id: userId,
        status: "active",
        price_id: "arcai_boost_monthly",
        product_id: "arcai_boost",
        current_period_end: "9999-12-31 23:59:59+00",
        current_period_start: new Date().toISOString(),
        environment: "sandbox",
        stripe_subscription_id: `promo_admin_${userId}_${Date.now()}`,
      }, { onConflict: "user_id" });

      logStep("Granted boost via admin", { userId });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "revoke_boost") {
      const { userId } = params;
      if (!userId) throw new Error("userId required");

      await supabase.from("subscriptions").delete().eq("user_id", userId);

      logStep("Revoked boost via admin", { userId });
      return new Response(JSON.stringify({ success: true }), {
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
