-- Preserve selected accounts across the July 2026 clean-project rebuild.
-- Auth UUIDs are intentionally not preserved; grants follow verified emails.
create table if not exists public.account_entitlement_grants (
  email text primary key check (email = lower(email)),
  grant_admin boolean not null default false,
  grant_primary_admin boolean not null default false,
  grant_lifetime_boost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_entitlement_grants enable row level security;
revoke all on public.account_entitlement_grants from public, anon, authenticated;
grant all on public.account_entitlement_grants to service_role;

insert into public.account_entitlement_grants (
  email,
  grant_admin,
  grant_primary_admin,
  grant_lifetime_boost
)
values
  ('lopezvictorymma@gmail.com', false, false, true),
  ('rcfreud@gmail.com', false, false, true),
  ('jakefroydinger@gmail.com', true, false, false),
  ('j@froydinger.com', true, true, false)
on conflict (email) do update set
  grant_admin = excluded.grant_admin,
  grant_primary_admin = excluded.grant_primary_admin,
  grant_lifetime_boost = excluded.grant_lifetime_boost,
  updated_at = now();

-- Earlier historical migrations seeded these exact obsolete UUIDs. They are
-- not valid in a replacement Auth project, so remove only those phantom rows.
-- Disable the admin-protection triggers solely around this deterministic repair.
alter table public.admin_users disable trigger user;
delete from public.admin_users
where user_id in (
  'e3546c19-c80a-4912-b29b-0a3bb5cbefdf'::uuid,
  'b2173d83-7018-4677-86e2-f0ab798ad6dd'::uuid,
  'c2128806-8684-4f6f-8aa0-840a20b3ff34'::uuid
);
alter table public.admin_users enable trigger user;

insert into public.admin_settings (key, value, description)
values ('primary_admin_email', 'j@froydinger.com', 'Primary admin email for auto-promotion')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description;

create or replace function public.apply_account_entitlement_grants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entitlement public.account_entitlement_grants%rowtype;
  normalized_email text := lower(new.email);
begin
  select * into entitlement
  from public.account_entitlement_grants
  where email = normalized_email;

  if not found then return new; end if;

  if entitlement.grant_admin then
    insert into public.admin_users (user_id, email, role, is_primary_admin)
    values (new.id, normalized_email, 'admin', entitlement.grant_primary_admin)
    on conflict (user_id) do update set
      email = excluded.email,
      role = excluded.role,
      is_primary_admin = excluded.is_primary_admin,
      updated_at = now();
  end if;

  if entitlement.grant_lifetime_boost then
    insert into public.subscriptions (
      user_id,
      status,
      price_id,
      product_id,
      current_period_start,
      current_period_end,
      environment,
      stripe_subscription_id
    ) values (
      new.id,
      'active',
      'arcai_boost_monthly',
      'arcai_boost',
      now(),
      '9999-12-31 23:59:59+00',
      'sandbox',
      'preserved_' || new.id::text
    )
    on conflict (user_id) do update set
      status = 'active',
      price_id = 'arcai_boost_monthly',
      product_id = 'arcai_boost',
      current_period_end = '9999-12-31 23:59:59+00',
      cancel_at_period_end = false,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists apply_account_entitlement_grants_on_signup on auth.users;
create trigger apply_account_entitlement_grants_on_signup
  after insert or update of email on auth.users
  for each row execute function public.apply_account_entitlement_grants();

-- Also apply grants if this migration runs after any preserved user is created.
update auth.users
set email = email
where lower(email) in (select email from public.account_entitlement_grants);
