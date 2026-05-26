import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level coverage for the student per-message digest cron (#156).
// Mirror of landlordMessageDigest.test.js — same contract, student-side
// RPC/env/field names.

const send = vi.fn().mockResolvedValue({ id: 'email-1' });
const rpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc }),
}));

vi.mock('@/lib/resend', () => ({
  getResend: () => ({ emails: { send } }),
}));

vi.mock('@/lib/emailSuppressions', () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/templates/email/studentMessageDigest', () => ({
  studentMessageDigestHtml: () => '<html />',
  studentMessageDigestSubject: () => 'subject',
}));

const { POST } = await import('@/app/api/cron/student-message-digest/route');

const SECRET = 'test-cron-secret';

let pendingRows;
let claimResult;

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  delete process.env.STUDENT_DIGEST_ENABLED;
  send.mockClear();
  pendingRows = [];
  claimResult = true;
  rpc.mockReset();
  rpc.mockImplementation((name) => {
    if (name === 'get_pending_student_notifications') {
      return Promise.resolve({ data: pendingRows, error: null });
    }
    if (name === 'claim_student_message_notification') {
      return Promise.resolve({ data: claimResult, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

function makeReq({ secret = SECRET } = {}) {
  return new Request('https://test.local/api/cron/student-message-digest', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  });
}

describe('student-message-digest route', () => {
  it('returns 401 when the cron secret mismatches', async () => {
    const res = await POST(makeReq({ secret: 'wrong' }));
    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns 401 when no cron secret is provided', async () => {
    const res = await POST(makeReq({ secret: '' }));
    expect(res.status).toBe(401);
  });

  it('skips when STUDENT_DIGEST_ENABLED is "false"', async () => {
    process.env.STUDENT_DIGEST_ENABLED = 'false';
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: 'disabled' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends zero emails when there are no pending notifications', async () => {
    pendingRows = [];
    const res = await POST(makeReq());
    expect(await res.json()).toMatchObject({ processed: 0, emailsSent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('claims and sends exactly one email for a single pending row', async () => {
    pendingRows = [
      { inquiry_id: 'iq1', student_email: 'student@example.com', unread_count: 3, landlord_display_name: 'Pat' },
    ];
    claimResult = true;
    const res = await POST(makeReq());
    expect(await res.json()).toMatchObject({ processed: 1, emailsSent: 1, alreadyClaimed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send when the claim was already taken by another tick', async () => {
    pendingRows = [{ inquiry_id: 'iq1', student_email: 'student@example.com', unread_count: 1 }];
    claimResult = false;
    const res = await POST(makeReq());
    expect(await res.json()).toMatchObject({ processed: 1, emailsSent: 0, alreadyClaimed: 1 });
    expect(send).not.toHaveBeenCalled();
  });
});
