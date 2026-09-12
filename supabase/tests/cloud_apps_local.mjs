// Disposable PostgreSQL only. No TCP, production configuration, paid providers,
// or deployed migrations. The server is always stopped; temp data is retained.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
const bin = '/opt/homebrew/opt/postgresql@17/bin';
const directory = mkdtempSync('/tmp/arc-app-pg-');
const data = `${directory}/data`, socket = `${directory}/socket`;
mkdirSync(socket, { mode: 0o700 });
const env = { ...process.env, PGHOST: socket, PGPORT: '55443', PGUSER: 'postgres', PGDATABASE: 'postgres' };
delete env.PGPASSWORD;
const sql = text => execFileSync(`${bin}/psql`, ['-X', '-v', 'ON_ERROR_STOP=1', '-At'], { env, input: text, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
let started = false;
try {
  execFileSync(`${bin}/initdb`, ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8'], { env, stdio: 'pipe' });
  execFileSync(`${bin}/pg_ctl`, ['-D', data, '-l', `${directory}/postgres.log`, '-o', `-k ${socket} -p 55443 -h '' -c unix_socket_permissions=0700`, '-w', 'start'], { env, stdio: 'pipe' });
  started = true;
  if (sql('show listen_addresses').trim() !== '') throw Error('TCP unexpectedly enabled');
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    create function auth.jwt() returns jsonb language sql stable as
      'select jsonb_build_object(''role'',current_setting(''request.jwt.claim.role'',true))';
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant select on auth.users to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`);
  const migration = name => sql(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  for (const file of [
    '20250830192630_47cf40bc-2d2c-42a2-9541-f810ada41674.sql',
    '20251106031256_36740d06-a7da-482d-b3a6-886314af7b52.sql',
    '20260102064547_8daccd8e-e346-40d4-a197-fe6140d93084.sql',
    '20260529020858_177f2e15-3416-48d7-b030-2aa0dc2c81b9.sql',
    '20260310120000_add_ide_projects.sql',
    '20260312022706_9680e92b-7530-4c35-9e61-e6635685fedc.sql',
  ]) migration(file);
  sql(`create table public.admin_users(user_id uuid primary key);
    create table public.subscriptions(user_id uuid, price_id text,status text,stripe_subscription_id text,current_period_end timestamptz);
    create unique index chat_sessions_id_user_id_cloud_runs_key on public.chat_sessions(id,user_id);`);
  migration('20260828213000_expire_admin_boost_grants.sql');
  migration('20260912085941_durable_cloud_runs.sql');
  migration('20260912100349_durable_cloud_app_versions.sql');
  console.log(sql(readFileSync(new URL('./cloud_apps.sql', import.meta.url), 'utf8')));
  console.log('App migration + PostgreSQL regression suite passed. No network/provider calls.');
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (started) execFileSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'pipe' });
}
