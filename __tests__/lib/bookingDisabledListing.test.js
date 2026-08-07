import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSupabaseAsService = vi.fn();
vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseAsService: (...args) => getSupabaseAsService(...args),
}));

vi.mock('@/lib/bookingEmail', () => ({
  sendBookingRequestEmail: vi.fn(async () => {}),
  sendBookingAcceptedEmail: vi.fn(async () => {}),
  sendBookingDeclinedEmail: vi.fn(async () => {}),
}));

vi.mock('@/lib/bookingBlocks', () => ({
  executeBlockAction: vi.fn(async () => {}),
}));

function listingQueryResult(row) {
  return {
    from: vi.fn(() => {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: row, error: null }),
        in: () => b,
      };
      return b;
    }),
  };
}

const { createBookingRequest } = await import('@/lib/bookingService');

beforeEach(() => {
  getSupabaseAsService.mockReset();
});

describe('createBookingRequest + disabled listing', () => {
  it('rejects a booking against a disabled listing with LISTING_DISABLED', async () => {
    getSupabaseAsService.mockReturnValue(
      listingQueryResult({
        listing_id: '0001001',
        listing_status: 'disabled',
        available_from: '2026-09-01',
        available_to: null,
        min_duration_months: 3,
        max_duration_months: 12,
        rent: {
          monthly_price: 450,
          currency: 'EUR',
          deposit: 450,
          bills_included: false,
        },
      }),
    );

    const result = await createBookingRequest({
      student: {
        student_id: 's1',
        email: 's@example.com',
        display_name: 'Sam',
      },
      user: { id: 'u1' },
      supabase: { from: vi.fn(), rpc: vi.fn() },
      listingId: '0001001',
      moveIn: '2026-09-01',
      moveOut: '2026-12-01',
      message: 'Hello, I would like to book this place for the semester.',
    });

    expect(result.error).toBe('LISTING_DISABLED');
    expect(result.status).toBe(404);
    expect(result.message).toMatch(/not available/i);
  });

  it('does not treat an active listing as disabled', async () => {
    // Blocks load is the second service call after listing load; fail closed
    // after the status check by returning empty blocks then let insert fail
    // so we only assert the status gate was passed.
    let call = 0;
    getSupabaseAsService.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return listingQueryResult({
          listing_id: '0001001',
          listing_status: 'active',
          available_from: '2026-09-01',
          available_to: null,
          min_duration_months: 3,
          max_duration_months: 12,
          rent: {
            monthly_price: 450,
            currency: 'EUR',
            deposit: 450,
            bills_included: false,
          },
        });
      }
      // blocks query
      return {
        from: vi.fn(() => {
          const b = {
            select: () => b,
            eq: () => b,
            in: async () => ({ data: [], error: null }),
          };
          return b;
        }),
      };
    });

    const supabase = {
      from: vi.fn(() => {
        const b = {
          insert: () => b,
          select: () => b,
          single: async () => ({
            data: null,
            error: { message: 'stop after status gate' },
          }),
        };
        return b;
      }),
      rpc: vi.fn(),
    };

    const result = await createBookingRequest({
      student: {
        student_id: 's1',
        email: 's@example.com',
        display_name: 'Sam',
      },
      user: { id: 'u1' },
      supabase,
      listingId: '0001001',
      moveIn: '2026-09-01',
      moveOut: '2026-12-01',
      message: 'Hello, I would like to book this place for the semester.',
    });

    // Passed the disabled gate; failed later on insert (mocked).
    expect(result.error).not.toBe('LISTING_DISABLED');
    expect(result.error).toBe('INTERNAL');
  });
});
