-- Unshipped App Builder adapter. Enable only after IDE autosave adopts the
-- protected-project contract. Existing projects remain legacy until opened by a run.
begin;
set local lock_timeout = '2s';
alter table public.ide_projects
  add column cloud_revision bigint not null default 0 check (cloud_revision >= 0),
  add column cloud_managed boolean not null default false;

create function public.guard_cloud_app_project() returns trigger
language plpgsql security invoker set search_path='' as $$
declare trusted boolean := current_user in ('postgres','service_role','supabase_admin');
begin
  if tg_op='INSERT' then
    if not trusted and (new.cloud_managed or new.cloud_revision <> 0) then
      raise exception 'Cloud project fields are server-owned' using errcode='42501';
    end if;
    return new;
  end if;
  if old.cloud_managed and not new.cloud_managed then
    raise exception 'Cloud project protection is permanent' using errcode='42501';
  end if;
  if not trusted and (new.cloud_managed is distinct from old.cloud_managed
    or new.cloud_revision is distinct from old.cloud_revision
    or (old.cloud_managed and (new.files is distinct from old.files
      or new.messages is distinct from old.messages
      or new.id is distinct from old.id or new.user_id is distinct from old.user_id))) then
    raise exception 'Protected app files require a versioned operation' using errcode='42501';
  end if;
  -- Ignore client counters; app-user/database metadata remains independent.
  new.cloud_revision := old.cloud_revision + case when new.files is distinct from old.files
    or new.messages is distinct from old.messages then 1 else 0 end;
  return new;
end;
$$;
revoke all on function public.guard_cloud_app_project() from public,anon,authenticated;
create trigger guard_cloud_app_project before insert or update on public.ide_projects
for each row execute function public.guard_cloud_app_project();

create table public.cloud_app_workspaces (
  run_id uuid primary key references public.cloud_runs(id) on delete cascade,
  project_id uuid not null references public.ide_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  base_revision bigint not null,
  version integer not null default 0 check (version between 0 and 256)
);
create index cloud_app_workspaces_project on public.cloud_app_workspaces(project_id);
create index cloud_app_workspaces_owner on public.cloud_app_workspaces(user_id);
create table public.cloud_app_versions (
  run_id uuid not null references public.cloud_app_workspaces(run_id) on delete cascade,
  version integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_key text,
  call jsonb,
  files jsonb not null check (jsonb_typeof(files)='object'),
  created_at timestamptz not null default now(),
  primary key(run_id,version), unique(receipt_key)
);
create index cloud_app_versions_owner on public.cloud_app_versions(user_id);
alter table public.cloud_app_workspaces enable row level security;
alter table public.cloud_app_versions enable row level security;
revoke all on public.cloud_app_workspaces,public.cloud_app_versions from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.cloud_app_workspaces to service_role;
-- Artifacts are append-only, including for the worker. Project deletion cascades.
grant select,insert on public.cloud_app_versions to service_role;
grant select on public.cloud_app_workspaces,public.cloud_app_versions to authenticated;
create policy cloud_app_workspace_owner on public.cloud_app_workspaces for select to authenticated using ((select auth.uid())=user_id);
create policy cloud_app_version_owner on public.cloud_app_versions for select to authenticated using ((select auth.uid())=user_id);

-- One short DB transaction per step, never a network call while holding locks.
-- Lock order matches existing cloud RPCs: session -> run -> project -> workspace.
create function public.cloud_app_step(
  p_run_id uuid, p_lease_token uuid, p_action text,
  p_receipt_key text default null, p_call jsonb default null,
  p_result jsonb default null, p_message jsonb default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  r public.cloud_runs%rowtype;
  p public.ide_projects%rowtype;
  w public.cloud_app_workspaces%rowtype;
  v public.cloud_app_versions%rowtype;
  files jsonb;
  op jsonb;
  item jsonb;
  path text;
  paths text[] := '{}';
  artifact jsonb;
  call_hash text;
  ide_turns jsonb;
  ide_message jsonb;
begin
  if p_action is null or p_action not in ('open','apply','complete') then
    raise exception 'Invalid app action' using errcode='22023';
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
  if r.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  select * into w from public.cloud_app_workspaces where run_id=p_run_id for update;
  if not found then
    if p_action <> 'open' then raise exception 'Missing app workspace' using errcode='22023'; end if;
    if jsonb_typeof(p.files) <> 'object' or octet_length(p.files::text)>4000000 then
      raise exception 'Invalid project files' using errcode='22023';
    end if;
    insert into public.cloud_app_workspaces(run_id,project_id,user_id,base_revision)
      values(r.id,p.id,r.user_id,p.cloud_revision) returning * into w;
    insert into public.cloud_app_versions(run_id,version,user_id,files) values(r.id,0,r.user_id,p.files);
    update public.ide_projects set cloud_managed=true where id=p.id and user_id=r.user_id;
  end if;
  if w.user_id is distinct from r.user_id or w.project_id is distinct from p.id then
    raise exception 'App workspace identity conflict' using errcode='23505';
  end if;
  select * into v from public.cloud_app_versions where run_id=r.id and version=w.version;
  if p_action='open' then
    return jsonb_build_object('status','ready','projectId',p.id,'version',w.version,'baseRevision',w.base_revision,'files',v.files);
  end if;
  if p_action='complete' then
    if r.checkpoint#>>'{engine,phase}' is distinct from 'done' then raise exception 'App run is not complete' using errcode='22023'; end if;
    if p.cloud_revision <> w.base_revision then return jsonb_build_object('status','conflict'); end if;
    if r.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
    artifact := jsonb_build_object('projectId',p.id,'runId',r.id,'version',w.version,
      'published',true,'executed',false,'tested',false,'deployed',false);
    ide_turns := p.messages;
    if jsonb_typeof(ide_turns)<>'array' then raise exception 'Invalid IDE history' using errcode='22023'; end if;
    if r.submission_message is not null and not exists(select 1 from jsonb_array_elements(ide_turns) m
      where m->>'id'=r.submission_message->>'id') then
      ide_turns := ide_turns || jsonb_build_array(r.submission_message);
    end if;
    ide_message := jsonb_build_object('id','cloud-'||r.id::text,'role','assistant',
      'content',p_message->>'content','timestamp',p_message->>'timestamp');
    if exists(select 1 from jsonb_array_elements(ide_turns) m where m->>'id'=ide_message->>'id') then
      raise exception 'IDE assistant identity conflict' using errcode='23505';
    end if;
    update public.ide_projects set files=v.files,messages=ide_turns||jsonb_build_array(ide_message) where id=p.id and user_id=r.user_id;
    -- Append history, never overwrite versions.app_users/app_db or deploy settings.
    if not public.complete_cloud_run(r.id,p_lease_token,
      coalesce(p_result,'{}') || jsonb_build_object('app_artifact',artifact),
      coalesce(p_message,'{}') || jsonb_build_object('id','cloud-'||r.id::text,'role','assistant',
        'type','ide','ideProjectId',p.id,'ideFileCount',(select count(*) from jsonb_object_keys(v.files)),
        'sourceModel','cloud-ide')) then
      raise exception 'Completion lease expired' using errcode='40001';
    end if;
    return jsonb_build_object('status','completed','artifact',artifact);
  end if;
  if p_call->>'name' is distinct from 'apply_app_files'
    or jsonb_typeof(p_call->'arguments') is distinct from 'string'
    or p_receipt_key is distinct from (r.id::text||':turn:'||(r.checkpoint#>>'{engine,turns}')||':tool:'||(p_call->>'id'))
    or not exists(select 1 from jsonb_array_elements(coalesce(r.checkpoint#>'{engine,calls}','[]')) c where c=p_call)
    or r.checkpoint#>>array['engine','receipts',p_receipt_key,'state'] is distinct from 'started' then
    raise exception 'App change is not the claimed tool call' using errcode='22023';
  end if;
  call_hash := encode(sha256(convert_to((p_call->>'name')||E'\n'||(p_call->>'arguments'),'UTF8')),'hex');
  if r.mode='ask' and (r.checkpoint#>>'{inputResponse,decision}' is distinct from 'approve'
    or r.checkpoint#>>'{inputResponse,callId}' is distinct from p_call->>'id'
    or r.checkpoint#>>'{pendingApproval,callId}' is distinct from p_call->>'id'
    or r.checkpoint#>>'{inputResponse,argumentsHash}' is distinct from call_hash
    or r.checkpoint#>>'{pendingApproval,argumentsHash}' is distinct from call_hash) then
    return jsonb_build_object('status','denied');
  end if;
  select * into v from public.cloud_app_versions where receipt_key=p_receipt_key;
  if found then
    if v.run_id <> r.id or v.user_id <> r.user_id or v.call is distinct from p_call then
      raise exception 'App receipt identity conflict' using errcode='23505';
    end if;
    return jsonb_build_object('status','saved','version',v.version,'replayed',true);
  end if;
  op := (p_call->>'arguments')::jsonb;
  if jsonb_typeof(op) <> 'object' or jsonb_typeof(op->'expectedVersion') is distinct from 'number'
    or jsonb_typeof(op->'writes') is distinct from 'array' or jsonb_typeof(op->'deletes') is distinct from 'array'
    or (select count(*) from jsonb_object_keys(op))<>3
    or jsonb_array_length(op->'writes')+jsonb_array_length(op->'deletes') not between 1 and 50 then
    raise exception 'Invalid app changes' using errcode='22023';
  end if;
  if (op->>'expectedVersion')::numeric <> w.version then return jsonb_build_object('status','conflict'); end if;
  if w.version>=256 then raise exception 'App version limit' using errcode='22023'; end if;
  select v1.files into files from public.cloud_app_versions v1 where run_id=r.id and version=w.version;
  for item in select * from jsonb_array_elements((op->'writes')||(op->'deletes')) loop
    path := case when jsonb_typeof(item)='string' then item#>>'{}' else item->>'path' end;
    if path is null or length(path)>300 or path !~ '^[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$'
      or path ~ '(^|/)\.{1,2}(/|$)' or path like '%//%' or right(path,1)='/'
      or path=any(paths) or path in ('src/lib/netlifyDb.ts','src/components/NetlifyAuthModal.tsx') then
      raise exception 'Invalid or protected app path' using errcode='22023';
    end if;
    paths := array_append(paths,path);
  end loop;
  for item in select * from jsonb_array_elements(op->'deletes') loop
    if jsonb_typeof(item)<>'string' then raise exception 'Invalid deletion' using errcode='22023'; end if;
    files := files - (item#>>'{}');
  end loop;
  for item in select * from jsonb_array_elements(op->'writes') loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'content') is distinct from 'string'
      or jsonb_typeof(item->'language') is distinct from 'string'
      or length(item->>'content')>500000 or length(item->>'language')>40
      or (select count(*) from jsonb_object_keys(item))<>3 then
      raise exception 'Invalid app file' using errcode='22023';
    end if;
    files := jsonb_set(files,array[item->>'path'],jsonb_build_object('content',item->>'content','language',item->>'language'));
  end loop;
  if (select count(*) from jsonb_object_keys(files))>200 or octet_length(files::text)>4000000 then
    raise exception 'App files exceed limits' using errcode='22023';
  end if;
  if r.lease_expires_at <= clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  insert into public.cloud_app_versions(run_id,version,user_id,receipt_key,call,files)
    values(r.id,w.version+1,r.user_id,p_receipt_key,p_call,files);
  update public.cloud_app_workspaces set version=version+1 where run_id=r.id;
  return jsonb_build_object('status','saved','version',w.version+1,'replayed',false);
end;
$$;
revoke all on function public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.cloud_app_step(uuid,uuid,text,text,jsonb,jsonb,jsonb) to service_role;

-- Companion contract for the existing IDE's manual edits/autosave cutover.
-- Stable operation UUID survives a lost response; exact revision CAS prevents
-- full-file/history snapshots from overwriting a newer cloud completion.
create table public.cloud_app_save_receipts (
  operation_id uuid primary key,
  project_id uuid not null references public.ide_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expected_revision bigint not null,
  files jsonb not null,
  messages jsonb not null,
  revision bigint not null
);
create index cloud_app_save_receipts_project on public.cloud_app_save_receipts(project_id);
create index cloud_app_save_receipts_owner on public.cloud_app_save_receipts(user_id);
alter table public.cloud_app_save_receipts enable row level security;
revoke all on public.cloud_app_save_receipts from public,anon,authenticated,service_role;
grant select,insert,delete on public.cloud_app_save_receipts to service_role;
create function public.save_cloud_app_project(
  p_operation_id uuid,p_project_id uuid,p_expected_revision bigint,p_files jsonb,p_messages jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner uuid := auth.uid();
  p public.ide_projects%rowtype;
  receipt public.cloud_app_save_receipts%rowtype;
  revision bigint;
  file record;
begin
  if owner is null or not coalesce(public.user_has_boost(owner),false) then
    raise exception 'Current App Builder entitlement required' using errcode='42501';
  end if;
  if p_operation_id is null or p_project_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Invalid app save identity' using errcode='22023';
  end if;
  select * into p from public.ide_projects where id=p_project_id and user_id=owner for update;
  if not found then raise exception 'Project not found for owner' using errcode='42501'; end if;
  select * into receipt from public.cloud_app_save_receipts where operation_id=p_operation_id;
  if found then
    if receipt.project_id<>p.id or receipt.user_id<>owner or receipt.expected_revision<>p_expected_revision
      or receipt.files is distinct from p_files or receipt.messages is distinct from p_messages then
      raise exception 'App save operation identity conflict' using errcode='23505';
    end if;
    return jsonb_build_object('operationId',p_operation_id,'revision',receipt.revision,'replayed',true);
  end if;
  if p.cloud_revision<>p_expected_revision then raise exception 'Project revision conflict' using errcode='40001'; end if;
  if jsonb_typeof(p_files) is distinct from 'object' or octet_length(p_files::text)>4000000
    or jsonb_typeof(p_messages) is distinct from 'array' or octet_length(p_messages::text)>1000000 then
    raise exception 'Invalid app snapshot' using errcode='22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_files))>200 then raise exception 'Too many app files' using errcode='22023'; end if;
  for file in select * from jsonb_each(p_files) loop
    if length(file.key)>300 or file.key !~ '^[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$'
      or jsonb_typeof(file.value->'content') is distinct from 'string' or length(file.value->>'content')>500000 then
      raise exception 'Invalid app file' using errcode='22023';
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_messages) m where
    jsonb_typeof(m) is distinct from 'object' or jsonb_typeof(m->'id') is distinct from 'string'
    or m->>'role' is null or m->>'role' not in ('user','assistant') or jsonb_typeof(m->'content') is distinct from 'string') then
    raise exception 'Invalid IDE message' using errcode='22023';
  end if;
  if p.cloud_managed and ((p.files->'src/lib/netlifyDb.ts') is distinct from (p_files->'src/lib/netlifyDb.ts')
    or (p.files->'src/components/NetlifyAuthModal.tsx') is distinct from (p_files->'src/components/NetlifyAuthModal.tsx')) then
    raise exception 'Protected system files cannot change' using errcode='42501';
  end if;
  update public.ide_projects set files=p_files,messages=p_messages where id=p.id and user_id=owner returning cloud_revision into revision;
  insert into public.cloud_app_save_receipts(operation_id,project_id,user_id,expected_revision,files,messages,revision)
    values(p_operation_id,p.id,owner,p_expected_revision,p_files,p_messages,revision);
  return jsonb_build_object('operationId',p_operation_id,'revision',revision,'replayed',false);
end;
$$;
revoke all on function public.save_cloud_app_project(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_cloud_app_project(uuid,uuid,bigint,jsonb,jsonb) to authenticated;
commit;
