import { NextResponse } from 'next/server';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { entryFor, monthKey, parseLead } from '@/lib/boardingLead';
import { buildInterestEmail, buildSubmitEmail, sendLeadEmail } from '@/lib/boardingLeadEmail';

/*
  POST /api/boarding/lead — the /boarding lead form (LeadForm.js).

  Unauthenticated: parents are not signed in. Each form visit has a UUID
  made in the browser; every event upserts that one row in boarding_leads
  (migration 128) with the service role, since the table has no client
  grants at all.

    view    the result screen, "just show me the path". Answers only.
    update  fee-map taps / "Ask me about…" after the result showed.
    submit  the personalised request. Emails Michael, once per visit.

  The server recomputes the child's entry point from the answers rather
  than trusting the browser's, using the same entryFor() the form uses.

  Abuse: a honeypot field, strict validation, and a per-isolate request cap.
  The cap is best-effort, like the report route's layer 1 — Workers isolates
  are neither global nor durable. That is acceptable here because nothing is
  emailed outside the one submit per row, so a flood costs rows, not inbox.
*/

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

function overBudget(ip) {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  const recent = (hits.get(ip) || []).filter((ts) => ts > cutoff);
  const over = recent.length >= RATE_LIMIT_MAX;
  if (!over) recent.push(Date.now());
  hits.set(ip, recent);
  return over;
}

function union(a = [], b = []) {
  return [...new Set([...(a || []), ...b])];
}

const ok = () => NextResponse.json({ ok: true }, { status: 200 });

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error_code: 'INVALID_INPUT', error: 'Invalid JSON body' }, { status: 400 });
  }

  // Honeypot: people never see the `company` field, so a value means a bot.
  // Answer as if it worked, so it learns nothing, and store nothing.
  if (typeof body?.company === 'string' && body.company.trim() !== '') return ok();

  const parsed = parseLead(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error_code: 'INVALID_INPUT', error: `Invalid field: ${parsed.error}` },
      { status: 400 },
    );
  }
  const lead = parsed.lead;

  // cf-connecting-ip only, for the reason given in the report route.
  if (overBudget(request.headers.get('cf-connecting-ip') || 'unknown')) {
    return NextResponse.json({ error_code: 'RATE_LIMITED', error: 'Too many requests' }, { status: 429 });
  }

  const entry = entryFor({ ageNow: lead.ageNow, start: lead.start, nowKey: monthKey(new Date()) });

  let supabase;
  try {
    supabase = getSupabaseAsService();
  } catch (err) {
    console.error('Boarding lead: no service client:', err);
    return NextResponse.json({ error_code: 'INTERNAL', error: 'Unavailable' }, { status: 500 });
  }

  const { data: existing, error: readError } = await supabase
    .from('boarding_leads')
    .select('path, schools_viewed, interest, submitted_at, first_name, contact_method, contact_value')
    .eq('id', lead.id)
    .maybeSingle();
  if (readError) {
    console.error('Boarding lead: read failed:', readError);
    return NextResponse.json({ error_code: 'INTERNAL', error: 'Could not save' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const row = {
    id: lead.id,
    source: lead.source,
    start_choice: lead.start,
    age_now: lead.ageNow,
    mode: lead.mode,
    entry_programme: entry.blocked ? null : entry.entry.programme,
    entry_school_year: entry.blocked ? null : entry.schoolYear,
    exam_year: entry.blocked ? null : entry.examYear,
    // A visit can become personalised, never go back.
    path: existing?.path === 'personalised' ? 'personalised' : lead.path,
    // Union, so an out-of-order or failed earlier event never loses a tap.
    schools_viewed: union(existing?.schools_viewed, lead.schoolsViewed),
    interest: union(existing?.interest, lead.interest),
    updated_at: now,
  };

  // Only the first submit records contact details and emails. A retry after
  // a dropped response, or a double click, keeps the original and is still
  // answered 200 — it did work.
  const firstSubmit = lead.event === 'submit' && !existing?.submitted_at;
  if (firstSubmit) {
    Object.assign(row, {
      first_name: lead.firstName,
      contact_method: lead.contactMethod,
      contact_value: lead.contactValue,
      about: lead.about,
      submitted_at: now,
    });
  }

  const { error: writeError } = await supabase.from('boarding_leads').upsert(row, { onConflict: 'id' });
  if (writeError) {
    console.error('Boarding lead: write failed:', writeError);
    return NextResponse.json({ error_code: 'INTERNAL', error: 'Could not save' }, { status: 500 });
  }

  if (firstSubmit) {
    await sendLeadEmail(buildSubmitEmail(lead, entry));
  } else if (existing?.submitted_at && lead.event === 'update') {
    const added = lead.interest.filter((k) => !(existing.interest || []).includes(k));
    if (added.length) await sendLeadEmail(buildInterestEmail(existing, added, lead.id));
  }

  return ok();
}
