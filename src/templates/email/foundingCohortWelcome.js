/**
 * Welcome email for the founding-50 cohort (ranks 6–50). Promises the
 * Founding Member badge, conditional on subscribing to SuperLandlord and
 * passing identity verification. No discount — that's the founding-five
 * differentiator.
 *
 * @param {object} params
 * @param {string} params.landlordName
 * @param {number} params.foundingRank - 6..50
 * @param {string} params.subscribeUrl - Link to onboarding/subscribe
 * @param {'el'|'en'} params.locale
 */
export function foundingCohortWelcomeHtml({
  landlordName,
  foundingRank,
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
                <strong>${copy.unlockLabel}</strong> ${copy.unlockBody}
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#635BFF;border-radius:8px;padding:0;">
                    <a href="${subscribeUrl}" style="display:inline-block;padding:12px 28px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase;">${copy.cta}</a>
                  </td>
                </tr>
              </table>
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

export function foundingCohortWelcomeSubject(foundingRank, locale = 'en') {
  const copy = COPY[locale === 'en' ? 'en' : 'el'];
  return copy.subject.replace('{rank}', foundingRank);
}

const COPY = {
  el: {
    eyebrow: 'Founding 50',
    headerTagline: 'Φοιτητική Στέγαση · Θεσσαλονίκη',
    footerTagline: 'Επίσημος συνεργάτης στέγασης AUSoM και άλλων κορυφαίων πανεπιστημίων',
    title: 'Είσαι ο ιδρυτικός #{rank} από τους 50',
    greetingPrefix: 'Γεια σου',
    greetingFallback: 'Γεια σου,',
    body1:
      'Καλώς ήρθες στην ιδρυτική ομάδα του StudentX πριν από τις αφίξεις του Σεπτεμβρίου 2026. Είσαι ένας από τους πενήντα ιδιοκτήτες που θα διαμορφώσουν τον κατάλογο από την πρώτη μέρα.',
    unlockLabel: 'Πώς ξεκλειδώνεις το σήμα Founding Member:',
    unlockBody:
      'Ενεργοποίησε τη συνδρομή SuperLandlord και ολοκλήρωσε την ταυτοποίηση. Όσο και τα δύο είναι ενεργά, οι αγγελίες σου θα φέρουν το σήμα Founding Member — αναγνωρίσιμο από κάθε φοιτητή που μας επισκέπτεται.',
    cta: 'Ενεργοποίησε SuperLandlord',
    subject: 'Καλώς ήρθες στην ιδρυτική ομάδα — είσαι ο #{rank}',
  },
  en: {
    eyebrow: 'Founding 50',
    headerTagline: 'Student Housing · Thessaloniki',
    footerTagline: 'Official housing partner for AUSoM and other world-class universities',
    title: "You're founding member #{rank} of 50",
    greetingPrefix: 'Hi',
    greetingFallback: 'Hi there,',
    body1:
      "Welcome to the StudentX founding cohort ahead of the September 2026 arrivals. You're one of fifty landlords shaping the directory from day one.",
    unlockLabel: 'How to unlock the Founding Member badge:',
    unlockBody:
      'Activate a SuperLandlord subscription and complete identity verification. While both are active, your listings will display the Founding Member badge — visible to every student who browses StudentX.',
    cta: 'Activate SuperLandlord',
    subject: "Welcome to the founding cohort — you're member #{rank}",
  },
};
