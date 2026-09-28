import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  POST /api/landlord/compute-university-distances: the wizard's prefill.
  It measures with the SAME loader as the server-side re-measures
  (src/lib/measureTargets.js), so the two can't disagree about one pin.
*/

let token = 'jwt';
let targets = { faculties: [{ faculty_id: 'auth-law' }], universities: [{ university_id: 'uom' }] };

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: () => token,
  getUserFromToken: vi.fn(async () => ({ id: 'auth-1' })),
  getSupabaseWithToken: vi.fn(() => ({ tag: 'token-client' })),
}));
vi.mock('@/lib/measureTargets', () => ({ loadMeasureTargets: vi.fn(async () => targets) }));
vi.mock('@/lib/computeUniversityDistances', () => ({
  computeUniversityDistances: vi.fn(async () => [
    { university_id: 'auth', distance_meters: 678, source: 'computed' },
  ]),
}));

const { POST } = await import('@/app/api/landlord/compute-university-distances/route');
const { loadMeasureTargets } = await import('@/lib/measureTargets');
const { computeUniversityDistances } = await import('@/lib/computeUniversityDistances');

function post(body) {
  return POST(new Request('https://studentx.uk/api/landlord/compute-university-distances', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  token = 'jwt';
  targets = { faculties: [{ faculty_id: 'auth-law' }], universities: [{ university_id: 'uom' }] };
});

describe('POST /api/landlord/compute-university-distances', () => {
  it('measures the pin against the shared loader\'s targets', async () => {
    const res = await post({ lat: 40.6294, lng: 22.9666 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      distances: [{ university_id: 'auth', distance_meters: 678, source: 'computed' }],
    });
    // The landlord's own token client, not a service key (faculties are public).
    expect(loadMeasureTargets).toHaveBeenCalledWith({ tag: 'token-client' }, '[compute-university-distances]');
    expect(computeUniversityDistances).toHaveBeenCalledWith(
      { lat: 40.6294, lng: 22.9666 },
      targets.faculties,
      { universities: targets.universities },
    );
  });

  it('500s when the faculties cannot be loaded', async () => {
    targets = { error: 'faculties: boom' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post({ lat: 40.6294, lng: 22.9666 });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(computeUniversityDistances).not.toHaveBeenCalled();
  });

  it('400s without coordinates and 401s without a token', async () => {
    expect((await post({ lat: 'x' })).status).toBe(400);
    token = null;
    expect((await post({ lat: 40.6, lng: 22.9 })).status).toBe(401);
    expect(loadMeasureTargets).not.toHaveBeenCalled();
  });
});
