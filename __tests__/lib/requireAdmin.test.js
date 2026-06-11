import { describe, it, expect, vi, beforeEach } from 'vitest';

// next/headers is imported at module top in requireAdmin.js (for requireAdmin's
// cookie read). Mock it so importing the SUT in node is clean; these tests
// exercise the header-token path (requireAdminApi) which does not touch cookies.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock('@/lib/authCookies', () => ({ SB_ACCESS_TOKEN_COOKIE: 'sb-access-token' }));

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: vi.fn(() => null),
  getUserFromToken: vi.fn(async () => null),
  getSupabaseWithToken: vi.fn(),
}));

const { isAdminEmail, requireAdminApi } = await import('@/lib/requireAdmin');
const supabaseServer = await import('@/lib/supabaseServer');

beforeEach(() => {
  process.env.ADMIN_EMAILS = 'michaelcharlesg@icloud.com, Ops@StudentX.uk';
  vi.mocked(supabaseServer.extractToken).mockReset();
  vi.mocked(supabaseServer.getUserFromToken).mockReset();
});

describe('isAdminEmail', () => {
  it('matches allowlisted emails case-insensitively', () => {
    expect(isAdminEmail('michaelcharlesg@icloud.com')).toBe(true);
    expect(isAdminEmail('OPS@studentx.uk')).toBe(true);
  });
  it('rejects non-allowlisted, empty, and nullish emails', () => {
    expect(isAdminEmail('someone@else.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
  it('rejects everyone when ADMIN_EMAILS is unset (the current prod state)', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('michaelcharlesg@icloud.com')).toBe(false);
  });
});

describe('requireAdminApi', () => {
  it('401s when no bearer token is present', async () => {
    vi.mocked(supabaseServer.extractToken).mockReturnValue(null);
    const r = await requireAdminApi(new Request('https://x/admin'));
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('401s when the token does not resolve to a user', async () => {
    vi.mocked(supabaseServer.extractToken).mockReturnValue('tok');
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue(null);
    const r = await requireAdminApi(new Request('https://x/admin'));
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it('403s when the user is signed in but not allowlisted', async () => {
    vi.mocked(supabaseServer.extractToken).mockReturnValue('tok');
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({ email: 'nope@x.com' });
    const r = await requireAdminApi(new Request('https://x/admin'));
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it('passes an allowlisted admin through', async () => {
    vi.mocked(supabaseServer.extractToken).mockReturnValue('tok');
    vi.mocked(supabaseServer.getUserFromToken).mockResolvedValue({ email: 'michaelcharlesg@icloud.com' });
    const r = await requireAdminApi(new Request('https://x/admin'));
    expect(r).toMatchObject({ ok: true, token: 'tok' });
    expect(r.user.email).toBe('michaelcharlesg@icloud.com');
  });
});
