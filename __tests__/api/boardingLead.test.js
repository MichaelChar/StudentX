import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/*
  /api/boarding/lead — the /boarding lead form's endpoint. One row per form
  visit, upserted by id; Michael is emailed on the first submit only, and
  again only when a parent who already submitted asks about another school.
*/

const db = { existing: null, upserts: [], readError: null, writeError: null };
const maybeSingle = vi.fn(async () => ({ data: db.existing, error: db.readError }));
const upsert = vi.fn(async (row) => {
  db.upserts.push(row);
  return { error: db.writeError };
});
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }), upsert }));
vi.mock('@/lib/supabaseServer', () => ({ getSupabaseAsService: () => ({ from }) }));

const send = vi.fn(async () => ({ id: 'email-1' }));
vi.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send } }) }));

const { POST } = await import('@/app/api/boarding/lead/route');

let ipCounter = 0;
function req(body) {
  return new Request('https://studentx.uk/api/boarding/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${++ipCounter}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ID = '3f6c1b2e-9a4d-4c1e-8f7a-1b2c3d4e5f60';
const VIEW = {
  id: ID, event: 'view', source: 'boarding', start: '2027-09', ageNow: 16,
  mode: 'boarding', path: 'resources', schoolsViewed: [], interest: [],
};
const SUBMIT = {
  ...VIEW, event: 'submit', path: 'personalised', interest: ['rosey'],
  firstName: 'Eleni', contactMethod: 'email', contactValue: 'eleni@example.com', about: 'IGCSE',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 12));
  Object.assign(db, { existing: null, upserts: [], readError: null, writeError: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/boarding/lead', () => {
  it('400s on a body that is not JSON', async () => {
    expect((await POST(req('{nope'))).status).toBe(400);
  });

  it('400s on an invalid field and names it', async () => {
    const res = await POST(req({ ...VIEW, ageNow: 40 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('ageNow');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('answers a filled honeypot with 200 and stores nothing', async () => {
    const res = await POST(req({ ...SUBMIT, company: 'Acme' }));
    expect(res.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('stores a view with the entry point worked out on the server', async () => {
    const res = await POST(req(VIEW));
    expect(res.status).toBe(200);
    expect(db.upserts[0]).toMatchObject({
      id: ID, path: 'resources', start_choice: '2027-09', age_now: 16,
      entry_programme: 'DP 2', entry_school_year: 2027, exam_year: 2028,
    });
    expect(db.upserts[0]).not.toHaveProperty('contact_value');
    expect(send).not.toHaveBeenCalled();
  });

  it('stores a blocked entry as nulls', async () => {
    await POST(req({ ...VIEW, ageNow: 17 }));
    expect(db.upserts[0]).toMatchObject({ entry_programme: null, entry_school_year: null, exam_year: null });
  });

  it('stores the first submit and emails Michael once, replying to the parent', async () => {
    const res = await POST(req(SUBMIT));
    expect(res.status).toBe(200);
    expect(db.upserts[0]).toMatchObject({
      path: 'personalised', first_name: 'Eleni', contact_method: 'email',
      contact_value: 'eleni@example.com', about: 'IGCSE', interest: ['rosey'],
    });
    expect(db.upserts[0].submitted_at).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe('michael@studentx.uk');
    expect(mail.from).toBe('StudentX <michael@studentx.uk>');
    expect(mail.replyTo).toBe('eleni@example.com');
    expect(mail.subject).toBe('Boarding lead: Eleni via Email');
    expect(mail.text).toContain('Start: September 2027');
    expect(mail.text).toContain('Joins DP 2 in 2027–28, IB exams May 2028');
    expect(mail.text).toContain('Asked about: Le Rosey');
  });

  it('does not set Reply-To for a phone contact', async () => {
    await POST(req({ ...SUBMIT, contactMethod: 'whatsapp', contactValue: '+30 697 123 4567' }));
    expect(send.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it('treats a repeated submit as done: no second email, original contact kept', async () => {
    db.existing = { path: 'personalised', interest: ['rosey'], schools_viewed: [], submitted_at: '2026-10-12T10:00:00Z' };
    const res = await POST(req({ ...SUBMIT, contactValue: 'other@example.com' }));
    expect(res.status).toBe(200);
    expect(db.upserts[0]).not.toHaveProperty('contact_value');
    expect(send).not.toHaveBeenCalled();
  });

  it('never moves a personalised visit back to resources, and keeps earlier taps', async () => {
    db.existing = { path: 'personalised', interest: ['rosey'], schools_viewed: ['tasis'], submitted_at: null };
    await POST(req({ ...VIEW, event: 'update', schoolsViewed: ['zuoz'] }));
    expect(db.upserts[0]).toMatchObject({
      path: 'personalised', schools_viewed: ['tasis', 'zuoz'], interest: ['rosey'],
    });
  });

  it('emails when a submitted parent asks about another school', async () => {
    db.existing = {
      path: 'personalised', interest: ['rosey'], schools_viewed: [], submitted_at: '2026-10-12T10:00:00Z',
      first_name: 'Eleni', contact_method: 'whatsapp', contact_value: '+30 697 123 4567',
    };
    await POST(req({ ...VIEW, event: 'update', path: 'personalised', interest: ['rosey', 'tasis'] }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toBe('Boarding lead: Eleni also asked about TASIS');
  });

  it('does not email an update that adds no new school', async () => {
    db.existing = { path: 'personalised', interest: ['rosey'], schools_viewed: [], submitted_at: '2026-10-12T10:00:00Z' };
    await POST(req({ ...VIEW, event: 'update', path: 'personalised', interest: ['rosey'], schoolsViewed: ['zuoz'] }));
    expect(send).not.toHaveBeenCalled();
  });

  it('still answers 200 when the email fails, because the lead is stored', async () => {
    send.mockRejectedValueOnce(new Error('resend down'));
    const res = await POST(req(SUBMIT));
    expect(res.status).toBe(200);
    expect(db.upserts).toHaveLength(1);
  });

  it('500s when the row cannot be written, and sends nothing', async () => {
    db.writeError = { message: 'boom' };
    const res = await POST(req(SUBMIT));
    expect(res.status).toBe(500);
    expect(send).not.toHaveBeenCalled();
  });

  it('500s when the existing row cannot be read', async () => {
    db.readError = { message: 'boom' };
    expect((await POST(req(VIEW))).status).toBe(500);
  });
});
