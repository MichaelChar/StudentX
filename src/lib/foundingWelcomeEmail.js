import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import {
  foundingFiveWelcomeHtml,
  foundingFiveWelcomeSubject,
} from '@/templates/email/foundingFiveWelcome';
import {
  foundingCohortWelcomeHtml,
  foundingCohortWelcomeSubject,
} from '@/templates/email/foundingCohortWelcome';

const FROM_ADDRESS = 'StudentX <alerts@studentx.uk>';
const FOUNDING_FIVE_PROMO = 'FOUNDING_FIVE_80';

const FOUNDING_FIVE_MIN = 2;
const FOUNDING_FIVE_MAX = 5;
const FOUNDING_COHORT_MAX = 50;

/**
 * Send the founding-cohort welcome email if the rank qualifies. Errors are
 * swallowed (logged) — a Resend hiccup must not block the signup response.
 *
 * @param {object} params
 * @param {string} params.landlordName
 * @param {string} params.email
 * @param {number|null} params.foundingRank
 */
export async function sendFoundingWelcomeEmail({
  landlordName,
  email,
  foundingRank,
}) {
  try {
    if (!email) return;
    if (foundingRank == null) return;
    if (foundingRank < FOUNDING_FIVE_MIN || foundingRank > FOUNDING_COHORT_MAX) return;

    if (await isEmailSuppressed(email)) {
      console.warn(`Founding welcome: skipping send — ${email} is suppressed`);
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
    const subscribeUrl = `${appUrl}/property/thessaloniki/landlord/onboarding`;

    const isFoundingFive =
      foundingRank >= FOUNDING_FIVE_MIN && foundingRank <= FOUNDING_FIVE_MAX;

    const subject = isFoundingFive
      ? foundingFiveWelcomeSubject(foundingRank)
      : foundingCohortWelcomeSubject(foundingRank);

    const html = isFoundingFive
      ? foundingFiveWelcomeHtml({
          landlordName,
          foundingRank,
          promoCode: FOUNDING_FIVE_PROMO,
          subscribeUrl,
        })
      : foundingCohortWelcomeHtml({
          landlordName,
          foundingRank,
          subscribeUrl,
        });

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject,
      html,
    });
  } catch (err) {
    console.error('Failed to send founding welcome email:', err);
  }
}
