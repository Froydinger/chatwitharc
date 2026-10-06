# Gated release candidate

This candidate supersedes the immediate-transition behavior in local commit `8bdf45b`. It remains isolated and undeployed. All SQL is in the single pending migration `20261006031918_monthly_image_policy.sql`; the transition/readiness gates apply in that same migration transaction. Do not apply the older commit's migration separately.

## Default and activation

The default mode is **staged**. Boost remains unlimited in quantity, preserving the previous entitlement until activation. Free has the approved Flare Low monthly policy. Admins remain unlimited. Lite readiness defaults **false**, including for admins and unlimited campaigns. No campaign is activated or created automatically.

After deployment approval and before activation, use an existing authorized service context to call `arc_image_transition_report()` read-only. The admin dashboard also displays counts and up to 200 missing/expired renewal-date exceptions. To inspect all exceptions, the existing service role can select the candidate function's full results. None of these previews fixes a cohort in place.

Approved activation uses the existing service client RPC:

```js
await supabaseAdmin.rpc('arc_image_activate_transition', {
  mode: 'grandfather',       // or 'immediate' only if explicitly chosen
  missing_date_action: 'reject', // 'finite' only after explicit decision
  confirmed: true,
});
```

This is a production write and must wait for the release/configuration approval. The migration does not call it.

Grandfather activation captures the then-current eligible Boost cohort and fixed expiry once. Existing monthly/annual active, trialing, past_due and canceled-through-period eligibility is preserved, including eligible Google Play active/grace/canceled-through-expiry subscriptions. Where multiple eligible subscriptions exist, the latest current expiry is used. No subscription rows, billing settings or webhooks are changed.

Missing dates block grandfather activation with `reject`; the transaction rolls back its candidate rows. The explicit `finite` decision gives these accounts finite credits rather than inventing an expiry. Expired dates are surfaced in the report and have no unlimited window. An immediate transition is an explicit decision to make all eligible users finite. No path grants perpetual access for a missing date.

Activation replays with the same choices return the same cohort. Different choices are rejected once captured. New upgrades after capture are finite. A downgrade loses the inherited bypass; a later reupgrade can use only the original still-valid expiry. Renewal webhooks and subscription period changes cannot extend the stored timestamp. At the exact expiry instant the normal UTC-calendar-month credits and optional refill apply. Existing reservations replay their original admission without causing another provider request; new stale-client requests are evaluated against current policy. Independent active campaigns can still provide temporary unlimited quantity after grandfather expiry, without unlocking Free models.

## Lite readiness gate

Read-only verification must use the **existing production Google account/key**, without retrieving it into chat, replacing it, creating grants or generating an image. Inspect existing secret-name presence with an already-authorized management context, then perform authenticated model metadata lookup for `models/gemini-3.1-flash-lite-image`. Check HTTP success and exact returned model name. Public documentation alone is not account verification. Record a redacted check reference and timestamp; never put credentials into evidence.

Only after approved verification may the existing service context enable readiness:

```js
await supabaseAdmin.rpc('arc_image_set_lite_readiness', {
  available: true,
  evidence: {
    model: 'gemini-3.1-flash-lite-image',
    method: 'account-model-lookup',
    reference: 'REDACTED_APPROVED_CHECK_REFERENCE',
    checkedAt: 'ACTUAL_UTC_CHECK_TIMESTAMP',
  },
  confirmed: true,
});
```

Enabling requires evidence from within the preceding 24 hours. The flag is a release-controlled assertion of account readiness, not an automatic provider health monitor. Disabling through the same service RPC is allowed with an explanatory evidence object. Routine authenticated admin settings cannot activate the rollout or change readiness. The browser hides unavailable Lite, clears a saved Lite choice to Flare Low, and blocks submission during the change. Both generation/edit handlers and SQL reservation enforce readiness, including stale clients. Provider health can still change after verification; provider errors remain explicit and no automatic paid retries are introduced.

Current verification: connected Supabase read-only tools confirm project `jpqtoixhjnfdubvqshwk` is ACTIVE_HEALTHY and deployed generation code contains existing OpenAI/Google paths. It does not contain Lite. Actual secret presence and authenticated Lite metadata lookup remain blocked by absent local CLI access token and lack of a connected secret-list capability. No readiness flag has been enabled. No real generation has been performed.

## Evidence and release order

- Disposable PostgreSQL tests compile the complete candidate migration and cover staged default, explicit immediate mode, immutable cohort, missing/expired dates, trials/cancellation/Google grace, downgrade/reupgrade, exact UTC expiry under a non-UTC session, renewal updates, campaign precedence, stale requests, browser privilege denial and Lite readiness rejection.
- Provider/config fixture tests: 10 passed / 0 failed. Changed endpoints type-check.
- Desktop/mobile UI fixtures verify concise picker balance/cost, exact Lite naming, disabled Lite fallback, full dashboard refill/transition details, and read-only admin release status. No external provider requests.
- Production frontend fixture build passes. Baseline TypeScript errors remain unchanged. Full unchanged-source shared suite reproduces 27 passed / 3 failed; test/media source bytes match `86a32b3`.

After approval: fetch/reconcile current main; run candidate checks; deploy reviewed source through the existing main integration; verify migration/function/frontend versions and staged snapshots; inspect the release-time renewal-date report; apply only approved transition/readiness configuration; verify actual snapshots and expiry behavior. Real provider/storage smoke tests require authorization for their paid calls. The existing iOS release thread owns bundling, signing and TestFlight. No deployment, configuration write, campaign activation, billing change or native packaging occurred here.

Public image branding has been retired in landing/pricing/modals, settings, docs/blogs, SEO/static HTML/llms.txt, source badges and provider error messages. Copy uses actual model names, while unavailable Lite remains hidden. No Image Studio product is introduced.
