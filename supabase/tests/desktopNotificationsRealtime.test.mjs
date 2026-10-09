// Isolated Postgres execution: publication is idempotent and existing RLS/claims
// protect cross-account reads/writes. This does not run a Realtime server.
// Use TEST_PGLITE_MODULE as documented in idleWorkerWakeups.test.mjs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.TEST_PGLITE_MODULE;
const { PGlite } = await import(moduleName ? pathToFileURL(moduleName).href : '@electric-sql/pglite');
const db = new PGlite();
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
insert into auth.users values('${userA}'),('${userB}');
create table public.push_notification_history(id integer);
create publication supabase_realtime for table public.push_notification_history;
`);
await db.exec(await readFile(new URL('../migrations/20260714150000_add_mac_desktop_notifications.sql', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../migrations/20261009224516_desktop_notifications_realtime.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration);
assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map(r => r.tablename), ['desktop_notifications','push_notification_history']);
assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.desktop_notifications'::regclass")).rows[0].relrowsecurity, true);
await db.exec(`insert into public.desktop_notifications(user_id,title) values('${userA}','Account A'),('${userB}','Account B');
set role authenticated; select set_config('request.jwt.claim.sub','${userA}',false);`);
assert.deepEqual((await db.query('select title from public.desktop_notifications')).rows.map(r => r.title), ['Account A']);
assert.equal((await db.query(`update public.desktop_notifications set delivered_at=now() where user_id='${userB}' and delivered_at is null returning id`)).rows.length, 0);
assert.equal((await db.query(`update public.desktop_notifications set delivered_at=now() where user_id='${userA}' and delivered_at is null returning id`)).rows.length, 1);
assert.equal((await db.query(`update public.desktop_notifications set delivered_at=now() where user_id='${userA}' and delivered_at is null returning id`)).rows.length, 0);
await db.exec(`select set_config('request.jwt.claim.sub','${userB}',false);`);
const bRows = (await db.query('select title,delivered_at from public.desktop_notifications')).rows;
assert.deepEqual(bRows, [{title:'Account B',delivered_at:null}]);
await db.exec('reset role');
assert.equal((await db.query("select has_table_privilege('anon','public.desktop_notifications','select') allowed")).rows[0].allowed, false);
const rollback = await readFile(new URL('../../docs/qa/desktop-notifications-realtime-rollback.sql', import.meta.url), 'utf8');
await db.exec(rollback); await db.exec(rollback);
assert.deepEqual((await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map(r => r.tablename), ['push_notification_history']);
console.log('PASS publication repeat deploy/rollback, preserved existing publication member, unchanged RLS, account isolation, conditional at-most-once claim, anon denial');
await db.close();
