/**
 * Welcome email sent when a landlord activates SuperLandlord or
 * SuperLandlord Heavy. Reminds them that the public Verified badge
 * also requires submitting an ID for admin review.
 *
 * @param {object} params
 * @param {string} params.landlordName - Used in the greeting
 * @param {string} params.tierName - "SuperLandlord" or "SuperLandlord Heavy"
 * @param {string} params.verificationUrl - Full URL to /landlord/verification
 * @param {'el'|'en'} params.locale
 */
export function subscriptionWelcomeHtml({ landlordName, tierName, verificationUrl, locale = 'el' }) {
  const copy = COPY[locale === 'en' ? 'en' : 'el'];
  const greeting = landlordName ? `${copy.greetingPrefix} ${landlordName},` : copy.greetingFallback;

  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'el'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${copy.title}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#F0EBDF;border-radius:12px;overflow:hidden;border:1px solid #E5DFD0;">
          <tr>
            <td style="background:#01828D;padding:24px 32px;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#B8860B;">StudentX</p>
              <p style="margin:4px 0 0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#FAF8F3B3;">${copy.headerTagline}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:'EB Garamond',Garamond,Georgia,'Times New Roman',serif;font-size:24px;font-weight:600;color:#01828D;letter-spacing:-0.01em;">${copy.title}</h1>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#333;line-height:1.6;">
                ${greeting}
              </p>
              <p style="margin:0 0 16px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#555;line-height:1.6;">
                ${copy.welcomeBody.replace('{tier}', tierName)}
              </p>
              <p style="margin:0 0 24px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#555;line-height:1.6;">
                <strong>${copy.nextStepLabel}</strong> ${copy.nextStepBody}
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#B8860B;border-radius:8px;padding:0;">
                    <a href="${verificationUrl}" style="display:inline-block;padding:12px 28px;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${copy.cta}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:#999;line-height:1.5;">
                ${copy.footnote}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#FAF8F3;padding:20px 32px;border-top:1px solid #E5DFD0;">
              <p style="margin:0;font-family:'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#999;">
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

export function subscriptionWelcomeSubject(tierName, locale = 'el') {
  const copy = COPY[locale === 'en' ? 'en' : 'el'];
  return copy.subject.replace('{tier}', tierName);
}

const COPY = {
  el: {
    headerTagline: 'Φοιτητική Στέγαση · Θεσσαλονίκη',
    footerTagline: 'Ο επίσημος συνεργάτης στέγασης για φοιτητές της Ιατρικής ΑΠΘ',
    title: 'Καλώς ήρθες στην οικογένεια SuperLandlord',
    greetingPrefix: 'Γεια σου',
    greetingFallback: 'Γεια σου,',
    welcomeBody:
      'Η συνδρομή σου στο πλάνο {tier} είναι ενεργή. Ευχαριστούμε που εμπιστεύεσαι το StudentX για να βρεις τους ιδανικούς φοιτητές για τα ακίνητά σου.',
    nextStepLabel: 'Τελευταίο βήμα:',
    nextStepBody:
      'Για να εμφανιστεί το σήμα Verified πάνω από τις αγγελίες σου, ανέβασε ένα έγγραφο ταυτοπροσωπίας. Η ομάδα μας θα το ελέγξει εντός 1-2 εργάσιμων ημερών.',
    cta: 'Ανέβασε ταυτότητα',
    footnote:
      'Το έγγραφο φυλάσσεται με ασφάλεια και δεν εμφανίζεται δημόσια — χρησιμοποιείται μόνο για επαλήθευση.',
    subject: 'Η συνδρομή σου {tier} είναι ενεργή — επόμενο βήμα: ταυτοπροσωπία',
  },
  en: {
    headerTagline: 'Student Housing · Thessaloniki',
    footerTagline: 'Official housing partner for AUTh medical students',
    title: 'Welcome to the SuperLandlord family',
    greetingPrefix: 'Hi',
    greetingFallback: 'Hi there,',
    welcomeBody:
      'Your {tier} subscription is active. Thanks for trusting StudentX to help you reach the right students for your properties.',
    nextStepLabel: 'One last step:',
    nextStepBody:
      'To display the Verified badge on your listings, upload a government-issued ID for review. Our team will verify it within 1-2 business days.',
    cta: 'Upload ID',
    footnote:
      'Your document is stored securely and never shown publicly — it is used only for verification.',
    subject: 'Your {tier} subscription is active — next step: verify your ID',
  },
};
