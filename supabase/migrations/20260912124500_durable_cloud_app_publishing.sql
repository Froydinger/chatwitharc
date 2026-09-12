begin;

create table public.cloud_app_publications (
  run_id uuid primary key references public.cloud_runs(id) on delete cascade,
  project_id uuid not null references public.ide_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_key text not null unique,
  status text not null check (status in ('started','completed')),
  subdomain text not null,
  title text not null,
  description text not null default '',
  site_id text,
  url text,
  netlify_url text,
  deploy_id text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cloud_app_publications_project on public.cloud_app_publications(project_id, created_at desc);
create index cloud_app_publications_owner on public.cloud_app_publications(user_id, created_at desc);
alter table public.cloud_app_publications enable row level security;
revoke all on public.cloud_app_publications from public, anon, authenticated, service_role;
grant select on public.cloud_app_publications to authenticated;
create policy cloud_app_publication_owner on public.cloud_app_publications
  for select to authenticated using ((select auth.uid()) = user_id);
create trigger cloud_app_publications_updated_at before update on public.cloud_app_publications
  for each row execute function public.update_updated_at_column();

-- Publication is a two-phase server operation: reserve the exact tool receipt,
-- deploy outside the transaction, then commit the returned Netlify identity.
-- A retry can reconcile the same reserved address instead of creating a second site.
create function public.cloud_app_publish_step(
  p_run_id uuid, p_lease_token uuid, p_action text,
  p_receipt_key text, p_call jsonb, p_result jsonb
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  r public.cloud_runs%rowtype;
  p public.ide_projects%rowtype;
  w public.cloud_app_workspaces%rowtype;
  publication public.cloud_app_publications%rowtype;
  args jsonb;
  chosen_subdomain text;
  call_hash text;
begin
  if p_action is null or p_action not in ('publish_start','publish_commit') then
    raise exception 'Invalid publication action' using errcode='22023';
  end if;
  select * into r from public.cloud_runs where id=p_run_id;
  if not found then return jsonb_build_object('status','fenced'); end if;
  perform 1 from public.chat_sessions where id=r.session_id and user_id=r.user_id for update;
  if not found then return jsonb_build_object('status','fenced'); end if;
  select * into r from public.cloud_runs where id=p_run_id for update;
  if not found or r.kind <> 'app' or r.status <> 'running' or p_lease_token is null
    or r.lease_token is distinct from p_lease_token or r.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('status','fenced');
  end if;
  if not coalesce(public.user_has_boost(r.user_id),false) then return jsonb_build_object('status','denied'); end if;
  select * into p from public.ide_projects where id=(r.request->>'projectId')::uuid and user_id=r.user_id for update;
  if not found then return jsonb_build_object('status','denied'); end if;
  select * into w from public.cloud_app_workspaces where run_id=r.id for update;
  if not found then raise exception 'Missing app workspace' using errcode='22023'; end if;
  if p_call->>'name' is distinct from 'publish_app'
    or jsonb_typeof(p_call->'arguments') is distinct from 'string'
    or p_receipt_key is distinct from (r.id::text||':turn:'||(r.checkpoint#>>'{engine,turns}')||':tool:'||(p_call->>'id'))
    or not exists(select 1 from jsonb_array_elements(coalesce(r.checkpoint#>'{engine,calls}','[]')) c where c=p_call)
    or r.checkpoint#>>array['engine','receipts',p_receipt_key,'state'] is distinct from 'started' then
    raise exception 'Publication is not the claimed tool call' using errcode='22023';
  end if;
  call_hash := encode(sha256(convert_to((p_call->>'name')||E'\n'||(p_call->>'arguments'),'UTF8')),'hex');
  if r.checkpoint#>>'{inputResponse,decision}' is distinct from 'approve'
    or r.checkpoint#>>'{inputResponse,callId}' is distinct from p_call->>'id'
    or r.checkpoint#>>'{inputResponse,argumentsHash}' is distinct from call_hash
    or r.checkpoint#>>'{pendingApproval,callId}' is distinct from p_call->>'id'
    or r.checkpoint#>>'{pendingApproval,argumentsHash}' is distinct from call_hash then
    return jsonb_build_object('status','denied');
  end if;

  select * into publication from public.cloud_app_publications where receipt_key=p_receipt_key;
  if found and (publication.run_id <> r.id or publication.project_id <> p.id or publication.user_id <> r.user_id) then
    raise exception 'Publication receipt identity conflict' using errcode='23505';
  end if;
  if p_action='publish_start' then
    if found and publication.status='completed' then
      return jsonb_build_object('status','published','result',publication.result);
    end if;
    if found then
      return jsonb_build_object('status','ready','projectId',p.id,'siteId',publication.site_id,
        'subdomain',publication.subdomain,'title',publication.title,'description',publication.description);
    end if;
    args := p_result;
    if jsonb_typeof(args) is distinct from 'object' or (select count(*) from jsonb_object_keys(args))<>3
      or jsonb_typeof(args->'subdomain') is distinct from 'string'
      or jsonb_typeof(args->'title') is distinct from 'string'
      or jsonb_typeof(args->'description') is distinct from 'string'
      or length(args->>'subdomain')>50 or length(args->>'title')>160 or length(args->>'description')>320
      or length(trim(args->>'title'))=0 then
      raise exception 'Invalid publication metadata' using errcode='22023';
    end if;
    chosen_subdomain := lower(trim(args->>'subdomain'));
    if chosen_subdomain='' then chosen_subdomain := 'arc-app-'||left(replace(p.id::text,'-',''),12); end if;
    if chosen_subdomain !~ '^[a-z0-9][a-z0-9-]*$' or chosen_subdomain in ('www','app','api','mail','email','admin','blog','docs','status','support','help','dashboard','chat','cdn','static','assets','dev','staging','test','arc','arcai','askarc') then
      raise exception 'That publish address is reserved or invalid' using errcode='22023';
    end if;
    if p.netlify_site_id is null and exists(select 1 from public.published_sites where subdomain=chosen_subdomain) then
      raise exception 'That publish address is already taken' using errcode='23505';
    end if;
    insert into public.cloud_app_publications(run_id,project_id,user_id,receipt_key,status,subdomain,title,description,site_id)
      values(r.id,p.id,r.user_id,p_receipt_key,'started',chosen_subdomain,trim(args->>'title'),trim(args->>'description'),p.netlify_site_id);
    return jsonb_build_object('status','ready','projectId',p.id,'siteId',p.netlify_site_id,
      'subdomain',chosen_subdomain,'title',trim(args->>'title'),'description',trim(args->>'description'));
  end if;

  if not found then raise exception 'Missing publication intent' using errcode='22023'; end if;
  if publication.status='completed' then return jsonb_build_object('status','published','result',publication.result); end if;
  if jsonb_typeof(p_result) is distinct from 'object'
    or jsonb_typeof(p_result->'siteId') is distinct from 'string'
    or jsonb_typeof(p_result->'url') is distinct from 'string'
    or jsonb_typeof(p_result->'deployId') is distinct from 'string'
    or jsonb_typeof(p_result->'subdomain') is distinct from 'string'
    or jsonb_typeof(p_result->'title') is distinct from 'string'
    or jsonb_typeof(p_result->'description') is distinct from 'string'
    or p_result->>'subdomain' <> publication.subdomain
    or length(p_result->>'siteId')=0 or length(p_result->>'deployId')=0 then
    raise exception 'Invalid publication receipt' using errcode='22023';
  end if;
  update public.cloud_app_publications set status='completed',site_id=p_result->>'siteId',url=p_result->>'url',
    netlify_url=p_result->>'netlifyUrl',deploy_id=p_result->>'deployId',result=p_result
    where run_id=r.id and receipt_key=p_receipt_key;
  update public.ide_projects set netlify_url=p_result->>'url',netlify_site_id=p_result->>'siteId',netlify_subdomain=publication.subdomain,
    title=publication.title where id=p.id and user_id=r.user_id;
  insert into public.published_sites(user_id,netlify_site_id,subdomain,url,title,og_description)
    values(r.user_id,p_result->>'siteId',publication.subdomain,p_result->>'url',publication.title,publication.description)
    on conflict (subdomain) do update set user_id=excluded.user_id,netlify_site_id=excluded.netlify_site_id,url=excluded.url,
      title=excluded.title,og_description=excluded.og_description,updated_at=now();
  return jsonb_build_object('status','published','result',p_result);
end;
$$;
revoke all on function public.cloud_app_publish_step(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.cloud_app_publish_step(uuid,uuid,text,text,jsonb,jsonb) to service_role;
commit;
