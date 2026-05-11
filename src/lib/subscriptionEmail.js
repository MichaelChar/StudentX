import { getResend } from '@/lib/resend';
import { isEmailSuppressed } from '@/lib/emailSuppressions';
import { subscriptionWelcomeHtml, subscriptionWelcomeSubject } from '@/templates/email/subscriptionWelcome';

const FROM_ADDRESS = 'StudentX <alerts@studentx.uk>';

const TIER_DISPLAY_NAMES = {
  verified: 'SuperLandlord',
  verified_pro: 'SuperLandlord Heavy',
};

/**
 * Send the subscription welcome email after a Stripe checkout completes.
 * Errors are swallowed (logged): the webhook must always ack 2xx, and a
 * Resend hiccup should never block downstream `customer.subscription.*`
 * events.
 */
export async function sendSubscriptionWelcomeEmail({ supabase, landlordId, tier }) {
  try {
    const { data: landlord } = await supabase
      .from('landlords')
      .select('name, email, preferred_locale')
      .eq('landlord_id', landlordId)
      .single();

    if (!landlord?.email) {
      console.warn(`Subscription welcome: no email for landlord ${landlordId}`);
      return;
    }

    if (await isEmailSuppressed(landlord.email)) {
      console.warn(`Subscription welcome: skipping send — ${landlord.email} is suppressed`);
      return;
    }

    // English-only post-Step-B (issue #158). Any DB drift to 'el' is
    // ignored — the API now rejects 'el' writes and the column will be
    // dropped in the schema cleanup follow-up.
    const locale = 'en';
    const tierName = TIER_DISPLAY_NAMES[tier] || 'SuperLandlord';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studentx.uk';
    const verificationUrl = `${appUrl}/${locale === 'en' ? 'en/' : ''}property/thessaloniki/landlord/verification`;

    await getResend().emails.send({
      from: FROM_ADDRESS,
      to: landlord.email,
      subject: subscriptionWelcomeSubject(tierName, locale),
      html: subscriptionWelcomeHtml({
        landlordName: landlord.name,
        tierName,
        verificationUrl,
        locale,
      }),
    });
  } catch (err) {
    console.error('Failed to send subscription welcome email:', err);
  }
}
