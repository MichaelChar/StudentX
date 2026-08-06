import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireAdminApi = vi.fn();
const getSupabaseAsService = vi.fn();

vi.mock('@/lib/requireAdmin', () => ({
  requireAdminApi: (...args) => requireAdminApi(...args),
  isAdminEmail: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseAsService: (...args) => getSupabaseAsService(...args),
  extractToken: vi.fn(),
  getUserFromToken: vi.fn(),
  getSupabaseWithToken: vi.fn(),
}));

const { GET, POST } = await import('@/app/api/admin/listing-go-live/route');

function makeQuery(result) {
  const c = {
    select: () => c,
    eq: () => c,
    neq: () => c,
    order: () => c,
    limit: () => c,
    maybeSingle: () => Promise.resolve(result),
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
    then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
  };
  return c;
}

beforeEach(() => {
  requireAdminApi.mockReset();
  getSupabaseAsService.mockReset();
});

describe('admin listing-go-live auth', () => {
  it('refuses non-admin on GET', async () => {
    requireAdminApi.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Forbidden',
    });
    const res = await GET(
      new Request('https://x/api/admin/listing-go-live?filter=candidates'),
    );
    expect(res.status).toBe(403);
  });

  it('refuses non-admin on POST', async () => {
    requireAdminApi.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'Forbidden',
    });
    const res = await POST(
      new Request('https://x/api/admin/listing-go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: '0100001', action: 'approve' }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('admin listing-go-live approve gates', () => {
  it('rejects approve when video verification missing', async () => {
    requireAdminApi.mockResolvedValue({
      ok: true,
      user: { email: 'ops@studentx.uk' },
      token: 't',
    });

    getSupabaseAsService.mockReturnValue({
      from: () =>
        makeQuery({
          data: {
            listing_id: '0100001',
            listing_status: 'disabled',
            flags: { listing_status: 'submitted' },
            landlords: { landlord_id: '0100', is_verified: true, email: 'a@b.c' },
            property_verifications: [],
          },
          error: null,
        }),
    });

    const res = await POST(
      new Request('https://x/api/admin/listing-go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: '0100001', action: 'approve' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.missing).toContain('video_call');
  });

  it('approves when all gates pass', async () => {
    requireAdminApi.mockResolvedValue({
      ok: true,
      user: { email: 'ops@studentx.uk' },
      token: 't',
    });

    let updated = null;
    getSupabaseAsService.mockReturnValue({
      from: () => {
        const c = {
          select: () => c,
          eq: (col, val) => {
            if (col === 'listing_id' && updated) {
              return Promise.resolve({ error: null });
            }
            return c;
          },
          maybeSingle: () =>
            Promise.resolve({
              data: {
                listing_id: '0100001',
                listing_status: 'disabled',
                flags: { listing_status: 'submitted' },
                landlords: {
                  landlord_id: '0100',
                  is_verified: true,
                  email: 'a@b.c',
                },
                property_verifications: [
                  {
                    verification_id: 'v1',
                    method: 'video_call',
                    status: 'approved',
                    verified_at: '2026-08-01T00:00:00Z',
                  },
                ],
              },
              error: null,
            }),
          update: (payload) => {
            updated = payload;
            return {
              eq: () => Promise.resolve({ error: null }),
            };
          },
        };
        return c;
      },
    });

    const res = await POST(
      new Request('https://x/api/admin/listing-go-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: '0100001', action: 'approve' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing_status).toBe('active');
    expect(body.flags.admin_live_approved).toBe(true);
    expect(updated.listing_status).toBe('active');
  });
});
