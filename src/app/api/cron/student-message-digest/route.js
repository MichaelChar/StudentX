import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import {
  studentMessageDigestHtml,
  studentMessageDigestSubject,
} from '@/templates/email/studentMessageDigest';

// Service-role client: the digest RPCs are SECURITY DEFINER and granted
// to anon/authenticated, but we use the service-role key here to keep
// the cron context off the auth cookie path entirely. Mirrors the
// landlord-message-digest route.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

// Debounce window. One email per inquiry per this interval. Slightly
// tighter than the cron tick (5 min) so a tick that runs a few seconds
// late doesn't get rejected by its own previous run, but wide enough
// to absorb a burst of landlord messages into a single email.
const MIN_INTERVAL = '4 minutes 30 seconds';

const FROM_ADDRESS = 'StudentX <alerts@studentx.uk>';

function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === secret;
}

function resolveLocale(studentLocale) {
  if (studentLocale === 'el' || studentLocale === 'en') return studentLocale;
  // Default English (2026-05-11 product call: emails go in English by
  // default; explicit 'el' preference still honored if set in settings).
  return 'en';
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Kill switch: deploy-time disable without removing the cron trigger.
  if (process.env.STUDENT_DIGEST_ENABLED === 'false') {
    return NextResponse.json({ skipped: 'disabled' });
  }

  const supabase = getServiceSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';

  const { data: pending, error: fetchError } = await supabase.rpc(
    'get_pending_student_notifications',
    { p_min_interval: MIN_INTERVAL },
  );

  if (fetchError) {
    console.error('[student-digest] failed to fetch pending notifications:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch pending notifications' }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, emailsSent: 0, alreadyClaimed: 0 });
  }

  const resend = getResend();
  let emailsSent = 0;
  let alreadyClaimed = 0;
  let failures = 0;

  for (const row of pending) {
    try {
      // Claim BEFORE Resend send: conditional UPSERT, only one caller
      // per (inquiry, period) advances last_notified_at. Concurrent /
      // retried callers get false and skip silently.
      const { data: claimed, error: claimError } = await supabase.rpc(
        'claim_student_message_notification',
        {
          p_inquiry_id: row.inquiry_id,
          p_min_interval: MIN_INTERVAL,
          p_unread_count: row.unread_count,
        },
      );

      if (claimError) {
        console.error(
          `[student-digest] claim_student_message_notification failed for ${row.inquiry_id}:`,
          claimError,
        );
        failures++;
        continue;
      }
      if (!claimed) {
        alreadyClaimed++;
        continue;
      }

      // From here on the claim is committed: a Resend failure means
      // this digest is lost for this period. Same tradeoff as the
      // landlord digest — missing one email beats double-sending.
      const locale = resolveLocale(row.student_locale);

      if (await isEmailSuppressed(row.student_email)) {
        console.warn(
          `[student-digest] skipping send — ${row.student_email} is suppressed`,
        );
        continue;
      }

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: row.student_email,
        subject: studentMessageDigestSubject(
          row.landlord_display_name,
          row.unread_count,
          locale,
        ),
        html: studentMessageDigestHtml({
          studentName: row.student_name,
          landlordName: row.landlord_display_name,
          listing: {
            listing_id: row.listing_id,
            address: row.listing_address,
            neighborhood: row.listing_neighborhood,
            monthly_price: row.listing_monthly_price,
          },
          unreadCount: row.unread_count,
          snippet: row.latest_message_body,
          appUrl,
          inquiryId: row.inquiry_id,
          locale,
        }),
      });

      emailsSent++;
    } catch (err) {
      console.error(`[student-digest] error processing inquiry ${row?.inquiry_id}:`, err);
      failures++;
      // Continue with next inquiry — one bad row must not abort the run.
    }
  }

  return NextResponse.json({
    processed: pending.length,
    emailsSent,
    alreadyClaimed,
    failures,
  });
}
