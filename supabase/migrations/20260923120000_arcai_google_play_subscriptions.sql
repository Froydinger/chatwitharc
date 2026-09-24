-- Google Play subscription receipts are server-owned. Purchase tokens must
-- never be readable by authenticated or anonymous Data API clients.
create table if not exists public.google_play_subscriptions (
  purchase_token text primary key check (char_length(purchase_token) between 1 and 8192),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null check (product_id in ('arcai_boost_monthly', 'arcai_boost_annual')),
  subscription_state text not null,
  expiry_time timestamptz,
  auto_renewing boolean not null default false,
  linked_purchase_token text,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_play_subscriptions_user_expiry_idx
  on public.google_play_subscriptions (user_id, expiry_time desc);

alter table public.google_play_subscriptions enable row level security;
revoke all on table public.google_play_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.google_play_subscriptions to service_role;

-- Google Play subscriptions grant the same Boost entitlement as Stripe while
-- the subscription is active, in grace, or canceled but not yet expired.
create or replace function public.user_has_boost(check_user_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if check_user_id is null or
     (check_user_id <> auth.uid() and coalesce(auth.jwt() ->> 'role', '') <> 'service_role') then
    return false;
  end if;

  if exists (select 1 from public.admin_users where user_id = check_user_id) then
    return true;
  end if;

  return exists (
    select 1
    from public.subscriptions
    where user_id = check_user_id
      and price_id in ('arcai_boost_monthly', 'arcai_boost_annual')
      and (
        status in ('active', 'trialing', 'past_due')
        or (status = 'canceled' and current_period_end is not null and current_period_end > now())
      )
  ) or exists (
    select 1
    from public.google_play_subscriptions
    where user_id = check_user_id
      and subscription_state in (
        'SUBSCRIPTION_STATE_ACTIVE',
        'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
        'SUBSCRIPTION_STATE_CANCELED'
      )
      and expiry_time is not null
      and expiry_time > now()
  );
end;
$$;

revoke all on function public.user_has_boost(uuid) from public, anon;
grant execute on function public.user_has_boost(uuid) to authenticated, service_role;
