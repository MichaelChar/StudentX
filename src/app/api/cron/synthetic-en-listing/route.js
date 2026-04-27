import { NextResponse } from 'next/server';
import { getResend } from '@/lib/resend';

// Synthetic uptime check guarding against the regression class fixed in PR #48
// (see issue #49 + docs/runbooks/synthetic-en-listing.md). Fetches the EN listing
// page and asserts English markers are present + Greek markers absent. Emails
// SYNTHETIC_ALERT_EMAIL via Resend on any failure.
//
// Triggered by cf/worker-entry.mjs on the */15 * * * * cron. Also callable
// manually with the CRON_SECRET for local sanity checks.

const DEFAULT_LISTING_ID = '0100006';
const FETCH_TIMEOUT_MS = 10_000;

const EN_MARKERS_REQUIRED = [
  '<html lang="en"',
  'Sign in to view this listing',
];
const EL_MARKERS_FORBIDDEN = [
  'lang="el"',
  'Συνδέσου',
];

function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === secret;
}

async function fetchListingHtml(url) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'user-agent': 'StudentX-synthetic/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'manual',
  });
  const body = await res.text();
  return { status: res.status, body };
}

function evaluateBody({ status, body }) {
  if (status !== 200) {
    return { ok: false, reason: `non-200 status: ${status}` };
  }
  for (const marker of EN_MARKERS_REQUIRED) {
    if (!body.includes(marker)) {
      return { ok: false, reason: `missing required EN marker: ${marker}` };
    }
  }
  for (const marker of EL_MARKERS_FORBIDDEN) {
    if (body.includes(marker)) {
      return { ok: false, reason: `forbidden EL marker present: ${marker}` };
    }
  }
  return { ok: true };
}

async function sendAlert({ to, listingId, url, status, reason, bodyExcerpt }) {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL || 'StudentX Alerts <alerts@updates.studentx.gr>';
  await resend.emails.send({
    from,
    to,
    subject: `[StudentX synthetic] /en/listing/${listingId} failed: ${reason}`,
    text: [
      `Synthetic check failed for ${url}`,
      ``,
      `Status: ${status ?? 'no response'}`,
      `Reason: ${reason}`,
      ``,
      `--- HTML excerpt (first 500 chars) ---`,
      bodyExcerpt || '(no body)',
    ].join('\n'),
  });
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const listingId = process.env.SYNTHETIC_LISTING_ID || DEFAULT_LISTING_ID;
  const alertEmail = process.env.SYNTHETIC_ALERT_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = `${appUrl}/en/listing/${listingId}`;

  let fetched;
  try {
    fetched = await fetchListingHtml(url);
  } catch (err) {
    const reason = `fetch threw: ${err.name || 'Error'} ${err.message || ''}`.trim();
    if (alertEmail) {
      try {
        await sendAlert({ to: alertEmail, listingId, url, status: null, reason, bodyExcerpt: '' });
      } catch (mailErr) {
        console.error('[synthetic-en-listing] alert email failed:', mailErr);
      }
    }
    return NextResponse.json({ ok: false, reason }, { status: 200 });
  }

  const verdict = evaluateBody(fetched);
  if (!verdict.ok) {
    if (alertEmail) {
      try {
        await sendAlert({
          to: alertEmail,
          listingId,
          url,
          status: fetched.status,
          reason: verdict.reason,
          bodyExcerpt: fetched.body.slice(0, 500),
        });
      } catch (mailErr) {
        console.error('[synthetic-en-listing] alert email failed:', mailErr);
      }
    } else {
      console.error('[synthetic-en-listing] no SYNTHETIC_ALERT_EMAIL configured; failure was:', verdict.reason);
    }
    return NextResponse.json({ ok: false, reason: verdict.reason, status: fetched.status }, { status: 200 });
  }

  return NextResponse.json({ ok: true, status: fetched.status });
}
