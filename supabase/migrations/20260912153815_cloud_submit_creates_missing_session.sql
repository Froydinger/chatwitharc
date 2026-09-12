-- A first cloud turn must not wait for the legacy session save to win a race.
-- The atomic submission already owns the authenticated user and session ID, so
-- it can create the empty shell inside the same transaction when this is a new
-- local chat. Existing sessions keep the original revision checks unchanged.
create or replace function public.submit_cloud_run(
  p_run_id uuid, p_user_id uuid, p_session_id uuid, p_mode text, p_kind text,
  p_request jsonb, p_user_message jsonb, p_expected_revision bigint
)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.chat_sessions%rowtype;
  v_run public.cloud_runs%rowtype;
  v_messages jsonb;
  v_existing jsonb;
  v_history jsonb;
  v_authoritative jsonb;
begin
  if p_run_id is null or p_user_id is null or p_session_id is null
    or p_mode is null or p_mode not in ('ask', 'auto')
    or p_kind is null or p_kind not in ('chat', 'app')
    or jsonb_typeof(p_request) is distinct from 'object'
    or p_expected_revision is null or p_expected_revision < 0
    or jsonb_typeof(p_user_message) is distinct from 'object'
    or jsonb_typeof(p_user_message->'id') is distinct from 'string'
    or length(btrim(p_user_message->>'id')) not between 1 and 200
    or p_user_message->>'id' like 'cloud-%'
    or p_user_message->>'role' is distinct from 'user'
    or jsonb_typeof(p_user_message->'content') is distinct from 'string'
    or length(p_user_message->>'content') > 200000 then
    raise exception 'Invalid cloud submission or user message' using errcode = '22023';
  end if;
  if p_request ? 'workspace_context' then
    if jsonb_typeof(p_request->'workspace_context') is distinct from 'object' then
      raise exception 'Invalid workspace snapshot' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_object_keys(p_request->'workspace_context') k where k not in ('kind','content','language','label'))
      or p_request#>>'{workspace_context,kind}' is null
      or p_request#>>'{workspace_context,kind}' not in ('code','canvas')
      or jsonb_typeof(p_request#>'{workspace_context,content}') is distinct from 'string'
      or length(p_request#>>'{workspace_context,content}')>400000
      or ((p_request->'workspace_context') ? 'language' and (
        jsonb_typeof(p_request#>'{workspace_context,language}') is distinct from 'string'
        or length(p_request#>>'{workspace_context,language}')>200))
      or ((p_request->'workspace_context') ? 'label' and (
        jsonb_typeof(p_request#>'{workspace_context,label}') is distinct from 'string'
        or length(p_request#>>'{workspace_context,label}')>200)) then
      raise exception 'Invalid workspace snapshot' using errcode='22023';
    end if;
  end if;

  select * into v_session from public.chat_sessions
    where id = p_session_id and user_id = p_user_id for update;
  if not found then
    if p_expected_revision <> 0 then
      raise exception 'Cloud run session owner mismatch' using errcode = '23503';
    end if;
    insert into public.chat_sessions(id, user_id, title, messages, persistence_version)
      values(p_session_id, p_user_id, 'New Chat', '[]'::jsonb, 1);
    select * into v_session from public.chat_sessions
      where id = p_session_id and user_id = p_user_id for update;
  end if;
  select * into v_run from public.cloud_runs where id = p_run_id for update;
  if found then
    if v_run.user_id is distinct from p_user_id or v_run.session_id is distinct from p_session_id
      or v_run.mode is distinct from p_mode or v_run.kind is distinct from p_kind
      or v_run.request is distinct from p_request
      or v_run.submission_message is distinct from p_user_message then
      raise exception 'Run id conflicts with a different submission' using errcode = '23505';
    end if;
    return jsonb_build_object('id', v_run.id, 'status', v_run.status,
      'session_revision', v_session.revision, 'session_sequence',v_run.session_sequence,'replayed', true);
  end if;
  if v_session.revision <> p_expected_revision then
    if v_session.persistence_version<>1 or p_expected_revision>v_session.revision
      or p_expected_revision<v_session.transcript_edit_revision
      or jsonb_typeof(p_request->'messages') is distinct from 'array'
      or jsonb_array_length(p_request->'messages')<1
      or (p_request->'messages'->-1) is distinct from jsonb_build_object('role','user','content',p_user_message->>'content') then
      raise exception 'Stale session revision' using errcode = '40001';
    end if;
    v_history := (p_request->'messages') - (jsonb_array_length(p_request->'messages')-1);
    select coalesce(jsonb_agg(jsonb_build_object('role',item->>'role','content',item->>'content') order by n),'[]')
      into v_authoritative from jsonb_array_elements(coalesce(v_session.messages,'[]')) with ordinality e(item,n)
      where item->>'id' is distinct from p_user_message->>'id';
    if jsonb_array_length(v_history)>jsonb_array_length(v_authoritative)
      or v_history is distinct from (select coalesce(jsonb_agg(item order by n),'[]')
        from jsonb_array_elements(v_authoritative) with ordinality e(item,n) where n<=jsonb_array_length(v_history)) then
      raise exception 'Submitted history conflicts with authoritative messages' using errcode='40001';
    end if;
  end if;
  v_messages := coalesce(v_session.messages, '[]'::jsonb);
  if jsonb_typeof(v_messages) <> 'array' then
    raise exception 'Chat messages must be an array' using errcode = '22023';
  end if;
  select item into v_existing from jsonb_array_elements(v_messages) as entries(item)
    where item->>'id' = p_user_message->>'id' limit 1;
  if (select count(*) from jsonb_array_elements(v_messages) as entries(item)
    where item->>'id' = p_user_message->>'id') > 1 then
    raise exception 'Existing transcript has duplicate user message ids' using errcode = '23505';
  end if;
  if v_existing is not null then
    if v_existing is distinct from p_user_message then
      raise exception 'User message id already has different content' using errcode = '23505';
    end if;
  else
    v_messages := v_messages || jsonb_build_array(p_user_message);
  end if;
  insert into public.cloud_runs(id,user_id,session_id,mode,kind,request,submission_message)
    values(p_run_id,p_user_id,p_session_id,p_mode,p_kind,p_request,p_user_message) returning * into v_run;
  update public.chat_sessions set messages = v_messages, persistence_version = 1
    where id = p_session_id and user_id = p_user_id returning revision into v_session.revision;
  return jsonb_build_object('id', p_run_id, 'status', 'queued',
    'session_revision', v_session.revision, 'session_sequence',v_run.session_sequence,'replayed', false);
end;
$$;
revoke all on function public.submit_cloud_run(uuid, uuid, uuid, text, text, jsonb, jsonb, bigint)
  from public, anon, authenticated;
grant execute on function public.submit_cloud_run(uuid, uuid, uuid, text, text, jsonb, jsonb, bigint)
  to service_role;
