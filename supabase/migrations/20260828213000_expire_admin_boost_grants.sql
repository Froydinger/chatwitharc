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

  -- Admins always receive Boost entitlements, even without a subscription row.
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
      and (
        stripe_subscription_id not like 'promo_admin_%'
        or (current_period_end is not null and current_period_end > now())
      )
  );
end;
$$;

revoke all on function public.user_has_boost(uuid) from public, anon;
grant execute on function public.user_has_boost(uuid) to authenticated, service_role;
