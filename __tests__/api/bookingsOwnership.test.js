import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Student must not act on a booking that is not theirs.
 * loadBookingForViewer returns 404 when student_id does not match.
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

const applyTransition = vi.fn();
const confirmMoveIn = vi.fn();
const reportMoveInProblem = vi.fn();
const inquiryIdForBooking = vi.fn();
const acceptBooking = vi.fn();
const declineBooking = vi.fn();

vi.mock('@/lib/bookingService', () => ({
  applyTransition: (...args) => applyTransition(...args),
  confirmMoveIn: (...args) => confirmMoveIn(...args),
  reportMoveInProblem: (...args) => reportMoveInProblem(...args),
  inquiryIdForBooking: (...args) => inquiryIdForBooking(...args),
  acceptBooking: (...args) => acceptBooking(...args),
  declineBooking: (...args) => declineBooking(...args),
}));

const { PATCH, GET } = await import('@/app/api/bookings/[id]/route');

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

function serviceClient({ booking }) {
  return {
    from(name) {
      if (name === 'bookings') {
        return chain({ data: booking, error: null });
      }
      if (name === 'booking_events') {
        return chain({ data: [], error: null });
      }
      return chain({ data: null, error: null });
    },
  };
}

function studentClient(student) {
  return {
    from(name) {
      if (name === 'students') {
        return chain({ data: student });
      }
      if (name === 'landlords') {
        return chain({ data: null });
      }
      return chain({ data: null });
    },
  };
}

const foreignBooking = {
  booking_id: 'b-foreign',
  student_id: 'student-other',
  listing_id: '0100001',
  move_in: '2026-09-01',
  move_out: '2026-12-01',
  monthly_rent: 450,
  total_stay_value: 1350,
  state: 'confirmed',
  last_activity_at: '2026-08-01T00:00:00Z',
  listings: {
    listing_id: '0100001',
    title: 'Test',
    landlord_id: 'll-1',
    location: { address: '1 Main', neighborhood: 'Center' },
    rent: { monthly_price: 450, deposit: 450 },
  },
};

beforeEach(() => {
  extractToken.mockReset();
  getUserFromToken.mockReset();
  getSupabaseWithToken.mockReset();
  getSupabaseAsService.mockReset();
  applyTransition.mockReset();
  confirmMoveIn.mockReset();
  reportMoveInProblem.mockReset();
  inquiryIdForBooking.mockReset();
});

function authAsStudent() {
  extractToken.mockReturnValue('tok');
  getUserFromToken.mockResolvedValue({ id: 'user-1' });
  getSupabaseWithToken.mockReturnValue(
    studentClient({ student_id: 'student-me', email: 'me@x.test', display_name: 'Me' }),
  );
  getSupabaseAsService.mockReturnValue(serviceClient({ booking: foreignBooking }));
}

const req = (body) => ({
  headers: { get: () => null },
  json: () => Promise.resolve(body),
});

describe('student cannot act on another student\'s booking', () => {
  it('GET returns 404 for a foreign booking', async () => {
    authAsStudent();
    inquiryIdForBooking.mockResolvedValue(null);

    const res = await GET(req(), { params: Promise.resolve({ id: 'b-foreign' }) });
    expect(res.status).toBe(404);
    expect(applyTransition).not.toHaveBeenCalled();
    expect(confirmMoveIn).not.toHaveBeenCalled();
  });

  it('PATCH cancel returns 404 for a foreign booking', async () => {
    authAsStudent();

    const res = await PATCH(req({ action: 'cancel' }), {
      params: Promise.resolve({ id: 'b-foreign' }),
    });
    expect(res.status).toBe(404);
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it('PATCH confirm-move-in returns 404 for a foreign booking', async () => {
    authAsStudent();

    const res = await PATCH(req({ action: 'confirm-move-in' }), {
      params: Promise.resolve({ id: 'b-foreign' }),
    });
    expect(res.status).toBe(404);
    expect(confirmMoveIn).not.toHaveBeenCalled();
  });

  it('PATCH report-problem returns 404 for a foreign booking', async () => {
    authAsStudent();

    const res = await PATCH(
      req({ action: 'report-problem', description: 'Not my booking at all.' }),
      { params: Promise.resolve({ id: 'b-foreign' }) },
    );
    expect(res.status).toBe(404);
    expect(reportMoveInProblem).not.toHaveBeenCalled();
  });
});
