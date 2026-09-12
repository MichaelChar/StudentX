import { createClient } from '@supabase/supabase-js';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import { fromAddressFor } from '@/lib/emailFrom';
import { inquiryEmailHtml, inquiryEmailSubject } from '@/templates/email/inquiry';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Sends the landlord notification email for a new inquiry. Extracted from
 * the (now removed) anonymous /api/inquiries route so the authenticated
 * /api/inquiries/start route can call it without duplicating logic.
 *
 * Errors are swallowed: the inquiry has already persisted, and
 * mark_inquiry_email_sent is idempotent if we want to retry later via
 * a backfill job. We never want a Resend hiccup to fail the user-facing
 * "Start conversation" call.
 */
export async function sendLandlordInquiryEmail({
  inquiryId,
  listingId,
  studentName,
  studentEmail,
  studentPhone = null,
  message,
  facultyId = null,
}) {
  try {
    /*
      SERVICE ROLE, NOT ANON — this is load-bearing, not a preference.

      This query selects `landlords ( … email )`. Migration 065 revoked the
      blanket anon SELECT on `landlords` and granted back only the 7 public
      catalog columns; `email` is deliberately not among them. So the anon
      client gets `42501 permission denied for table landlords`, PostgREST
      returns no row, and the `!landlord?.email` guard below turns that into a
      silent early return.

      That is exactly what happened from 2026-07-03 until this fix: every send
      in this file stopped delivering and nothing surfaced it, because these
      helpers are best-effort by contract and swallow their own failures.

      If you change this back to getSupabase(), the emails stop again and no
      test or alert will tell you.
    */
    const supabase = getSupabaseAsService();

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select(`
        listing_id,
        location ( address, neighborhood ),
        rent ( monthly_price ),
        landlords ( name, email )
      `)
      .eq('listing_id', listingId)
      .single();

    // Surface the failure instead of swallowing it. A discarded error here is
    // what made the 2026-07-03 breakage look like "no landlord email on file".
    if (listingError) {
      console.error('inquiryEmail: listing/landlord load failed:', listingError.message);
    }

    const landlord = Array.isArray(listing?.landlords) ? listing.landlords[0] : listing?.landlords;
    const location = Array.isArray(listing?.location) ? listing.location[0] : listing?.location;
    const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;

    if (!landlord?.email) {
      console.warn(`Inquiry ${inquiryId}: no landlord email on file for listing ${listingId}`);
      return;
    }

    if (await isEmailSuppressed(landlord.email)) {
      console.warn(`Inquiry ${inquiryId}: skipping send — ${landlord.email} is suppressed`);
      return;
    }

    let facultyName = null;
    if (facultyId) {
      const { data: faculty } = await supabase
        .from('faculties')
        .select('name')
        .eq('faculty_id', facultyId)
        .single();
      facultyName = faculty?.name ?? null;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
    const listingSummary = [location?.address, location?.neighborhood].filter(Boolean).join(' · ');

    await getResend().emails.send({
      from: fromAddressFor(landlord.name),
      to: landlord.email,
      replyTo: studentEmail,
      subject: inquiryEmailSubject(studentName, listingSummary),
      html: inquiryEmailHtml({
        landlordName: landlord.name,
        student: {
          name: studentName,
          email: studentEmail,
          phone: studentPhone,
          faculty: facultyName,
        },
        message,
        listing: {
          listing_id: listingId,
          address: location?.address,
          neighborhood: location?.neighborhood,
          monthly_price: rent?.monthly_price,
        },
        appUrl,
      }),
    });

    await getServiceSupabase().rpc('mark_inquiry_email_sent', { p_inquiry_id: inquiryId });
  } catch (err) {
    console.error('Failed to send landlord notification email:', err);
  }
}
