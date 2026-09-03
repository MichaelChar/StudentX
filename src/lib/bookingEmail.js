/**
 * Booking notification emails — inlined HTML, same pattern as inquiryEmail /
 * gigInquiryEmail. Best-effort: never throw to the caller.
 */

import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import { formatMoney } from '@/lib/formatMoney';

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
      rent ( monthly_price, currency ),
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
    const priceStr = formatMoney(price, rent?.currency);
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
        <p><strong>Monthly rent:</strong> ${safe(priceStr)}</p>
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
    const detailUrl = `${appUrl}/student/account/bookings/${bookingId}`;

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
        <p><a href="${detailUrl}">View your booking</a></p>
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

/**
 * Daily move-in prompt — student whose move-in day has arrived and who has
 * not yet confirmed or reported a problem.
 */
export async function sendMoveInPromptEmail({
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
    const detailUrl = `${appUrl}/student/account/bookings/${bookingId}`;

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: studentEmail,
      subject: `How was move-in? — ${label}`,
      html: `
        <p>Hi ${safe(studentName || 'there')},</p>
        <p>Your move-in day for <strong>${safe(label)}</strong> has arrived (${safe(moveIn)} → ${safe(moveOut)}).</p>
        <p><strong>Is everything as promised?</strong></p>
        <p>Please confirm the stay is as described, or report a problem so we can help.</p>
        <p><a href="${detailUrl}">Respond to your booking</a></p>
        <p style="color:#666;font-size:12px;">Booking ref: ${safe(bookingId)}. Silence is not treated as confirmation — please respond.</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send move-in prompt email:', err);
  }
}

/**
 * Ops alert when a student reports a move-in problem.
 *
 * The money IS held — manually, outside this codebase, not by Stripe Connect
 * (W3 is unbuilt). So this alert is time-critical rather than informational:
 * the landlord payout goes out one business day after arrival, and until it
 * does there is still something to withhold. Said plainly in the body because
 * whoever reads it has to act, not just file it.
 */
export async function sendMoveInProblemOpsEmail({
  bookingId,
  listingId,
  studentEmail,
  studentName,
  moveIn,
  moveOut,
  description,
}) {
  try {
    const recipient =
      process.env.SYNTHETIC_ALERT_EMAIL || process.env.GIG_ALERT_EMAIL;
    if (!recipient) {
      console.warn(
        `Booking ${bookingId}: no SYNTHETIC_ALERT_EMAIL for move-in problem report`,
      );
      return;
    }
    if (await isEmailSuppressed(recipient)) {
      console.warn(`Booking ${bookingId}: ops email ${recipient} suppressed`);
      return;
    }

    const { listing, location } = await loadListingContext(listingId);
    const label = listingLabel(location, listing);
    const appUrl = appBase();
    const detailUrl = `${appUrl}/student/account/bookings/${bookingId}`;

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: recipient,
      replyTo: studentEmail || undefined,
      subject: `Move-in problem reported — ${label}`,
      html: `
        <p>A student reported a problem after move-in.</p>
          <p><strong>The payout is held manually until one business day after arrival.</strong>
          If that has not happened yet it can still be withheld — check before releasing.</p>
        <p><strong>Booking:</strong> ${safe(bookingId)}</p>
        <p><strong>Listing:</strong> ${safe(label)} (${safe(listingId)})</p>
        <p><strong>Student:</strong> ${safe(studentName || '—')} &lt;${safe(studentEmail || '—')}&gt;</p>
        <p><strong>Stay:</strong> ${safe(moveIn)} → ${safe(moveOut)}</p>
        <p><strong>Description:</strong></p>
        <blockquote>${safe(description || '').replace(/\n/g, '<br>')}</blockquote>
        <p><a href="${detailUrl}">Student booking detail</a> (student account view)</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send move-in problem ops email:', err);
  }
}
