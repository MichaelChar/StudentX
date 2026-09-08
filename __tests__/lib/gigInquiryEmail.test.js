import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Issue #503. sendGigInquiryEmail marked the row via the ANON client:

      getSupabase().from('gig_inquiries').update({ email_sent: true })

  gig_inquiries has RLS on with INSERT and SELECT policies only — no
  UPDATE policy — so that matched zero rows. Supabase does not raise when
  RLS filters an update away, and the call site discarded the result, so
  email_sent was never set and nothing ever said so.

  These tests pin the two things that fix it: the write goes through the
  SERVICE client (via the migration-117 RPC), and the anon client is never
  asked to write.
*/

const rpc = vi.fn(async () => ({ data: true, error: null }));
const createClient = vi.fn(() => ({ rpc }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

// The anon client is legitimately used to READ the gig. Its `update` is a
// spy so a regression to the old behaviour fails loudly rather than
// silently no-opping the way the bug did.
const anonUpdate = vi.fn();
const anonClient = {
  from: () => ({
    select: () => ({
      eq: () => ({ single: async () => ({ data: { title: 'Bar work', employer_name: 'Cafe' } }) }),
    }),
    update: anonUpdate,
  }),
};
vi.mock('@/lib/supabase', () => ({ getSupabase: () => anonClient }));

const send = vi.fn(async () => ({ id: 'email-1' }));
vi.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send } }) }));
vi.mock('@/lib/emailSuppressions', () => ({ isEmailSuppressed: async () => false }));

const { sendGigInquiryEmail } = await import('@/lib/gigInquiryEmail');

const ARGS = {
  inquiryId: '11111111-1111-1111-1111-111111111111',
  gigId: '22222222-2222-2222-2222-222222222222',
  studentName: 'A Student',
  studentEmail: 'student@example.com',
  message: 'Interested!',
};

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  process.env.GIG_ALERT_EMAIL = 'alerts@example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

describe('sendGigInquiryEmail — marking email_sent (#503)', () => {
  it('marks the row through the service-role RPC, not the anon client', async () => {
    await sendGigInquiryEmail(ARGS);

    expect(send).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mark_gig_inquiry_email_sent', {
      p_inquiry_id: ARGS.inquiryId,
    });
    // The regression guard: the old code reached here and did nothing.
    expect(anonUpdate).not.toHaveBeenCalled();
    // And the service client must be built with the service-role key.
    expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'service-key');
  });

  it('does not throw when marking fails — the email already went out', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(sendGigInquiryEmail(ARGS)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('skips entirely when no alert recipient is configured', async () => {
    delete process.env.GIG_ALERT_EMAIL;
    delete process.env.SYNTHETIC_ALERT_EMAIL;

    await sendGigInquiryEmail(ARGS);

    expect(send).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
