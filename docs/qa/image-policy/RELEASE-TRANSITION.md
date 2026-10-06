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

The existing service context can enable readiness after approved account verification or an explicit owner-reported account-access assertion:

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

Enabling requires evidence from within the preceding 24 hours; method owner-reported records an explicit owner assertion rather than a performed lookup. The flag is a release-controlled assertion of account readiness, not an automatic provider health monitor. Disabling through the same service RPC is allowed with an explanatory evidence object. Routine authenticated admin settings cannot activate the rollout or change readiness. The browser hides unavailable Lite, clears a saved Lite choice to Flare Low, and blocks submission during the change. Both generation/edit handlers and SQL reservation enforce readiness, including stale clients. Provider health can still change after verification; provider errors remain explicit and no automatic paid retries are introduced.

Current verification: connected Supabase read-only tools confirm project `jpqtoixhjnfdubvqshwk` is ACTIVE_HEALTHY and deployed generation code contains existing OpenAI/Google paths. It does not contain Lite. Actual secret presence and authenticated Lite metadata lookup were not verified; attempts were blocked by absent local CLI access token and lack of a connected secret-list capability. The release is authorized to enable readiness from the owner-reported assertion documented below. No real generation has been performed.

## Evidence and release order

- Disposable PostgreSQL tests compile the complete candidate migration and cover staged default, explicit immediate mode, immutable cohort, missing/expired dates, trials/cancellation/Google grace, downgrade/reupgrade, exact UTC expiry under a non-UTC session, renewal updates, campaign precedence, stale requests, browser privilege denial and Lite readiness rejection.
- Provider/config fixture tests: 10 passed / 0 failed. Changed endpoints type-check.
- Desktop/mobile UI fixtures verify concise picker balance/cost, exact Lite naming, disabled Lite fallback, full dashboard refill/transition details, and read-only admin release status. No external provider requests.
- Production frontend fixture build passes. Baseline TypeScript errors remain unchanged. Full unchanged-source shared suite reproduces 27 passed / 3 failed; test/media source bytes match `86a32b3`.

After approval: fetch/reconcile current main; run candidate checks; deploy reviewed source through the existing main integration; verify migration/function/frontend versions and staged snapshots; inspect the release-time renewal-date report; apply only approved transition/readiness configuration; verify actual snapshots and expiry behavior. Real provider/storage smoke tests require authorization for their paid calls. The existing iOS release thread owns bundling, signing and TestFlight. No deployment, configuration write, campaign activation, billing change or native packaging occurred here.

Public image branding has been retired in landing/pricing/modals, settings, docs/blogs, SEO/static HTML/llms.txt, source badges and provider error messages. Copy uses actual model names, while unavailable Lite remains hidden. No Image Studio product is introduced.

## Owner-confirmed grant classification correction

Jake confirmed that Frank and Bilbo were granted through Stripe and asked us to preserve their access rather than treat absent dates as unpaid/unverified renewals. The policy singleton accepts only their two existing user UUIDs as server-controlled transition exclusions; its migration default is empty, and approved release configuration resolves those UUIDs from their confirmed account emails. This metadata does not create or modify a tier grant, subscription, billing record, or signup behavior. On approved activation they retain their existing Boost tier and receive the ordinary 250 monthly image credits and optional refill, with no fabricated paid-renewal expiry.

Existing account_entitlement_grants lifetime Boost records are likewise classified as granted tier access, not year-9999 paid renewals. Their cohort expiry is NULL with status grant; no permanent unlimited image bypass is inherited. The pre-provisioned lifetime signup trigger is unchanged. An unclassified year-9999 sentinel is instead surfaced as missing and blocks default activation. There is no automatic perpetual transition. Admin quantity bypass and independent authorized campaigns remain unchanged.

Read-only simulation at 2026-10-06 04:58:52 UTC: 4 grants, 1 ordinary future renewal, 1 expired admin promotion, 0 missing renewal dates. The formerly missing accounts no longer require Stripe connection or payment verification. The expired promo is still reported and receives finite image quantities under activation; tier records are untouched. Deployment/transition approval and Lite account readiness remain pending.

## Edit routing

Free edits use Flare Low. Normal Boost UI edits use the selected model; a fresh picker starts with Flare Low, and valid saved choices remain. Work edits default to Sunburst High. Builder edits use Flare Low unless the actual user explicitly asks for better images, then Sunburst High. Transparent edits require Flare/Sunburst; Google requests are rejected with switch guidance. Costs per output are Flare Low1, Flare Medium1 square/2 larger or source, Sunburst High4 square/6 larger or source, Lite3, full Nano5. Builder uses separate safety caps.

The precision-edit modal had an old hardcoded Sunburst route and dropped captured quality in its event handler. This candidate makes it honor the same resolved tier/model selection and forwards captured quality through ChatInput to the edit service. The edit modal also uses the concise balance summary.

Final grant/edit validation: disposable SQL policy tests PASS; browser fixtures PASS including Free/Boost precision edit event model and quality capture; production fixture build PASS; targeted ESLint PASS; final edit TSX parse PASS; excluded-file TypeScript check retains exactly the baseline 47 error signatures, with no additions.

## Approved release configuration

Jake authorized deployment and explicitly instructed us to assume their existing Google account has Lite access. Enable Lite using method `owner-reported`, reference `main-chat/Sentinel_4feee15ae7808191947b65de3f20b159`, and their actual assertion timestamp `2026-10-06T05:03:06Z`. This is owner-reported access, not an authenticated metadata or paid runtime test. The service release gate accepts that explicit assertion; no new key, grant, account connection, purchase, or paid generation is required. Earlier readiness-wait instructions above are historical and superseded by this owner instruction. The approved release uses `grandfather` with default `reject` for genuinely missing dates; owner-confirmed and lifetime grants are classified separately and finite after activation.

Backend integration observation: main push updated the frontend, but the migration and functions did not update. Complete the approved backend release using the existing authorized Supabase management connection, preserve existing gateway authentication flags, verify installed sources before activation, and record the actual migration version returned by the management tool.
