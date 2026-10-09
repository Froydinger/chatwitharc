import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadModule(path, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  new Function(...Object.keys(globals), 'require', 'module', 'exports', code)(...Object.values(globals), name => {
    assert.ok(name in dependencies, `unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const { createProfileCache } = loadModule('../src/lib/profileCache.ts');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const user = (id, extra = {}) => ({ id, email: `${id}@example.test`, user_metadata: {}, ...extra });
const row = (id, display_name = id) => ({ user_id: id, id: `profile-${id}`, display_name });

function cacheFixture() {
  const reads = [], writes = [];
  const cache = createProfileCache({
    load: (owner, isCurrent) => {
      const result = deferred(); reads.push({ owner, isCurrent, ...result }); return result.promise;
    },
    update: (userId, updates) => {
      const result = deferred(); writes.push({ userId, updates, ...result }); return result.promise;
    },
  });
  return { cache, reads, writes };
}

{
  const { cache, reads } = cacheFixture();
  const snapshots = [];
  const unsubscribe = cache.subscribe(() => snapshots.push(cache.getSnapshot()));
  cache.activate(user('a'));
  const pending = cache.ensure();
  for (let i = 0; i < 30; i++) assert.equal(cache.ensure(), pending, 'concurrent readers share one promise');
  await flush();
  assert.equal(reads.length, 1);
  reads[0].resolve(row('a'));
  await pending;
  assert.equal(cache.getSnapshot().loading, false);
  assert.equal(cache.activate(user('a', { updated_at: 'refreshed' })), false);
  await cache.ensure();
  assert.equal(reads.length, 1, 'same-account auth events and later consumers use the cache');
  const refresh = cache.refetch();
  assert.equal(cache.refetch(), refresh, 'internal concurrent refreshes coalesce');
  await flush(); reads[1].resolve(row('a', 'Updated elsewhere')); await refresh;
  assert.equal(cache.getSnapshot().profile.display_name, 'Updated elsewhere');
  assert.ok(snapshots.some(state => state.loading));
  unsubscribe(); const count = snapshots.length; cache.activate(null); assert.equal(snapshots.length, count);
}

{
  const { cache, reads, writes } = cacheFixture();
  cache.activate(user('a'));
  const oldRead = cache.ensure(); await flush();
  const save = cache.update({ display_name: 'New name' }); await flush();
  assert.equal(reads[0].isCurrent(), false, 'starting a mutation fences a prior read and missing-row creation');
  writes[0].resolve(row('a', 'New name')); await save;
  reads[0].resolve(row('a', 'Old name')); await oldRead;
  assert.equal(cache.getSnapshot().profile.display_name, 'New name', 'late fetch cannot overwrite a saved profile');
  assert.equal(cache.getSnapshot().loading, false);
  assert.equal(cache.getSnapshot().updating, false);
  const refresh = cache.refetch(); await flush();
  reads[1].reject(new Error('read failed')); await refresh;
  assert.equal(cache.getSnapshot().profile.display_name, 'New name', 'read errors retain the last good profile');
  assert.equal(cache.getSnapshot().error.message, 'read failed');
}

{
  const { cache, reads, writes } = cacheFixture();
  cache.activate(user('a'));
  const first = cache.update({ display_name: 'First' });
  const second = cache.update({ preferred_voice: 'marin' });
  const refresh = cache.refetch();
  await flush();
  assert.equal(writes.length, 1, 'writes are serialized'); assert.equal(reads.length, 0);
  writes[0].resolve(row('a', 'First')); await first; await flush();
  assert.equal(cache.getSnapshot().updating, true, 'updating remains true while another save is queued');
  assert.equal(writes.length, 2); assert.equal(reads.length, 0, 'refresh waits for all writes');
  writes[1].resolve({ ...row('a', 'First'), preferred_voice: 'marin' }); await second; await flush();
  assert.equal(reads.length, 1);
  reads[0].resolve({ ...row('a', 'First'), preferred_voice: 'marin' }); await refresh;
  assert.equal(cache.getSnapshot().updating, false);
  assert.equal(cache.getSnapshot().profile.preferred_voice, 'marin');

  const failed = cache.update({ display_name: 'Rejected' });
  const rejected = assert.rejects(failed, /write failed/);
  const next = cache.update({ display_name: 'Recovered' }); await flush();
  writes[2].reject(new Error('write failed')); await rejected; await flush();
  writes[3].resolve(row('a', 'Recovered')); await next;
  assert.equal(cache.getSnapshot().profile.display_name, 'Recovered');
  assert.equal(cache.getSnapshot().error, null);
}

{
  const { cache, reads, writes } = cacheFixture();
  cache.activate(user('a'));
  const save = cache.update({ display_name: 'First' });
  const supersededRefresh = cache.refetch();
  const newerSave = cache.update({ display_name: 'Second' }); await flush();
  writes[0].resolve(row('a', 'First')); await save; await flush();
  writes[1].resolve(row('a', 'Second')); await newerSave; await supersededRefresh;
  assert.equal(reads.length, 0, 'a write invalidates even a refresh still waiting for earlier writes');
  assert.equal(cache.getSnapshot().profile.display_name, 'Second');
}

{
  const { cache, reads, writes } = cacheFixture();
  cache.activate(user('a'));
  const aGeneration = cache.getSnapshot().generation;
  const aRead = cache.ensure(); await flush();
  const aSave = cache.update({ display_name: 'Late A' });
  const aRejected = assert.rejects(aSave, /account changed/);
  const queuedA = cache.update({ display_name: 'Never send' });
  const queuedRejected = assert.rejects(queuedA, /account changed/);
  await flush();
  cache.activate(user('b'));
  assert.equal(cache.getSnapshot().profile, null, 'account switch immediately clears private profile');
  assert.equal(cache.getSnapshot().updating, false);
  const bRead = cache.ensure(); await flush();
  assert.equal(reads[0].isCurrent(), false);
  reads[1].resolve(row('b')); await bRead;
  writes[0].resolve(row('a', 'Late A')); await aRejected; await queuedRejected;
  reads[0].reject(new Error('Late A failure')); await aRead;
  assert.equal(writes.length, 1, 'queued writes are never sent after account change');
  assert.equal(cache.getSnapshot().profile.user_id, 'b'); assert.equal(cache.getSnapshot().error, null);
  await assert.rejects(cache.update({ display_name: 'Wrong account' }, aGeneration), /account changed/);
  await cache.refetch(aGeneration); assert.equal(reads.length, 2, 'stale refresh callback cannot fetch another account');
  cache.activate(null); cache.activate(user('a'));
  await assert.rejects(cache.update({ display_name: 'Old sign-in' }, aGeneration), /account changed/);
  await cache.invalidate('a', aGeneration);
  assert.equal(reads.length, 2, 'stale generation invalidation cannot refresh a later sign-in of the same account');
  cache.activate(user('guest', { is_anonymous: true }));
  await cache.ensure();
  assert.equal(reads.length, 2, 'anonymous users never fetch a profile');
  assert.equal(cache.getSnapshot().profile, null);
}
console.log('PASS: shared profile cache deduplication, refetch, mutation sequencing, error recovery, account isolation and stale async fencing');

// Exercise the production AuthProvider and useProfile with a minimal hook runner,
// a mocked Supabase transport, and real timers. No copied auth/cache algorithms.
function authFixture(initialEvent = null) {
  const states = [], effects = [], cleanups = [];
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  let now = 0;
  let hookIndex = 0, authListener, unsubscribed = 0;
  const bootstrap = deferred();
  const reads = [], writes = [], inserts = [];
  let nextRead = ownerId => Promise.resolve({ data: row(ownerId), error: null });
  let nextInsert = payload => Promise.resolve({ data: row(payload.user_id, payload.display_name), error: null });
  const fakeSupabase = {
    auth: {
      getSession: () => bootstrap.promise,
      onAuthStateChange: listener => { authListener = listener; if (initialEvent) listener(initialEvent, null); return { data: { subscription: { unsubscribe: () => { unsubscribed++; } } } }; },
      signInAnonymously: async () => ({ error: null }),
    },
    from: table => {
      assert.equal(table, 'profiles'); let ownerId, patch, insertion;
      const builder = {
        select: () => builder,
        eq: (column, value) => { assert.equal(column, 'user_id'); ownerId = value; return builder; },
        maybeSingle: () => { reads.push(ownerId); return nextRead(ownerId); },
        update: updates => { patch = updates; return builder; },
        insert: payload => { insertion = payload; return builder; },
        single: () => {
          if (insertion) { inserts.push(insertion); return nextInsert(insertion); }
          writes.push({ ownerId, patch }); return Promise.resolve({ data: { ...row(ownerId), ...patch }, error: null });
        },
      };
      return builder;
    },
  };
  const react = {
    useState: initial => { const i = hookIndex++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = value; }]; },
    useCallback: fn => fn,
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useEffect: fn => { if (!effects.length) effects.push(fn); },
    createContext: value => ({ value, Provider: Symbol('Provider') }),
    useContext: context => context.value,
  };
  let context;
  const auth = loadModule('../src/hooks/useAuth.tsx', {
    react,
    'react/jsx-runtime': { jsx: (_type, props) => { context = props.value; return props; } },
    '@/integrations/supabase/client': { supabase: fakeSupabase, isSupabaseConfigured: true },
    '@/lib/profileCache': { createProfileCache: repository => createProfileCache(repository, () => now) },
  }, { window, document });
  const { useProfile } = loadModule('../src/hooks/useProfile.tsx', { './useAuth': { useAuth: () => context } });
  function render() { hookIndex = 0; auth.AuthProvider({ children: null }); return context; }
  render(); cleanups.push(effects[0]());
  return {
    reads, writes, inserts, bootstrap, render, useProfile, window, document,
    advance: ms => { now += ms; },
    emit: (event, account) => authListener(event, account ? { user: account } : null),
    setRead: fn => { nextRead = fn; }, setInsert: fn => { nextInsert = fn; },
    cleanup: () => { cleanups.forEach(fn => fn()); assert.equal(unsubscribed, 1); },
  };
}

{
  const fixture = authFixture();
  fixture.emit('INITIAL_SESSION', user('a')); await tick(); await flush();
  let auth = fixture.render();
  assert.equal(auth.profile.user_id, 'a');
  for (let i = 0; i < 30; i++) assert.equal(fixture.useProfile().profile, auth.profile);
  fixture.bootstrap.resolve({ data: { session: { user: user('a') } } }); await flush();
  for (const event of ['TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED', 'INITIAL_SESSION']) fixture.emit(event, user('a'));
  await tick(); await flush();
  assert.deepEqual(fixture.reads, ['a'], '30 consumers, bootstrap and repeated auth events perform only one profile read');
  auth = fixture.render();
  const staleSave = auth.updateProfile;
  const staleRefresh = auth.refetchProfile;
  await fixture.useProfile().updateProfile({ display_name: 'Updated for every consumer' });
  auth = fixture.render();
  assert.equal(auth.profile.display_name, 'Updated for every consumer');
  assert.equal(fixture.useProfile().profile, auth.profile);
  assert.equal(fixture.reads.length, 1, 'returned update row updates the cache without another read');
  await fixture.useProfile().refetch(); fixture.render();
  assert.equal(fixture.reads.length, 2);
  fixture.emit('SIGNED_OUT', null); auth = fixture.render();
  assert.equal(auth.profile, null); assert.equal(auth.needsOnboarding, false);
  fixture.emit('SIGNED_IN', user('b')); await tick(); await flush(); auth = fixture.render();
  assert.equal(auth.profile.user_id, 'b');
  await assert.rejects(staleSave({ display_name: 'A callback' }), /account changed/);
  const readsBeforeStaleRefresh = fixture.reads.length;
  await staleRefresh();
  assert.equal(fixture.reads.length, readsBeforeStaleRefresh, 'an old account refresh callback cannot invalidate the new account');
  assert.equal(fixture.writes.length, 1);
  fixture.cleanup();
}

{
  const fixture = authFixture('SIGNED_OUT');
  fixture.bootstrap.resolve({ data: { session: { user: user('stale') } } });
  await flush(); await tick();
  assert.equal(fixture.render().user, null, 'a synchronous subscription logout also fences bootstrap');
  assert.equal(fixture.reads.length, 0);
  fixture.cleanup();
}

{
  const fixture = authFixture();
  fixture.emit('SIGNED_OUT', null);
  fixture.bootstrap.resolve({ data: { session: { user: user('stale') } } });
  await flush(); await tick();
  assert.equal(fixture.render().user, null, 'late getSession cannot restore a logged-out account');
  assert.equal(fixture.reads.length, 0);
  fixture.emit('SIGNED_IN', user('first'));
  fixture.emit('SIGNED_IN', user('second'));
  await tick(); await flush();
  assert.deepEqual(fixture.reads, ['second'], 'account changes cancel stale deferred profile fetches');
  fixture.emit('SIGNED_IN', user('guest', { is_anonymous: true })); await tick();
  assert.equal(fixture.render().profile, null); assert.equal(fixture.reads.length, 1);
  fixture.cleanup();
}

{
  const fixture = authFixture();
  fixture.bootstrap.resolve({ data: { session: null } }); await flush();
  fixture.setRead(() => Promise.resolve({ data: null, error: { message: 'Network unavailable' } }));
  fixture.emit('SIGNED_IN', user('a')); await tick(); await flush();
  assert.equal(fixture.inserts.length, 0, 'network/read failures never create profiles');
  assert.equal(fixture.render().profileError.message, 'Network unavailable');
  fixture.setRead(() => Promise.resolve({ data: null, error: null }));
  await fixture.render().refetchProfile();
  assert.equal(fixture.inserts.length, 1);
  assert.equal(fixture.inserts[0].user_id, 'a');
  assert.equal(fixture.inserts[0].display_name, 'a', 'creation uses the same captured user without another auth getUser call');
  fixture.cleanup();
}

{
  const fixture = authFixture();
  const pending = deferred();
  fixture.setRead(() => pending.promise);
  fixture.emit('SIGNED_IN', user('old')); await tick(); await flush();
  fixture.emit('SIGNED_OUT', null);
  pending.resolve({ data: null, error: null }); await flush();
  assert.equal(fixture.inserts.length, 0, 'late missing-row read cannot create a profile after logout');
  assert.equal(fixture.render().profile, null);
  fixture.cleanup();
}

{
  const fixture = authFixture();
  let calls = 0;
  fixture.setRead(ownerId => Promise.resolve({ data: calls++ === 0 ? null : row(ownerId, 'Created by trigger'), error: null }));
  fixture.setInsert(() => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate row' } }));
  fixture.emit('SIGNED_IN', user('a')); await tick(); await flush();
  assert.equal(fixture.render().profile.display_name, 'Created by trigger', 'creation races read the existing row without overwriting it');
  fixture.cleanup();
}

{
  const fixture = authFixture();
  fixture.emit('SIGNED_IN', user('a')); await tick(); await flush();
  for (const event of ['focus', 'online']) fixture.window.dispatchEvent(new Event(event));
  fixture.document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(fixture.reads.length, 1, 'fresh profiles are not read on every focus or online event');
  fixture.advance(60_000);
  fixture.document.visibilityState = 'hidden';
  fixture.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(fixture.reads.length, 1, 'hidden tabs do not revalidate profiles');
  fixture.document.visibilityState = 'visible';
  fixture.document.dispatchEvent(new Event('visibilitychange'));
  fixture.window.dispatchEvent(new Event('focus'));
  fixture.window.dispatchEvent(new Event('online')); await flush();
  assert.equal(fixture.reads.length, 2, 'stale visible profiles refresh once across clustered lifecycle events');
  fixture.setRead(() => Promise.resolve({ data: null, error: { message: 'Offline' } }));
  fixture.advance(60_000); fixture.window.dispatchEvent(new Event('online')); await flush();
  fixture.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(fixture.reads.length, 3, 'failed automatic refreshes are throttled too');
  fixture.setRead(ownerId => Promise.resolve({ data: row(ownerId, 'Signup name'), error: null }));
  await fixture.render().invalidateProfile('a');
  assert.equal(fixture.render().profile.display_name, 'Signup name', 'direct signup invalidation bypasses stale-time throttle');
  await fixture.render().invalidateProfile('other');
  assert.equal(fixture.reads.length, 4, 'targeted invalidation cannot refresh a different account');
  fixture.cleanup();
  fixture.advance(60_000); fixture.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(fixture.reads.length, 4, 'unmount removes lifecycle listeners');
}

{
  const { cache, reads } = cacheFixture();
  cache.activate(user('a'));
  const stale = cache.ensure(); await flush();
  const invalidated = cache.invalidate('a'); await flush();
  assert.equal(reads.length, 2);
  reads[1].resolve(row('a', 'Signup name')); await invalidated;
  reads[0].resolve(row('a', 'Old signup row')); await stale;
  assert.equal(cache.getSnapshot().profile.display_name, 'Signup name', 'direct-write invalidation fences in-flight stale reads');
}

{
  const fixture = authFixture();
  fixture.setRead(() => Promise.resolve({ data: null, error: { message: 'Initially offline' } }));
  fixture.emit('SIGNED_IN', user('a')); await tick(); await flush();
  assert.equal(fixture.render().profile, null);
  assert.equal(fixture.render().profileError.message, 'Initially offline');
  fixture.advance(10_000);
  for (let i = 0; i < 10; i++) fixture.window.dispatchEvent(new Event('focus'));
  await flush();
  assert.equal(fixture.reads.length, 1, 'focus storms remain throttled after an initial failure');
  fixture.setRead(ownerId => Promise.resolve({ data: row(ownerId, 'Recovered online'), error: null }));
  fixture.window.dispatchEvent(new Event('online'));
  fixture.window.dispatchEvent(new Event('online'));
  fixture.window.dispatchEvent(new Event('focus'));
  await flush();
  assert.equal(fixture.reads.length, 2, 'reconnection bypasses the failed initial read throttle and coalesces concurrent events');
  assert.equal(fixture.render().profile.display_name, 'Recovered online', 'initial offline failure recovers without any later lifecycle event');
  assert.equal(fixture.render().profileError, null);
  fixture.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(fixture.reads.length, 2, 'successful recovery starts the ordinary revalidation throttle');
  fixture.cleanup();
}

{
  const fixture = authFixture();
  fixture.setRead(() => Promise.resolve({ data: null, error: { message: 'Initially offline' } }));
  fixture.emit('SIGNED_IN', user('a')); await tick(); await flush();
  fixture.advance(10_000);
  fixture.document.visibilityState = 'hidden';
  fixture.window.dispatchEvent(new Event('online')); await flush();
  assert.equal(fixture.reads.length, 1, 'hidden reconnects do not issue a background read');
  fixture.setRead(ownerId => Promise.resolve({ data: row(ownerId, 'Recovered on return'), error: null }));
  fixture.document.visibilityState = 'visible';
  fixture.document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(fixture.reads.length, 2, 'returning to the tab consumes the pending reconnect recovery');
  assert.equal(fixture.render().profile.display_name, 'Recovered on return');
  fixture.cleanup();
}

{
  const fixture = authFixture();
  fixture.emit('SIGNED_IN', user('a')); await tick(); await flush();
  fixture.render();
  const oldFocusRead = deferred();
  fixture.setRead(() => oldFocusRead.promise);
  fixture.advance(60_000);
  fixture.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(fixture.reads.length, 2);
  // uploadAvatar writes outside useProfile and its existing callers then invoke
  // the public refetch. That refresh must start after the committed upload.
  fixture.setRead(ownerId => Promise.resolve({ data: { ...row(ownerId), avatar_url: 'new-avatar.png' }, error: null }));
  await fixture.useProfile().refetch();
  assert.equal(fixture.reads.length, 3, 'explicit post-write refresh starts a new read instead of joining the pre-write focus request');
  assert.equal(fixture.render().profile.avatar_url, 'new-avatar.png');
  oldFocusRead.resolve({ data: { ...row('a'), avatar_url: 'old-avatar.png' }, error: null });
  await flush();
  assert.equal(fixture.render().profile.avatar_url, 'new-avatar.png', 'late pre-upload read cannot overwrite the refreshed avatar');
  assert.equal(fixture.useProfile().loading, false);
  fixture.cleanup();
}

const authPage = readFileSync(new URL('../src/components/AuthPage.tsx', import.meta.url), 'utf8');
assert.match(authPage, /if \(!profileError\) await invalidateProfile\(data.user.id\)/, 'signup invalidates the matching profile only after its upsert succeeds');
const onboarding = readFileSync(new URL('../src/components/OnboardingScreen.tsx', import.meta.url), 'utf8');
assert.match(onboarding, /await updateProfile\(/, 'onboarding must publish through the shared profile cache');
assert.doesNotMatch(onboarding, /\.from\(['"]profiles['"]\)/);
console.log('PASS: production AuthProvider/useProfile bootstrap and token-event dedup, shared updates, logout fencing, safe missing-row creation and onboarding cache wiring');
