-- Allow ordinary durable Work runs to create one owned App Builder project.
-- The tool receipt is the idempotency key, and every mutation is fenced by the
-- claimed run lease. The worker never invokes the separate app-run adapter.
begin;
create table if not exists public.cloud_app_build_receipts (
  receipt_key text primary key,
  run_id uuid not null references public.cloud_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.ide_projects(id) on delete cascade,
  call jsonb not null,
  artifact jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.cloud_app_build_receipts enable row level security;
revoke all on public.cloud_app_build_receipts from public,anon,authenticated,service_role;
grant select on public.cloud_app_build_receipts to authenticated;
grant select,insert on public.cloud_app_build_receipts to service_role;
create policy cloud_app_build_receipt_owner on public.cloud_app_build_receipts for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.cloud_build_app(
  p_run_id uuid, p_lease_token uuid, p_receipt_key text,
  p_call jsonb, p_title text, p_prompt text, p_files jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.cloud_runs%rowtype;
  existing public.cloud_app_build_receipts%rowtype;
  project public.ide_projects%rowtype;
  artifact jsonb;
  item jsonb;
  path text;
  file_count integer;
begin
  if p_run_id is null or p_lease_token is null or p_receipt_key is null or p_call is null then
    raise exception 'Invalid app build receipt' using errcode='22023';
  end if;
  select * into r from public.cloud_runs where id=p_run_id;
  if not found then return jsonb_build_object('status','fenced'); end if;
  perform 1 from public.chat_sessions where id=r.session_id and user_id=r.user_id for update;
  if not found then return jsonb_build_object('status','fenced'); end if;
  select * into r from public.cloud_runs where id=p_run_id for update;
  if not found or r.kind <> 'chat' or r.mode <> 'auto' or r.status <> 'running'
    or r.lease_token is distinct from p_lease_token or r.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('status','fenced');
  end if;
  if not coalesce(public.user_has_boost(r.user_id),false) then return jsonb_build_object('status','denied'); end if;
  if p_call->>'name' is distinct from 'build_app'
    or p_call->>'id' is null
    or p_receipt_key is distinct from r.id::text||':turn:'||(r.checkpoint#>>'{engine,turns}')||':tool:'||(p_call->>'id')
    or not exists(select 1 from jsonb_array_elements(coalesce(r.checkpoint#>'{engine,calls}','[]')) c where c=p_call)
    or r.checkpoint#>>array['engine','receipts',p_receipt_key,'state'] is distinct from 'started' then
    raise exception 'App build is not the claimed tool call' using errcode='22023';
  end if;
  select * into existing from public.cloud_app_build_receipts where receipt_key=p_receipt_key;
  if found then
    if existing.run_id<>r.id or existing.user_id<>r.user_id or existing.call is distinct from p_call then
      raise exception 'App build receipt identity conflict' using errcode='23505';
    end if;
    return jsonb_build_object('status','saved','replayed',true,'artifact',existing.artifact);
  end if;
  if p_title is null or length(trim(p_title))=0 or length(p_title)>160
    or p_prompt is null or length(trim(p_prompt))=0 or length(p_prompt)>200000
    or jsonb_typeof(p_files) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_files))=0
    or (select count(*) from jsonb_object_keys(p_files))>200
    or octet_length(p_files::text)>4000000 then
    raise exception 'Invalid app build files' using errcode='22023';
  end if;
  for path in select * from jsonb_object_keys(p_files) loop
    item := p_files->path;
    if path !~ '^[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$'
      or path in ('src/lib/netlifyDb.ts','src/components/NetlifyAuthModal.tsx')
      or jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'content') is distinct from 'string'
      or jsonb_typeof(item->'language') is distinct from 'string'
      or length(item->>'content')>500000 or length(item->>'language')>40 then
      raise exception 'Invalid or protected app file' using errcode='22023';
    end if;
  end loop;
  if r.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  if not (p_files ? 'src/App.tsx') or not (p_files ? 'src/main.tsx') then
    raise exception 'App must include src/App.tsx and src/main.tsx' using errcode='22023';
  end if;
  insert into public.ide_projects(user_id,title,prompt,files,messages)
    values(r.user_id,trim(p_title),p_prompt,p_files,
      case when jsonb_typeof(r.submission_message)='object' then jsonb_build_array(r.submission_message) else '[]'::jsonb end)
    returning * into project;
  file_count := (select count(*) from jsonb_object_keys(project.files));
  artifact := jsonb_build_object('projectId',project.id,'runId',r.id,'version',1,
    'title',project.title,'prompt',coalesce(project.prompt,project.title,'Arc App'),'ideTitle',project.title,'idePrompt',coalesce(project.prompt,project.title,'Arc App'),'fileCount',file_count,
    'url','/build/'||project.id::text,'published',false,'publishedUrl',null,
    'executed',false,'tested',false,'deployed',false);
  insert into public.cloud_app_build_receipts(receipt_key,run_id,user_id,project_id,call,artifact)
    values(p_receipt_key,r.id,r.user_id,project.id,p_call,artifact);
  return jsonb_build_object('status','saved','replayed',false,'artifact',artifact);
end;
$$;
revoke all on function public.cloud_build_app(uuid,uuid,text,jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cloud_build_app(uuid,uuid,text,jsonb,text,text,jsonb) to service_role;
commit;
