import { deepStrictEqual, equal, rejects } from 'node:assert/strict';
import { authorizedArcModelRoute, isArcModelAdmin } from './arcModelAccess.ts';
import { ARC_ASTRA, ARC_LUNA, ARC_SOL, ArcModelAccessError } from './arcModelRouting.ts';

const user = { id: 'verified-owner' };
const spoofed = {
  modelSelection: ARC_ASTRA, isAdmin: true, hasBoost: true,
  userId: 'administrator', user_id: 'administrator',
  profile: { isAdmin: true, hasBoost: true, role: 'admin' },
  user_metadata: { role: 'admin', is_admin: true },
  app_metadata: { role: 'admin' }, reasoningEffort: 'high',
  messages: [{ role: 'user', content: 'Hi' }],
};

function fixture(options: {
  adminId?: string | null; boost?: unknown; adminError?: unknown; boostError?: unknown;
  throwAdmin?: boolean; throwBoost?: boolean;
} = {}) {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    db: {
      from(name: string) {
        calls.push(['from', name]);
        equal(name, 'admin_users');
        return { select(columns: string) {
          equal(columns, 'user_id');
          return { eq(column: string, id: string) {
            equal(column, 'user_id'); equal(id, user.id);
            calls.push(['admin_user_id', id]);
            return { async maybeSingle() {
              if (options.throwAdmin) throw new Error('admin lookup interrupted');
              return { data: options.adminId ? { user_id: options.adminId } : null,
                error: options.adminError ?? null };
            } };
          } };
        } };
      },
      async rpc(name: string, args?: Record<string, unknown>) {
        calls.push([name, args]);
        equal(name, 'user_has_boost');
        deepStrictEqual(args, { check_user_id: user.id });
        if (options.throwBoost) throw new Error('Boost lookup interrupted');
        return { data: options.boost ?? false, error: options.boostError ?? null };
      },
    },
  };
}

const isAccessError = (status: number) => (error: unknown) =>
  error instanceof ArcModelAccessError && error.status === status;

Deno.test('Astra authorizes existing Boost RPC and exact admin_users identity', async () => {
  const boost = fixture({ boost: true });
  const paid = await authorizedArcModelRoute(boost.db, user, spoofed);
  equal(paid.model, ARC_ASTRA); equal(paid.effort, 'low');
  equal(paid.hasBoost, true); equal(paid.isAdmin, false);
  equal(boost.calls.filter(([name]) => name === 'user_has_boost').length, 1);

  const admin = fixture({ adminId: user.id, boostError: 'unused Boost lookup' });
  const owner = await authorizedArcModelRoute(admin.db, user, spoofed);
  equal(owner.model, ARC_ASTRA); equal(owner.isAdmin, true);
  equal(admin.calls.filter(([name]) => name === 'user_has_boost').length, 0);
  equal(await isArcModelAdmin(fixture({ adminId: 'another-user' }).db, user.id), false);
});

Deno.test('Free, malformed Boost results, and forged profile flags cannot grant Astra', async () => {
  for (const boost of [false, null, 'true', 1, { hasBoost: true }, [true]]) {
    const f = fixture({ boost });
    await rejects(() => authorizedArcModelRoute(f.db, user, spoofed), isAccessError(403));
  }
  await rejects(() => authorizedArcModelRoute(fixture({ adminId: 'another-user' }).db,
    user, spoofed), isAccessError(403));
});

Deno.test('Astra guests and anonymous identities never perform entitlement lookup', async () => {
  for (const guest of [null, undefined, { ...user, is_anonymous: true }]) {
    const f = fixture({ adminId: user.id, boost: true });
    await rejects(() => authorizedArcModelRoute(f.db, guest, spoofed), isAccessError(403));
    equal(f.calls.length, 0);
  }
});

Deno.test('Entitlement errors fail closed even when a result also claims access', async () => {
  for (const options of [
    { adminError: 'unavailable' }, { adminId: user.id, adminError: 'unavailable' },
    { boostError: 'unavailable' }, { boost: true, boostError: 'unavailable' },
  ]) {
    await rejects(() => authorizedArcModelRoute(fixture(options).db, user, spoofed), isAccessError(503));
  }
  for (const options of [{ throwAdmin: true }, { throwBoost: true }]) {
    await rejects(() => authorizedArcModelRoute(fixture(options).db, user, spoofed), /interrupted/);
  }
});

Deno.test('Luna and Sol routing do not require Boost and untrusted effort is bounded', async () => {
  for (const modelSelection of [ARC_LUNA, ARC_SOL, 'auto']) {
    const f = fixture({ adminError: 'unused', boostError: 'unused' });
    const route = await authorizedArcModelRoute(f.db, user, { ...spoofed, modelSelection });
    equal(route.model, modelSelection === 'auto' ? ARC_LUNA : modelSelection);
    equal(route.effort, modelSelection === ARC_SOL ? 'low' : 'none');
    equal(f.calls.length, 0);
  }
  for (const prompt of ['Draft a short email', 'Debug my app', 'Search the web for news']) {
    const route = await authorizedArcModelRoute(fixture().db, user, {
      modelSelection: 'auto', prompt,
    });
    equal(route.model, ARC_SOL);
  }
  const complex = await authorizedArcModelRoute(fixture({ boost: true }).db, user, {
    ...spoofed, messages: [{ role: 'user', content: 'Compare these exhaustive multi-step alternatives' }],
  });
  equal(complex.effort, 'medium');
});

Deno.test('Legacy premium hints retain authorization and explicit Luna wins over them', async () => {
  for (const hint of [{ model: ARC_ASTRA }, { reasoningSelection: ARC_ASTRA }]) {
    await rejects(() => authorizedArcModelRoute(fixture().db, user, hint), isAccessError(403));
    equal((await authorizedArcModelRoute(fixture({ boost: true }).db, user, hint)).model, ARC_ASTRA);
    equal((await authorizedArcModelRoute(fixture().db, user,
      { ...hint, modelSelection: ARC_LUNA })).model, ARC_LUNA);
  }
});
