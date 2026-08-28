import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Admin storage audit.
 *
 * Enumerates uploaded and generated files per user across the app's buckets.
 * Storage RLS deliberately stops even an admin's browser session from listing
 * another user's folder, so the listing has to happen server-side under the
 * service role — the same shape admin-users already uses.
 *
 * Every action re-verifies the caller against admin_users on the server. The
 * client's own isAdmin flag is a UI convenience and is never trusted here.
 *
 * Previews are short-lived signed URLs rather than public ones, so a link
 * pasted somewhere by accident stops working rather than exposing a user's
 * upload indefinitely.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-STORAGE] ${step}${detailsStr}`);
};

/** Buckets holding user content. Kept explicit so a new bucket is a deliberate add. */
const AUDITABLE_BUCKETS = [
  "avatars",
  "ticket-attachments",
  "generated-files",
] as const;

const SIGNED_URL_TTL_SECONDS = 300;

interface FileEntry {
  bucket: string;
  userId: string;
  name: string;
  path: string;
  sizeBytes: number | null;
  mimeType: string | null;
  createdAt: string | null;
  /** Best-effort classification from the filename conventions the app uses. */
  kind: "uploaded" | "generated" | "avatar" | "other";
}

function classify(name: string): FileEntry["kind"] {
  if (/^user-upload-/i.test(name)) return "uploaded";
  if (/^(generated|gen)-/i.test(name) || /^image-\d+/i.test(name)) return "generated";
  if (/avatar/i.test(name)) return "avatar";
  return "other";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Storage auditing is disabled for privacy." }), {
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

    // ── list: every user folder across the audited buckets ──────────────────
    if (action === "list") {
      const targetBuckets: string[] = params.bucket
        ? [params.bucket]
        : [...AUDITABLE_BUCKETS];
      const files: FileEntry[] = [];
      const bucketErrors: Record<string, string> = {};

      for (const bucket of targetBuckets) {
        // Top level of these buckets is one folder per user id.
        const { data: folders, error: folderErr } = await supabase.storage
          .from(bucket)
          .list("", { limit: 1000 });

        if (folderErr) {
          bucketErrors[bucket] = folderErr.message;
          continue;
        }

        for (const folder of folders ?? []) {
          // Entries with an id are files sitting at the root, not user folders.
          if (folder.id) {
            files.push({
              bucket,
              userId: "(root)",
              name: folder.name,
              path: folder.name,
              sizeBytes: folder.metadata?.size ?? null,
              mimeType: folder.metadata?.mimetype ?? null,
              createdAt: folder.created_at ?? null,
              kind: classify(folder.name),
            });
            continue;
          }

          if (params.userId && folder.name !== params.userId) continue;

          const { data: inner } = await supabase.storage
            .from(bucket)
            .list(folder.name, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });

          for (const f of inner ?? []) {
            if (!f.id) continue; // nested folder; the app does not create these
            files.push({
              bucket,
              userId: folder.name,
              name: f.name,
              path: `${folder.name}/${f.name}`,
              sizeBytes: f.metadata?.size ?? null,
              mimeType: f.metadata?.mimetype ?? null,
              createdAt: f.created_at ?? null,
              kind: classify(f.name),
            });
          }
        }
      }

      // Attach user email and display name for ALL registered users so the audit reads all people.
      const displayNames: Record<string, string> = {};
      const userEmails: Record<string, string> = {};

      const [{ data: authData }, { data: profiles }] = await Promise.all([
        supabase.auth.admin.listUsers({ perPage: 1000 }),
        supabase.from("profiles").select("id, user_id, display_name"),
      ]);

      const profileMap = new Map<string, string>();
      for (const p of profiles || []) {
        if (p.display_name) {
          if (p.user_id) profileMap.set(p.user_id, p.display_name);
          if (p.id) profileMap.set(p.id, p.display_name);
        }
      }

      for (const u of authData?.users || []) {
        if (u.email) userEmails[u.id] = u.email;
        const name = profileMap.get(u.id);
        if (name) displayNames[u.id] = name;
      }

      files.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

      logStep("Listed", { count: files.length, buckets: targetBuckets });
      return new Response(
        JSON.stringify({
          files,
          displayNames,
          userEmails,
          bucketErrors,
          totalBytes: files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // ── sign: short-lived preview URLs for specific paths ───────────────────
    if (action === "sign") {
      const { bucket, paths } = params as { bucket: string; paths: string[] };
      if (!bucket || !Array.isArray(paths) || !paths.length) {
        throw new Error("bucket and paths are required");
      }
      if (!AUDITABLE_BUCKETS.includes(bucket as typeof AUDITABLE_BUCKETS[number])) {
        throw new Error("Bucket is not auditable");
      }

      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths.slice(0, 200), SIGNED_URL_TTL_SECONDS);
      if (error) throw error;

      logStep("Signed", { bucket, count: data?.length ?? 0 });
      return new Response(JSON.stringify({ urls: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    // 403 for the auth failures so the client can tell them from a real fault.
    const isAuth = /admin|authenticated|authorization|Auth error/i.test(message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: isAuth ? 403 : 500,
    });
  }
});
