/** Isolated temporary PostgreSQL; never reads project connection settings. */
const bin = "/opt/homebrew/bin/";
Deno.test("image SQL: live fences, atomic paid intent, Quick/Pro quotas, partial and midnight-safe refunds", async () => {
  const tmp = await Deno.makeTempDir({
    dir: "/tmp",
    prefix: "arc-cloud-image-",
  });
  async function command(name: string, args: string[], input?: string) {
    const p = new Deno.Command(bin + name, {
      args,
      stdin: input ? "piped" : "null",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    if (input) {
      const w = p.stdin.getWriter();
      await w.write(new TextEncoder().encode(input));
      await w.close();
    }
    const r = await p.output();
    if (!r.success) throw new Error(new TextDecoder().decode(r.stderr));
    return new TextDecoder().decode(r.stdout);
  }
  const sql = (s: string) =>
    command("psql", [
      "-h",
      tmp,
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ], s);
  let started = false;
  try {
    await command("initdb", [
      "-D",
      tmp + "/db",
      "-A",
      "trust",
      "-U",
      "postgres",
      "--no-locale",
    ]);
    await command("pg_ctl", [
      "-D",
      tmp + "/db",
      "-l",
      tmp + "/postgres.log",
      "-o",
      `-F -k ${tmp} -h ''`,
      "-w",
      "start",
    ]);
    started = true;
    await sql(`
      create role anon;create role authenticated;create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table auth.users(id uuid primary key,is_anonymous boolean default false);
      create table public.admin_users(user_id uuid);
      create table public.boost_users(user_id uuid);
      create function public.user_has_boost(u uuid) returns boolean language sql as 'select exists(select 1 from public.boost_users where user_id=u)';
      create table public.chat_sessions(id uuid primary key,user_id uuid);
      create table public.cloud_runs(id uuid primary key,user_id uuid,session_id uuid,status text,lease_token uuid,lease_expires_at timestamptz,checkpoint jsonb);
      create table public.image_generation_jobs(id uuid primary key default gen_random_uuid(),user_id uuid,job_type text,prompt text,aspect_ratio text,preferred_model text,status text,quota_reserved_count integer default 0,quota_finalized_at timestamptz,created_at timestamptz default now(),error_type text,error_message text,result_image_url text,result_image_urls text[]);
      create table public.daily_image_usage(user_id uuid,usage_date date,used_count integer default 0,updated_at timestamptz default now(),primary key(user_id,usage_date));
    `);
    const migrations = new URL("../../migrations/", import.meta.url);
    for (
      const file of [
        "20260703173000_track_image_quota_reservation_date.sql",
        "20260908180000_support_gpt_image_2_5_models.sql",
        "20260912102738_durable_cloud_images.sql",
      ]
    ) await sql(await Deno.readTextFile(new URL(file, migrations)));
    await sql(`
      do $$ declare
        u uuid := gen_random_uuid(); rid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid();
        c jsonb:='{"id":"call","name":"generate_image","arguments":"{}"}';
        a jsonb:='{"kind":"generate","prompt":"Tree","model":"gpt-image-2.5-flare","count":3,"aspectRatio":"1:1","sourceUrls":[],"transparent":false}';
        k text; m jsonb; jid uuid; used integer; blocked boolean:=false;
      begin
        insert into auth.users values(u,false);insert into public.chat_sessions values(sid,u);
        insert into public.cloud_runs values(rid,u,sid,'running',lease,now()+interval '1 hour',jsonb_build_object('engine',jsonb_build_object('turns',1,'calls',jsonb_build_array(c))));
        k:=rid::text||':turn:1:tool:call';
        m:=public.cloud_image_step(rid,u,lease,k,c,'begin',a);jid:=(m->>'job_id')::uuid;
        if not (m->'quota'->>'allowed')::boolean then raise exception 'Quick denied';end if;
        perform public.cloud_image_step(rid,u,lease,k,c,'begin',a);
        select used_count into used from daily_image_usage where user_id=u;
        if used<>3 then raise exception 'Duplicate reservation';end if;
        m:=public.cloud_image_step(rid,u,lease,k,c,'start',a,0);
        if not (m->>'dispatch')::boolean then raise exception 'First dispatch blocked';end if;
        m:=public.cloud_image_step(rid,u,lease,k,c,'start',a,0);
        if (m->>'dispatch')::boolean then raise exception 'Duplicate dispatch';end if;
        begin perform public.cloud_image_step(rid,u,gen_random_uuid(),k,c,'start',a,1); exception when others then blocked:=true;end;
        if not blocked then raise exception 'Stale lease accepted';end if;
        -- Reservation before midnight: refund that day, not current usage.
        update daily_image_usage set usage_date=current_date-1 where user_id=u;
        update image_generation_jobs set quota_usage_date=current_date-1 where id=jid;
        update cloud_runs set status='cancelled',lease_token=null where id=rid;
        perform public.cloud_image_step(rid,u,null,k,c,'accept',a,0,'resp_saved');
        perform public.cloud_image_step(rid,u,null,k,c,'finish',a,0,'https://r2.invalid/owner/output.png');
        perform public.cloud_image_step(rid,u,null,k,c,'cancel_ready',a,1);
        m:=public.cloud_image_step(rid,u,null,k,c,'cancel_ready',a,2);
        if not (m->>'settled')::boolean then raise exception 'Not settled';end if;
        perform public.cloud_image_step(rid,u,null,k,c,'cancel_ready',a,2);
        select used_count into used from daily_image_usage where user_id=u;
        if used<>1 then raise exception 'Partial refund incorrect: %',used;end if;
        if (select status from image_generation_jobs where id=jid)<>'completed' then raise exception 'Missing job completion';end if;
        -- Free Pro denied; Boost permitted. Both use existing quota RPC.
        insert into image_generation_jobs(user_id,preferred_model)values(u,'gpt-image-2.5-sunburst')returning id into jid;
        if (public.reserve_image_quota(u,jid,1)->>'allowed')::boolean then raise exception 'Free Pro allowed';end if;
        insert into boost_users values(u);
        if not (public.reserve_image_quota(u,jid,1)->>'allowed')::boolean then raise exception 'Boost Pro denied';end if;
        if has_function_privilege('authenticated','public.cloud_image_step(uuid,uuid,uuid,text,jsonb,text,jsonb,integer,text)','execute') then raise exception 'Browser can mutate receipts';end if;
      end $$;
    `);
  } finally {
    if (started) {
      await command("pg_ctl", [
        "-D",
        tmp + "/db",
        "-m",
        "immediate",
        "-w",
        "stop",
      ]);
    }
    await Deno.remove(tmp, { recursive: true });
  }
});
