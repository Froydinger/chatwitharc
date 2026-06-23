// Deletes anonymous Supabase users older than 2 hours. Intended to be
// invoked on a schedule (pg_cron) and also callable on demand to purge
// the existing backlog of ghost guest accounts.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Optional override via body: { maxAgeHours: number, purgeAll: boolean }
  let maxAgeHours = 2;
  let purgeAll = false;
  try {
    const body = await req.json();
    if (body && typeof body.maxAgeHours === "number") maxAgeHours = body.maxAgeHours;
    if (body && body.purgeAll === true) purgeAll = true;
  } catch {
    /* no body — use defaults */
  }

  const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  let scanned = 0;
  let errors = 0;
  let page = 1;
  const perPage = 1000;

  // Iterate auth.users via admin API. is_anonymous flag is on the user record.
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("listUsers error:", error);
      errors++;
      break;
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;
    scanned += users.length;

    for (const u of users) {
      // @ts-ignore - is_anonymous is on the user object
      if (!u.is_anonymous) continue;
      const createdAt = u.created_at ? new Date(u.created_at).getTime() : 0;
      if (!purgeAll && createdAt > cutoffMs) continue;

      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) {
        console.error("deleteUser failed", u.id, delErr.message);
        errors++;
      } else {
        deleted++;
      }
    }

    if (users.length < perPage) break;
    page++;
    if (page > 50) break; // safety cap (50k users)
  }

  const result = { deleted, scanned, errors, maxAgeHours, purgeAll };
  console.log("cleanup-anonymous-users result:", result);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
