import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Property verification API guards:
 *  - non-admin refused on admin endpoints
 *  - duplicate pending requests rejected (409)
 */

const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseAsService = vi.fn();
const requireAdminApi = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseAsService: (...args) => getSupabaseAsService(...args),
  getSupabaseWithToken: vi.fn(),
}));

vi.mock('@/lib/requireAdmin', () => ({
  requireAdminApi: (...args) => requireAdminApi(...args),
  isAdminEmail: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/propertyVerificationEmail', () => ({
  sendPropertyVerificationApprovedEmail: vi.fn(async () => {}),
  sendPropertyVerificationRejectedEmail: vi.fn(async () => {}),
}));

const { GET: adminListGet } = await import(
  '@/app/api/admin/property-verifications/route'
);
const { PATCH: adminPatch } = await import(
  '@/app/api/admin/property-verifications/[id]/route'
);
const { POST: landlordRequestPost } = await import(
  '@/app/api/landlord/listings/[id]/property-verification/route'
);

function chain(terminal, { onInsert } = {}) {
  const c = {
    select: () => c,
    eq: () => c,
    is: () => c,
    not: () => c,
    order: () => c,
    maybeSingle: () => Promise.resolve(terminal),
    single: () => Promise.resolve(terminal),
    insert: (payload) => {
      if (onInsert) onInsert(payload);
      return {
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                verification_id: 'new-v',
                listing_id: '0100001',
                method: 'video_call',
                verified_at: null,
                checklist_json: {},
                notes: null,
                created_at: '2026-08-02T00:00:00Z',
              },
              error: null,
            }),
        }),
      };
    },
    update: () => c,
    then: (onFulfilled) => Promise.resolve(terminal).then(onFulfilled),
  };
  return c;
}

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseAsService.mockReset();
  requireAdminApi.mockReset();
});

describe('admin property-verifications auth', () => {
  it('refuses a non-admin on GET list', async () => {
    requireAdminApi.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Forbidden',
    });

    const res = await adminListGet(
      new Request('https://x/api/admin/property-verifications?status=pending'),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('refuses a non-admin on PATCH approve/reject', async () => {
    requireAdminApi.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Forbidden',
    });

    const res = await adminPatch(
      new Request('https://x/api/admin/property-verifications/v1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('refuses unauthenticated callers (401)', async () => {
    requireAdminApi.mockResolvedValue({
      ok: false,
      status: 401,
      error: 'Unauthorized',
    });

    const res = await adminListGet(
      new Request('https://x/api/admin/property-verifications'),
    );
    expect(res.status).toBe(401);
  });
});

describe('landlord property-verification request', () => {
  it('rejects a duplicate pending request with 409', async () => {
    extractToken.mockReturnValue('tok');
    getUserFromToken.mockResolvedValue({ id: 'user-1', email: 'll@x.com' });

    getSupabaseAsService.mockReturnValue({
      from(name) {
        if (name === 'landlords') {
          return chain({ data: { landlord_id: '0100' }, error: null });
        }
        if (name === 'listings') {
          return chain({
            data: { listing_id: '0100001', landlord_id: '0100' },
            error: null,
          });
        }
        if (name === 'property_verifications') {
          // select existing → one pending row; insert should never run
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    {
                      verification_id: 'existing',
                      verified_at: null,
                      checklist_json: {},
                      created_at: '2026-08-01T00:00:00Z',
                    },
                  ],
                  error: null,
                }),
            }),
            insert: () => {
              throw new Error('insert must not be called on duplicate pending');
            },
          };
        }
        return chain({ data: null, error: null });
      },
    });

    const res = await landlordRequestPost(
      new Request(
        'https://x/api/landlord/listings/0100001/property-verification',
        { method: 'POST' },
      ),
      { params: Promise.resolve({ id: '0100001' }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/pending/i);
  });

  it('creates a pending video_call row when none exists', async () => {
    extractToken.mockReturnValue('tok');
    getUserFromToken.mockResolvedValue({ id: 'user-1', email: 'll@x.com' });

    let inserted = null;
    getSupabaseAsService.mockReturnValue({
      from(name) {
        if (name === 'landlords') {
          return chain({ data: { landlord_id: '0100' }, error: null });
        }
        if (name === 'listings') {
          return chain({
            data: { listing_id: '0100001', landlord_id: '0100' },
            error: null,
          });
        }
        if (name === 'property_verifications') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
            insert: (payload) => {
              inserted = payload;
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        verification_id: 'new-v',
                        ...payload,
                        created_at: '2026-08-02T00:00:00Z',
                      },
                      error: null,
                    }),
                }),
              };
            },
          };
        }
        return chain({ data: null, error: null });
      },
    });

    const res = await landlordRequestPost(
      new Request(
        'https://x/api/landlord/listings/0100001/property-verification',
        { method: 'POST' },
      ),
      { params: Promise.resolve({ id: '0100001' }) },
    );
    expect(res.status).toBe(201);
    expect(inserted).toMatchObject({
      listing_id: '0100001',
      method: 'video_call',
      verified_at: null,
    });
  });

  it('401s when the landlord is not authenticated', async () => {
    extractToken.mockReturnValue(null);
    const res = await landlordRequestPost(
      new Request(
        'https://x/api/landlord/listings/0100001/property-verification',
        { method: 'POST' },
      ),
      { params: Promise.resolve({ id: '0100001' }) },
    );
    expect(res.status).toBe(401);
  });
});
