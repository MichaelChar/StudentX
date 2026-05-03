import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import { inquiryEmailHtml, inquiryEmailSubject } from '@/templates/email/inquiry';

const FROM_ADDRESS = 'StudentX <alerts@studentx.uk>';

function resolveLandlordEmailLocale(request, landlord) {
  if (landlord?.preferred_locale === 'el' || landlord?.preferred_locale === 'en') {
    return landlord.preferred_locale;
  }
  const header = request?.headers.get?.('accept-language') || '';
  const tags = header
    .split(',')
    .map((t) => t.split(';')[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    if (tag === 'el' || tag.startsWith('el-')) return 'el';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'el';
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
  request = null,
}) {
  try {
    const supabase = getSupabase();

    const { data: listing } = await supabase
      .from('listings')
      .select(`
        listing_id,
        location ( address, neighborhood ),
        rent ( monthly_price ),
        landlords ( name, email, preferred_locale )
      `)
      .eq('listing_id', listingId)
      .single();

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
    const emailLocale = resolveLandlordEmailLocale(request, landlord);

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: landlord.email,
      replyTo: studentEmail,
      subject: inquiryEmailSubject(studentName, listingSummary, emailLocale),
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
        locale: emailLocale,
      }),
    });

    await supabase.rpc('mark_inquiry_email_sent', { p_inquiry_id: inquiryId });
  } catch (err) {
    console.error('Failed to send landlord notification email:', err);
  }
}
