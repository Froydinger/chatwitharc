import { createClient } from "npm:@supabase/supabase-js@2.57.2";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Cache-Control": "no-store",
};
const reply = (v: unknown, status = 200) =>
  Response.json(v, { status, headers });
const digest = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ).map((n) => n.toString(16).padStart(2, "0")).join("");
const must = (r: any) => {
  if (r.error) throw new Error("Account operation failed");
  return r.data;
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    // The emailed random token is a narrowly scoped capability: appeal or delete this account only.
    if (typeof body.token === "string" && /^[a-f0-9]{64}$/.test(body.token)) {
      const job = must(
        await db.from("account_lifecycle").select("*").eq(
          "token_hash",
          await digest(body.token),
        ).maybeSingle(),
      );
      if (!job) {
        return reply({
          error: "This account-control link is invalid or has expired.",
        }, 404);
      }
      if (body.action === "status") {
        return reply({
          state: job.state,
          kind: job.kind,
          deleteAfter: job.delete_after,
          reason: job.reason,
          cleanupError: job.last_error,
        });
      }
      if (body.action === "appeal") {
        if (
          typeof body.message !== "string" || body.message.trim().length < 10 ||
          body.message.length > 5000
        ) {
          return reply({
            error: "Please enter an appeal between 10 and 5,000 characters.",
          }, 400);
        }
        const changed = must(
          await db.from("account_lifecycle").update({
            state: "appealed",
            appeal_text: body.message.trim(),
            delete_after: null,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id).in("state", [
            "notice_pending",
            "suspended",
            "held",
            "appealed",
          ]).select("id"),
        );
        if (!changed.length) {
          return reply({
            error:
              "Deletion has already started or this case is closed. Contact arc@froydinger.com.",
          }, 409);
        }
        return reply({ success: true });
      }
      if (body.action === "delete" && body.confirm === "DELETE") {
        const changed = must(
          await db.from("account_lifecycle").update({
            state: "deleting",
            delete_after: new Date().toISOString(),
            lease_until: null,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id).in("state", [
            "notice_pending",
            "suspended",
            "held",
            "appealed",
          ]).select("id"),
        );
        if (!changed.length) {
          return reply({ error: "This case cannot be changed." }, 409);
        }
        return reply({ success: true });
      }
      return reply({ error: "Invalid action" }, 400);
    }
    const token = (req.headers.get("Authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return reply({ error: "Sign in required" }, 401);
    const owner = must(
      await db.from("admin_users").select("is_primary_admin").eq(
        "user_id",
        user.id,
      ).maybeSingle(),
    );
    if (!owner?.is_primary_admin) {
      return reply({ error: "Owner access required" }, 403);
    }
    if (body.action === "list") {
      return reply({
        cases: must(
          await db.from("account_lifecycle").select(
            "id,email,state,kind,reason,appeal_text,delete_after,created_at,last_error",
          ).neq("state", "deleted").order("created_at", { ascending: false })
            .limit(100),
        ),
      });
    }
    if (body.action === "ban") {
      const flag = must(
        await db.from("content_review_flags").select("owner_id").eq(
          "id",
          body.flagId,
        ).single(),
      );
      const protectedUser = must(
        await db.from("admin_users").select("is_primary_admin").eq(
          "user_id",
          flag.owner_id,
        ).maybeSingle(),
      );
      if (flag.owner_id === user.id || protectedUser?.is_primary_admin) {
        return reply({ error: "Owner accounts cannot be banned" }, 400);
      }
      if (
        typeof body.reason !== "string" || body.reason.trim().length < 10 ||
        body.reason.length > 2000
      ) {
        return reply({
          error:
            "Enter a reason between 10 and 2,000 characters. It will be sent to the user.",
        }, 400);
      }
      const target = must(await db.auth.admin.getUserById(flag.owner_id))?.user;
      if (
        !target?.email ||
        body.confirmEmail?.toLowerCase() !== target.email.toLowerCase()
      ) return reply({ error: "Type the exact account email to confirm" }, 400);
      const existing = must(
        await db.from("account_lifecycle").select("id,state").eq(
          "user_id",
          target.id,
        ).maybeSingle(),
      );
      if (existing && existing.state !== "restored") {
        return reply({
          error: "This account already has an open case. Use Account actions.",
        }, 409);
      }
      if (existing) {
        must(
          await db.from("account_lifecycle").delete().eq("id", existing.id).eq(
            "state",
            "restored",
          ),
        );
      }
      const access = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      const emailHash = must(
        await db.rpc("account_email_hash", { p_email: target.email }),
      );
      const job = must(
        await db.from("account_lifecycle").insert({
          user_id: target.id,
          email: target.email,
          email_hash: emailHash,
          token_hash: await digest(access),
          kind: "ban",
          state: "notice_pending",
          reason: body.reason.trim(),
          created_by: user.id,
        }).select().single(),
      );
      must(
        await db.auth.admin.updateUserById(target.id, {
          ban_duration: "876000h",
        }),
      );
      must(await db.rpc("freeze_account_work", { p_user: target.id }));
      const key = Deno.env.get("RESEND_API_KEY");
      if (!key) {
        throw new Error("Account frozen; notice delivery needs attention");
      }
      const deadline = new Date(Date.now() + 30 * 86400000).toISOString();
      const from = Deno.env.get("SEND_EMAIL_FROM") ||
        "ArcAI <noreply@askarc.chat>";
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `account-ban-${job.id}`,
        },
        body: JSON.stringify({
          from,
          to: target.email,
          subject: "ArcAI account suspension — 30 days to appeal",
          text:
            `Your ArcAI account has been suspended by a human reviewer.\n\nReason: ${body.reason.trim()}\n\nYou have until ${deadline} to appeal. If you do not appeal, your account and Arc-held content will be deleted, and this account identity will remain blocked. An appeal pauses deletion for human review.\n\nAppeal or request immediate deletion using this private link:\nhttps://askarc.chat/account-appeal#${access}\n\nYou may also contact arc@froydinger.com. Google Play subscriptions must be cancelled in Google Play; Stripe renewals will be cancelled during deletion.\n\nWe retain only a blocked-account fingerprint after a finalized ban, not your chats or images.`,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!sent.ok) {
        return reply({
          error:
            "Account frozen, but the notice failed. No deletion is scheduled. Restore the account or contact support before retrying.",
        }, 503);
      }
      must(
        await db.from("account_lifecycle").update({
          state: "suspended",
          notice_sent_at: new Date().toISOString(),
          delete_after: deadline,
        }).eq("id", job.id).eq("state", "notice_pending"),
      );
      return reply({ success: true });
    }
    const job = must(
      await db.from("account_lifecycle").select("*").eq("id", body.id).single(),
    );
    if (!job.user_id || ["deleting", "deleted"].includes(job.state)) {
      return reply(
        { error: "Deletion has started or this case is closed" },
        409,
      );
    }
    if (body.action === "hold") {
      const rows = must(
        await db.from("account_lifecycle").update({
          state: "held",
          delete_after: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id).in("state", [
          "suspended",
          "appealed",
          "notice_pending",
          "held",
        ]).select("id"),
      );
      if (!rows.length) {
        return reply({ error: "Case changed; refresh before continuing" }, 409);
      }
    } else if (body.action === "restore") {
      // Hold first so the worker cannot claim deletion while Auth is restored.
      const rows = must(
        await db.from("account_lifecycle").update({
          state: "held",
          delete_after: null,
        }).eq("id", job.id).in("state", [
          "suspended",
          "appealed",
          "notice_pending",
          "held",
        ]).select("id"),
      );
      if (!rows.length) {
        return reply({ error: "Case changed; refresh before continuing" }, 409);
      }
      must(
        await db.auth.admin.updateUserById(job.user_id, {
          ban_duration: "none",
        }),
      );
      must(
        await db.from("account_lifecycle").update({
          state: "restored",
          reason: null,
          appeal_text: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id).eq("state", "held"),
      );
    } else if (body.action === "finalize") {
      if (body.confirmEmail?.toLowerCase() !== job.email?.toLowerCase()) {
        return reply({
          error: "Type the exact account email to finalize deletion",
        }, 400);
      }
      const rows = must(
        await db.from("account_lifecycle").update({
          state: "deleting",
          lease_until: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id).in("state", ["appealed", "held"]).select("id"),
      );
      if (!rows.length) {
        return reply(
          { error: "Hold or review the appeal before finalizing" },
          409,
        );
      }
    } else return reply({ error: "Invalid action" }, 400);
    return reply({ success: true });
  } catch (e) {
    return reply({
      error: e instanceof Error ? e.message : "Account operation failed",
    }, 503);
  }
});
