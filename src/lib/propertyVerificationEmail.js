/**
 * Landlord-facing property verification outcome emails.
 * Inlined HTML, same pattern as bookingEmail / gigInquiryEmail.
 * Best-effort: never throw to the caller.
 */

import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import { formatPropertyVerificationDate } from '@/lib/propertyVerification';

const FROM_ADDRESS = 'StudentX <alerts@studentx.uk>';

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
  const supabase = getSupabase();
  const { data: listing } = await supabase
    .from('listings')
    .select(`
      listing_id,
      title,
      location ( address, neighborhood ),
      landlords ( name, email )
    `)
    .eq('listing_id', listingId)
    .single();

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
      from: FROM_ADDRESS,
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
      from: FROM_ADDRESS,
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
