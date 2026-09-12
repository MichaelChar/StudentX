/**
 * Landlord-facing property verification outcome emails.
 * Inlined HTML, same pattern as bookingEmail / gigInquiryEmail.
 * Best-effort: never throw to the caller.
 */

import { getSupabaseAsService } from '@/lib/supabaseServer';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import { fromAddressFor } from '@/lib/emailFrom';
import { formatPropertyVerificationDate } from '@/lib/propertyVerification';

function safe(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appBase() {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
}

async function loadListingLandlord(listingId) {
  /*
    SERVICE ROLE, NOT ANON — this is load-bearing, not a preference.

    This query selects `landlords ( … email )`. Migration 065 (#bce085a) revoked
    the blanket anon SELECT on `landlords` and granted back only the 7 public
    catalog columns; `email` is deliberately not among them. So the anon client
    gets `42501 permission denied for table landlords` for this select, PostgREST
    returns no row, and the `!landlord?.email` guard below turns that into a
    silent early return.

    That is exactly what happened between 2026-07-03 and the fix: every send in
    this file stopped delivering, and nothing surfaced it, because these helpers
    are best-effort by contract and swallow their own failures.

    If you change this back to getSupabase(), these emails stop again and no test
    or alert will tell you.
  */
  const supabase = getSupabaseAsService();
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select(`
      listing_id,
      title,
      location ( address, neighborhood ),
      landlords ( name, email )
    `)
    .eq('listing_id', listingId)
    .single();

  // Surface the failure instead of swallowing it. The 2026-07-03 outage was
  // invisible precisely because this error was discarded and the missing row
  // then looked like "landlord has no email on file".
  if (listingError) {
    console.error('propertyVerificationEmail: listing/landlord load failed:', listingError.message);
  }

  const landlord = Array.isArray(listing?.landlords)
    ? listing.landlords[0]
    : listing?.landlords;
  const location = Array.isArray(listing?.location)
    ? listing.location[0]
    : listing?.location;

  return { listing, landlord, location };
}

function listingLabel(location, listing) {
  return (
    [location?.address, location?.neighborhood].filter(Boolean).join(' · ') ||
    listing?.title ||
    listing?.listing_id ||
    'listing'
  );
}

/**
 * Notify landlord that their property video verification was approved.
 */
export async function sendPropertyVerificationApprovedEmail({
  listingId,
  method = 'video_call',
  verifiedAt,
}) {
  try {
    const { listing, landlord, location } = await loadListingLandlord(listingId);
    if (!landlord?.email) {
      console.warn(
        `Property verification approved: no landlord email for listing ${listingId}`,
      );
      return;
    }
    if (await isEmailSuppressed(landlord.email)) {
      console.warn(
        `Property verification approved: landlord ${landlord.email} suppressed`,
      );
      return;
    }

    const label = listingLabel(location, listing);
    const appUrl = appBase();
    const date = formatPropertyVerificationDate(verifiedAt || new Date().toISOString());
    const listingsUrl = `${appUrl}/property/thessaloniki/landlord/listings`;
    const methodPhrase =
      method === 'video_call' ? 'video call' : method?.replace(/_/g, ' ') || 'verification';

    await getResend().emails.send({
      from: fromAddressFor(landlord.name),
      to: landlord.email,
      subject: `Property verified — ${label}`,
      html: `
        <p>Hi ${safe(landlord.name || 'there')},</p>
        <p>Good news — your listing has been <strong>property-verified</strong> by StudentX.</p>
        <p><strong>Listing:</strong> ${safe(label)}</p>
        <p><strong>Method:</strong> ${safe(methodPhrase)}</p>
        <p><strong>Verified on:</strong> ${safe(date)}</p>
        <p>Students will see a Verified badge on this listing with a short note of what was checked.</p>
        <p><a href="${listingsUrl}">View your listings</a></p>
        <p style="color:#666;font-size:12px;">StudentX · Thessaloniki student housing</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send property verification approved email:', err);
  }
}

/**
 * Notify landlord that their property video verification was rejected.
 */
export async function sendPropertyVerificationRejectedEmail({
  listingId,
  notes,
}) {
  try {
    const { listing, landlord, location } = await loadListingLandlord(listingId);
    if (!landlord?.email) {
      console.warn(
        `Property verification rejected: no landlord email for listing ${listingId}`,
      );
      return;
    }
    if (await isEmailSuppressed(landlord.email)) {
      console.warn(
        `Property verification rejected: landlord ${landlord.email} suppressed`,
      );
      return;
    }

    const label = listingLabel(location, listing);
    const appUrl = appBase();
    const listingsUrl = `${appUrl}/property/thessaloniki/landlord/listings`;

    await getResend().emails.send({
      from: fromAddressFor(landlord.name),
      to: landlord.email,
      subject: `Property verification not approved — ${label}`,
      html: `
        <p>Hi ${safe(landlord.name || 'there')},</p>
        <p>We could not complete property verification for your listing after the review call.</p>
        <p><strong>Listing:</strong> ${safe(label)}</p>
        ${
          notes
            ? `<p><strong>Notes from our team:</strong></p><blockquote>${safe(notes).replace(/\n/g, '<br>')}</blockquote>`
            : ''
        }
        <p>You can request video verification again once any issues are fixed.</p>
        <p><a href="${listingsUrl}">View your listings</a></p>
        <p style="color:#666;font-size:12px;">StudentX · Thessaloniki student housing</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send property verification rejected email:', err);
  }
}
