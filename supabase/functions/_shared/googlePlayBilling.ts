import type { SupabaseClient } from "npm:@supabase/supabase-js@2.89.0";

export const GOOGLE_PLAY_PACKAGE = "chat.askarc.android";
export const GOOGLE_PLAY_PRODUCT_IDS = new Set(["arcai_boost_monthly", "arcai_boost_annual"]);
const GOOGLE_PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

interface ServiceAccount {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
}

interface SubscriptionV2 {
  subscriptionState?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
}

export interface VerifiedGooglePlaySubscription {
  productId: string;
  state: string;
  expiryTime: string | null;
  autoRenewing: boolean;
  linkedPurchaseToken: string | null;
  isEntitled: boolean;
}

const ENTITLED_SUBSCRIPTION_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
]);

export function isGooglePlaySubscriptionEntitled(
  state: string | null | undefined,
  expiryTime: string | null | undefined,
  now = Date.now(),
): boolean {
  const expiryMs = expiryTime ? Date.parse(expiryTime) : Number.NaN;
  return ENTITLED_SUBSCRIPTION_STATES.has(state ?? "")
    && Number.isFinite(expiryMs)
    && expiryMs > now;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemBytes(value: string): ArrayBuffer {
  const stripped = value.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(stripped);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt - Date.now() > 60_000) return cachedAccessToken.token;

  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Google Play verification is not configured.");
  let account: ServiceAccount;
  try { account = JSON.parse(raw) as ServiceAccount; } catch { throw new Error("Google Play verification is not configured."); }
  if (!account.client_email || !account.private_key) throw new Error("Google Play verification is not configured.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: OAUTH_SCOPE,
    aud: account.token_uri || OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })));
  const unsigned = `${header}.${claims}`;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemBytes(account.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch { throw new Error("Google Play verification is not configured."); }
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(account.token_uri || OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("Google Play verification is temporarily unavailable.");
  const tokenData = await response.json() as { access_token?: string; expires_in?: number };
  if (!tokenData.access_token) throw new Error("Google Play verification is temporarily unavailable.");
  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + Math.max(60, tokenData.expires_in ?? 3600) * 1000,
  };
  return tokenData.access_token;
}

async function googleApi(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${GOOGLE_PLAY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function verifyAndStoreGooglePlaySubscription(
  db: SupabaseClient,
  userId: string,
  productId: string,
  purchaseToken: string,
): Promise<VerifiedGooglePlaySubscription> {
  if (!GOOGLE_PLAY_PRODUCT_IDS.has(productId)) throw new Error("Unsupported Google Play product.");
  if (!purchaseToken || purchaseToken.length > 8192) throw new Error("Invalid Google Play purchase receipt.");

  const encodedPackage = encodeURIComponent(GOOGLE_PLAY_PACKAGE);
  const encodedReceipt = encodeURIComponent(purchaseToken);
  const subscriptionResponse = await googleApi(
    `/applications/${encodedPackage}/purchases/subscriptionsv2/tokens/${encodedReceipt}`,
  );
  if (!subscriptionResponse.ok) throw new Error("Google Play could not verify this purchase receipt.");
  const details = await subscriptionResponse.json() as SubscriptionV2;
  const lineItem = details.lineItems?.find(item => item.productId === productId);
  if (!lineItem) throw new Error("Google Play purchase does not match this subscription.");

  const expiryMs = lineItem.expiryTime ? Date.parse(lineItem.expiryTime) : Number.NaN;
  const expiryTime = Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null;
  const isEntitled = isGooglePlaySubscriptionEntitled(details.subscriptionState, expiryTime);

  const { data: existing, error: existingError } = await db.from("google_play_subscriptions")
    .select("user_id").eq("purchase_token", purchaseToken).maybeSingle();
  if (existingError) throw new Error("Google Play receipt ownership could not be checked.");
  if (existing && existing.user_id !== userId) throw new Error("This Google Play purchase is linked to another ArcAI account.");

  if (details.linkedPurchaseToken) {
    const { data: linked, error: linkedError } = await db.from("google_play_subscriptions")
      .select("user_id").eq("purchase_token", details.linkedPurchaseToken).maybeSingle();
    if (linkedError) throw new Error("Google Play subscription ownership could not be checked.");
    if (linked && linked.user_id !== userId) throw new Error("This Google Play subscription is linked to another ArcAI account.");
  }

  if (isEntitled && details.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    const acknowledgement = await googleApi(
      `/applications/${encodedPackage}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodedReceipt}:acknowledge`,
      { method: "POST", body: JSON.stringify({}) },
    );
    if (!acknowledgement.ok) throw new Error("Google Play purchase acknowledgement failed. Try Restore purchases.");
  }

  const verified: VerifiedGooglePlaySubscription = {
    productId,
    state: details.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED",
    expiryTime,
    autoRenewing: lineItem.autoRenewingPlan?.autoRenewEnabled === true,
    linkedPurchaseToken: details.linkedPurchaseToken ?? null,
    isEntitled,
  };
  const { error: saveError } = await db.from("google_play_subscriptions").upsert({
    purchase_token: purchaseToken,
    user_id: userId,
    product_id: verified.productId,
    subscription_state: verified.state,
    expiry_time: verified.expiryTime,
    auto_renewing: verified.autoRenewing,
    linked_purchase_token: verified.linkedPurchaseToken,
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "purchase_token" });
  if (saveError) throw new Error("Google Play subscription could not be saved.");
  return verified;
}

export async function syncStoredGooglePlaySubscriptions(db: SupabaseClient, userId: string): Promise<number> {
  const { data: receipts, error } = await db.from("google_play_subscriptions")
    .select("purchase_token,product_id,last_verified_at")
    .eq("user_id", userId);
  if (error) throw new Error("Google Play subscriptions could not be loaded.");

  let refreshed = 0;
  for (const receipt of receipts ?? []) {
    const lastVerifiedAt = Date.parse(receipt.last_verified_at ?? "");
    if (Number.isFinite(lastVerifiedAt) && Date.now() - lastVerifiedAt < 5 * 60_000) continue;
    await verifyAndStoreGooglePlaySubscription(db, userId, receipt.product_id, receipt.purchase_token);
    refreshed += 1;
  }
  return refreshed;
}
