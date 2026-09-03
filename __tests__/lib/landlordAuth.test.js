import { describe, it, expect, vi } from 'vitest';
import { landlordIdForUser, landlordRowForUser } from '@/lib/landlordAuth';

/** Minimal PostgREST-shaped stub: .from().select().eq().single() */
function client(result, spy = {}) {
  return {
    from: (table) => {
      spy.table = table;
      return {
        select: (columns) => {
          spy.columns = columns;
          return {
            eq: (col, val) => {
              spy.eq = [col, val];
              return { single: async () => result };
            },
          };
        },
      };
    },
  };
}

describe('landlordIdForUser', () => {
  it('returns the landlord id for a user who has one', async () => {
    const c = client({ data: { landlord_id: '0106' }, error: null });
    expect(await landlordIdForUser(c, 'auth-1')).toBe('0106');
  });

  /*
    A signed-in student, or a landlord mid-signup, has no landlord row. That is
    an ordinary outcome the routes turn into a 404 — never an exception, and
    never a silent success.
  */
  it('returns null when the user has no landlord profile', async () => {
    const c = client({ data: null, error: { code: 'PGRST116' } });
    expect(await landlordIdForUser(c, 'auth-1')).toBeNull();
  });

  it('queries landlords by auth_user_id and asks only for the id', async () => {
    const spy = {};
    await landlordIdForUser(client({ data: { landlord_id: '0106' } }, spy), 'auth-9');
    expect(spy.table).toBe('landlords');
    expect(spy.columns).toBe('landlord_id');
    expect(spy.eq).toEqual(['auth_user_id', 'auth-9']);
  });

  /*
    Guards the call sites rather than the query: a route that forgot to pass a
    client, or one whose token produced no user, must get null instead of a
    TypeError surfacing as a 500.
  */
  it('returns null rather than throwing when given nothing', async () => {
    expect(await landlordIdForUser(null, 'auth-1')).toBeNull();
    expect(await landlordIdForUser(client({ data: null }), null)).toBeNull();
    expect(await landlordIdForUser(undefined, undefined)).toBeNull();
  });
});

describe('landlordRowForUser', () => {
  it('returns the whole row, so a caller can read more than the id', async () => {
    const row = { landlord_id: '0106', is_verified: true };
    expect(await landlordRowForUser(client({ data: row }), 'a', 'landlord_id, is_verified'))
      .toEqual(row);
  });

  it('passes the requested column list straight through', async () => {
    const spy = {};
    await landlordRowForUser(client({ data: {} }, spy), 'a', 'landlord_id, is_verified');
    expect(spy.columns).toBe('landlord_id, is_verified');
  });

  it('defaults to the id alone', async () => {
    const spy = {};
    await landlordRowForUser(client({ data: {} }, spy), 'a');
    expect(spy.columns).toBe('landlord_id');
  });

  it('returns null for a user with no row', async () => {
    expect(await landlordRowForUser(client({ data: null, error: {} }), 'a')).toBeNull();
  });
});

/*
  The whole point of the module. The lookup used to run on a service-role
  client in eleven routes, on the belief that migration 065 made it impossible
  otherwise. 065 removed auth_user_id from the ANON allowlist only —
  `authenticated` kept SELECT — so the caller's own token suffices, and the
  service-role key (which bypasses RLS entirely) is not needed.
*/
describe('it never reaches for a service-role client', () => {
  it('uses only the client it was handed', async () => {
    const handed = vi.fn(() => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { landlord_id: 'X' } }) }) }),
    }));
    const id = await landlordIdForUser({ from: handed }, 'auth-1');
    expect(id).toBe('X');
    expect(handed).toHaveBeenCalledTimes(1);
  });
});
