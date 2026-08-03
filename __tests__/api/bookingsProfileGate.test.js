import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Booking create is blocked when the student guest profile is incomplete.
 * Landlord booking responses never include students.email.
 */

const extractToken = vi.fn();
const getUserFromToken = vi.fn();
const getSupabaseWithToken = vi.fn();
const getSupabaseAsService = vi.fn();
const createBookingRequest = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  extractToken: (...args) => extractToken(...args),
  getUserFromToken: (...args) => getUserFromToken(...args),
  getSupabaseWithToken: (...args) => getSupabaseWithToken(...args),
  getSupabaseAsService: (...args) => getSupabaseAsService(...args),
}));

vi.mock('@/lib/bookingService', () => ({
  createBookingRequest: (...args) => createBookingRequest(...args),
}));

const { POST, GET } = await import('@/app/api/bookings/route');

function chain(terminal) {
  const c = {
    select: () => c,
    eq: () => c,
    in: () => c,
    order: () => c,
    maybeSingle: () => Promise.resolve(terminal),
    then: (onFulfilled) => Promise.resolve(terminal).then(onFulfilled),
  };
  return c;
}

const incompleteStudent = {
  student_id: 's-1',
  email: 'student@example.com',
  display_name: 'Ada',
  preferred_locale: 'en',
  date_of_birth: null,
  gender: null,
  nationality: null,
  languages: [],
  bio: null,
  home_university: null,
  receiving_university: null,
  receiving_faculty: null,
  funding_source: null,
  created_at: '2025-01-01T00:00:00Z',
};

const completeStudent = {
  ...incompleteStudent,
  date_of_birth: '2000-05-01',
  gender: 'woman',
  bio: 'Med student on Erasmus for the year.',
  home_university: 'University of Amsterdam',
  receiving_university: 'Aristotle University of Thessaloniki',
};

function studentClient(student) {
  return {
    from(name) {
      if (name === 'students') {
        return chain({ data: student, error: null });
      }
      if (name === 'landlords') {
        return chain({ data: null, error: null });
      }
      return chain({ data: null, error: null });
    },
  };
}

function landlordClient(landlord) {
  return {
    from(name) {
      if (name === 'students') {
        return chain({ data: null, error: null });
      }
      if (name === 'landlords') {
        return chain({ data: landlord, error: null });
      }
      return chain({ data: null, error: null });
    },
  };
}

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
  getSupabaseAsService.mockReset();
  createBookingRequest.mockReset();
});

function jsonRequest(body, token = 'jwt') {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/bookings — profile completeness gate', () => {
  it('blocks submission when the guest profile is incomplete', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue({ id: 'auth-1' });
    getSupabaseWithToken.mockReturnValue(studentClient(incompleteStudent));

    const res = await POST(
      jsonRequest({
        listing_id: '0100001',
        move_in: '2026-09-01',
        move_out: '2026-12-01',
        message: 'Hello, I would like to book this place for the semester.',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_code).toBe('PROFILE_INCOMPLETE');
    expect(Array.isArray(body.missing_fields)).toBe(true);
    expect(body.missing_fields.length).toBeGreaterThan(0);
    expect(createBookingRequest).not.toHaveBeenCalled();
  });

  it('allows submission when the guest profile is complete', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue({ id: 'auth-1' });
    getSupabaseWithToken.mockReturnValue(studentClient(completeStudent));
    createBookingRequest.mockResolvedValue({
      booking: { booking_id: 'b-1', state: 'requested' },
      inquiry_id: 'inq-1',
      cost: { total_rent: 1350 },
    });

    const res = await POST(
      jsonRequest({
        listing_id: '0100001',
        move_in: '2026-09-01',
        move_out: '2026-12-01',
        message: 'Hello, I would like to book this place for the semester.',
      }),
    );

    expect(res.status).toBe(201);
    expect(createBookingRequest).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/bookings — landlord never receives student email', () => {
  it('strips email from guest profiles in landlord list responses', async () => {
    extractToken.mockReturnValue('jwt');
    getUserFromToken.mockResolvedValue({ id: 'auth-ll' });
    getSupabaseWithToken.mockReturnValue(
      landlordClient({ landlord_id: '0001', name: 'Kostas', email: 'll@x.test' }),
    );

    const bookingRow = {
      booking_id: 'b-1',
      student_id: 's-1',
      listing_id: '0100001',
      state: 'requested',
      monthly_rent: 450,
      move_in: '2026-09-01',
      move_out: '2026-12-01',
      total_stay_value: 1350,
      created_at: '2026-08-01T00:00:00Z',
      students: {
        student_id: 's-1',
        display_name: 'Ada',
        date_of_birth: '2000-05-01',
        gender: 'woman',
        nationality: 'GR',
        languages: ['en'],
        bio: 'Hi',
        home_university: 'other',
        receiving_university: 'auth',
        receiving_faculty: 'auth-main',
        funding_source: 'parents',
        created_at: '2025-01-01T00:00:00Z',
      },
      listings: {
        listing_id: '0100001',
        title: 'Studio',
        location: { address: '1 Main', neighborhood: 'Center' },
      },
    };

    // Fluent builder that records the last terminal resolution. Listings
    // eq() returns listing ids; bookings in()+order() returns booking rows;
    // bookings in() alone (counts) returns state rows.
    getSupabaseAsService.mockReturnValue({
      from(name) {
        if (name === 'listings') {
          const q = {
            select: () => q,
            eq: () => Promise.resolve({ data: [{ listing_id: '0100001' }], error: null }),
          };
          return q;
        }
        if (name === 'bookings') {
          let mode = 'list';
          const q = {
            select(cols) {
              if (cols === 'state') mode = 'counts';
              else mode = 'list';
              return q;
            },
            in: () => q,
            order: () => Promise.resolve({ data: [bookingRow], error: null }),
            then: (fn) =>
              Promise.resolve(
                mode === 'counts'
                  ? { data: [{ state: 'requested' }], error: null }
                  : { data: [bookingRow], error: null },
              ).then(fn),
          };
          return q;
        }
        return chain({ data: null, error: null });
      },
    });

    const res = await GET(
      new Request('http://localhost/api/bookings', {
        headers: { Authorization: 'Bearer jwt' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('landlord');
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0].students.display_name).toBe('Ada');
    expect(body.bookings[0].students.email).toBeUndefined();
    expect(Object.keys(body.bookings[0].students)).not.toContain('email');
    const payload = JSON.stringify(body.bookings);
    expect(payload).not.toMatch(/student@example\.com/);
  });
});
