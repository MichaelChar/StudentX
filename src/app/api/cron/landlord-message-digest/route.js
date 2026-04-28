import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResend } from '@/lib/resend';
import {
  landlordMessageDigestHtml,
  landlordMessageDigestSubject,
} from '@/templates/email/landlordMessageDigest';

// Service-role client: the digest RPCs are GRANTed only to service_role
// (migration 033). The CRON_SECRET check above gates the route; this
// client gates the database. Mirrors src/lib/metrics/supabase.js.
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
// to absorb a burst of student messages into a single email.
const MIN_INTERVAL = '4 minutes 30 seconds';

const FROM_ADDRESS = 'StudentX <alerts@updates.studentx.gr>';

function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === secret) return true;
  const { searchParams } = new URL(request.url);
  return searchParams.get('secret') === secret;
}

function resolveLocale(landlordLocale) {
  if (landlordLocale === 'el' || landlordLocale === 'en') return landlordLocale;
  return 'el';
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Kill switch: deploy-time disable without removing the cron trigger.
  if (process.env.LANDLORD_DIGEST_ENABLED === 'false') {
    return NextResponse.json({ skipped: 'disabled' });
  }

  const supabase = getServiceSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.gr';

  const { data: pending, error: fetchError } = await supabase.rpc(
    'get_pending_landlord_notifications',
    { p_min_interval: MIN_INTERVAL },
  );

  if (fetchError) {
    console.error('[landlord-digest] failed to fetch pending notifications:', fetchError);
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
      // retried callers get false and skip silently. Mirrors
      // claim_digest_send (migration 022).
      const { data: claimed, error: claimError } = await supabase.rpc(
        'claim_landlord_message_notification',
        {
          p_inquiry_id: row.inquiry_id,
          p_min_interval: MIN_INTERVAL,
          p_unread_count: row.unread_count,
        },
      );

      if (claimError) {
        console.error(
          `[landlord-digest] claim_landlord_message_notification failed for ${row.inquiry_id}:`,
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
      // saved-searches digest — missing one email beats double-sending.
      const locale = resolveLocale(row.landlord_locale);

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: row.landlord_email,
        subject: landlordMessageDigestSubject(
          row.student_display_name,
          row.unread_count,
          locale,
        ),
        html: landlordMessageDigestHtml({
          landlordName: row.landlord_name,
          studentName: row.student_display_name,
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
      console.error(`[landlord-digest] error processing inquiry ${row?.inquiry_id}:`, err);
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
