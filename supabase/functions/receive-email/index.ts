import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GUEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function parseFrom(fromStr: string): { name: string; email: string } {
  // Matches "Display Name <email@example.com>" or just "email@example.com"
  const match = fromStr.match(/^(?:"?([^"]*)"?\s)?<?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || match[2],
      email: match[2].trim().toLowerCase(),
    };
  }
  return { name: fromStr, email: fromStr.trim().toLowerCase() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    console.log("Inbound email received:", body);

    // Support both direct inbound payloads and wrapped webhook payloads
    const payload = (body.type === "email.received" || body.data) ? body.data : body;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const emailId = payload.email_id || payload.id;
    let emailDetails = null;

    if (RESEND_API_KEY && emailId) {
      try {
        console.log(`Fetching email details for ${emailId} from Resend API...`);
        const response = await fetch(`https://api.resend.com/emails/${emailId}`, {
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
        });
        if (response.ok) {
          emailDetails = await response.json();
          console.log("Successfully retrieved email details:", emailDetails);
        } else {
          console.error(`Resend API fetch failed with status: ${response.status} ${response.statusText}`);
        }
      } catch (e) {
        console.error("Failed to query Resend API:", e);
      }
    }

    const fromStr = emailDetails?.from || payload.from || "";
    const { name: senderName, email: senderEmail } = parseFrom(fromStr);
    
    // Parse original recipient to catch wildcard/alias emails (e.g. support@ or hello@)
    const rawTo = emailDetails?.to || payload.to;
    const toStr = Array.isArray(rawTo) ? rawTo[0] : (rawTo || "");
    const { email: recipientEmail } = parseFrom(toStr);
    
    const subject = emailDetails?.subject || payload.subject || "No Subject";
    const textContent = emailDetails?.text || emailDetails?.html || payload.text || payload.html || "Empty email body";

    if (!senderEmail) {
      return new Response(JSON.stringify({ error: "Missing sender email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Look up user by email in auth
    let resolvedUserId: string | null = null;
    try {
      const { data: uData } = await admin.auth.admin.getUserByEmail(senderEmail);
      resolvedUserId = uData?.user?.id || null;
    } catch (e) {
      console.warn("User lookup in auth failed:", e);
    }

    // 2. Ensure a profile exists for the Guest User UUID (if needed)
    if (!resolvedUserId) {
      const { data: guestProfile } = await admin
        .from("profiles")
        .select("user_id")
        .eq("user_id", GUEST_USER_ID)
        .maybeSingle();

      if (!guestProfile) {
        await admin.from("profiles").insert({
          user_id: GUEST_USER_ID,
          display_name: "Guest Customer",
          welcome_email_sent: false,
        });
      }
    }

    const ticketUserId = resolvedUserId || GUEST_USER_ID;

    // 3. Find active ticket with this sender_email
    const { data: existingTicket } = await admin
      .from("support_tickets")
      .select("*")
      .eq("sender_email", senderEmail)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let ticketId = "";
    if (existingTicket) {
      ticketId = existingTicket.id;
      // Re-open if in progress
      await admin
        .from("support_tickets")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", ticketId);
    } else {
      // Create new ticket
      ticketId = crypto.randomUUID();
      await admin.from("support_tickets").insert({
        id: ticketId,
        subject: subject,
        sender_email: senderEmail,
        sender_name: senderName,
        recipient_email: recipientEmail,
        user_id: ticketUserId,
        status: "open",
        priority: "medium",
      });
    }

    // 4. Insert ticket message
    await admin.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: ticketUserId,
      sender_email: senderEmail,
      content: textContent,
      is_inbound: true,
      is_admin_reply: false,
    });

    // 5. Query admin user IDs
    const { data: admins } = await admin.from("admin_users").select("user_id");
    const adminIds = (admins || []).map((ad) => ad.user_id);

    // Parse email creation date to avoid flooding on replayed historic webhooks
    const emailCreatedAt = emailDetails?.created_at || payload.data?.created_at || payload.created_at || new Date().toISOString();
    const emailDate = new Date(emailCreatedAt);
    const now = new Date();
    // Margins: Only notify if the email event was generated in the last 10 minutes
    const isRecent = Math.abs(now.getTime() - emailDate.getTime()) < 10 * 60 * 1000;

    if (isRecent) {
      // 6. Dispatch push notifications to admins
      if (adminIds.length > 0) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_ids: adminIds,
            payload: {
              title: `✉️ Support Email: ${senderName}`,
              body: subject,
              url: "/admin?tab=tickets",
              tag: `support-ticket-inbound`,
            },
          }),
        }).catch((err) => console.error("Admin push notification failed:", err));
      }

      // 7. Dispatch transactional email alert to admin email
      const adminNotificationEmail = "jkrd09@gmail.com";
      await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateName: "arc-notification",
          recipientEmail: adminNotificationEmail,
          templateData: {
            title: `New Support Email: ${senderName}`,
            message: `From: ${senderName} (${senderEmail})\nSubject: ${subject}\n\n${textContent.slice(0, 1000)}`,
            url: "https://askarc.chat/admin",
          },
        }),
      }).catch((err) => console.error("Admin email notification failed:", err));
    } else {
      console.log(`Skipping admin push & email notifications for replayed historic email (Date: ${emailCreatedAt}) to prevent mail storm.`);
    }

    return new Response(JSON.stringify({ success: true, ticketId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
