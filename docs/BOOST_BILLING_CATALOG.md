# Boost purchase catalog — October 10, 2026

## Approved offers and preserved renewals

New website purchases use independent USD prices on the existing Boost product
`prod_UbSTljFnpRfR8v`:

| Interval | Amount | Lookup key | Verified live price |
| --- | --- | --- | --- |
| Monthly | $15/month | `arcai_boost_monthly_202610` | `price_1UOrq0AB32948AKDzDqPg1vp` |
| Annual | $115/year | `arcai_boost_annual_202610` | `price_1UOrqPAB32948AKDjnqWyyC4` |

The current price IDs were verified in Stripe by the release owner. The old
lookup keys and all existing subscriptions remain untouched, including $10/$95
and older $7/$65 prices. This change contains no subscription-item mutation,
price creation, lookup-key transfer, default-product change, portal reconfiguration
or migration of customer billing terms. Existing subscribers keep their current
price for renewals. Annual $115 is $9.58/month equivalent and approximately 36%
less than twelve $15 monthly payments; it is not a temporary annual discount.

Google Play remains its separate catalog with `arcai_boost_monthly` and
`arcai_boost_annual` SKUs. The store modal requires a localized returned price
before checkout. It never passes a Stripe lookup key to Play. Website pricing
copy is explicitly web-scoped; Play entry points defer to the actual store price.
No native product prices or binaries are changed. Boost Pro has only a name and
Coming soon tile, without a price, benefits, purchase action or entitlement.

## Contracts

`_shared/boostCatalog.ts` separates current purchase keys from grandfathered
entitlement aliases. Existing raw price IDs and server-verified recurring prices
on the known product still identify Boost. Product recognition is entitlement-only;
public Checkout accepts exactly the two new lookup keys and verifies the actual
Stripe price ID, product, currency, amount, recurring interval and active status.

Recognized old offer requests return a logical error with HTTP 200, code
`boost_pricing_changed`, and no URL/client secret. This deliberately lets existing
open clients display the refresh guidance rather than masking it with the SDK's
generic non-2xx error. No session is created and the amount is never silently changed.
Arbitrary unrecognized IDs still fail with HTTP 400.

Existing current subscriptions and active paid-through cancellations are directed
to management. Stripe history is paginated and must succeed before a new purchase;
old history prevents repeated trials. Verified current Play receipts prevent a
duplicate website purchase. No Stripe subscription is replaced or repriced.

The existing synchronous Checkout-return verification still retrieves the real
Stripe session. It recognizes old and new prices, preserves actual status,
item/subscription period dates and cancellation intent, and never invents a
subscription ID or active status. A saved old checkout cannot overwrite a different
current recognized account subscription. This read-before-write safeguard is not
an atomic cross-provider transaction. The existing webhook upsert conflict behavior
is retained; an expired customer re-subscribing may still depend on the return-page
verification if a webhook encounters the pre-existing unique-user row conflict.

## Infrastructure boundary and known limitation

The application keeps its existing hosted Stripe flow and shared server Stripe
client. Netlify serves the frontend; the repo invokes Supabase `create-checkout`.
The existing server client may route outgoing Stripe REST calls through the
Lovable connector gateway depending on the pre-existing credential format.

No credentials, webhook registration, signature algorithm, JWT configuration,
customer portal configuration or gateway path are changed. Deployed
`payments-webhook` v35 and its bundled `stripe.ts` were read-only verified against
the baseline behavior. That helper already accepts parsed payloads when its
expected signing-secret variable is absent. The absence of those variable names
in the dashboard does not establish that existing purchases are broken or prove
an upstream delivery contract. Actual live Stripe event delivery was not exercised.
Do not describe this release as a webhook-authentication fix, and do not introduce
new credential/configuration changes under a pricing rollout.

## Tests and release

- `node scripts/test-boost-billing-catalog.mjs`: real checkout/webhook handlers
  with isolated mocked Stripe, Supabase and email I/O; 38 functional groups.
- `node scripts/test-boost-billing-sql.mjs`: serial PGlite, 536 assertions across
  68 accounts, old/new identities and seven legacy renewal fixtures. No live
  Stripe/Play calls or concurrency claim.
- `_shared/boost-admin-email.test.ts`: mocked old/new entitlement interval and
  deduplicated notification tests.
- Pricing UI DOM checks cover $15/$115, grandfathering, localized Play prices,
  unchanged SKUs, missing-price rejection and the name-only Boost Pro tile.
- `scripts/test-gpt-aeo-contract.mjs` preserves semantic hidden content,
  structured data, title/canonical/robots/sitemap contracts and all 16 prerenders.

Apply `20261010051816_boost_price_catalog_v2.sql` before deploying
`create-checkout` and `payments-webhook`, then release matching frontend prices.
Keep existing JWT settings. The additive migration updates only recognition
functions, not subscription rows or image transition state. Keep both old/new
recognition and current-price-safe Checkout on every rollback after new purchases
are possible. Pause new checkout if needed instead of reverting to stale price
claims or losing a new subscriber's entitlement. See `GPT_MODEL_LINEUP.md` for the
combined model/usage release order.
