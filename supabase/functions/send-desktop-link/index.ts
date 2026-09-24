import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { createClient } from "npm:@supabase/supabase-js@2";
import { template as desktopLinkTemplate } from "../_shared/transactional-email-templates/desktop-link.tsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SITE_URL = "https://askarc.chat";
const FROM_DOMAIN = "askarc.chat";
const ALLOWED_ORIGINS = new Set(["https://askarc.chat", "https://www.askarc.chat"]);
const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

function jsonResponse(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function validOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.port === "5173";
  } catch {
    return false;
  }
}

async function keyedRecipientHash(email: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(email)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin || !validOrigin(origin)) {
    return new Response("Forbidden", { status: 403, headers: { Vary: "Origin" } });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  let body: { email?: unknown; company?: unknown };
  try {
    const rawBody = await req.text();
    if (rawBody.length > 4096) return jsonResponse({ error: "Request too large" }, 413, origin);
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Invalid request" }, 400, origin);
    }
    body = parsed;
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400, origin);
  }

  // A quiet honeypot response prevents simple bot submissions without revealing
  // that the field is being checked.
  if (typeof body.company === "string" && body.company.trim()) {
    return jsonResponse({ ok: true }, 200, origin);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return jsonResponse({ error: "Enter a valid email address" }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceKey || !resendApiKey) {
    console.error("Desktop link email service is not configured");
    return jsonResponse({ error: "Email service is temporarily unavailable" }, 503, origin);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: suppressed, error: suppressionError } = await admin
    .from("suppressed_emails")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (suppressionError) {
    console.error("Desktop link suppression lookup failed", { code: suppressionError.code });
    return jsonResponse({ error: "Email service is temporarily unavailable" }, 503, origin);
  }
  if (suppressed) return jsonResponse({ ok: true }, 200, origin);

  const recipientHash = await keyedRecipientHash(email, serviceKey);
  const { data: allowed, error: rateLimitError } = await admin.rpc(
    "consume_desktop_link_email_request",
    { p_recipient_hash: recipientHash },
  );
  if (rateLimitError) {
    console.error("Desktop link rate limit failed", { code: rateLimitError.code });
    return jsonResponse({ error: "Email service is temporarily unavailable" }, 503, origin);
  }
  // Keep the response identical for suppressed and rate-limited addresses.
  if (!allowed) return jsonResponse({ ok: true }, 200, origin);

  try {
    const templateData = { displayName: "there", desktopUrl: `${SITE_URL}/downloads` };
    const html = await renderAsync(React.createElement(desktopLinkTemplate.component, templateData));
    const text = await renderAsync(React.createElement(desktopLinkTemplate.component, templateData), { plainText: true });
    const fromEmail = Deno.env.get("SEND_EMAIL_FROM") || `noreply@${FROM_DOMAIN}`;
    const from = fromEmail.includes("<") ? fromEmail : `ArcAI <${fromEmail}>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: desktopLinkTemplate.subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      console.error("Desktop link delivery provider rejected the request", { status: response.status });
      await admin.rpc("release_desktop_link_email_request", { p_recipient_hash: recipientHash });
      return jsonResponse({ error: "Email service is temporarily unavailable" }, 503, origin);
    }
  } catch (error) {
    console.error("Desktop link delivery failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    await admin.rpc("release_desktop_link_email_request", { p_recipient_hash: recipientHash });
    return jsonResponse({ error: "Email service is temporarily unavailable" }, 503, origin);
  }

  return jsonResponse({ ok: true }, 200, origin);
});
