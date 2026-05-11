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

// Rank 1 is the founder; ranks 2–5 get the 80%-off promo, ranks 6–50 get the
// Founding Member badge perk. Ranks 51+ receive no founding email — Supabase's
// own auth-confirmation email is the only mail that fires for them.
const FOUNDING_FIVE_MIN = 2;
const FOUNDING_FIVE_MAX = 5;
const FOUNDING_COHORT_MAX = 50;

function pickLocale(request, hintedLocale) {
  if (hintedLocale === 'el' || hintedLocale === 'en') return hintedLocale;
  const header = request?.headers?.get?.('accept-language') || '';
  const tags = header
    .split(',')
    .map((t) => t.split(';')[0].trim().toLowerCase())
    .filter(Boolean);
  for (const tag of tags) {
    if (tag === 'el' || tag.startsWith('el-')) return 'el';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  // Default English (2026-05-11 product call).
  return 'en';
}

/**
 * Send the founding-cohort welcome email if the rank qualifies. Errors are
 * swallowed (logged) — a Resend hiccup must not block the signup response.
 *
 * @param {object} params
 * @param {string} params.landlordName
 * @param {string} params.email
 * @param {number|null} params.foundingRank
 * @param {Request} [params.request] - For accept-language fallback
 * @param {'el'|'en'} [params.locale] - Explicit locale hint, beats header
 */
export async function sendFoundingWelcomeEmail({
  landlordName,
  email,
  foundingRank,
  request,
  locale: hintedLocale,
}) {
  try {
    if (!email) return;
    if (foundingRank == null) return;
    if (foundingRank < FOUNDING_FIVE_MIN || foundingRank > FOUNDING_COHORT_MAX) return;

    if (await isEmailSuppressed(email)) {
      console.warn(`Founding welcome: skipping send — ${email} is suppressed`);
      return;
    }

    const locale = pickLocale(request, hintedLocale);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
    const subscribeUrl = `${appUrl}/${locale === 'en' ? 'en/' : ''}property/thessaloniki/landlord/onboarding`;

    const isFoundingFive =
      foundingRank >= FOUNDING_FIVE_MIN && foundingRank <= FOUNDING_FIVE_MAX;

    const subject = isFoundingFive
      ? foundingFiveWelcomeSubject(foundingRank, locale)
      : foundingCohortWelcomeSubject(foundingRank, locale);

    const html = isFoundingFive
      ? foundingFiveWelcomeHtml({
          landlordName,
          foundingRank,
          promoCode: FOUNDING_FIVE_PROMO,
          subscribeUrl,
          locale,
        })
      : foundingCohortWelcomeHtml({
          landlordName,
          foundingRank,
          subscribeUrl,
          locale,
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
