-- Keep the existing delivered-push history as the shared in-app notification
-- tray, and tag rows by delivery channel. Email rows are added only after the
-- transactional provider has accepted the message.
alter table public.push_notification_history
  add column channel text not null default 'push',
  add column notification_key text;

alter table public.push_notification_history
  add constraint push_notification_history_channel_check
  check (channel in ('push', 'email'));

create unique index push_notification_history_notification_key_uidx
  on public.push_notification_history(notification_key)
  where notification_key is not null;

create or replace function public.finish_cloud_run_email(
  p_id uuid, p_user_id uuid, p_lease_token uuid, p_receipt jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d public.cloud_run_email_outbox%rowtype;
  r public.cloud_runs%rowtype;
begin
  if jsonb_typeof(p_receipt) is distinct from 'object'
    or p_receipt->>'accepted' is distinct from 'true'
    or nullif(p_receipt->>'id','') is null
    or length(p_receipt::text) > 4000 then
    raise exception 'Invalid email receipt' using errcode = '22023';
  end if;

  select * into d from public.cloud_run_email_outbox
    where id=p_id and user_id=p_user_id for update;
  if not found or d.state <> 'sending' or p_lease_token is null
    or d.lease_token is distinct from p_lease_token
    or d.lease_expires_at <= clock_timestamp() then return false; end if;

  select * into r from public.cloud_runs where id=d.run_id;
  if not found or r.user_id is distinct from d.user_id then return false; end if;

  update public.cloud_run_email_outbox
    set state='sent', provider_receipt=p_receipt,
        lease_token=null, lease_expires_at=null, sent_at=clock_timestamp()
    where id=p_id;

  -- A skipped or suppressed email is not a delivered notification. The
  -- outbox row and tray row commit atomically, so a retry cannot duplicate it.
  if p_receipt->>'id' not like 'skipped:%'
    and p_receipt->>'id' not like 'suppressed:%' then
    insert into public.push_notification_history(
      user_id, title, body, url, tag, channel, notification_key
    ) values (
      d.user_id,
      case when r.mode = 'auto' then 'Arc Work finished' else 'Arc Chat finished' end,
      case when r.mode = 'auto' then 'Your Arc Work run is ready.' else 'Your Arc Chat run is ready.' end,
      '/chat/' || r.session_id::text || case when r.mode = 'auto'
        then '?workSummary=' || r.id::text else '' end,
      'cloud-run-email:' || d.run_id::text,
      'email',
      'cloud-run-email:' || d.run_id::text
    ) on conflict (notification_key) where notification_key is not null do nothing;
  end if;

  return true;
end;
$$;

revoke all on function public.finish_cloud_run_email(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finish_cloud_run_email(uuid, uuid, uuid, jsonb) to service_role;
