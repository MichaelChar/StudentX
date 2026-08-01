/**
 * Booking notification emails — inlined HTML, same pattern as inquiryEmail /
 * gigInquiryEmail. Best-effort: never throw to the caller.
 */

import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';

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

async function loadListingContext(listingId) {
  const supabase = getSupabase();
  const { data: listing } = await supabase
    .from('listings')
    .select(`
      listing_id,
      title,
      location ( address, neighborhood ),
      rent ( monthly_price ),
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
  const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;

  return { listing, landlord, location, rent };
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
 * Notify landlord of a new booking request.
 */
export async function sendBookingRequestEmail({
  bookingId,
  listingId,
  studentName,
  studentEmail,
  message,
  moveIn,
  moveOut,
  monthlyRent,
}) {
  try {
    const { listing, landlord, location, rent } = await loadListingContext(listingId);
    if (!landlord?.email) {
      console.warn(`Booking ${bookingId}: no landlord email for listing ${listingId}`);
      return;
    }
    if (await isEmailSuppressed(landlord.email)) {
      console.warn(`Booking ${bookingId}: landlord ${landlord.email} suppressed`);
      return;
    }

    const label = listingLabel(location, listing);
    const appUrl = appBase();
    const price = monthlyRent ?? rent?.monthly_price;
    const detailUrl = `${appUrl}/property/thessaloniki/landlord/reservations/${bookingId}`;

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: landlord.email,
      replyTo: studentEmail || undefined,
      subject: `New booking request — ${label}`,
      html: `
        <p>Hi ${safe(landlord.name || 'there')},</p>
        <p><strong>${safe(studentName || 'A student')}</strong> requested to book your listing.</p>
        <p><strong>Listing:</strong> ${safe(label)}</p>
        <p><strong>Move-in:</strong> ${safe(moveIn)} &nbsp;·&nbsp; <strong>Move-out:</strong> ${safe(moveOut)}</p>
        <p><strong>Monthly rent:</strong> €${safe(price)}</p>
        ${message ? `<p><strong>Message:</strong></p><blockquote>${safe(message).replace(/\n/g, '<br>')}</blockquote>` : ''}
        <p><a href="${detailUrl}">Review request</a> — accept or decline in your reservations inbox.</p>
        <p style="color:#666;font-size:12px;">You won't be charged by StudentX. Parties settle rent offline for this booking.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send booking request email:', err);
  }
}

/**
 * 24h inactivity reminder — one per booking (caller gates).
 */
export async function sendBookingReminderEmail({
  bookingId,
  listingId,
  studentName,
  moveIn,
  moveOut,
}) {
  try {
    const { listing, landlord, location } = await loadListingContext(listingId);
    if (!landlord?.email) return;
    if (await isEmailSuppressed(landlord.email)) return;

    const label = listingLabel(location, listing);
    const appUrl = appBase();
    const detailUrl = `${appUrl}/property/thessaloniki/landlord/reservations/${bookingId}`;

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: landlord.email,
      subject: `Reminder: booking request waiting — ${label}`,
      html: `
        <p>Hi ${safe(landlord.name || 'there')},</p>
        <p>A booking request from <strong>${safe(studentName || 'a student')}</strong> is still waiting for your response.</p>
        <p><strong>Listing:</strong> ${safe(label)}</p>
        <p><strong>Move-in:</strong> ${safe(moveIn)} &nbsp;·&nbsp; <strong>Move-out:</strong> ${safe(moveOut)}</p>
        <p>Requests expire after 2 days of inactivity. <a href="${detailUrl}">Respond now</a>.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send booking reminder email:', err);
  }
}

/**
 * Notify student that the landlord accepted (offline confirm).
 */
export async function sendBookingAcceptedEmail({
  bookingId,
  listingId,
  studentEmail,
  studentName,
  moveIn,
  moveOut,
}) {
  try {
    if (!studentEmail) return;
    if (await isEmailSuppressed(studentEmail)) return;

    const { listing, location } = await loadListingContext(listingId);
    const label = listingLabel(location, listing);
    const appUrl = appBase();

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: studentEmail,
      subject: `Booking accepted — ${label}`,
      html: `
        <p>Hi ${safe(studentName || 'there')},</p>
        <p>Good news — the landlord accepted your booking request.</p>
        <p><strong>Listing:</strong> ${safe(label)}</p>
        <p><strong>Move-in:</strong> ${safe(moveIn)} &nbsp;·&nbsp; <strong>Move-out:</strong> ${safe(moveOut)}</p>
        <p>You won't be charged on StudentX. Arrange payment and move-in details directly with the landlord via your inquiry thread.</p>
        <p><a href="${appUrl}/student/inquiries">Open messages</a></p>
        <p style="color:#666;font-size:12px;">Booking ref: ${safe(bookingId)}</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send booking accepted email:', err);
  }
}

/**
 * Notify student that the landlord declined (one-click, no reason).
 */
export async function sendBookingDeclinedEmail({
  bookingId,
  listingId,
  studentEmail,
  studentName,
  moveIn,
  moveOut,
}) {
  try {
    if (!studentEmail) return;
    if (await isEmailSuppressed(studentEmail)) return;

    const { listing, location } = await loadListingContext(listingId);
    const label = listingLabel(location, listing);
    const appUrl = appBase();

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: studentEmail,
      subject: `Booking declined — ${label}`,
      html: `
        <p>Hi ${safe(studentName || 'there')},</p>
        <p>The landlord declined your booking request for <strong>${safe(label)}</strong> (${safe(moveIn)} → ${safe(moveOut)}).</p>
        <p>The dates have been released. You can request another listing anytime.</p>
        <p><a href="${appUrl}/property/thessaloniki/results">Browse listings</a></p>
        <p style="color:#666;font-size:12px;">Booking ref: ${safe(bookingId)}</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send booking declined email:', err);
  }
}
