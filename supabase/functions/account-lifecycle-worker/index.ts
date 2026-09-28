import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { eraseAccount } from "../_shared/accountDeletion.ts";
Deno.serve(async (req) => {
  const secret = Deno.env.get("CONTENT_REVIEW_CRON_SECRET");
  if (
    req.method !== "POST" || !secret ||
    req.headers.get("x-cron-secret") !== secret
  ) return new Response("Unauthorized", { status: 401 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: jobs, error } = await db.rpc("claim_account_deletions");
  if (error) {
    return Response.json({ error: "Unable to claim work" }, { status: 503 });
  }
  let completed = 0;
  for (const job of jobs ?? []) {
    try {
      await eraseAccount(db, job.user_id, job.email);
      const { error } = await db.from("account_lifecycle").update({
        state: "deleted",
        user_id: null,
        email: null,
        reason: null,
        appeal_text: null,
        created_by: null,
        lease_until: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("state", "deleting");
      if (error) throw error;
      completed++;
    } catch {
      await db.from("account_lifecycle").update({
        last_error: "Deletion incomplete; automatic retry pending",
        lease_until: new Date(Date.now() + 300000).toISOString(),
      }).eq("id", job.id).eq("state", "deleting");
    }
  }
  // Self-deletion receipts expire; ban fingerprints remain only to prevent re-registration.
  await db.from("account_lifecycle").delete().eq("kind", "self_delete").eq(
    "state",
    "deleted",
  ).lt("updated_at", new Date(Date.now() - 86400000).toISOString());
  await db.from("account_lifecycle").delete().eq("state", "restored")
    .lt("updated_at", new Date(Date.now() - 86400000).toISOString());
  return Response.json({ completed });
});
