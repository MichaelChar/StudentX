import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Landlord may only see a booking (and its guest profile) for their own
 * listings. Foreign bookings → 404. Student email never appears in the
 * landlord-facing GET /api/bookings/[id] response.
 */

const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();
const getSupabaseAsService = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
  getSupabaseAsService: (...args) => getSupabaseAsService(...args),
}));

const inquiryIdForBooking = vi.fn();

vi.mock('@/lib/bookingService', () => ({
  applyTransition: vi.fn(),
  confirmMoveIn: vi.fn(),
  reportMoveInProblem: vi.fn(),
  inquiryIdForBooking: (...args) => inquiryIdForBooking(...args),
  acceptBooking: vi.fn(),
  declineBooking: vi.fn(),
}));

const { GET } = await import('@/app/api/bookings/[id]/route');

function chain(terminal) {
  const c = {
    select: () => c,
    eq: () => c,
    order: () => c,
    maybeSingle: () => Promise.resolve(terminal),
    then: (onFulfilled) => Promise.resolve(terminal).then(onFulfilled),
  };
  return c;
}

function landlordAuthClient(landlord) {
  return {
    from(name) {
      if (name === 'students') return chain({ data: null, error: null });
      if (name === 'landlords') return chain({ data: landlord, error: null });
      return chain({ data: null, error: null });
    },
  };
}

const guestStudent = {
  student_id: 's-guest',
  display_name: 'Ada Lovelace',
  date_of_birth: '2001-12-10',
  gender: 'woman',
  nationality: 'GB',
  languages: ['en'],
  bio: 'Maths student.',
  home_university: 'other',
  receiving_university: 'auth',
  receiving_faculty: 'auth-sciences',
  funding_source: 'scholarship',
  created_at: '2025-06-01T00:00:00Z',
};

const ownListingBooking = {
  booking_id: 'b-own',
  student_id: 's-guest',
  listing_id: '0100001',
  move_in: '2026-09-01',
  move_out: '2026-12-01',
  monthly_rent: 450,
  total_stay_value: 1350,
  state: 'requested',
  last_activity_at: '2026-08-01T00:00:00Z',
  created_at: '2026-08-01T00:00:00Z',
  students: guestStudent,
  listings: {
    listing_id: '0100001',
    title: 'Studio',
    landlord_id: '0001',
    location: { address: '1 Main', neighborhood: 'Center' },
    rent: { monthly_price: 450, deposit: 450 },
  },
};

const foreignListingBooking = {
  ...ownListingBooking,
  booking_id: 'b-foreign',
  listings: {
    ...ownListingBooking.listings,
    listing_id: '9999001',
    landlord_id: '9999',
  },
};

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
  getSupabaseAsService.mockReset();
  inquiryIdForBooking.mockReset();
  inquiryIdForBooking.mockResolvedValue(null);
});

function authAsLandlord() {
  extractToken.mockReturnValue('tok');
  getUserFromToken.mockResolvedValue({ id: 'user-ll' });
  getSupabaseWithToken.mockReturnValue(
    landlordAuthClient({ landlord_id: '0001', name: 'Kostas', email: 'll@x.test' }),
  );
}

const req = () => ({
  headers: { get: () => null },
});

describe('landlord booking ownership + guest privacy', () => {
  it('returns 404 when the booking is on another landlord\'s listing', async () => {
    authAsLandlord();
    getSupabaseAsService.mockReturnValue({
      from(name) {
        if (name === 'bookings') {
          return chain({ data: foreignListingBooking, error: null });
        }
        if (name === 'booking_events') {
          return chain({ data: [], error: null });
        }
        return chain({ data: null, error: null });
      },
    });

    const res = await GET(req(), { params: Promise.resolve({ id: 'b-foreign' }) });
    expect(res.status).toBe(404);
  });

  it('returns the guest profile without email for own bookings', async () => {
    authAsLandlord();
    getSupabaseAsService.mockReturnValue({
      from(name) {
        if (name === 'bookings') {
          return chain({ data: ownListingBooking, error: null });
        }
        if (name === 'booking_events') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          };
        }
        return chain({ data: null, error: null });
      },
    });

    const res = await GET(req(), { params: Promise.resolve({ id: 'b-own' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('landlord');
    expect(body.booking.students.display_name).toBe('Ada Lovelace');
    expect(body.booking.students.age).toBeTypeOf('number');
    expect(body.booking.students.email).toBeUndefined();
    expect(Object.keys(body.booking.students)).not.toContain('email');
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/student@/i);
    // Landlord's own email in auth resolution is not part of the booking payload.
    expect(raw).not.toMatch(/ll@x\.test/);
  });
});
