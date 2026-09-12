# Durable App Builder handoff (not activated)

## Implemented server boundary

- `cloudAppAdvance(db, apiKey, { enabled: true })` returns the scheduler's
  `advance(runId)` callback. The default is disabled. It claims through the shared
  worker, uses Luna with medium reasoning, and reconstructs each continuation
  from persisted engine state and app draft versions.
- `advanceCloudAppRun` exposes injected ports for tests. Do not invoke either
  function from inside an already-claimed worker's `prepare`: that would claim
  twice. Dispatch app/chat before calling their respective advance functions.
- `inspect_app`, chunked `read_app_file`, and `apply_app_files` are the app-only
  tools. Writes in ask mode require an exact approved call/hash. There are no
  shell, deploy, network, or generated-code execution tools.
- Owner/session/project and current `user_has_boost` checks precede model work
  and run again on continuation/tool attempts/publication. Existing SQL includes
  admins. No browser auth token, `versions.app_users`, or `versions.app_db` is
  copied into model context.
- Each write receipt creates an immutable `cloud_app_versions` snapshot. A lost
  acknowledgement replays the same run/turn/call receipt, not another version.
  Lost model submission acknowledgement pauses instead of making another POST.
- Completion compares the project's `cloud_revision` against the initial draft
  baseline, publishes files, appends IDE user/assistant history, and atomically
  completes the cloud run and chat-session IDE artifact. Conflicts retain drafts
  and pause for explicit reconciliation. They never silently overwrite/rebase.

## Remaining ingress/runtime wiring (Noether/main)

1. Keep App Builder activation separate and disabled until migration + IDE tests
   pass. The existing `cloudRunRuntime.ts` intentionally still rejects app runs.
   A dispatcher must choose `cloudAppAdvance` for `kind=app` **before claim**;
   ordinary text keeps its existing worker. Never change legacy `agent`, `chat`,
   `aiService.sendMessage`, or voice-controller paths as part of this cutover.
2. Require an existing, saved, owned `ide_projects.id` as `request.projectId`.
   Validate current Boost/admin and owned chat session/project before accepting
   an app submission. The worker/RPC repeats these checks authoritatively.
3. Do not send `request.currentFiles`; the new adapter rejects it. Save local
   editor changes first, then use authoritative server files. Do not call
   `addMessage` before atomic `submit_cloud_run` for the final user turn.
4. Current ingress/adapter messages are `{role:'user'|'assistant',content:string}`.
   Client system messages are rejected. Image/multimodal app submissions require
   a separately validated ingress/provider contract; don't silently strip images.
5. Completed `result.app_artifact` contains `{projectId,runId,version,published:true,
   executed:false,tested:false,deployed:false}`. The chat message is `type:'ide'`
   with `ideProjectId`, `ideFileCount`, `sourceModel:'cloud-ide'`.
   Artifact version is run-local; `ide_projects.cloud_revision` is the project
   CAS revision. They are different counters.

## Remaining IDECanvasPanel cutover (coordinate before editing)

1. Create a UUID project with the existing DEFAULT_FILES/system SDK files, save
   it, and load `id,user_id,files,messages,cloud_revision,cloud_managed` using an
   explicit owner filter. User edits must be saved before app submission.
2. For protected projects, replace the existing whole-project upsert of files
   and messages with `save_cloud_app_project` (below). Legacy unprotected projects
   remain compatible. Metadata/app database/deploy settings are separate writes.
3. Keep one immutable pending save intent with an owner-scoped durable outbox:
   `{operationId,projectId,expectedRevision,files,messages}`. Preserve it across
   reloads and transport uncertainty. Serialize saves. Do not make a new UUID
   to retry the same operation or silently reload over pending local editor edits.
4. On completion, flush pending project saves, check the observation's abort
   signal, and reload the specific project/owner. Reject an older revision or
   apply-after-abort. Do not copy a background project's files into the selected
   project's editor. Preserve DEFAULT_FILES, selected file, preview and local-only
   behavior. No automatic deploy.
5. Discovery/restoration uses the existing cloud run lifecycle, with project IDs
   obtained from verified results or an owner-scoped project/run association.
   The current generic discovery projection does not expose `request.projectId`;
   add an explicit safe project-ID field for app runs if needed, not the request.

### Protected manual save RPC

`save_cloud_app_project(p_operation_id uuid, p_project_id uuid,
p_expected_revision bigint, p_files jsonb, p_messages jsonb)` runs authenticated.

It returns `{operationId,revision,replayed}`. SQLSTATE `40001` means an explicit
revision conflict; `23505` means the UUID was reused for a different operation;
`42501` means access/system-file denial; `22023` means invalid input. Transport
failure or a malformed acknowledgement is uncertain: retain the same intent.
Receipts are retained until project/account deletion. No refresh/signout cleanup.

## Verification and activation limits

The new migration is `20260912100349_durable_cloud_app_versions.sql`, following
the durable cloud-run migration and its concurrent-index prerequisite. New app
tables use owner-read RLS and service-only writes; draft artifacts are append-only.
`cloud_managed` protection is permanent once an app worker opens a workspace.
Deploying/activating without the IDE save cutover would reject old IDE autosaves.

Run `deno test --no-lock supabase/functions/_shared/cloudApp_test.ts` and
`node supabase/tests/cloud_apps_local.mjs`. The latter launches disposable local
PostgreSQL with TCP disabled, applies real prerequisite/app migrations, tests
the SQL, then stops the server. It does not use a deployed Supabase instance.
No paid calls, generated-app runtime tests, browser-closed live E2E, or deployment
have been performed. The adapter remains unwired pending the integrations above.
