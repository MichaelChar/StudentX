import { getSupabase } from '@/lib/supabase';
import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';

const FROM_ADDRESS = 'StudentX <alerts@studentx.uk>';

// Where gig interest lands until an employer self-serve portal exists. Falls
// back to the synthetic-alert inbox so a misconfig surfaces somewhere real
// rather than silently dropping student interest.
function alertRecipient() {
  return (
    process.env.GIG_ALERT_EMAIL ||
    process.env.SYNTHETIC_ALERT_EMAIL ||
    null
  );
}

/**
 * Emails the gigs alert inbox when a student expresses interest in a gig.
 * Best-effort, mirroring sendLandlordInquiryEmail — the inquiry row has already
 * persisted, so a Resend hiccup never fails the user-facing submit.
 *
 * Until employer accounts exist there is no per-gig recipient, so everything
 * routes to GIG_ALERT_EMAIL. The employer's own contact_info is intentionally
 * not used as the recipient here (admin triages first).
 */
export async function sendGigInquiryEmail({
  inquiryId,
  gigId,
  studentName,
  studentEmail,
  message,
}) {
  try {
    const to = alertRecipient();
    if (!to) {
      console.warn(`Gig inquiry ${inquiryId}: no GIG_ALERT_EMAIL configured — skipping email`);
      return;
    }
    if (await isEmailSuppressed(to)) {
      console.warn(`Gig inquiry ${inquiryId}: alert recipient ${to} is suppressed — skipping`);
      return;
    }

    const supabase = getSupabase();
    const { data: gig } = await supabase
      .from('gigs')
      .select('title, employer_name, country_code, city')
      .eq('gig_id', gigId)
      .single();

    const gigSummary = [gig?.title, gig?.employer_name, [gig?.city, gig?.country_code].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' · ');

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
    const safe = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      replyTo: studentEmail || undefined,
      subject: `New gig interest: ${gig?.title ?? 'Holiday gig'}`,
      html: `
        <p>A student expressed interest in a holiday gig.</p>
        <p><strong>Gig:</strong> ${safe(gigSummary)}</p>
        <p><strong>Student:</strong> ${safe(studentName)} (${safe(studentEmail)})</p>
        <p><strong>Message:</strong></p>
        <blockquote>${safe(message).replace(/\n/g, '<br>')}</blockquote>
        <p><a href="${appUrl}/gigs/${gigId}">View gig</a></p>
      `,
    });

    await supabase
      .from('gig_inquiries')
      .update({ email_sent: true })
      .eq('inquiry_id', inquiryId);
  } catch (err) {
    console.error('Failed to send gig inquiry email:', err);
  }
}
