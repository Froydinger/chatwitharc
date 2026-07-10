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

async function sendBoostEmail(options: {
  templateName: "boost-granted" | "boost-revoked";
  userId: string;
  displayName?: string | null;
  adminEmail?: string | null;
  idempotencyKey: string;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.warn("[ADMIN-USERS] Missing Supabase env; skipping Boost email");
    return false;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateName: options.templateName,
        recipientUserId: options.userId,
        idempotencyKey: options.idempotencyKey,
        templateData: {
          displayName: options.displayName || undefined,
          adminEmail: options.adminEmail || undefined,
          appUrl: "https://askarc.chat",
          pricingUrl: "https://askarc.chat/pricing",
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("[ADMIN-USERS] Boost email failed", {
        templateName: options.templateName,
        userId: options.userId,
        status: response.status,
        text,
      });
      return false;
    }

    logStep("Boost email sent", { templateName: options.templateName, userId: options.userId });
    return true;
  } catch (error) {
    console.warn("[ADMIN-USERS] Boost email threw", {
      templateName: options.templateName,
      userId: options.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

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

      // Filter out anonymous users (those without an email or marked as anonymous)
      const registeredUsers = (users || []).filter(u => u.email && u.email.trim() !== "" && !u.is_anonymous);

      // Get profiles for all users
      const userIds = registeredUsers.map(u => u.id);
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

      const enrichedUsers = registeredUsers.map(u => {
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

      return new Response(JSON.stringify({ users: enrichedUsers, total: enrichedUsers.length }), {
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

      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();

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
      const emailSent = await sendBoostEmail({
        templateName: "boost-granted",
        userId,
        displayName: targetProfile?.display_name,
        adminEmail: userData.user?.email,
        idempotencyKey: `admin-boost-granted:${userId}:${new Date().toISOString().slice(0, 10)}`,
      });

      return new Response(JSON.stringify({ success: true, emailSent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "revoke_boost") {
      const { userId } = params;
      if (!userId) throw new Error("userId required");

      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();

      await supabase.from("subscriptions").delete().eq("user_id", userId);

      logStep("Revoked boost via admin", { userId });
      const emailSent = await sendBoostEmail({
        templateName: "boost-revoked",
        userId,
        displayName: targetProfile?.display_name,
        adminEmail: userData.user?.email,
        idempotencyKey: `admin-boost-revoked:${userId}:${new Date().toISOString().slice(0, 10)}`,
      });

      return new Response(JSON.stringify({ success: true, emailSent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "stats") {
      // 1. Total users
      const { data: { users }, error: usersErr } = await supabase.auth.admin.listUsers();
      if (usersErr) throw usersErr;
      const totalUsers = users?.length || 0;

      // 2. Active subscriptions
      const { data: subs, error: subsErr } = await supabase
        .from("subscriptions")
        .select("status, environment");
      if (subsErr) throw subsErr;

      const activeSubs = subs?.filter(s => s.status === "active") || [];
      const activeLiveSubsCount = activeSubs.filter(s => s.environment === "live").length;
      const activeSandboxSubsCount = activeSubs.filter(s => s.environment === "sandbox").length;
      const mrr = activeLiveSubsCount * 7.00;

      // 3. Activity counts
      const [
        { count: chatsCount },
        { count: filesCount },
        { count: sitesCount },
        { count: bugsCount },
        { count: ticketsCount },
        { count: voiceCount }
      ] = await Promise.all([
        supabase.from("chat_sessions").select("id", { count: "exact", head: true }),
        supabase.from("generated_files").select("id", { count: "exact", head: true }),
        supabase.from("published_sites").select("id", { count: "exact", head: true }),
        supabase.from("bug_reports").select("id", { count: "exact", head: true }),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }),
        supabase.from("voice_conversations").select("id", { count: "exact", head: true })
      ]);

      // 4. Image Generation Stats
      const { data: imageUsage } = await supabase.from("daily_image_usage").select("used");
      const totalImages = imageUsage?.reduce((sum, item) => sum + (item.used || 0), 0) || 0;

      return new Response(JSON.stringify({
        totalUsers,
        activeLiveSubsCount,
        activeSandboxSubsCount,
        mrr,
        chatsCount: chatsCount || 0,
        filesCount: filesCount || 0,
        sitesCount: sitesCount || 0,
        bugsCount: bugsCount || 0,
        ticketsCount: ticketsCount || 0,
        voiceCount: voiceCount || 0,
        totalImages
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_bugs") {
      const { data: bugs, error } = await supabase
        .from("bug_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      return new Response(JSON.stringify({ bugs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_bug") {
      const { bugId } = params;
      if (!bugId) throw new Error("bugId required");
      const { error } = await supabase.from("bug_reports").delete().eq("id", bugId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_tickets") {
      const { data: tickets, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      return new Response(JSON.stringify({ tickets }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_ticket_messages") {
      const { ticketId } = params;
      if (!ticketId) throw new Error("ticketId required");
      const { data: messages, error } = await supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reply_to_ticket") {
      const { ticketId, content } = params;
      if (!ticketId) throw new Error("ticketId required");
      if (!content) throw new Error("content required");

      const { data: reply, error: replyErr } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticketId,
          sender_id: callerUserId,
          content,
          is_admin_reply: true
        })
        .select()
        .single();
      if (replyErr) throw replyErr;

      const { error: ticketErr } = await supabase
        .from("support_tickets")
        .update({ status: "replied", updated_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (ticketErr) throw ticketErr;

      return new Response(JSON.stringify({ success: true, reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_ticket_status") {
      const { ticketId, status } = params;
      if (!ticketId) throw new Error("ticketId required");
      if (!status) throw new Error("status required");

      const { error } = await supabase
        .from("support_tickets")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (error) throw error;

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
