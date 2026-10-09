# Polling efficiency release

## Scope and baseline

Base: `14c650d75a8f3e1f722885cb4292e183295ed728` (verified deployed Netlify frontend and all bundled sources for cloud-worker v68, run-scheduled-tasks v39, browserbase-cleanup v16).

- One profile cache per AuthProvider: shared reads, same-account auth-event deduplication, generation-fenced callbacks, serialized writes, signup/onboarding invalidation, visible focus/online revalidation at most once per minute. No profile polling.
- Desktop notifications: one ref-counted account-owned delivery controller; INSERT signals, initial/reconnect/focus backlog recovery, conditional `delivered_at IS NULL` claims, teardown/account fences, bounded fallback during outage. Healthy idle performs no notification SELECTs.
- Existing minute cron jobs retain their schedules. Their three SQL invoke functions return before HTTP unless eligible cloud runs/completion outboxes, active due scheduled tasks, or reclaimable browser sessions exist. Existing claims and delivery semantics remain unchanged. The cloud-worker gate conservatively also preserves wakes for active due scheduled tasks and pending durable scheduled delivery leases because its runtime feature flags cannot be read from SQL; it never enables that optional dispatcher.
- No Edge Function source changes, billing changes, blanket log suppression, scheduled-worker cutover, or unrelated archived Mac changes.

## Reproducible checks

Install application dependencies with `npm ci`. This cloud executor used `npm_config_cache=/tmp/arc-npm-cache npm ci --ignore-scripts` because its default home cache was unavailable.

```
node scripts/test-profile-cache.mjs
node --test src/lib/desktopNotificationDelivery.test.mjs src/hooks/usePushNotifications.test.mjs
node --test src/services/cloudRunLifecycle.test.mjs src/services/cloudRuns.test.mjs src/services/cloudSessionPersistence.test.mjs src/services/cloudSessionChanges.test.mjs src/hooks/useCloudRuns.test.mjs src/services/cloudAppRuns.test.mjs
npm install --prefix /tmp/arc-db-tests --ignore-scripts @electric-sql/pglite@0.5.8
TEST_PGLITE_MODULE=/tmp/arc-db-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/idleWorkerWakeups.test.mjs
TEST_PGLITE_MODULE=/tmp/arc-db-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/desktopNotificationsRealtime.test.mjs
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npm run build
```

Production builds require `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Compilation was checked using the project URL and a non-secret fixture key, without calling production. Deploy through the existing environment configuration, never ship the fixture key.

SQL checks execute the actual migration bodies and existing claim functions in disposable Postgres WASM. `net.http_post` is a recording stub: 51 eligibility/recovery scenarios plus rollback, publication/RLS/account-isolation/conditional-claim checks. They do not prove the remote Realtime transport, native OS notification display, or multi-connection lock behavior. Existing atomic claim implementations were not changed.

Baseline on untouched main: full lint reports 640 errors / 90 warnings; full app TypeScript stops on existing JSX parse errors in unused `AdminSettingsPanel.tsx`. Configured production build passes. Compare final diagnostics against this baseline; do not describe the full repository as lint/type-clean.

## Verification results

- Configured production build: PASS on untouched base and final source.
- Profile production-cache/AuthProvider regression script: PASS, including initial offline failure followed by online recovery before the normal refresh cooldown.
- Desktop delivery controller + actual adapter: 17/17 PASS.
- Existing cloud lifecycle/transport/persistence/run tests: 50/50 PASS.
- SQL guards: 51/51 scenarios PASS, plus executable original-function rollback.
- Publication SQL: repeat apply/rollback, preserved existing member, RLS/owner isolation, conditional at-most-once claims and anon denial PASS.
- Focused TypeScript for modified frontend dependency closures: PASS. Profile/controller focused ESLint: 0 errors; existing AuthProvider fast-refresh warning remains. The notification hook retains 7 pre-existing unrelated web-push `any` errors, down from 11.
- Full lint: 632 errors / 88 warnings, compared with 640 / 90 on untouched base; no new lint violations.
- Full app TypeScript: identical baseline AdminSettingsPanel JSX parse failures.
- Additional existing UI/app/store suite: 65/78 pass on both base and final; the same 13 store-fixture tests lack `mergeOrdinaryChatTurns` / `discardOrdinaryChatTurns` mocks. Composer aggregate fails identically on base/final because its fixture lacks `useImageGenStore`. These unrelated fixtures were not modified to manufacture a green result.
- Native desktop display, live authenticated reconnect and remote multi-connection concurrency were not run during implementation. SQL uses disposable fixtures and HTTP stubs.

## Release order and safety

1. Recheck remote main is still the base and local scoped diff is the reviewed revision. Snapshot the three live invoke definitions and publication membership before release. Confirm all three minute jobs remain active and no unrelated deployment is pending.
2. This repository documents main push as a release trigger for Netlify plus Supabase functions/migrations. Verify each integration's actual deployment result; a successful Git push alone is not deployment evidence. Parent coordinates release; no push or live SQL was performed during implementation.
3. Apply/verify `20261009220000_gate_idle_worker_wakeups` and `20261009220100_desktop_notifications_realtime` through the established migration integration. Do not blindly run migrations separately while that integration is deploying them. Both changes are repeat-safe; no data rewrite occurs.
4. Verify frontend deployment SHA and successful build. Database-first is preferred, but either order remains compatible: old frontend still polls after publication is added; new frontend uses bounded fallback until replication is ready.
5. Recheck active minute jobs and matching function definitions. During a genuinely idle interval, expect no HTTP worker wakes. With eligible work, verify advancement/settlement continues after closing the app. Do not create production runs or send external messages solely for a smoke test without an approved test fixture/account.
6. In an approved desktop test account, verify notification arrival, reconnect/focus backlog delivery, duplicate claim protection across two windows, sign-out/account-switch fencing, and zero healthy-idle desktop queries after Postgres Changes readiness. Verify profile read count is independent of visible MessageBubble count, profile edits update all consumers, and logout clears cached data.

## Publication security

The publication adds only `public.desktop_notifications`. Existing authenticated SELECT/UPDATE/DELETE policies remain owner-bound via `auth.uid() = user_id`; anon has no SELECT grant. The client also applies explicit owner predicates and treats Realtime payloads as wakeup signals, fetching authorized backlog rather than displaying event payloads. No RLS, grants, replica identity, or other publication members change.

## Rollback

- Frontend: redeploy the previous verified Netlify deploy or revert only the scoped frontend commit and release normally. The additive publication can safely remain while old frontend polls.
- Worker gates: execute `docs/qa/idle-worker-wakeups-rollback.sql` through the approved database release path. It restores the exact three original invoke definitions and permissions, leaving cron schedules/outbox state/claim functions unchanged. Tested to restore three idle HTTP wakeups.
- If fully removing this publication addition, first restore the old frontend and verify no new consumer relies on it; then use `docs/qa/desktop-notifications-realtime-rollback.sql`. It drops only that table from the publication and is repeat-safe. Never delete notification rows as a rollback.
- Record rollback as a new forward migration in repository history before the next automated database release; do not delete already-applied migration records.

## Bounded follow-up finding

Active run observation still polls cloud-run status every 1.5 seconds. The client uses `getSession`, while the server's cloud-run endpoint verifies `auth.getUser(token)` per request. This can produce about 40 auth verifications per minute per actively observed run. Verification is a security boundary and remains unchanged. A future event-driven status observation design should preserve server verification and account fences rather than simply removing them.
