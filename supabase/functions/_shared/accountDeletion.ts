import { createStripeClient } from "./stripe.ts";
// All operations are idempotent. Never report completion until Auth deletion succeeds.
export async function eraseAccount(db: any, userId: string, email: string) {
  const must = (result: any) => {
    if (result.error) throw new Error("Account cleanup step failed");
    return result.data;
  };
  const owner = must(
    await db.from("admin_users").select("is_primary_admin").eq(
      "user_id",
      userId,
    ).maybeSingle(),
  );
  if (owner?.is_primary_admin) {
    throw new Error("Transfer account ownership before deleting this account");
  }
  const subscriptions = must(
    await db.from("subscriptions").select("stripe_subscription_id,environment")
      .eq("user_id", userId),
  );
  for (const sub of subscriptions ?? []) {
    if (!sub.stripe_subscription_id) continue;
    // Sandbox records never create real charges; missing test credentials must
    // not prevent a person from deleting their production Arc account.
    if (sub.environment === "sandbox" && !Deno.env.get("STRIPE_SANDBOX_API_KEY")) continue;
    const stripe = createStripeClient(
      sub.environment === "sandbox" ? "sandbox" : "live",
    );
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch (e: any) {
      if (e?.code !== "resource_missing") {
        throw new Error("Subscription cancellation failed");
      }
    }
  }
  // Hosted projects are personal data too. Only delete sites associated with this account.
  const sites = must(
    await db.from("published_sites").select("netlify_site_id,subdomain").eq(
      "user_id",
      userId,
    ),
  );
  const publications = must(
    await db.from("cloud_app_publications").select("site_id,subdomain").eq(
      "user_id",
      userId,
    ),
  );
  for (
    const id of new Set([
      ...sites.map((s: any) => s.netlify_site_id),
      ...publications.map((s: any) => s.site_id),
    ].filter(Boolean))
  ) {
    if (id === "2cbbc91b-c858-42d1-8198-e7b5450a2c63") {
      throw new Error("Protected site");
    }
    const key = Deno.env.get("NETLIFY_ACCESS_TOKEN");
    if (!key) throw new Error("Hosted-site cleanup unavailable");
    const otherSites = must(
      await db.from("published_sites").select("id").eq("netlify_site_id", id)
        .neq("user_id", userId),
    );
    const otherReceipts = must(
      await db.from("cloud_app_publications").select("run_id").eq("site_id", id)
        .neq("user_id", userId),
    );
    if (otherSites.length || otherReceipts.length) {
      throw new Error("Hosted-site ownership requires review");
    }
    const remote = await fetch(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(String(id))}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (remote.status === 404) continue;
    if (!remote.ok) throw new Error("Hosted-site verification failed");
    const metadata = await remote.json();
    const names = [
      ...sites.filter((s: any) => s.netlify_site_id === id),
      ...publications.filter((s: any) => s.site_id === id),
    ].map((s: any) => `${s.subdomain}.askarc.chat`);
    if (
      !names.includes(metadata.custom_domain) ||
      metadata.custom_domain === "askarc.chat"
    ) throw new Error("Hosted-site ownership requires review");
    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${encodeURIComponent(String(id))}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error("Hosted-site cleanup failed");
    }
  }
  // Iterate from offset zero after each deletion: no skipped rows, folder depth or 1000-file cap.
  for (let batch = 0; batch < 50; batch++) {
    const objects = must(
      await db.rpc("account_owned_objects", { p_user: userId }),
    );
    if (!objects.length) break;
    const buckets = new Set<string>(objects.map((o: any) => o.bucket_id));
    for (const bucket of buckets) {
      must(
        await db.storage.from(bucket).remove(
          objects.filter((o: any) => o.bucket_id === bucket).map((o: any) =>
            o.name
          ),
        ),
      );
    }
    if (batch === 49) {
      throw new Error("More files remain; cleanup will continue");
    }
  }
  const worker = Deno.env.get("R2_WORKER_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("R2_WORKER_SECRET");
  if (!worker || !secret) throw new Error("Legacy image cleanup unavailable");
  let cursor: string | null = null;
  do {
    const url = new URL(`${worker}/admin/list`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error("Legacy image inventory failed");
    const page = await res.json();
    for (const object of page.objects ?? []) {
      if (
        typeof object.key !== "string" || !object.key.startsWith(`${userId}/`)
      ) continue;
      const removed = await fetch(
        `${worker}/objects/${
          object.key.split("/").map(encodeURIComponent).join("/")
        }`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!removed.ok && removed.status !== 404) {
        throw new Error("Legacy image cleanup failed");
      }
    }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  must(await db.rpc("erase_account_rows", { p_user: userId, p_email: email }));
  const deleted = await db.auth.admin.deleteUser(userId);
  if (deleted.error && deleted.error.status !== 404) {
    throw new Error("Auth deletion failed");
  }
}
