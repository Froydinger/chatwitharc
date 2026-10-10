# Cloud app completion lease conflict

## Reviewed scope

Base: `22251af7bd8e13606a98ab075162a6efd4e25437`.

The September 26 worker-permissions migration reintroduced SQLSTATE `40001` for the deterministic `Completion lease expired` exception in `public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb)`. The October 10 live preflight confirmed one occurrence and a function body byte-identical to that migration. The nested `complete_cloud_run` implementation also matches the existing September 12 source.

The new migration changes only that exact raise statement to `PT409`. It retains the exception, so an IDE update that precedes rejected completion is rolled back. It uses the exact function signature, fails closed if the expected statement is absent/ambiguous, and is repeat-safe. Function ownership, SECURITY INVOKER, search_path, defaults, privileges, lease/ownership/Boost checks and all other statements stay unchanged. No Edge Function or frontend production source changes are needed.

PostgREST documents `PTxyz` as the custom HTTP status mechanism; Supabase specifically recommends `PT409` instead of deterministic `40001`, which invokes transaction retries:
- https://docs.postgrest.org/en/v14/references/errors.html#raise-errors-with-http-status-codes
- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

Applied migration: `20261010021134_cloud_app_completion_lease_conflict`. Postflight confirmed the live definition differs only by the targeted SQLSTATE, metadata/ACLs are unchanged, and the project remains healthy.

## Verification

```
npm install --prefix /tmp/arc-db-tests --ignore-scripts @electric-sql/pglite@0.5.8
TEST_PGLITE_MODULE=/tmp/arc-db-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/cloudAppCompletionLease.test.mjs
node --test supabase/tests/cloudAppCompletionClient.test.mjs
```

The SQL tests execute the real `cloud_app_step` and `complete_cloud_run` functions in disposable Postgres WASM, not mocked completion functions. A test-only trigger expires/replaces the lease between the IDE write and nested completion; a nontransactional sequence records attempted IDE writes even when the transaction rolls back.

- Reproduces the original `40001` failure and rollback
- Late expiry and token replacement produce `PT409` with unchanged IDE files/history, chat history, draft versions and run state
- Initially expired/stale/null leases retain the existing early `fenced` receipt, without writes
- Valid completion remains atomic; duplicate completion cannot rewrite files or append messages
- Project revision conflict remains unchanged
- Metadata/ACLs are preserved; repeated migration is a no-op; unexpected upstream definition fails closed
- Actual TypeScript completion caller issues one RPC, rejects once, schedules no retry, and keeps safe diagnostics; completed/fenced/conflict/denied receipts remain unchanged

There is no local PostgREST HTTP server in this executor. HTTP 409/no server serialization retry follows the documented `PT409` contract; the tests independently prove the SQLSTATE, SQL rollback and one-attempt client behavior. No deliberately failing production RPC, paid request, or live completion fixture was used.

## Release plan

1. Parent reviews the migration and passing tests. Recheck remote main and capture the live exact-signature definition, owner, ACL, search_path and existing migration records.
2. Supabase has no GitHub repository integration. After release approval, apply only this reviewed migration through the authenticated Supabase migration connector. Do not redeploy unchanged Edge Functions or create an integration.
3. Verify the deployed function definition differs by only the intended SQLSTATE; verify ownership/ACL/security/search_path unchanged. Record the connector-generated migration version.
4. Reconcile the authored filename and its test reference to that actual version before publishing the scoped migration/tests/docs. Do not modify old applied migrations or migration-history rows by hand.
5. Publish using expected-base, non-force update. Netlify may rebuild because main changed, but app source is unchanged. Observe existing activity/errors read-only; do not seed live user jobs to manufacture a smoke test.

Rollback requires explicit coordination: restore the captured prior function through the approved database release path while retaining owner/grants. That restores the known `40001` retry risk, so use it only for an actual deployment regression. No row/schema data changes need reversal.
