/**
 * Welcome email for the founding-five cohort (ranks 2–5). Includes the
 * FOUNDING_FIVE_80 promo code that the recipient pastes into the Stripe
 * Checkout "Add promotion code" field. Mirrors the visual structure of
 * subscriptionWelcome.js so both emails feel like the same product.
 *
 * @param {object} params
 * @param {string} params.landlordName
 * @param {number} params.foundingRank - 2..5
 * @param {string} params.promoCode - 'FOUNDING_FIVE_80'
 * @param {string} params.subscribeUrl - Link to the onboarding/subscribe page
 * @param {'el'|'en'} params.locale
 */
export function foundingFiveWelcomeHtml({
  landlordName,
  foundingRank,
  promoCode,
  subscribeUrl,
  locale = 'en',
}) {
  const copy = COPY[locale === 'en' ? 'en' : 'el'];
  const greeting = landlordName ? `${copy.greetingPrefix} ${landlordName},` : copy.greetingFallback;

  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'el'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${copy.title}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#f6f4ff;border-radius:12px;overflow:hidden;border:1px solid #e6eaef;">
          <tr>
            <td style="background:#0a2540;padding:24px 32px;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffcb57;">${copy.eyebrow}</p>
              <p style="margin:4px 0 0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#ffffffB3;">${copy.headerTagline}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'EB Garamond',Garamond,Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;color:#0a2540;letter-spacing:-0.01em;">${copy.title.replace('{rank}', foundingRank)}</h1>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                ${copy.body1}
              </p>
              <p style="margin:0 0 24px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#0a2540;line-height:1.6;">
                ${copy.body2}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:#0a2540;border-radius:8px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 4px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffcb57;">${copy.codeLabel}</p>
                    <p style="margin:0;font-family:'EB Garamond',Garamond,Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;color:#ffffff;letter-spacing:0.04em;">${promoCode}</p>
                  </td>
                </tr>
              </table>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#635BFF;border-radius:8px;padding:0;">
                    <a href="${subscribeUrl}" style="display:inline-block;padding:12px 28px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase;">${copy.cta}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#7a8595;line-height:1.5;">
                ${copy.footnote}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:20px 32px;border-top:1px solid #e6eaef;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#7a8595;">
                StudentX · ${copy.footerTagline}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function foundingFiveWelcomeSubject(foundingRank, locale = 'en') {
  const copy = COPY[locale === 'en' ? 'en' : 'el'];
  return copy.subject.replace('{rank}', foundingRank);
}

const COPY = {
  el: {
    eyebrow: 'Founding Five',
    headerTagline: 'Φοιτητική Στέγαση · Θεσσαλονίκη',
    footerTagline: 'Επίσημος συνεργάτης στέγασης AUSoM και άλλων κορυφαίων πανεπιστημίων',
    title: 'Είσαι ο ιδρυτικός #{rank} από τους 50',
    greetingPrefix: 'Γεια σου',
    greetingFallback: 'Γεια σου,',
    body1:
      'Είσαι μέσα στους πρώτους πέντε ιδιοκτήτες που διεκδίκησαν θέση στην ιδρυτική ομάδα του StudentX πριν από τις αφίξεις του Σεπτεμβρίου 2026. Ευχαριστούμε για την εμπιστοσύνη.',
    body2:
      'Ως μέλος της Founding Five, η συνδρομή σου SuperLandlord για τον πρώτο χρόνο γίνεται από €49 → €9,80 με τον παρακάτω κωδικό. Πέρασέ τον στο πεδίο "Add promotion code" κατά το checkout.',
    codeLabel: 'Κωδικός Founding Five',
    cta: 'Ενεργοποίησε SuperLandlord',
    footnote:
      'Μετά την ενεργοποίηση, ανέβασε ταυτότητα στο Verification για να ξεκλειδώσεις το σήμα Founding Member πάνω από τις αγγελίες σου.',
    subject: 'Είσαι ο ιδρυτικός #{rank} — εδώ είναι ο κωδικός σου 80%',
  },
  en: {
    eyebrow: 'Founding Five',
    headerTagline: 'Student Housing · Thessaloniki',
    footerTagline: 'Official housing partner for AUSoM and other world-class universities',
    title: "You're founding member #{rank} of 50",
    greetingPrefix: 'Hi',
    greetingFallback: 'Hi there,',
    body1:
      "You're one of the first five landlords to claim a spot in the StudentX founding cohort ahead of the September 2026 arrivals. Thanks for trusting us.",
    body2:
      "As a Founding Five member, your first-year SuperLandlord subscription drops from €49 → €9.80 with the code below. Paste it into the \"Add promotion code\" field at checkout.",
    codeLabel: 'Founding Five code',
    cta: 'Activate SuperLandlord',
    footnote:
      'After activation, upload an ID on the Verification page to unlock the Founding Member badge on your listings.',
    subject: "You're founding member #{rank} — here's your 80% code",
  },
};
