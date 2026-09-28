-- Human-issued bans and user-requested deletion. No scanner can call this workflow.
create table if not exists public.account_lifecycle (
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique,
 email text,
 email_hash text not null,
 kind text not null check (kind in ('ban','self_delete')),
 state text not null check (state in ('notice_pending','suspended','appealed','held','deleting','deleted','restored')),
 reason text,
 appeal_text text,
 token_hash text unique not null,
 created_by uuid,
 created_at timestamptz not null default now(),
 delete_after timestamptz,
 notice_sent_at timestamptz,
 lease_until timestamptz,
 last_error text,
 updated_at timestamptz not null default now()
);
alter table public.account_lifecycle enable row level security;
revoke all on public.account_lifecycle from public,anon,authenticated;
grant all on public.account_lifecycle to service_role;
-- A database-private random key makes email fingerprints resistant to dictionary lookup.
create table if not exists public.account_ban_hash_key (id boolean primary key default true check(id), secret text not null);
insert into public.account_ban_hash_key values(true, encode(extensions.gen_random_bytes(32),'hex')) on conflict do nothing;
alter table public.account_ban_hash_key enable row level security;
revoke all on public.account_ban_hash_key from public,anon,authenticated,service_role;
create or replace function public.account_email_hash(p_email text) returns text language sql security definer set search_path='' as $$
 select encode(extensions.hmac(lower(trim(p_email)),secret,'sha256'),'hex') from public.account_ban_hash_key where id;
$$;
revoke all on function public.account_email_hash(text) from public,anon,authenticated;
grant execute on function public.account_email_hash(text) to service_role;

create or replace function public.account_access_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.account_lifecycle where user_id=auth.uid() and state not in ('restored'));
$$;
revoke all on function public.account_access_allowed() from public,anon;
grant execute on function public.account_access_allowed() to authenticated,service_role;
-- Existing access tokens cannot continue accessing rows after suspension.
do $$ declare r record; begin
 for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
 execute format('drop policy if exists account_freeze_guard on %I.%I',r.nspname,r.relname);
 execute format('create policy account_freeze_guard on %I.%I as restrictive for all to authenticated using ((select public.account_access_allowed())) with check ((select public.account_access_allowed()))',r.nspname,r.relname);
 end loop;
end $$;

create or replace function public.prevent_banned_account_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is not null and exists(select 1 from public.account_lifecycle where email_hash=public.account_email_hash(new.email) and kind='ban' and state<>'restored' and user_id is distinct from new.id) then
 raise exception 'This account cannot register. Contact arc@froydinger.com to appeal.';
 end if;
 return new;
end $$;
revoke all on function public.prevent_banned_account_signup() from public,anon,authenticated;
drop trigger if exists prevent_banned_account_signup on auth.users;
create trigger prevent_banned_account_signup before insert or update of email on auth.users for each row execute function public.prevent_banned_account_signup();

create or replace function public.freeze_account_work(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.admin_users where user_id=p_user and is_primary_admin) then raise exception 'Owner accounts cannot be suspended or deleted here'; end if;
 update public.scheduled_tasks set status='paused' where user_id=p_user and status='active';
 update public.cloud_runs set status='cancelled',lease_token=null,lease_expires_at=null where user_id=p_user and status in ('queued','running','awaiting_input');
 delete from auth.sessions where user_id=p_user;
end $$;
revoke all on function public.freeze_account_work(uuid) from public,anon,authenticated;
grant execute on function public.freeze_account_work(uuid) to service_role;

create or replace function public.account_owned_objects(p_user uuid) returns table(bucket_id text,name text) language sql security definer set search_path='' as $$
 select bucket_id,name from storage.objects where owner_id=p_user::text or split_part(name,'/',1)=p_user::text limit 200;
$$;
revoke all on function public.account_owned_objects(uuid) from public,anon,authenticated;
grant execute on function public.account_owned_objects(uuid) to service_role;

-- A single transaction removes app rows, including moderation material. The Auth
-- account is deleted via the Admin API after storage and external cleanup succeed.
create or replace function public.erase_account_rows(p_user uuid,p_email text) returns void language plpgsql security definer set search_path='' as $$
declare r record; pass integer; blocked boolean;
begin
 if exists(select 1 from public.admin_users where user_id=p_user and is_primary_admin) then raise exception 'Owner accounts require ownership transfer before deletion'; end if;
 update public.content_review_flags set reviewed_by=null where reviewed_by=p_user;
 for pass in 1..12 loop
 blocked:=false;
 for r in select table_name,column_name from information_schema.columns where table_schema='public'
 and table_name not in ('account_lifecycle','account_ban_hash_key') and data_type='uuid'
 and column_name in ('user_id','owner_id','author_user_id','sender_id','blocker_user_id','blocked_user_id','invited_by') loop
 begin execute format('delete from public.%I where %I=$1',r.table_name,r.column_name) using p_user;
 exception when foreign_key_violation then blocked:=true; end;
 end loop;
 exit when not blocked;
 end loop;
 if blocked then raise exception 'Account cleanup dependency could not be resolved'; end if;
 for r in select table_name,column_name from information_schema.columns where table_schema='public'
 and table_name not in ('account_lifecycle','account_ban_hash_key') and data_type in ('text','character varying')
 and column_name in ('email','user_email','recipient_email','sender_email') loop
 execute format('delete from public.%I where lower(%I)=lower($1)',r.table_name,r.column_name) using p_email;
 end loop;
end $$;
revoke all on function public.erase_account_rows(uuid,text) from public,anon,authenticated;
grant execute on function public.erase_account_rows(uuid,text) to service_role;

create or replace function public.claim_account_deletions() returns setof public.account_lifecycle language sql security definer set search_path='' as $$
 update public.account_lifecycle set state='deleting',lease_until=now()+interval '5 minutes',updated_at=now()
 where id in (select id from public.account_lifecycle where
 ((state='suspended' and notice_sent_at is not null and delete_after<=now()) or (state='deleting' and (lease_until is null or lease_until<now())))
 order by delete_after nulls first for update skip locked limit 2) returning *;
$$;
revoke all on function public.claim_account_deletions() from public,anon,authenticated;
grant execute on function public.claim_account_deletions() to service_role;

create or replace function public.invoke_account_lifecycle_worker() returns void language plpgsql security definer set search_path='' as $$
declare secret text; begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='content_review_cron_secret';
 if secret is null then raise exception 'Worker secret unavailable'; end if;
 perform net.http_post(url:='https://jpqtoixhjnfdubvqshwk.supabase.co/functions/v1/account-lifecycle-worker',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=110000);
end $$;
revoke all on function public.invoke_account_lifecycle_worker() from public,anon,authenticated;
do $$ begin if exists(select 1 from cron.job where jobname='account-lifecycle-worker') then perform cron.unschedule('account-lifecycle-worker'); end if; end $$;
select cron.schedule('account-lifecycle-worker','*/5 * * * *','select public.invoke_account_lifecycle_worker()');

-- Remove old self-harm signals from the review queue; keep unrelated signals.
update public.content_review_flags set signals=array(select s from unnest(signals) s where s not like 'self-harm%') where exists(select 1 from unnest(signals) s where s like 'self-harm%');
delete from public.content_review_flags where cardinality(signals)=0;
-- Do not recreate moderation records while an account is being erased.
create or replace function public.guard_review_deleted_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=new.owner_id) or exists(select 1 from public.account_lifecycle where user_id=new.owner_id and state in ('deleting','deleted')) then return null; end if;
 return new;
end $$;
revoke all on function public.guard_review_deleted_owner() from public,anon,authenticated;
drop trigger if exists guard_review_deleted_owner on public.content_review_flags;
create trigger guard_review_deleted_owner before insert or update on public.content_review_flags for each row execute function public.guard_review_deleted_owner();
