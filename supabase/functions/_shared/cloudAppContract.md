# Durable App Builder contract

## Runtime boundary

- App creation and edits use a separate durable `kind=app` Cloud Run. The worker
  dispatches these runs to `cloudAppAdvance` before claiming them in the ordinary
  Chat/Work runtime. The model uses the Agents API with `gpt-6-luna` at low
  reasoning effort. Its function tools run through Arc's existing trusted
  Supabase worker; the request uses `environment: none` and does not provision
  an OpenAI-hosted computer or E2B sandbox.
- `inspect_app`, chunked `read_app_file`, `apply_app_files`, and `publish_app` are
  app-only tools. Writes in ask mode require an exact approved call/hash.
  Publishing is always approval-gated, writes a durable publication intent before
  calling Netlify, and reconciles the same address if the acknowledgement is lost.
- Owner/session/project and current `user_has_boost` checks precede model work and
  run again on continuation, tool attempts, and publication. Browser auth tokens,
  `versions.app_users`, and `versions.app_db` are not copied into model context.
- Each write receipt creates an immutable `cloud_app_versions` snapshot. A lost
  acknowledgement replays the same run/turn/call receipt, not another version.
  Lost model submission acknowledgement pauses instead of making another POST.
- Completion compares `cloud_revision` against the starting draft, publishes saved
  files, appends user/assistant app history, and atomically completes the cloud run
  and chat-session app artifact. Conflicts retain drafts and pause for reconciliation.

## App Builder UI integration

- `AppBuilderWorkspace` is the replacement preview-first surface. Desktop users can
  open source editing, Git handoff, and ZIP export. Mobile users get a preview, a
  back-to-Chat control, and publishing.
- Chat routes clear app creation/edit requests into a saved App Builder project.
  The builder's run history is scoped to `kind=app`; ordinary Chat/Work history is
  not mixed with app runs.
- `appBuilderProject.ts` loads projects with owner filters and routes protected
  file/history writes through `save_cloud_app_project`. Metadata and browser-local
  Netlify Database preview state remain separate project fields.
- Preview execution is browser-local with Sandpack. It is not a remote Linux
  sandbox and does not run repository code in E2B.
- Publishing is an explicit `publish_app` action that uses Arc's App Builder
  Netlify account for `askarc.chat` links. Git handoff creates a draft for the
  user's own repository and hosting account; it does not move that site to
  `askarc.chat`.

## Ingress and tool rules

1. Require a saved, owned `ide_projects.id` as `request.projectId`. Verify current
   Boost/admin entitlement and the owned Chat session/project before accepting an
   app submission. The worker/RPC repeats these checks authoritatively.
2. Do not send client `request.currentFiles`; save changes first, then use the
   authoritative server project. Do not append a user turn before atomic
   `submit_cloud_run` succeeds.
3. Ingress messages are `{role:'user'|'assistant',content:string}`. Client system
   messages are rejected. Image/multimodal app submissions require a separately
   validated ingress/provider contract; do not silently strip images.
4. Completed `result.app_artifact` contains `{projectId,runId,version,published,
   executed:false,tested:false,deployed}`. The model-side run does not claim to
   have executed or tested the generated app. The browser preview runs separately.
   Artifact version is run-local; `ide_projects.cloud_revision` is the project
   CAS revision.

## Protected manual save RPC

`save_cloud_app_project(p_operation_id uuid, p_project_id uuid,
p_expected_revision bigint, p_files jsonb, p_messages jsonb)` runs authenticated.

It returns `{operationId,revision,replayed}`. SQLSTATE `PT409` means an explicit
revision conflict; `23505` means the UUID was reused for a different operation;
`42501` means access/system-file denial; `22023` means invalid input. Transport
failure or a malformed acknowledgement is uncertain: retain the same intent.
Receipts are retained until project/account deletion.

## Verification

The migration `20260912100349_durable_cloud_app_versions.sql` follows the durable
cloud-run migration and its concurrent-index prerequisite. New app tables use
owner-read RLS and service-only writes; draft artifacts are append-only.
`cloud_managed` protection is permanent once an app worker opens a workspace.

Run `deno test --no-lock supabase/functions/_shared/cloudApp_test.ts` and
`node supabase/tests/cloud_apps_local.mjs`. The latter launches disposable local
PostgreSQL with TCP disabled, applies the prerequisite/app migrations, tests SQL,
then stops the server. It does not use a deployed Supabase instance. These checks
do not prove generated-app browser behavior, paid Luna calls, or a production
publication; verify each separately before claiming it.
