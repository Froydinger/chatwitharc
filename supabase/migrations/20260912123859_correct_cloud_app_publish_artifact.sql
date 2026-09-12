-- Keep completed App Builder artifacts truthful: a draft is not published
-- unless the durable publish transaction was committed successfully.
create or replace function public.cloud_app_step(
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
      'published',exists(select 1 from public.cloud_app_publications where run_id=r.id and status='completed'),
      'executed',false,'tested',false,
      'deployed',exists(select 1 from public.cloud_app_publications where run_id=r.id and status='completed'));
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
