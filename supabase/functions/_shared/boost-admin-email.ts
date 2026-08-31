type StripeEnv = "sandbox" | "live";

const BOOST_PLAN_NAMES: Record<string, string> = {
  arcai_boost_monthly: "ArcAI Boost Monthly",
  arcai_boost_annual: "ArcAI Boost Annual",
};

interface BoostAdminEmailOptions {
  userId: string;
  subscriptionId: string;
  priceId: string | null;
  environment: StripeEnv;
  subscriberEmail?: string | null;
  displayName?: string | null;
}

export function isBoostPriceId(
  priceId: string | null,
): priceId is keyof typeof BOOST_PLAN_NAMES {
  return !!priceId && Object.hasOwn(BOOST_PLAN_NAMES, priceId);
}

export function getBoostPlanName(priceId: string | null): string {
  return (priceId && BOOST_PLAN_NAMES[priceId]) || "ArcAI Boost";
}

export function getStripeSubscriptionUrl(subscriptionId: string): string {
  return `https://dashboard.stripe.com/subscriptions/${
    encodeURIComponent(subscriptionId)
  }`;
}

export function shouldSendBoostAdminEmail(
  environment: StripeEnv,
  priceId: string | null,
): boolean {
  return environment === "live" && isBoostPriceId(priceId);
}

export function getBoostAdminIdempotencyKey(subscriptionId: string): string {
  return `admin-boost-upgraded:${subscriptionId}`;
}

/**
 * Send one owner-facing notification for a newly activated live Boost
 * subscription. The same idempotency key is used by the checkout-return and
 * webhook paths so ordinary Stripe retries do not create duplicate emails.
 */
export async function sendBoostAdminEmail(
  options: BoostAdminEmailOptions,
): Promise<void> {
  if (!shouldSendBoostAdminEmail(options.environment, options.priceId)) {
    return;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = Deno.env.get("ADMIN_EMAIL");

  if (!supabaseUrl || !serviceKey || !adminEmail) {
    console.warn("[boost-admin-email] required email configuration is missing");
    return;
  }

  const displayName = options.displayName?.trim();
  const subscriberEmail = options.subscriberEmail?.trim();
  const subscriber = displayName && subscriberEmail
    ? `${displayName} (${subscriberEmail})`
    : displayName || subscriberEmail || `User ${options.userId}`;

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-transactional-email`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateName: "arc-notification",
          recipientEmail: adminEmail,
          idempotencyKey: getBoostAdminIdempotencyKey(options.subscriptionId),
          templateData: {
            title: "New ArcAI Boost subscriber",
            message: `${subscriber} activated ${
              getBoostPlanName(options.priceId)
            }.`,
            url: getStripeSubscriptionUrl(options.subscriptionId),
            ctaLabel: "View subscription",
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn("[boost-admin-email] notification failed", {
        subscriptionId: options.subscriptionId,
        status: response.status,
        text: await response.text(),
      });
    }
  } catch (error) {
    console.warn("[boost-admin-email] notification threw", {
      subscriptionId: options.subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
