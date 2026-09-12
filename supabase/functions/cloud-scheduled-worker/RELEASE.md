# Durable scheduled worker: unreleased configuration contract

No cron was changed and no function/migration was deployed.

Entrypoint: `POST /functions/v1/cloud-scheduled-worker`, empty body, dedicated
`Authorization: Bearer <CLOUD_SCHEDULED_WORKER_SECRET>`. Never use a user JWT,
anon key, query-string secret, or model-provided recipient. The handler uses
`verify_jwt=false` because it verifies its own scheduler secret. Empty/missing
secrets fail closed; error responses omit task/user/provider details.

Required server configuration: existing `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, plus the dedicated secret above.
No credentials enter requests/checkpoints/occurrences/outbox payloads.

All three gates default false and must be explicitly true:

- `CLOUD_SCHEDULED_ENABLED`
- `CLOUD_SCHEDULED_CUTOVER_CONFIRMED`: operator confirms legacy
  `run-scheduled-tasks` cron is disabled before enabling this consumer. This
  flag does NOT disable it. Running legacy and durable consumers together is unsafe.
- `CLOUD_SCHEDULED_REMINDER_ONLY_CONFIRMED`: current inventory is limited to
  plain reminders. The new model adapter does not yet provide the legacy
  weather/search tool loop. General digest/weather task cutover remains blocked
  until a durable multi-tool adapter is supplied; don't set this flag to bypass that gap.

Cloud-worker also advances one scheduled boundary when these gates are enabled,
using its existing `CLOUD_WORKER_SECRET` auth and enable flag. Configure ONE
invocation route, not both. Suggested external cadence: every minute, POST with
secret sourced from server vault, no browser timer or webhook. Each invocation
advances at most one model boundary and one delivery boundary. Size cadence and
capacity explicitly before release; sequential provider start/poll typically
requires several ticks before delivery. No cron SQL is installed by this patch.

Apply/review durable run, scheduled-tool, and scheduled-dispatch migrations in
order before enabling. Existing durable chat prerequisite index still applies.

Provider adapter composes cloudResponseProvider: stored background response ID,
read-only polling, no automatic model resubmission after unknown acceptance.
This uses OpenAI stored/background data, not a zero-retention mode; confirm
project/model availability and retention policy before release.

Push composes cloudNotificationDispatch, with only the claimed owner's ID and
a stable occurrence/channel tag. Email resolves the current verified owner email
through Auth Admin and calls send-transactional-email with a stable log key.
Partial/zero push, suppressed/unverified email, HTTP/transport uncertainty and
lost acceptance acknowledgements never become fabricated success receipts.

**Recovery gate:** push does not offer exactly-once delivery, and the existing
email helper's check-then-send is not provider-side idempotency. SQL records
`sending` before either call; expired ambiguity becomes `recovery_required`
without automatic resend. Provide operator reconciliation/monitoring for these
rows and occurrence recovery before release. A logical acceptance receipt is not
proof of device delivery, user viewing, or a provider message ID. Cancellation
cannot retract a network send already in flight.
