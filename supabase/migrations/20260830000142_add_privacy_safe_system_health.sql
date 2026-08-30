-- Privacy-safe aggregate traffic counters. There are deliberately no columns
-- capable of holding a person, request, browser, network, or device identifier.
create table public.anonymous_route_traffic (
  traffic_date date not null default (timezone('utc', now()))::date,
  route text not null,
  pageviews bigint not null default 0 check (pageviews >= 0),
  updated_at timestamptz not null default now(),
  primary key (traffic_date, route),
  constraint anonymous_route_traffic_route_check check (
    route = any (array[
      '/', '/welcome', '/blog', '/blog/:slug', '/chat/:sessionId',
      '/share/:sessionId', '/downloads', '/pricing', '/upgrade',
      '/dashboard', '/dashboard/settings', '/support', '/docs',
      '/tasks', '/shared', '/shared/:chatId', '/terms', '/privacy',
      '/status'
    ]::text[])
  )
);

comment on table public.anonymous_route_traffic is
  'Daily pageview totals by allowlisted canonical route. Never stores request- or user-level data.';

alter table public.anonymous_route_traffic enable row level security;
alter table public.anonymous_route_traffic force row level security;

revoke all on table public.anonymous_route_traffic from public, anon, authenticated;
grant select, insert, update on table public.anonymous_route_traffic to service_role;

-- Atomic aggregation prevents request-level rows and avoids lost increments.
-- SECURITY INVOKER means this only succeeds for the explicitly granted
-- service_role, which already has the table privileges and bypasses RLS.
create or replace function public.record_anonymous_pageview(route_name text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.anonymous_route_traffic (traffic_date, route, pageviews)
  values ((timezone('utc', now()))::date, route_name, 1)
  on conflict (traffic_date, route)
  do update set
    pageviews = public.anonymous_route_traffic.pageviews + 1,
    updated_at = now();
$$;

revoke all on function public.record_anonymous_pageview(text) from public, anon, authenticated;
grant execute on function public.record_anonymous_pageview(text) to service_role;
